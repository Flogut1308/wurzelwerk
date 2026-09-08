// Gemeinsame Helfer für test/schema/*.test.ts (AP-0.6 PR-B, CLAUDE.md §13 geschützter Prüfpfad).
// Zwei Bausteine: eine frische, vollständig migrierte In-Memory-Datenbank (Muster aus
// test/migration/historisch.test.ts) und ein kleiner Parser für `CHECK (spalte IN (…))`-Klauseln
// aus dem rohen CREATE-TABLE-Text (sqlite_master.sql) — für den Vergleich Schema↔Zod.
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'

/**
 * Öffnet eine frische, vollständig migrierte In-Memory-Datenbank über die einzige erlaubte Stelle
 * für Pragmas (`src/main/datenbank/verbindung.ts`, CLAUDE.md §6) — `foreign_keys = ON` gilt damit
 * wie im laufenden Betrieb. Aufrufer schließt die Verbindung selbst (`db.close()`).
 */
export function frischeMigrierteDatenbank(): Database.Database {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

const TabellenListeZeileSchema = z.object({
  schema: z.string(),
  name: z.string(),
  type: z.string(),
  ncol: z.number().int(),
  wr: z.number().int(),
  strict: z.number().int(),
})
export type TabellenListeZeile = z.infer<typeof TabellenListeZeileSchema>

/** `PRAGMA table_list` liefert laut Typdefinition `unknown` — hier geprüft (CLAUDE.md §4). */
function tabellenListeRoh(db: Database.Database): readonly TabellenListeZeile[] {
  return z.array(TabellenListeZeileSchema).parse(db.pragma('table_list'))
}

/** Alle Anwender-Tabellen (kein `sqlite_*`, keine Views, kein `temp`-Schema). */
export function anwenderTabellen(db: Database.Database): readonly TabellenListeZeile[] {
  return tabellenListeRoh(db).filter(
    (zeile) => zeile.type === 'table' && zeile.schema === 'main' && !zeile.name.startsWith('sqlite_'),
  )
}

/** Nur die Namen, für `it.each` und Mengenvergleiche. */
export function anwenderTabellenNamen(db: Database.Database): readonly string[] {
  return anwenderTabellen(db)
    .map((zeile) => zeile.name)
    .sort((a, b) => a.localeCompare(b))
}

const SpaltenInfoSchema = z.object({
  cid: z.number().int(),
  name: z.string(),
  type: z.string(),
  notnull: z.number().int(),
  dflt_value: z.unknown(),
  pk: z.number().int(),
})
export type SpaltenInfo = z.infer<typeof SpaltenInfoSchema>

/**
 * `PRAGMA table_info(<tabelle>)` je Tabelle. `tabelle` kommt ausschließlich aus den fest
 * verdrahteten Konstanten dieser Testdateien (nie aus einer Nutzereingabe) — SQLite erlaubt für
 * `PRAGMA table_info(...)` kein Parameter-Binding auf den Tabellennamen, daher Interpolation ohne
 * Injektionsrisiko (analog zur Begründung bei `PRAGMA user_version` in laeufer.ts).
 */
export function spaltenInfo(db: Database.Database, tabelle: string): readonly SpaltenInfo[] {
  return z.array(SpaltenInfoSchema).parse(db.pragma(`table_info(${tabelle})`))
}

export function spaltenNamen(db: Database.Database, tabelle: string): readonly string[] {
  return spaltenInfo(db, tabelle).map((spalte) => spalte.name)
}

const FremdschluesselZeileSchema = z.object({
  id: z.number().int(),
  seq: z.number().int(),
  table: z.string(),
  from: z.string(),
  to: z.string().nullable(),
  on_update: z.string(),
  on_delete: z.string(),
  match: z.string(),
})
export type FremdschluesselZeile = z.infer<typeof FremdschluesselZeileSchema>

/** `PRAGMA foreign_key_list(<tabelle>)` — Tabellenname aus denselben Gründen interpoliert wie oben. */
export function fremdschluesselListe(db: Database.Database, tabelle: string): readonly FremdschluesselZeile[] {
  return z.array(FremdschluesselZeileSchema).parse(db.pragma(`foreign_key_list(${tabelle})`))
}

/** Rohes `CREATE TABLE …`-SQL aus `sqlite_master`, wie es die Migration angewendet hat. */
export function createTableSqlVon(db: Database.Database, tabelle: string): string {
  const zeile = db
    .prepare<{ readonly name: string }, { readonly sql: string | null }>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = @name",
    )
    .get({ name: tabelle })
  if (zeile === undefined || zeile.sql === null) {
    throw new Error(`Kein CREATE-TABLE-SQL für Tabelle "${tabelle}" gefunden — Tabellenname prüfen.`)
  }
  return zeile.sql
}

/**
 * Parst `CHECK (spalte IN ('a','b',…))`-Klauseln mit String-Literalen aus einem rohen
 * CREATE-TABLE-Text. Bewusst nur String-Literale: `CHECK (spalte IN (0,1))` (Boolean-Konvention,
 * CLAUDE.md §4 STRICT), `CHECK (konfidenz BETWEEN 1 AND 4)` und `CHECK (id = 1)` haben eigene,
 * gesonderte Prüfungen und sollen hier nicht mitgezählt werden.
 */
export function checkInSpaltenAusSql(createTableSql: string): ReadonlyMap<string, ReadonlySet<string>> {
  const ergebnis = new Map<string, ReadonlySet<string>>()
  const klauselRegex = /CHECK\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+IN\s*\(((?:'(?:[^']|'')*'\s*,?\s*)+)\)\s*\)/g
  for (const treffer of createTableSql.matchAll(klauselRegex)) {
    const spalte = treffer[1]
    const literalListe = treffer[2]
    if (spalte === undefined || literalListe === undefined) {
      continue
    }
    const literalRegex = /'((?:[^']|'')*)'/g
    const werte = new Set(
      Array.from(literalListe.matchAll(literalRegex)).map((literalTreffer) => {
        const roh = literalTreffer[1]
        return roh === undefined ? '' : roh.replace(/''/g, "'")
      }),
    )
    ergebnis.set(spalte, werte)
  }
  return ergebnis
}

/** Prüft `CHECK (spalte BETWEEN 1 AND 4)` (Konfidenzskala, N.1/E-1/E-9) im rohen CREATE-TABLE-Text. */
export function hatKonfidenzBetweenCheck(createTableSql: string, spalte: string): boolean {
  const regex = new RegExp(`CHECK\\s*\\(\\s*${spalte}\\s+BETWEEN\\s+1\\s+AND\\s+4\\s*\\)`)
  return regex.test(createTableSql)
}

/**
 * Namen aller Trigger auf `tabelle` (`sqlite_master.tbl_name`), alphabetisch sortiert (AP-0.8,
 * test/schema/trigger-vorhanden.test.ts). Erfasst sowohl `abl_*`- als auch `jrn_*`-Trigger — die
 * Filterung nach Präfix bleibt Sache des Aufrufers.
 */
export function triggerNamenFuerTabelle(db: Database.Database, tabelle: string): readonly string[] {
  const zeilen = db
    .prepare<{ readonly tabelle: string }, { readonly name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = @tabelle",
    )
    .all({ tabelle })
  return zeilen.map((zeile) => zeile.name).sort((a, b) => a.localeCompare(b))
}
