// AP-0.8, 55_Architektur.md §4.4: "Trigger werden erzeugt, nicht geschrieben." Diese Datei WENDET
// den von `pnpm trigger` (skripte/trigger-generieren.ts) erzeugten `jrn_*`-Triggerblock an - sie
// GENERIERT ihn nicht. `generierteTriggerAnwenden()` wird von `src/main/datenbank/migration/
// laeufer.ts` genau einmal nach jeder abgeschlossenen Migrationsschleife aufgerufen (nicht je
// Einzelmigration) - das erreicht aber nur Datenbanken, für die gerade tatsächlich eine Migration
// lief. `triggerdriftAusgleichen()` (AP-0.24, F-06) schließt die Lücke für bestehende Dateien: ein
// Trigger-Fix OHNE begleitende neue Migration (etwa ein reiner `pnpm trigger`-Neulauf nach einer
// Korrektur in `docs/schema/*.sql`-Kommentaren, die den generierten Body ändert) erreicht sie sonst
// nie, weil `migrieren()` bei bereits aktueller `user_version` ein No-op ist und
// `generierteTriggerAnwenden()` dann gar nicht läuft.
import type Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { migrieren } from './migration/laeufer'
import { oeffnen } from './verbindung'

interface TriggerNameZeile {
  readonly name: string
}

interface TriggerNameSqlZeile {
  readonly name: string
  readonly sql: string
}

/** Alle `jrn_*`-Trigger als `name → sql` (`sqlite_master.sql`, wie SQLite sie verbatim speichert). */
function jrnTriggerAbbild(db: Database.Database): ReadonlyMap<string, string> {
  const zeilen = db
    .prepare<[], TriggerNameSqlZeile>(
      "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'jrn\\_%' ESCAPE '\\'",
    )
    .all()
  return new Map(zeilen.map((zeile) => [zeile.name, zeile.sql]))
}

/**
 * Lazy memoisierte SOLL-Abbilder je Basisverzeichnis (AP-0.24) - die `:memory:`-Referenzmigration
 * unten soll nicht bei jedem `triggerdriftAusgleichen()`-Aufruf (also bei jedem Öffnen eines
 * Projekts) erneut laufen; `test/budget/` beobachtet das Öffnen.
 */
const sollAbbildCache = new Map<string, ReadonlyMap<string, string>>()

/**
 * Referenz-Abbild der `jrn_*`-Trigger, wie SQLite sie nach einer frischen Migration in
 * `sqlite_master` speichert (Round-Trip statt Textvergleich gegen die Datei, s. Modul-Kommentar bei
 * `triggerdriftAusgleichen`).
 */
function sollAbbild(basisverzeichnis: string): ReadonlyMap<string, string> {
  const zwischengespeichert = sollAbbildCache.get(basisverzeichnis)
  if (zwischengespeichert !== undefined) {
    return zwischengespeichert
  }
  const referenzDb = oeffnen(':memory:')
  let abbild: ReadonlyMap<string, string>
  try {
    migrieren(referenzDb, { schemaBasis: basisverzeichnis })
    abbild = jrnTriggerAbbild(referenzDb)
  } finally {
    referenzDb.close()
  }
  sollAbbildCache.set(basisverzeichnis, abbild)
  return abbild
}

/**
 * Absoluter Pfad zu `trigger_generiert.sql`, angehängt an ein **übergebenes** Basisverzeichnis
 * (AP-0.17) - analog `src/main/datenbank/migration/registrierung.ts` (`migrationsDateiPfad`):
 * diese Funktion trifft selbst keine Annahme über den Prozess, der Aufrufer entscheidet.
 */
function triggerDateiPfad(basisverzeichnis: string): string {
  return join(basisverzeichnis, 'trigger_generiert.sql')
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

/**
 * Erkennt Abweichungen zwischen den `jrn_*`-Triggern in `db` und dem SOLL-Stand aus
 * `docs/schema/trigger_generiert.sql` und wendet bei Abweichung `generierteTriggerAnwenden()` neu
 * an. Gibt die Anzahl abweichender (fehlender, überzähliger oder body-mutierter) Trigger zurück -
 * `0` heißt: kein Drift, nichts getan.
 *
 * VERGLEICHSSTRATEGIE (bewusst KEIN Textvergleich gegen die Datei): SQLite speichert
 * `sqlite_master.sql` verbatim so, wie `db.exec()` es entgegengenommen hat (u. a. ohne
 * abschließendes Semikolon, mit einer eigenen Whitespace-Normalisierung) - ein naiver Vergleich des
 * Datei-Texts gegen `sqlite_master.sql` erzeugte darum Dauer-Falsch-Drift, selbst wenn beide Seiten
 * inhaltlich identisch sind. Der Ausweg ist ein Round-Trip: die SOLL-Seite entsteht durch dieselbe
 * `db.exec()`-Speicherung wie die IST-Seite - nur auf einer frischen `:memory:`-Datenbank
 * (`sollAbbild()`, memoisiert je Basisverzeichnis, s. o.). Beide Seiten sind dadurch byte-gleich,
 * wenn sie inhaltlich übereinstimmen, ganz ohne eigene Normalisierung.
 */
export function triggerdriftAusgleichen(db: Database.Database, basisverzeichnis: string): number {
  const soll = sollAbbild(basisverzeichnis)
  const ist = jrnTriggerAbbild(db)

  const namen = new Set([...soll.keys(), ...ist.keys()])
  let abweichend = 0
  for (const name of namen) {
    if (soll.get(name) !== ist.get(name)) {
      abweichend += 1
    }
  }

  if (abweichend > 0) {
    generierteTriggerAnwenden(db, basisverzeichnis)
  }
  return abweichend
}
