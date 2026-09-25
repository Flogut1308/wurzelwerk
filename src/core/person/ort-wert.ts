// AP-1.34 PR-D (hueter #123, H1): EINE Wahrheit dafür, ob eine Orts-Aussage (`geburtsort`,
// `todesort`) einen Ort trägt — genutzt von `sterbeortAufloesen` (./sterbeort.ts) und
// `kernangabenAuswerten` (./kernangaben.ts). Ein Ort ist ein Ortsverweis (`wert_ref_id`) oder ein
// freier Ortstext (`wert_text`); `wert_zahl`/`datum_wert1` tragen keinen Ort. `aussage.anlegen`/
// `.aendern` lehnen beide an Orts-Prädikaten ab (`ortswertVerletzung`); Import und Altbestand können
// sie trotzdem enthalten.
//
// Rein (CLAUDE.md §4).

/** Prädikate, deren Wert ein Ort ist (Ortsverweis oder freier Ortstext). `aussage.anlegen`/`.aendern`
 * lehnen an ihnen einen Zahl- oder Datumswert ab (`VALIDIERUNG_ORTSWERT`, Vorarbeiten AP-1.30 PR 5 und
 * Teil 2 PR 4, `ortswertVerletzung`); die Profilabfrage löst ihren `wert_ref_id` als Ort auf, nicht
 * als Person. */
export const ORTS_PRAEDIKATE = ['geburtsort', 'todesort', 'wohnort'] as const

export function istOrtsPraedikat(praedikat: string): boolean {
  return ORTS_PRAEDIKATE.some((ortsPraedikat) => ortsPraedikat === praedikat)
}

/** Welche Wertart an einem Orts-Prädikat unzulässig ist. */
export type OrtswertVerletzung = 'zahl' | 'datum'

/**
 * Die eine Regel, welche Wertarten ein Orts-Prädikat NICHT trägt: keine Zahl (Vorarbeiten AP-1.30
 * PR 5) und kein Datum (Eigentümer 25.09.2026, docs/80 §32 V-5-datum). Der Gültigkeitszeitraum
 * (`gueltig_von`/`gueltig_bis`) ist kein Wert der Aussage und bleibt erlaubt — „Wohnort 1780–1795"
 * (A-08, §32 V-5b-zeitraum). `null`, wenn nichts verletzt ist; die Zahl wird vor dem Datum gemeldet.
 */
export function ortswertVerletzung(praedikat: string, werte: { readonly hatZahl: boolean; readonly hatDatum: boolean }): OrtswertVerletzung | null {
  if (!istOrtsPraedikat(praedikat)) return null
  if (werte.hatZahl) return 'zahl'
  if (werte.hatDatum) return 'datum'
  return null
}

export interface OrtWert {
  readonly wertRefId: string | null
  readonly wertText: string | null
}

export function traegtOrt(wert: OrtWert): boolean {
  return wert.wertRefId !== null || wert.wertText !== null
}
