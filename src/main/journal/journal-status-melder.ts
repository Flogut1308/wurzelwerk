// AP-0.10 PR-A2, 55_Architektur.md §2.5/§4.9: bündelt "wer muss erfahren, dass sich der
// Undo/Redo-Status geändert hat" an EINER Stelle - Renderer (`ereignis:journalStatus`, bestehend
// seit AP-0.9) UND das native Hauptprozess-Menü (`src/main/menue/menue.ts`, neu ab AP-0.10).
// `src/main/menue/menue.ts` registriert sich hier als Beobachter, statt dass `src/main/befehle/
// bus.ts` oder `src/main/ipc/registrierung.ts` `menue.ts` direkt importieren müssten (CLAUDE.md
// §12-Auftrag AP-0.10: kein Import `bus.ts` → `menue.ts`, sonst entsteht ein Importzyklus/eine
// unnötige Kopplung zwischen Befehlsbus und Menü).
import type Database from 'better-sqlite3'
import type { JournalStatusNutzlast } from '../../shared/ipc/vertrag'
import { sendeEreignis } from '../ipc/ereignisse'
import { status } from '../repositories/journal-repo'

/** Der Status bei keinem offenen Projekt (Menü ausgegraut, `ereignis:journalStatus` entsprechend). */
export const JOURNAL_STATUS_KEIN_PROJEKT: JournalStatusNutzlast = {
  undoMoeglich: false,
  redoMoeglich: false,
  undoBeschreibung: null,
  redoBeschreibung: null,
}

let beobachter: ((nutzlast: JournalStatusNutzlast) => void) | undefined

/**
 * Registriert den EINEN Beobachter für die Menü-Aktualisierung (`menueInitialisieren()` in
 * `src/main/menue/menue.ts`). Ein zweiter Aufruf ersetzt den ersten - es gibt in diesem Prozess nie
 * mehr als ein Menü.
 */
export function journalStatusBeobachterSetzen(fn: (nutzlast: JournalStatusNutzlast) => void): void {
  beobachter = fn
}

/**
 * Meldet den aktuellen Journalstatus an den Renderer (`ereignis:journalStatus`) UND an den
 * registrierten Beobachter (Menü). `db === undefined` heißt: kein Projekt offen (§4.9 gilt nur mit
 * einer offenen Datenbank).
 */
export function journalStatusMelden(db: Database.Database | undefined): void {
  const nutzlast = db === undefined ? JOURNAL_STATUS_KEIN_PROJEKT : status(db)
  sendeEreignis('ereignis:journalStatus', nutzlast)
  beobachter?.(nutzlast)
}
