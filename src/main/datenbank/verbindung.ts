import Database from 'better-sqlite3'
import { v7 as uuidv7 } from 'uuid'

/**
 * Die einzige Stelle, die eine SQLite-Verbindung öffnet und ihre Pragmas setzt
 * (55_Architektur.md §3.1, ADR-002, §6). `foreign_keys = ON` gilt pro Verbindung, nicht pro
 * Datei — SQLite schaltet sie aus Rückwärtskompatibilität sonst ab, und ohne sie ist das halbe
 * Datenmodell nur Dokumentation. Darum wird `foreign_keys` ausschließlich hier gesetzt.
 */
export function oeffnen(pfad: string): Database.Database {
  const db = new Database(pfad)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.pragma('temp_store = MEMORY')
  db.function('uuid7', () => uuidv7())
  return db
}
