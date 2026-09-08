// AP-0.8, 55_Architektur.md §4.3 (ADR-017): Armierung des Änderungsjournals. `journal_kontext`
// ist eine Einzeiler-Kontexttabelle (`id = 1`, docs/schema/0001_grundgeruest.sql) - Trigger können
// keine Anwendungsvariablen lesen, deshalb lesen die `jrn_*`-Trigger (docs/schema/
// trigger_generiert.sql) `transaktion_id`/`aktiv` von hier. Alle Funktionen hier nehmen ein
// Handle innerhalb einer bereits offenen Transaktion entgegen (CLAUDE.md §2: `BEGIN`/`COMMIT`
// bleibt `src/main/befehle/` vorbehalten) - diese Datei öffnet selbst nichts.
import type Database from 'better-sqlite3'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'

/**
 * Scharfschaltung: setzt `transaktion_id` auf die laufende Transaktion. `aktiv = 1` wird hier
 * ebenfalls (erneut) gesetzt, für den Fall, dass eine vorausgehende `journalAus()`-Phase
 * (Migration/Undo-Redo/Großimport, §4.3) nicht selbst wieder scharfgestellt hat.
 */
export function armieren(tx: Database.Database, transaktionId: string): void {
  tx.prepare('UPDATE journal_kontext SET transaktion_id = @transaktionId, aktiv = 1 WHERE id = 1').run({
    transaktionId,
  })
}

/**
 * Entwaffnung: setzt `transaktion_id` zurück auf `NULL`, OHNE das Journal selbst abzuschalten
 * (`aktiv` bleibt `1` - "scharfer Ruhezustand", 55_Architektur.md §4.3). Ein Schreibversuch ohne
 * vorheriges `armieren()` scheitert dadurch weiterhin: die `jrn_*`-Trigger versuchen dann,
 * `aenderung.transaktion_id` mit `NULL` zu befüllen, was an der `NOT NULL`-Bedingung der Spalte
 * abbricht.
 */
export function entwaffnen(tx: Database.Database): void {
  tx.prepare('UPDATE journal_kontext SET transaktion_id = NULL WHERE id = 1').run()
}

/**
 * Schaltet das Journal komplett ab (`aktiv = 0`) - der `WHEN`-Wächter der `jrn_*`-Trigger greift
 * dann nicht mehr, Schreibvorgänge auf journalisierten Tabellen bleiben unprotokolliert möglich.
 * Erlaubt an genau drei Stellen (Migration, Undo/Redo, Großimport, 55_Architektur.md §4.3) - der
 * Pflichtparameter `grund` dokumentiert am Aufrufort, WARUM diese Stelle eine der drei ist.
 * `test/invarianten/journal-vollstaendig.test.ts` (AP-0.8 PR-B) zählt die Produktivcode-Aufrufer
 * namentlich nach; eine vierte Stelle macht diesen Test rot.
 */
export function journalAus(tx: Database.Database, grund: string): void {
  if (grund.trim() === '') {
    throw new WurzelFehler('INTERN_UNERWARTET', 'journalAus() verlangt eine nichtleere Begründung (55_Architektur.md §4.3).')
  }
  tx.prepare('UPDATE journal_kontext SET aktiv = 0 WHERE id = 1').run()
}

/** Schaltet das Journal wieder scharf (Gegenstück zu `journalAus`). */
export function journalAn(tx: Database.Database): void {
  tx.prepare('UPDATE journal_kontext SET aktiv = 1 WHERE id = 1').run()
}
