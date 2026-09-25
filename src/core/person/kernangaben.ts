// AP-1.34 PR-D (docs/adr/ADR-031-kernangaben-vollstaendigkeitsgrad.md, docs/80_Offene_Fragen.md §31
// U-1.34-E7, Entwicklungsvorgaben §3.1 „68 % der Kernangaben belegt", §4.1 `completeness`):
// Vollständigkeitsgrad einer Person — die EINZIGE Stelle, an der er berechnet wird. Renderer,
// Personenliste, Statistik und Export rechnen ihn nie selbst nach (ADR-031).
//
// Kernangaben und wann sie erfüllt sind (ADR-031 samt Nachtrag vom 25.09.2026, docs/80 §32):
// - name          immer; die Hauptform hat einen Anzeigetext (D1 neu: vorhanden genügt). „belegt" nur,
//                 wenn eine Aussage über die Hauptform einen Beleg hat (D3).
// - geschlecht    immer; M, F oder X — U und „nicht erfasst" zählen nicht, ein Beleg ist nicht nötig (E7, D4).
// - geburtsdatum  immer; die Aussage führt: gibt es eine Aussage mit Wert, zählt sie nur mit Beleg (D1).
//                 Sonst zählt ein Geburts-Ereignis mit Datum, auch ohne Beleg (D9 neu, ./lebensdaten.ts).
// - geburtsort    immer; wie geburtsdatum, eine Aussage „trägt einen Ort" nach `traegtOrt` (Verweis oder
//                 freier Text, NICHT wert_zahl/Datum), das Ereignis über seinen `ort_id`.
// - todesdatum    nur bei `lebend_status = 'verstorben'` (D5); wie geburtsdatum mit dem Tod-Ereignis.
// - todesort      nur bei `verstorben`; wie geburtsort mit dem Tod-Ereignis (E5, D6 — dieselbe Auflösung
//                 wie `sterbeortAufloesen`).
// - vater, mutter immer, zwei Angaben; Platz besetzt (`elternPlaetze`) UND die Kante belegt (D7).
//                 Ist nur ein Elternteil unbestimmbarer Zuordnung da, heißen beide Angaben `elternteil`:
//                 die erste erfüllt, wenn er belegt ist, die zweite nie (D8).
//
// Zustand je Angabe (`aufschluesselung`, §32 V-D3-aufschluesselung/-randfaelle): `belegt` (erfüllt mit
// Beleg), `vorhanden` (erfüllt ohne Beleg: Geschlecht, Name, Ereignis-Rückfall), `unbelegt` (ein Wert
// liegt vor, ihm fehlt der Beleg — zählt nicht), `fehlt`. `fehlend` = Ids mit `unbelegt`/`fehlt`.
//
// Nenner 6 bzw. 8 (verstorben); Prozent abgerundet; Platzhalter → `null` (A-17, E7).
//
// Rein (CLAUDE.md §4): kein Date/Math.random/process/globalThis, keine Mutation der Eingabe.
import { elternPlaetze, type ElternGeschlecht, type ElternteilEintrag } from './eltern-plaetze'
import { fuehrendeQuelle } from './lebensdaten'
import { traegtOrt, type OrtWert } from './ort-wert'

/** Einzige Quelle der Kernangaben-Ids; `src/shared/schemata/person-detail.ts` baut sein Zod-Enum daraus.
 * Reihenfolge = Reihenfolge in `fehlend`. */
export const KERNANGABE_IDS = ['name', 'geschlecht', 'geburtsdatum', 'geburtsort', 'todesdatum', 'todesort', 'vater', 'mutter', 'elternteil'] as const

export type KernangabeId = (typeof KERNANGABE_IDS)[number]

/** Einzige Quelle der Zustände; `src/shared/schemata/person-detail.ts` baut sein Zod-Enum daraus. */
export const KERNANGABE_ZUSTAENDE = ['belegt', 'vorhanden', 'unbelegt', 'fehlt'] as const

