// Gemeinsamer Helfer für Tests, die AP-0.7s abgeleitetes Schema brauchen, OHNE dass es als
// Migration v3 registriert ist (bewusste PR-A-Entscheidung, siehe docs/schema/0003_abgeleitet.sql
// Kopfkommentar). `docs/schema/0003_abgeleitet.sql` wird darum nicht über `migrieren()` erreicht,
// sondern direkt (readFileSync + db.exec) auf eine bereits per `migrieren()` auf SCHEMA_VERSION
// (aktuell 2) gebrachte Datenbank angewendet — genau das Muster, das PR-B dann durch eine echte
// Migration v3 ersetzt.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'

/**
 * Frische, migrierte (bis `SCHEMA_VERSION`) In-Memory-Datenbank mit zusätzlich direkt angewendetem
 * `docs/schema/0003_abgeleitet.sql` (person_flach, suche_fts, suche_fts_quelle, abl_*-Trigger).
 * Aufrufer schließt die Verbindung selbst (`db.close()`).
 */
export function frischeDatenbankMitAbgeleitetemSchema(): Database.Database {
  const db = oeffnen(':memory:')
  migrieren(db)
  const abgeleitetesSchema = readFileSync(join('docs', 'schema', '0003_abgeleitet.sql'), 'utf8')
  db.exec(abgeleitetesSchema)
  return db
}
