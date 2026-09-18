// AP-1.7 PR-A (Profilseite, lesend). Reine Kern-Funktion, die exakt die Widerspruchsregel des
// generierten Triggers `abl_aussage_ai` spiegelt (docs/schema/0003_abgeleitet.sql Z.66-75, dort
// analog in `abl_aussage_au`/`abl_aussage_ad`/`abl_name_ai`/`abl_name_au`/`abl_name_ad`/
// `abl_person_ai`): innerhalb EINER `aussage.praedikat`-Gruppe gilt eine Person als
// "widersprüchlich", wenn es mindestens zwei UNTERSCHEIDBARE Wert-Tupel
// (wert_text|wert_zahl|wert_ref_id|datum_wert1|datum_wert2) gibt UND KEINE der Aussagen als
// `ist_bevorzugt` markiert ist.
//
// Der Trigger bleibt die einzige SQL-Quelle der Wahrheit für `person_flach.hat_widerspruch`
// (Kopfkommentar 0003_abgeleitet.sql: "Abgeleitete Tabellen tragen keine Wahrheit"). Diese
// Funktion baut dieselbe Regel NICHT ein zweites Mal in SQL nach — sie ist der In-Memory-Spiegel,
// den `src/main/abfragen/person-detail.ts` auf Feld-Ebene braucht (eine Person, ein Prädikat), weil
// `person_flach.hat_widerspruch` nur einen einzigen Bool über ALLE Prädikate einer Person trägt,
// die Profilseite aber je Feld wissen muss, OB genau DIESES Prädikat widersprüchlich ist.
//
// Reine, deterministische Funktion (CLAUDE.md §4: kein Date.now/Math.random/process/globalThis in
// src/core) — dieselbe Eingabe liefert immer dieselbe Ausgabe.

/** Das Wert-Tupel einer `aussage`-Zeile, genau die fünf Spalten, die der Trigger zur
 * Unterscheidbarkeit heranzieht (docs/schema/0002_kern.sql `aussage`). */
export interface AussageWertTupel {
  readonly wertText: string | null
  readonly wertZahl: number | null
  readonly wertRefId: string | null
  readonly datumWert1: string | null
  readonly datumWert2: string | null
}

/** Eine Aussage, reduziert auf das, was `hatWiderspruch` braucht: ihr Wert-Tupel und ob sie als
 * bevorzugt markiert ist. Die Eingabe ist bereits nach EINEM `praedikat` gefiltert — diese
 * Funktion kennt `praedikat` selbst nicht, das Gruppieren passiert beim Aufrufer. */
export interface AussageFuerWiderspruch {
  readonly wert: AussageWertTupel
  readonly istBevorzugt: boolean
}

/** Baut denselben verketteten Schlüssel wie der Trigger (COALESCE(..., '') || '|' || ...), damit
 * zwei Aussagen mit identischen Werten auf denselben Schlüssel fallen. */
function tupelSchluessel(wert: AussageWertTupel): string {
  return [wert.wertText ?? '', wert.wertZahl ?? '', wert.wertRefId ?? '', wert.datumWert1 ?? '', wert.datumWert2 ?? ''].join('|')
}

/**
 * Widerspruchsregel für EINE `praedikat`-Gruppe (Trigger-Referenz oben): mindestens zwei
 * unterscheidbare Wert-Tupel UND keine der Aussagen `istBevorzugt`. Eine leere oder einelementige
 * Gruppe ist nie widersprüchlich (COUNT(DISTINCT ...) >= 2 kann dafür nie erfüllt sein).
 */
export function hatWiderspruch(aussagen: readonly AussageFuerWiderspruch[]): boolean {
  const unterscheidbareSchluessel = new Set(aussagen.map((aussage) => tupelSchluessel(aussage.wert)))
  if (unterscheidbareSchluessel.size < 2) return false
  return !aussagen.some((aussage) => aussage.istBevorzugt)
}
