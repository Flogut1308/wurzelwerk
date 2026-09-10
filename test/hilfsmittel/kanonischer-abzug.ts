// AP-0.12 — eigenständiger, lokaler Dump-Helfer für `test/einheit/generator-deterministisch.test.ts`.
// BEWUSST NICHT aus `test/invarianten/_kanonischer-abzug.ts` importiert: dieser Pfad ist der
// geschützte Prüfpfad (CLAUDE.md §13, ADR-025) und darf nicht von `test/einheit/` aus referenziert
// werden. Diese Datei bildet dieselbe Idee unabhängig nach (alle Basistabellen sortiert dumpen), ist
// aber eigenständiger, additiver Testcode — keine Änderung am geschützten Pfad.
import type Database from 'better-sqlite3'
import { NICHT_JOURNALISIERT } from '../../src/main/journal/journalisierung'

const AUSGENOMMEN: ReadonlySet<string> = new Set<string>([
  ...NICHT_JOURNALISIERT,
  'suche_fts',
  'suche_fts_data',
  'suche_fts_idx',
  'suche_fts_docsize',
  'suche_fts_config',
])

interface TabelleNameZeile {
  readonly name: string
}

function basisTabellenNamen(db: Database.Database): readonly string[] {
  return db
    .prepare<[], TabelleNameZeile>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((zeile) => zeile.name)
    .filter((name) => !name.startsWith('sqlite_') && !AUSGENOMMEN.has(name))
}

interface SpalteInfoZeile {
  readonly name: string
  readonly pk: number
}

function spaltenUndSortierung(db: Database.Database, tabelle: string): { readonly spalten: readonly string[]; readonly sortierSpalten: readonly string[] } {
  const info = db.prepare<[], SpalteInfoZeile>(`PRAGMA table_info(${tabelle})`).all()
  const spalten = info.map((zeile) => zeile.name)
  const pkSpalten = info
    .filter((zeile) => zeile.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((zeile) => zeile.name)
  return { spalten, sortierSpalten: pkSpalten.length > 0 ? pkSpalten : spalten }
}

/** Zeilenwerte einer Basistabelle — beliebige Spaltennamen auf einfache SQLite-Werte. */
type ZeileWerte = Record<string, string | number | bigint | Uint8Array | null>

function tabellenAbzug(db: Database.Database, tabelle: string): string {
  const { spalten, sortierSpalten } = spaltenUndSortierung(db, tabelle)
  if (spalten.length === 0) {
    return `## ${tabelle}\n`
  }
  const sql = `SELECT ${spalten.join(', ')} FROM ${tabelle} ORDER BY ${sortierSpalten.join(', ')}`
  const zeilen = db.prepare<[], ZeileWerte>(sql).all()
  const zeilenText = zeilen.map((zeile) => JSON.stringify(zeile, Object.keys(zeile).sort())).join('\n')
  return `## ${tabelle} (${zeilen.length})\n${zeilenText}`
}

/**
 * Deterministischer, sortierter Textabzug ALLER Basistabellen (Journal-/Merge-/Ableitungs-Tabellen
 * ausgenommen, s. `AUSGENOMMEN`) — für den reinen Determinismusvergleich zweier Generator-Läufe.
 * Keine Ausnahmen für konkrete Fachtabellen: der Generator schreibt heute nur
 * `person`/`name`/`elternschaft`, ein Abzug über alle (leeren) übrigen Tabellen schadet nicht und
 * hält den Helfer allgemein nutzbar.
 */
export function kanonischerAbzug(db: Database.Database): string {
  return basisTabellenNamen(db)
    .map((tabelle) => tabellenAbzug(db, tabelle))
    .join('\n\n')
}