export type KernangabeZustand = (typeof KERNANGABE_ZUSTAENDE)[number]

export type KernangabenLebendStatus = 'lebend' | 'verstorben' | 'vermutet_verstorben'

/** Eine Personen-Aussage eines Prädikats: trägt sie einen Wert (`wert_text`/`wert_zahl`/
 * `wert_ref_id`/`datum_wert1`), und hat sie mindestens einen Beleg (`aussage_zitat`)? */
export interface KernAussage {
  readonly hatWert: boolean
  readonly belegt: boolean
}

/** Eine Orts-Aussage (`geburtsort`/`todesort`): ob sie einen Ort trägt, entscheidet allein
 * `traegtOrt` (./ort-wert.ts) — dieselbe Wahrheit wie beim Sterbeort (hueter #123, H1). */
export interface KernOrtAussage extends OrtWert {
  readonly belegt: boolean
}

/** Ein Geburts- bzw. Tod-Rückfall der Person (der Aufrufer filtert mit `istRueckfallEreignis`,
 * ./lebensdaten.ts). `datumVorhanden` nach `ereignisHatDatum`, `ortVorhanden` = `ort_id` gesetzt.
 * `datumBelegt`/`ortBelegt`: die Existenz-Aussage des Ereignisses hat einen Beleg mit Feld NULL
 * (ganze Aussage) bzw. dem Feld `datum`/`ort`. */
export interface KernEreignis {
  readonly datumVorhanden: boolean
  readonly ortVorhanden: boolean
  readonly datumBelegt: boolean
  readonly ortBelegt: boolean
}

/** Eine Elternkante; `belegt` = eine Aussage an genau dieser Kante hat einen Beleg. Doppelkanten
 * (gleiche `id`) sind ein Elternteil — belegt, wenn eine der Kanten belegt ist. */
export interface KernElternteil extends ElternteilEintrag {
  readonly belegt: boolean
}

export interface KernangabenEingabe {
  readonly istPlatzhalter: boolean
  readonly lebendStatus: KernangabenLebendStatus | null
  readonly geschlecht: ElternGeschlecht | null
  /** Die Hauptform hat einen nicht-leeren Anzeigetext (`anzeigetextVon`, src/core/name/anzeigename.ts). */
  readonly nameVorhanden: boolean
  /** Eine Aussage über die Hauptform hat mindestens einen Beleg (D3). */
  readonly hauptformBelegt: boolean
  readonly geburtsdatum: readonly KernAussage[]
  readonly geburtsort: readonly KernOrtAussage[]
  readonly todesdatum: readonly KernAussage[]
  readonly todesort: readonly KernOrtAussage[]
  readonly geburtEreignisse: readonly KernEreignis[]
  readonly todEreignisse: readonly KernEreignis[]
  readonly eltern: readonly KernElternteil[]
}

export interface Kernangaben {
  readonly erfuellt: number
  readonly anwendbar: number
  /** `Math.floor(erfuellt * 100 / anwendbar)` — abgerundet (E7). */
  readonly prozent: number
  /** Multimenge der nicht erfüllten Angaben in `KERNANGABE_IDS`-Reihenfolge; `elternteil` kann zweimal
   * vorkommen. Immer `fehlend.length === anwendbar - erfuellt`. */
  readonly fehlend: readonly KernangabeId[]
  /** Eine Zeile je anwendbarer Angabe, in `KERNANGABE_IDS`-Reihenfolge (`elternteil` ggf. zweimal). */
  readonly aufschluesselung: readonly KernangabeEintrag[]
}

export interface KernangabeEintrag {
  readonly id: KernangabeId
  readonly zustand: KernangabeZustand
}

