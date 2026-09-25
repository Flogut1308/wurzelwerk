// AP-1.34 PR-C2a (docs/80_Offene_Fragen.md §31 U-1.34-E5, Eigentümer: „Sterbeort = beides"):
// Welcher Ort gilt als Sterbeort einer Person?
//
// 1. Führend ist die Aussage `todesort` (symmetrisch zu `geburtsort`). Unter mehreren gewinnt die
//    bevorzugte (`ist_bevorzugt`), sonst die kleinste `id` (UUID v7 = älteste zuerst, stabil).
//    Eine Aussage zählt als vorhanden, sobald sie einen Wert trägt — `wert_ref_id` (Ortsverweis)
//    ODER `wert_text` (freier Ortstext ohne Ortsdatensatz, dann `ortId = null`). Eine Aussage ohne
//    beides trägt keinen Ort und wird übergangen.
// 2. Fehlt eine solche Aussage, gilt der Ort des Tod-Ereignisses (Rückfall). Der AUFRUFER filtert
//    auf Tod-Rückfälle (`istRueckfallEreignis`, ./lebensdaten.ts: `typ = 'tod'`, Rolle
//    `verstorbener` oder `hauptperson`) — hier kommt nur `{id, ortId}` an. Unter mehreren gewinnt
//    das mit Ort und kleinster `id`.
// 3. Sonst `null`.
// Seit AP-1.30 PR 1 ein dünner Aufruf von `lebensdatumAufloesen('todesort', …)` (./lebensdaten.ts) —
// dieselbe Regel und dieselbe Auswahl wie `abfrage:person.detail.lebensdaten`, keine zweite Auflösung.
//
// Rein (CLAUDE.md §4): kein Date/Math.random/process/globalThis, keine Mutation der Eingaben.
import { LEBENSDATUM_HERKUNFT, lebensdatumAufloesen, type LebensdatumHerkunft } from './lebensdaten'

export interface SterbeortAussage {
  readonly id: string
  readonly istBevorzugt: boolean
  readonly wertRefId: string | null
  readonly wertText: string | null
}

export interface SterbeortTodEreignis {
  readonly id: string
  readonly ortId: string | null
}

/** Einzige Quelle der Herkunftswerte ist `LEBENSDATUM_HERKUNFT` (./lebensdaten.ts); der Name bleibt
 * für `src/shared/schemata/person-detail.ts` (`SterbeortHerkunftEnum`). */
export const STERBEORT_HERKUNFT = LEBENSDATUM_HERKUNFT

export type SterbeortHerkunft = LebensdatumHerkunft

export interface Sterbeort {
  readonly herkunft: SterbeortHerkunft
  readonly ortId: string | null
  readonly aussageId: string | null
}

export function sterbeortAufloesen(
  aussagen: readonly SterbeortAussage[],
  todEreignisse: readonly SterbeortTodEreignis[],
): Sterbeort | null {
  // Zahl- und Datumsspalten tragen an `todesort` nie einen Ort (`traegtOrt`); das Ereignisdatum spielt
  // für den Ort keine Rolle — darum hier `null`, ohne die Auswahl zu verändern.
  const ergebnis = lebensdatumAufloesen(
    'todesort',
    aussagen.map((aussage) => ({ ...aussage, wertZahl: null, datumWert1: null })),
    todEreignisse.map((ereignis) => ({ ...ereignis, datumWert1: null, datumOriginaltext: null })),
  )
  if (ergebnis === null) return null
  if (ergebnis.herkunft === 'aussage') {
    const aussage = aussagen.find((kandidat) => kandidat.id === ergebnis.aussageId)
    return { herkunft: 'aussage', ortId: aussage?.wertRefId ?? null, aussageId: ergebnis.aussageId }
  }
  const ereignis = todEreignisse.find((kandidat) => kandidat.id === ergebnis.ereignisId)
  return { herkunft: 'ereignis', ortId: ereignis?.ortId ?? null, aussageId: null }
}
