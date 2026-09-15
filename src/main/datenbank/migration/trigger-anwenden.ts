// AP-0.8, 55_Architektur.md §4.4: "Trigger werden erzeugt, nicht geschrieben." Diese Datei WENDET
// den von `pnpm trigger` (skripte/trigger-generieren.ts) erzeugten `jrn_*`-Triggerblock an - sie
// GENERIERT ihn nicht. `generierteTriggerAnwenden()` wird von `./laeufer.ts` genau einmal nach
// jeder abgeschlossenen Migrationsschleife aufgerufen (nicht je Einzelmigration) - das erreicht
// aber nur Datenbanken, für die gerade tatsächlich eine Migration lief. `triggerdriftAusgleichen()`
// (AP-0.24, F-06, in `../journal-trigger-anwenden.ts`) schließt die Lücke für bestehende Dateien
// und importiert `generierteTriggerAnwenden` von hier.
//
// AP-0.25 PR-1: eigenständige, abhängigkeitsfreie Datei (keine Kante zu `../journal-trigger-anwenden`
// bzw. `./laeufer`), damit `./laeufer.ts` und `../journal-trigger-anwenden.ts` keinen Importzyklus
// mehr bilden - `laeufer.ts` importiert `generierteTriggerAnwenden` von hier statt von dort.
import type Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

interface TriggerNameZeile {
  readonly name: string
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
 * Absoluter Pfad zu `trigger_generiert.sql`, angehängt an ein **übergebenes** Basisverzeichnis
 * (AP-0.17) - analog `src/main/datenbank/migration/registrierung.ts` (`migrationsDateiPfad`):
 * diese Funktion trifft selbst keine Annahme über den Prozess, der Aufrufer entscheidet.
 */
function triggerDateiPfad(basisverzeichnis: string): string {
  return join(basisverzeichnis, 'trigger_generiert.sql')
}

/**
 * Löscht alle vorhandenen `jrn_*`-Journal-Trigger und wendet `docs/schema/trigger_generiert.sql`
 * neu an (55_Architektur.md §4.4: "als letzter Schritt jeder Migration"). Läuft in einer eigenen
 * Transaktion - analog zu `src/main/datenbank/trigger.ts` (`alleAbgeleitetenNeuAufbauen`) ist das
 * hier keine `src/main/befehle/`-Transaktion (CLAUDE.md §2), sondern selbst die
 * Schema-Wartungsoperation, aufgerufen aus `laeufer.ts` innerhalb dessen eigener Migrationslogik.
 */
export function generierteTriggerAnwenden(db: Database.Database, basisverzeichnis: string): void {
  db.exec('BEGIN')
  try {
    for (const name of vorhandeneJrnTrigger(db)) {
      // `name` kommt ausschließlich aus sqlite_master (nie aus einer Nutzereingabe) - SQLite
      // erlaubt für Bezeichner (Trigger-/Tabellennamen) ohnehin kein Parameter-Binding, nur für
      // Werte (CLAUDE.md §6), analog zur Begründung bei `PRAGMA user_version` in laeufer.ts.
      db.exec(`DROP TRIGGER ${name}`)
    }
    const inhalt = readFileSync(triggerDateiPfad(basisverzeichnis), 'utf8')
    db.exec(inhalt)
    db.exec('COMMIT')
  } catch (fehler) {
    db.exec('ROLLBACK')
    throw fehler
  }
}
