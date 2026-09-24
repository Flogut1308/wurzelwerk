// AP-1.34 PR-C2a (docs/80_Offene_Fragen.md §31 U-1.34-E5, Eigentümer: „Sterbeort = beides"):
// Welcher Ort gilt als Sterbeort einer Person?
//
// 1. Führend ist die Aussage `todesort` (symmetrisch zu `geburtsort`). Unter mehreren gewinnt die
//    bevorzugte (`ist_bevorzugt`), sonst die kleinste `id` (UUID v7 = älteste zuerst, stabil).
//    Eine Aussage zählt als vorhanden, sobald sie einen Wert trägt — `wert_ref_id` (Ortsverweis)
//    ODER `wert_text` (freier Ortstext ohne Ortsdatensatz, dann `ortId = null`). Eine Aussage ohne
//    beides trägt keinen Ort und wird übergangen.
// 2. Fehlt eine solche Aussage, gilt der Ort des Tod-Ereignisses (Rückfall). Der AUFRUFER filtert
//    auf Ereignisse `typ = 'tod'` mit Beteiligung der Person in der Rolle `verstorbener` — hier
//    kommt nur `{id, ortId}` an. Unter mehreren gewinnt das mit Ort und kleinster `id`.
// 3. Sonst `null`.
//
// Rein (CLAUDE.md §4): kein Date/Math.random/process/globalThis, keine Mutation der Eingaben.

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

/** Einzige Quelle der Herkunftswerte; `src/shared/schemata/person-detail.ts` baut sein Zod-Enum daraus. */
export const STERBEORT_HERKUNFT = ['aussage', 'ereignis'] as const

export type SterbeortHerkunft = (typeof STERBEORT_HERKUNFT)[number]

export interface Sterbeort {
  readonly herkunft: SterbeortHerkunft
  readonly ortId: string | null
  readonly aussageId: string | null
}

/** Kleinere `id` zuerst (Zeichenkettenvergleich, UUID v7 sortiert zeitlich). */
function nachId<T extends { readonly id: string }>(a: T, b: T): number {
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}

export function sterbeortAufloesen(
  aussagen: readonly SterbeortAussage[],
  todEreignisse: readonly SterbeortTodEreignis[],
): Sterbeort | null {
  const mitWert = aussagen.filter((a) => a.wertRefId !== null || a.wertText !== null).sort(nachId)
  const gewaehlt = mitWert.find((a) => a.istBevorzugt) ?? mitWert[0]
  if (gewaehlt !== undefined) {
    return { herkunft: 'aussage', ortId: gewaehlt.wertRefId, aussageId: gewaehlt.id }
  }

  const ereignis = todEreignisse.filter((e) => e.ortId !== null).sort(nachId)[0]
  if (ereignis !== undefined) {
    return { herkunft: 'ereignis', ortId: ereignis.ortId, aussageId: null }
  }
  return null
}
