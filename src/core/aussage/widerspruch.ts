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
//
// hueter-Auflage 1 (PR #65, E21): E21 verlangt je Feld ZWEI separate Zeichen — einen
// Konfidenz-Indikator MIT Belegzahl (liegt bereits an anderer Stelle vor) UND ein davon
// UNABHÄNGIGES "es gibt konkurrierende Angaben"-Signal, das auch dann noch `true` ist, wenn der
// Widerspruch durch eine Bevorzugung bereits AUFGELÖST wurde (`hatWiderspruch=false`). Dafür
// exportiert dieses Modul zusätzlich `anzahlUnterscheidbareWerte()` — dieselbe Tupelbildung wie
// `hatWiderspruch`, aber ohne die Bevorzugungs-Bedingung. `hatWiderspruch` ist über diese Funktion
// formuliert, damit es genau EINE Tupelquelle für Distinktheit gibt (keine zweite, driftende
// Kopie der COUNT(DISTINCT ...)-Logik).

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
 * zwei Aussagen mit identischen Werten auf denselben Schlüssel fallen. Anti-Drift-Hinweis: der
 * Trigger bildet `wert_zahl` über `CAST(wert_zahl AS TEXT)` auf ein SQLite-`REAL` an
 * (`docs/schema/0002_kern.sql:322`) — dessen Textform wird hier bewusst NICHT "korrigiert"
 * (z. B. via `toFixed`/Rundung), damit die Distinktheit zwischen Core und Trigger konsistent
 * bleibt, statt in einem Grenzfall (z. B. `1` vs. `1.0`) auseinanderzulaufen. */
function tupelSchluessel(wert: AussageWertTupel): string {
  return [wert.wertText ?? '', wert.wertZahl ?? '', wert.wertRefId ?? '', wert.datumWert1 ?? '', wert.datumWert2 ?? ''].join('|')
}

/**
 * Anzahl unterscheidbarer Wert-Tupel innerhalb EINER `praedikat`-Gruppe — das kanonische
 * "es gibt konkurrierende Angaben"-Signal (E21, hueter-Auflage 1 PR #65). Anders als
 * `hatWiderspruch` UNABHÄNGIG von `istBevorzugt`: zwei abweichende Werte bleiben zwei
 * unterscheidbare Werte, auch wenn einer davon bevorzugt ist.
 */
export function anzahlUnterscheidbareWerte(aussagen: readonly AussageFuerWiderspruch[]): number {
  return new Set(aussagen.map((aussage) => tupelSchluessel(aussage.wert))).size
}

/**
 * Widerspruchsregel für EINE `praedikat`-Gruppe (Trigger-Referenz oben): mindestens zwei
 * unterscheidbare Wert-Tupel UND keine der Aussagen `istBevorzugt`. Eine leere oder einelementige
 * Gruppe ist nie widersprüchlich (COUNT(DISTINCT ...) >= 2 kann dafür nie erfüllt sein). Formuliert
 * über `anzahlUnterscheidbareWerte()`, damit es genau EINE Tupelquelle für Distinktheit gibt.
 */
export function hatWiderspruch(aussagen: readonly AussageFuerWiderspruch[]): boolean {
  if (anzahlUnterscheidbareWerte(aussagen) < 2) return false
  return !aussagen.some((aussage) => aussage.istBevorzugt)
}
