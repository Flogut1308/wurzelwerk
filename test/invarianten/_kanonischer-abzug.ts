// AP-0.10 PR-B — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025). `kanonischerAbzug()` ist die
// tatsächliche Umsetzung des Test-Prototyps aus 55_Architektur.md §4.9 Punkt 5 ("„Bitgleich" wird
// nie geprüft" - außer hier). Iteriert über ALLE echten Basistabellen (`sqlite_master`,
// `type='table'`, gefiltert - s. `AUSGENOMMEN` unten), sortiert jede Tabelle nach ihrem
// Primärschlüssel (`PRAGMA table_info`, `pk`-Reihenfolge - Mehrfachschlüssel werden in
// pk-Indexreihenfolge sortiert, analog zu `pkSpalten` in `src/main/repositories/basis.ts` -
// unabhängig nachgebaut, weil `test/` keine der vier Architekturschichten aus CLAUDE.md §2 ist und
// `pkSpalten` dort ohnehin nicht exportiert wird), und serialisiert jede Zeile als JSON MIT
// sortierten Schlüsseln: `JSON.stringify(zeile, Object.keys(zeile).sort())` - der Array-Replacer
// von `JSON.stringify` legt zusätzlich die AUSGABEreihenfolge der Schlüssel fest, das erledigt
// "sortierte Schlüssel" in einem einzigen Aufruf.
//
// WICHTIG (55_Architektur.md §4.9 Punkt 5): `geaendert_am` wird NICHT ausgenommen - Undo/Redo
// schreiben ganze Zeilen zurück, der Test muss sehen, wenn eine Spalte dabei mal nicht mehr
// mitkommt.
//
// Ausgenommen: alle Tabellen aus `NICHT_JOURNALISIERT` (`src/main/journal/journalisierung.ts`) -
// das Journal selbst (`transaktion`/`aenderung`/`journal_kontext`, wo sich per Definition etwas
// ändern SOLL), dazu `schema_migration`/`name_phonetik`/`merge_protokoll`/`id_alias`/
// `person_flach`/`suche_fts_quelle` (Journal-/Merge-Infrastruktur bzw. abgeleitete Tabellen, die
// `test/invarianten/abgeleitet-gleich.test.ts` bereits separat gegen `alleAbgeleitetenNeuAufbauen`
// prüft, 55_Architektur.md §5.3 - hier NICHT nochmal, sonst würde ein von einem Undo-Schritt nicht
// mitgepflegter abgeleiteter Wert fälschlich als "Bitgleichheit verletzt" durchgehen, obwohl die
// Basistabellen längst wieder korrekt sind). Dazu die virtuelle FTS5-Tabelle `suche_fts` selbst
// (NICHT in `NICHT_JOURNALISIERT` - s. dortiger Kommentar: "keine Anwendertabelle im Sinn von
// anwenderTabellenNamen") + ihre vier von SQLite automatisch angelegten Schattentabellen
// (`suche_fts_data`/`_idx`/`_docsize`/`_config`, geprüft gegen eine echte migrierte `:memory:`-DB)
// + `sqlite_%`-Tabellen (SQLite-Eigenverwaltung, z. B. `sqlite_sequence` für die einzige
// AUTOINCREMENT-Spalte `suche_fts_quelle.rowid` - keine Anwendertabelle).
import type Database from 'better-sqlite3'
import { NICHT_JOURNALISIERT } from '../../src/main/journal/journalisierung'
import type { ZeileWerte } from '../../src/main/repositories/basis'

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

/** Alle Basistabellen für den kanonischen Abzug — `sqlite_master`, gefiltert um `AUSGENOMMEN` + SQLite-Eigenverwaltung (`sqlite_%`). */
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

interface SpaltenPlan {
  readonly spalten: readonly string[]
  readonly sortierSpalten: readonly string[]
}

/**
 * Spaltenliste + Sortierschlüssel einer Tabelle. `pk`-Reihenfolge aus `PRAGMA table_info`
 * (aufsteigend — bei einer zusammengesetzten Primärschlüsseldefinition wie
 * `PRIMARY KEY (aussage_id, zitat_id)` steht `pk=1` auf `aussage_id`, `pk=2` auf `zitat_id`, s.
 * `docs/schema/0002_kern.sql`). Fallback auf ALLE Spalten, falls eine Tabelle (entgegen F-05)
 * keine Primärschlüsselspalte hätte — rein defensiv, jede heutige Basistabelle hat eine.
 */
function spaltenPlan(db: Database.Database, tabelle: string): SpaltenPlan {
  const info = db.prepare<[], SpalteInfoZeile>(`PRAGMA table_info(${tabelle})`).all()
  const spalten = info.map((zeile) => zeile.name)
  const pkSpalten = info
    .filter((zeile) => zeile.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((zeile) => zeile.name)
  return { spalten, sortierSpalten: pkSpalten.length > 0 ? pkSpalten : spalten }
}

/** Deterministischer, sortierter Textabzug einer einzelnen Basistabelle. */
function tabellenAbzug(db: Database.Database, tabelle: string): string {
  const { spalten, sortierSpalten } = spaltenPlan(db, tabelle)
  if (spalten.length === 0) {
    // Unerreichbar für die heutigen Basistabellen (jede hat mindestens eine Spalte) — rein defensiv.
    return `## ${tabelle}\n`
  }
  const sql = `SELECT ${spalten.join(', ')} FROM ${tabelle} ORDER BY ${sortierSpalten.join(', ')}`
  const zeilen = db.prepare<[], ZeileWerte>(sql).all()
  const zeilenText = zeilen.map((zeile) => JSON.stringify(zeile, Object.keys(zeile).sort())).join('\n')
  return `## ${tabelle} (${zeilen.length})\n${zeilenText}`
}

/**
 * Kanonischer, deterministischer Textabzug ALLER Basistabellen (`AUSGENOMMEN` s. o.) —
 * 55_Architektur.md §4.9 Punkt 5. Zwei Aufrufe gegen denselben Datenbankinhalt liefern immer
 * dieselbe Zeichenkette, unabhängig von physischer Speicherreihenfolge (rowid,
 * Einfüge-/Undo-Reihenfolge) — genau das macht ihn tauglich für einen Vorher/Nachher-Vergleich
 * über eine beliebige Befehlsfolge + vollständiges Undo hinweg
 * (`test/invarianten/undo-bitgleich.test.ts`). Rein und deterministisch: kein `Date.now()`, kein
 * `Math.random()` — nur eine reine Funktion der aktuellen Tabelleninhalte.
 */
export function kanonischerAbzug(db: Database.Database): string {
  return basisTabellenNamen(db)
    .map((tabelle) => tabellenAbzug(db, tabelle))
    .join('\n\n')
}
