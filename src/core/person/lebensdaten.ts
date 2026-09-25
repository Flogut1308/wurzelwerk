// Vorarbeiten AP-1.30, PR 2 (Nachtrag ADR-031 vom 25.09.2026, docs/80 §32 V-D9-*): EINE Regel
// dafür, woher Geburts- und Todesdatum sowie Geburts- und Sterbeort einer Person kommen — gemeinsam
// für `kernangabenAuswerten` (./kernangaben.ts), `sterbeortAufloesen` (./sterbeort.ts) und damit
// die offene-Punkte-Regel `sterbeort_fehlt` (./offene-punkte.ts, über `person.detail.sterbeort`).
//
// 1. Die Aussage führt: gibt es eine Aussage, die einen Wert trägt (Ort: `traegtOrt`), entscheidet
//    allein sie — auch unbelegt (V-D9-aussage-fuehrt).
// 2. Sonst springt ein Rückfall-Ereignis ein, das den Wert trägt, auch ohne Beleg (Eigentümer D9):
//    Geburt = `typ = 'geburt'` mit der Person als `hauptperson` oder `kind`, Tod = `typ = 'tod'` mit
//    der Person als `verstorbener` oder `hauptperson`. Die Oberfläche legt den Tod seit Migration
//    0009 mit `verstorbener` an, und 0009 stellt den Bestand um. `hauptperson` am Tod bleibt
//    trotzdem Rückfall: der Import reicht Rollen aus Dateien unverändert durch
//    (src/main/import/schreiben.ts), und `ereignis.aendern` kann einen Typ geburt → tod ändern,
//    ohne die Rolle anzufassen. Taufe und Beerdigung sind kein Ersatz (V-D9-rollen).
// 3. Datum und Ort werden je Angabe getrennt aufgelöst (V-D9-getrennt).
//
// 4. Welche Aussage bzw. welches Ereignis den Wert liefert, löst `lebensdatumAufloesen` auf (unten,
//    AP-1.30 PR 1, V-D9-anzeige) — für die Anzeige in `abfrage:person.detail.lebensdaten`.
//
// Rein (CLAUDE.md §4): kein Date/Math.random/process/globalThis, keine Mutation der Eingaben.
import { traegtOrt, type OrtWert } from './ort-wert'

export type RueckfallArt = 'geburt' | 'tod'

/** Rollen, mit denen eine Person an ihrem Geburts- bzw. Tod-Ereignis beteiligt ist. */
export const RUECKFALL_ROLLEN: { readonly [A in RueckfallArt]: readonly string[] } = {
  geburt: ['hauptperson', 'kind'],
  tod: ['verstorbener', 'hauptperson'],
}

/** Ist eine Beteiligung (`ereignis.typ`, `beteiligung.rolle`) ein Geburts- bzw. Tod-Rückfall für
 * die beteiligte Person? `null` = weder noch. */
export function istRueckfallEreignis(typ: string, rolle: string): RueckfallArt | null {
  if (typ === 'geburt' && RUECKFALL_ROLLEN.geburt.includes(rolle)) return 'geburt'
  if (typ === 'tod' && RUECKFALL_ROLLEN.tod.includes(rolle)) return 'tod'
  return null
}

export interface EreignisDatum {
  readonly datumWert1: string | null
  readonly datumOriginaltext: string | null
}

/** Ein Ereignis hat ein Datum, sobald ein geparster Wert ODER ein Originaltext erfasst ist
 * (V-D9-ereignisdatum; symmetrisch zur Aussage, bei der `wert_text` als Wert gilt). */
export function ereignisHatDatum(datum: EreignisDatum): boolean {
  return datum.datumWert1 !== null || datum.datumOriginaltext !== null
}

export type Fuehrung<A, E> =
  | { readonly herkunft: 'aussage'; readonly kandidaten: readonly A[] }
  | { readonly herkunft: 'ereignis'; readonly kandidaten: readonly E[] }

/** Welche Quelle führt für EINE Angabe? Liefert die Kandidaten der führenden Quelle (nur die, die
 * den Wert tragen, in Eingabereihenfolge) oder `null`, wenn keine Quelle einen Wert trägt. Die
 * Auswahl innerhalb der Kandidaten (bevorzugt, kleinste id, irgendeine belegt) trifft der Aufrufer. */
export function fuehrendeQuelle<A, E>(
  aussagen: readonly A[],
  aussageTraegt: (aussage: A) => boolean,
  ereignisse: readonly E[],
  ereignisTraegt: (ereignis: E) => boolean,
): Fuehrung<A, E> | null {
  const mitWert = aussagen.filter(aussageTraegt)
  if (mitWert.length > 0) return { herkunft: 'aussage', kandidaten: mitWert }
  const ereignisseMitWert = ereignisse.filter(ereignisTraegt)
  if (ereignisseMitWert.length > 0) return { herkunft: 'ereignis', kandidaten: ereignisseMitWert }
  return null
}

// ── AP-1.30 PR 1 (V-D9-anzeige): welche Aussage bzw. welches Ereignis liefert den Wert? ──────────
// Dieselbe Führungsregel wie oben (`fuehrendeQuelle`); zusätzlich die Auswahl INNERHALB der
// führenden Quelle (bis PR 1 nur in ./sterbeort.ts): unter Aussagen die bevorzugte, sonst die
// kleinste `id` (UUID v7 = älteste); unter Ereignissen das mit kleinster `id`. Die Prüfregeln
// („trägt die Quelle einen Wert für DIESE Angabe?") stehen hier einmal und werden von
// `kernangabenAuswerten` (über die Eingabe aus src/main/abfragen/person-detail.ts),
// `sterbeortAufloesen` und `lebensdatumAufloesen` benutzt.

