// AP-0.8, 55_Architektur.md §4.4: "Trigger werden erzeugt, nicht geschrieben." Diese Datei WENDET
// den von `pnpm trigger` (skripte/trigger-generieren.ts) erzeugten `jrn_*`-Triggerblock an - sie
// GENERIERT ihn nicht. Aufgerufen von `src/main/datenbank/migration/laeufer.ts` genau einmal nach
// jeder abgeschlossenen Migrationsschleife (nicht je Einzelmigration).
import type Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

interface TriggerNameZeile {
  readonly name: string
}

/**
 * Absoluter Pfad zu `docs/schema/trigger_generiert.sql` - Annahme analog
 * `src/main/datenbank/migration/registrierung.ts` (`migrationsDateiPfad`): `docs/` liegt neben
 * `process.cwd()`, gilt für Vitest und `electron-vite dev`. TODO (dort vermerkt): für die gebaute,
 * gepackte App ist das Bündeln von `docs/` ins Programmpaket eine spätere Aufgabe.
 */
function triggerDateiPfad(): string {
  return join(process.cwd(), 'docs', 'schema', 'trigger_generiert.sql')
}

/** Namen aller vorhandenen `jrn_*`-Trigger, alphabetisch sortiert (für ein deterministisches DROP). */
function vorhandeneJrnTrigger(db: Database.Database): readonly string[] {
  return db
    .prepare<[], TriggerNameZeile>("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'jrn\\_%' ESCAPE '\\'")
    .all()
    .map((zeile) => zeile.name)
    .sort((a, b) => a.localeCompare(b))
}

/**
 * Löscht alle vorhandenen `jrn_*`-Journal-Trigger und wendet `docs/schema/trigger_generiert.sql`
 * neu an (55_Architektur.md §4.4: "als letzter Schritt jeder Migration"). Läuft in einer eigenen
 * Transaktion - analog zu `src/main/datenbank/trigger.ts` (`alleAbgeleitetenNeuAufbauen`) ist das
 * hier keine `src/main/befehle/`-Transaktion (CLAUDE.md §2), sondern selbst die
 * Schema-Wartungsoperation, aufgerufen aus `laeufer.ts` innerhalb dessen eigener Migrationslogik.
 */
export function generierteTriggerAnwenden(db: Database.Database): void {
  db.exec('BEGIN')
  try {
    for (const name of vorhandeneJrnTrigger(db)) {
      // `name` kommt ausschließlich aus sqlite_master (nie aus einer Nutzereingabe) - SQLite
      // erlaubt für Bezeichner (Trigger-/Tabellennamen) ohnehin kein Parameter-Binding, nur für
      // Werte (CLAUDE.md §6), analog zur Begründung bei `PRAGMA user_version` in laeufer.ts.
      db.exec(`DROP TRIGGER ${name}`)
    }
    const inhalt = readFileSync(triggerDateiPfad(), 'utf8')
    db.exec(inhalt)
    db.exec('COMMIT')
  } catch (fehler) {
    db.exec('ROLLBACK')
    throw fehler
  }
}
