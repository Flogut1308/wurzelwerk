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
// Rein (CLAUDE.md §4): kein Date/Math.random/process/globalThis, keine Mutation der Eingaben.

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
