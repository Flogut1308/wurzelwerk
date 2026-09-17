// Gemeinsamer Helfer für die Trockenlauf-Tests (AP-1.4a). Anders als
// `test/einheit/_hilfen-abgeleitet.ts` (`frischeDatenbankMitAbgeleitetemSchema()`) schaltet dieser
// Helfer das Journal NICHT ab: der Trockenlauf-Bericht wird aus den `aenderung`-Zeilen gebaut
// (56_Import_Vertrag.md §6.1) — ein Test, der das Journal deaktiviert, würde nie eine einzige
// `aenderung`-Zeile sehen. `migrieren()` lässt das Journal in seinem Standardzustand scharf
// ("scharfer Ruhezustand ab der ersten Migration", 55_Architektur.md §4.3, s. Kopfkommentar von
// `_hilfen-abgeleitet.ts`).
import type Database from 'better-sqlite3'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'

/** Frische, vollständig migrierte `:memory:`-Datenbank mit AKTIVEM Journal + `vocab`-Hilfstabelle
 * (für `abgeleiteterAbzug()`). Aufrufer schließt die Verbindung selbst (`db.close()`). */
export function frischeDatenbankMitJournal(): Database.Database {
  const db = oeffnen(':memory:')
  migrieren(db)
  db.exec("CREATE VIRTUAL TABLE vocab USING fts5vocab('suche_fts', 'instance')")
  return db
}