/** Zustand einer aus Aussage oder Rückfall-Ereignis aufgelösten Angabe (./lebensdaten.ts). */
function lebensdatumZustand<A extends { readonly belegt: boolean }>(
  aussagen: readonly A[],
  aussageTraegt: (aussage: A) => boolean,
  ereignisse: readonly KernEreignis[],
  ereignisTraegt: (ereignis: KernEreignis) => boolean,
  ereignisBelegt: (ereignis: KernEreignis) => boolean,
): KernangabeZustand {
  const fuehrung = fuehrendeQuelle(aussagen, aussageTraegt, ereignisse, ereignisTraegt)
  if (fuehrung === null) return 'fehlt'
  if (fuehrung.herkunft === 'aussage') return fuehrung.kandidaten.some((a) => a.belegt) ? 'belegt' : 'unbelegt'
  return fuehrung.kandidaten.some(ereignisBelegt) ? 'belegt' : 'vorhanden'
}

function datumZustand(aussagen: readonly KernAussage[], ereignisse: readonly KernEreignis[]): KernangabeZustand {
  return lebensdatumZustand(aussagen, (a) => a.hatWert, ereignisse, (e) => e.datumVorhanden, (e) => e.datumBelegt)
}

function ortZustand(aussagen: readonly KernOrtAussage[], ereignisse: readonly KernEreignis[]): KernangabeZustand {
  return lebensdatumZustand(aussagen, traegtOrt, ereignisse, (e) => e.ortVorhanden, (e) => e.ortBelegt)
}

function nameZustand(eingabe: KernangabenEingabe): KernangabeZustand {
  if (!eingabe.nameVorhanden) return 'fehlt'
  return eingabe.hauptformBelegt ? 'belegt' : 'vorhanden'
}

function istErfuellt(zustand: KernangabeZustand): boolean {
  return zustand === 'belegt' || zustand === 'vorhanden'
}

export function kernangabenAuswerten(eingabe: KernangabenEingabe): Kernangaben | null {
  if (eingabe.istPlatzhalter) return null

  const geschlechtErfasst = eingabe.geschlecht === 'M' || eingabe.geschlecht === 'F' || eingabe.geschlecht === 'X'
  const angaben: KernangabeEintrag[] = [
    { id: 'name', zustand: nameZustand(eingabe) },
    { id: 'geschlecht', zustand: geschlechtErfasst ? 'vorhanden' : 'fehlt' },
    { id: 'geburtsdatum', zustand: datumZustand(eingabe.geburtsdatum, eingabe.geburtEreignisse) },
    { id: 'geburtsort', zustand: ortZustand(eingabe.geburtsort, eingabe.geburtEreignisse) },
  ]
  if (eingabe.lebendStatus === 'verstorben') {
    angaben.push(
      { id: 'todesdatum', zustand: datumZustand(eingabe.todesdatum, eingabe.todEreignisse) },
      { id: 'todesort', zustand: ortZustand(eingabe.todesort, eingabe.todEreignisse) },
    )
  }

  const belegteEltern = new Set(eingabe.eltern.filter((e) => e.belegt).map((e) => e.id))
  const plaetze = elternPlaetze(eingabe.eltern)
  const platzZustand = (id: string | null): KernangabeZustand => {
    if (id === null) return 'fehlt'
    return belegteEltern.has(id) ? 'belegt' : 'unbelegt'
  }
  if (plaetze.unbestimmt !== null) {
    angaben.push({ id: 'elternteil', zustand: platzZustand(plaetze.unbestimmt) }, { id: 'elternteil', zustand: 'fehlt' })
  } else {
    angaben.push({ id: 'vater', zustand: platzZustand(plaetze.vater) }, { id: 'mutter', zustand: platzZustand(plaetze.mutter) })
  }

  const erfuellt = angaben.filter((a) => istErfuellt(a.zustand)).length
  const anwendbar = angaben.length
  return {
    erfuellt,
    anwendbar,
    prozent: Math.floor((erfuellt * 100) / anwendbar),
    fehlend: angaben.filter((a) => !istErfuellt(a.zustand)).map((a) => a.id),
    aufschluesselung: angaben,
  }
}
