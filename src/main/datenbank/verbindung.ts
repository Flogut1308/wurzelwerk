import Database from 'better-sqlite3'
import { v7 as uuidv7 } from 'uuid'
import { koelnerPhonetik } from '../../core/name/koelner-phonetik'
import { suchnormalform } from '../../core/name/suchnormalform'

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
  // AP-0.7 (55_Architektur.md §5.2): Trigger UND `alleAbgeleitetenNeuAufbauen()` rufen exakt
  // dieselben SQL-Funktionen auf - das ist die Bitgleichheits-Garantie. `deterministic: true`
  // erlaubt SQLite, die Funktionen in Indizes/generierten Spalten zu verwenden und Aufrufe mit
  // gleichem Argument zu cachen; beide Funktionen hier sind reine Funktionen aus src/core (CLAUDE.md
  // §4: kein Date.now/Math.random dort), erfüllen die Zusage also tatsächlich. Varargs-Guard: SQL
  // NULL kommt hier nie als JS `undefined` an (better-sqlite3 reicht `null` durch) - `arg ?? ''`
  // deckt beide ab, weil `src/core` selbst nichts von SQL/NULL wissen darf.
  db.function('suchnormalform', { deterministic: true }, (arg: unknown) => suchnormalform(textArgument(arg)))
  db.function('koelner_phonetik', { deterministic: true }, (arg: unknown) => koelnerPhonetik(textArgument(arg)))
  return db
}

/** SQL-Funktionsargumente sind `unknown` (better-sqlite3), NULL wird als leerer Text behandelt. */
function textArgument(arg: unknown): string {
  return typeof arg === 'string' ? arg : ''
}
