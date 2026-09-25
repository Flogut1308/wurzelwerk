// AP-1.34 PR-D (hueter #123, H1): EINE Wahrheit dafür, ob eine Orts-Aussage (`geburtsort`,
// `todesort`) einen Ort trägt — genutzt von `sterbeortAufloesen` (./sterbeort.ts) und
// `kernangabenAuswerten` (./kernangaben.ts). Ein Ort ist ein Ortsverweis (`wert_ref_id`) oder ein
// freier Ortstext (`wert_text`); `wert_zahl`/`datum_wert1` tragen keinen Ort, auch wenn
// `aussage.anlegen` sie bei jedem Prädikat zulässt.
//
// Rein (CLAUDE.md §4).

/** Prädikate, deren Wert ein Ort ist (Ortsverweis oder freier Ortstext). `aussage.anlegen`/`.aendern`
 * lehnen an ihnen einen Zahlwert ab (`VALIDIERUNG_ORTSWERT`, Vorarbeiten AP-1.30 PR 5); die
 * Profilabfrage löst ihren `wert_ref_id` als Ort auf, nicht als Person. */
export const ORTS_PRAEDIKATE = ['geburtsort', 'todesort', 'wohnort'] as const

export function istOrtsPraedikat(praedikat: string): boolean {
  return ORTS_PRAEDIKATE.some((ortsPraedikat) => ortsPraedikat === praedikat)
}

export interface OrtWert {
  readonly wertRefId: string | null
  readonly wertText: string | null
}

export function traegtOrt(wert: OrtWert): boolean {
  return wert.wertRefId !== null || wert.wertText !== null
}