/** Die vier Lebensdaten-Angaben, Reihenfolge = Reihenfolge in `abfrage:person.detail.lebensdaten`.
 * Einzige Quelle; `src/shared/schemata/person-detail.ts` baut sein Zod-Enum daraus. */
export const LEBENSDATUM_ANGABEN = ['geburtsdatum', 'geburtsort', 'todesdatum', 'todesort'] as const

export type LebensdatumAngabe = (typeof LEBENSDATUM_ANGABEN)[number]

/** Einzige Quelle der Herkunftswerte (auch für den Sterbeort, ./sterbeort.ts). */
export const LEBENSDATUM_HERKUNFT = ['aussage', 'ereignis'] as const

export type LebensdatumHerkunft = (typeof LEBENSDATUM_HERKUNFT)[number]

/** Zu welchem Rückfall-Ereignis (Geburt/Tod) gehört eine Angabe? */
export function lebensdatumArt(angabe: LebensdatumAngabe): RueckfallArt {
  return angabe === 'geburtsdatum' || angabe === 'geburtsort' ? 'geburt' : 'tod'
}

function istOrtsAngabe(angabe: LebensdatumAngabe): boolean {
  return angabe === 'geburtsort' || angabe === 'todesort'
}

/** Die Wertspalten einer Aussage (`wert_text`/`wert_zahl`/`wert_ref_id`/`datum_wert1`). */
export interface AussageWerte extends OrtWert {
  readonly wertZahl: number | null
  readonly datumWert1: string | null
}

/** Eine Datums-Aussage trägt einen Wert, sobald eine Wertspalte gesetzt ist (D1). */
export function aussageHatWert(werte: AussageWerte): boolean {
  return werte.wertText !== null || werte.wertZahl !== null || werte.wertRefId !== null || werte.datumWert1 !== null
}

/** Ein Ereignis trägt einen Ort, sobald `ort_id` gesetzt ist. */
export function ereignisHatOrt(ereignis: { readonly ortId: string | null }): boolean {
  return ereignis.ortId !== null
}

/** Trägt eine Aussage einen Wert für diese Angabe? Ort: `traegtOrt` (Verweis oder freier Text, nie
 * Zahl/Datum, V-5-altbestand); Datum: `aussageHatWert`. */
export function aussageTraegtAngabe(angabe: LebensdatumAngabe, aussage: AussageWerte): boolean {
  return istOrtsAngabe(angabe) ? traegtOrt(aussage) : aussageHatWert(aussage)
}

export interface LebensdatumEreignisWerte extends EreignisDatum {
  readonly ortId: string | null
}

/** Trägt ein Rückfall-Ereignis einen Wert für diese Angabe? Ort: `ereignisHatOrt`; Datum:
 * `ereignisHatDatum`. */
export function ereignisTraegtAngabe(angabe: LebensdatumAngabe, ereignis: LebensdatumEreignisWerte): boolean {
  return istOrtsAngabe(angabe) ? ereignisHatOrt(ereignis) : ereignisHatDatum(ereignis)
}

export interface LebensdatumAussage extends AussageWerte {
  readonly id: string
  readonly istBevorzugt: boolean
}

/** Ein Rückfall-Ereignis der passenden Art — der AUFRUFER filtert mit `istRueckfallEreignis`. */
export interface LebensdatumEreignis extends LebensdatumEreignisWerte {
  readonly id: string
}

export interface Lebensdatum {
  readonly angabe: LebensdatumAngabe
  readonly herkunft: LebensdatumHerkunft
  /** Nur bei `herkunft = 'aussage'`. */
  readonly aussageId: string | null
  /** Nur bei `herkunft = 'ereignis'`. */
  readonly ereignisId: string | null
}

/** Kleinere `id` zuerst (Zeichenkettenvergleich, UUID v7 sortiert zeitlich). */
function nachId<T extends { readonly id: string }>(a: T, b: T): number {
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}

/** Woher kommt der Wert EINER Angabe? `null`, wenn weder Aussage noch Rückfall-Ereignis einen Wert
 * trägt. Die Eingaben werden nicht verändert. */
export function lebensdatumAufloesen(
  angabe: LebensdatumAngabe,
  aussagen: readonly LebensdatumAussage[],
  ereignisse: readonly LebensdatumEreignis[],
): Lebensdatum | null {
  const fuehrung = fuehrendeQuelle(
    aussagen,
    (aussage) => aussageTraegtAngabe(angabe, aussage),
    ereignisse,
    (ereignis) => ereignisTraegtAngabe(angabe, ereignis),
  )
  if (fuehrung === null) return null
  if (fuehrung.herkunft === 'aussage') {
    const mitWert = [...fuehrung.kandidaten].sort(nachId)
    const gewaehlt = mitWert.find((aussage) => aussage.istBevorzugt) ?? mitWert[0]
    return gewaehlt === undefined ? null : { angabe, herkunft: 'aussage', aussageId: gewaehlt.id, ereignisId: null }
  }
  const ereignis = [...fuehrung.kandidaten].sort(nachId)[0]
  return ereignis === undefined ? null : { angabe, herkunft: 'ereignis', aussageId: null, ereignisId: ereignis.id }
}
