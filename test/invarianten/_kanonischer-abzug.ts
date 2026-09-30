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
// Ausgenommen (AP-1.34 PR-B, ADR-009-Nachtrag 24.09.2026): GENAU die fest gepinnte, wörtliche
// Liste `AUSGENOMMEN` unten — drei Kategorien, je Eintrag ein Grund — plus `sqlite_%`-Tabellen
// (SQLite-Eigenverwaltung, z. B. `sqlite_sequence` für die einzige AUTOINCREMENT-Spalte
// `suche_fts_quelle.rowid` - keine Anwendertabelle). Die Liste wird BEWUSST NICHT aus
// `NICHT_JOURNALISIERT` (`src/main/journal/journalisierung.ts`) abgeleitet: die frühere Fassung
// nahm `...NICHT_JOURNALISIERT` pauschal aus und ließ damit `schema_migration`, `merge_protokoll`
// und `id_alias` still aus dem Vergleich fallen, obwohl 55_Architektur.md §4.9 Punkt 5 nur
// Journal + abgeleitete Tabellen erlaubt. Fail-closed: jede Tabelle, die hier nicht steht -
// insbesondere jede künftig neu angelegte -, wird automatisch verglichen. Eine Erweiterung der
// Liste braucht einen weiteren ADR-009-Nachtrag und eine Gegenprobe
// (`test/invarianten/undo-bitgleich-ausnahmen.test.ts`, B-T1..B-T6).
//
// 1. Journal (ADR-018): `transaktion`/`aenderung`/`journal_kontext` - dort SOLL sich durch
//    Undo/Redo per Definition etwas ändern (Rücknahme-Markierung, Armierungszustand).
// 2. Abgeleitet (55_Architektur.md §5.3): `person_flach`/`name_phonetik`/`suche_fts_quelle`, die
//    virtuelle FTS5-Tabelle `suche_fts` und ihre vier von SQLite automatisch angelegten
//    Schattentabellen (`suche_fts_data`/`_idx`/`_docsize`/`_config`). Sie werden in
//    `test/invarianten/abgeleitet-gleich.test.ts` gegen `alleAbgeleitetenNeuAufbauen` geprüft
//    (rohe Schreibfolgen ohne Undo; nach Undo bisher nur `person_flach` in
//    `test/einheit/undo-abgeleitet.test.ts`, Folgepunkt U-1.34-B4 in docs/80 §31) -
//    hier NICHT nochmal, sonst würde ein von einem Undo-Schritt nicht mitgepflegter abgeleiteter
//    Wert fälschlich als "Bitgleichheit verletzt" durchgehen, obwohl die Basistabellen längst
//    wieder korrekt sind.
// 3. Fachlich (AP-1.34, E14): `kennung_zaehler` - eine einmal vergebene Personen-Kennung wird nie
//    neu vergeben; der Zähler läuft nur vorwärts (Trigger in docs/schema/0007_kennung_textanker.sql)
//    und bleibt nach einem Undo bewusst stehen. Dass er dabei tatsächlich ABWEICHT, prüft
//    `test/invarianten/kennung-nie-neu-vergeben.test.ts` (K1) gegen den rohen Tabelleninhalt.
import type Database from 'better-sqlite3'
import type { ZeileWerte } from '../../src/main/repositories/basis'

/** Journal-Tabellen (ADR-018): dort soll sich durch Undo/Redo etwas ändern. */
const AUSGENOMMEN_JOURNAL = ['transaktion', 'aenderung', 'journal_kontext'] as const

/** Abgeleitete Tabellen (55_Architektur.md §5.3) - geprüft gegen Neuaufbau in abgeleitet-gleich.test.ts. */
const AUSGENOMMEN_ABGELEITET = [
  'person_flach',
  'name_phonetik',
  'suche_fts_quelle',
  'suche_fts',
  'suche_fts_data',
  'suche_fts_idx',
  'suche_fts_docsize',
  'suche_fts_config',
] as const

/** Fachliche Ausnahme (AP-1.34, E14): Kennung wird nie neu vergeben, Zähler bleibt nach Undo stehen. */
const AUSGENOMMEN_FACHLICH = ['kennung_zaehler'] as const

const AUSGENOMMEN: ReadonlySet<string> = new Set<string>([
  ...AUSGENOMMEN_JOURNAL,
  ...AUSGENOMMEN_ABGELEITET,
  ...AUSGENOMMEN_FACHLICH,
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

/** Vorbereiteter Abzug EINER Tabelle (Teil des Plans je Verbindung, s. `abzugPlan`). */
type TabellenPlan =
  | { readonly art: 'leer'; readonly tabelle: string }
  | {
      readonly art: 'zeilen'
      readonly tabelle: string
      readonly anweisung: Database.Statement<[], ZeileWerte>
      /**
       * Spaltennamen, sortiert — derselbe Array-Replacer wie früher `Object.keys(zeile).sort()` je
       * Zeile: better-sqlite3 liefert je Zeile genau die Spalten des `SELECT` als Schlüssel, die
       * Menge ist also dieselbe, nur einmal statt je Zeile sortiert. Nicht `readonly`, weil
       * `JSON.stringify` den Replacer als veränderbares Array typisiert (liest ihn nur).
       */
      readonly schluessel: string[]
    }

interface AbzugPlan {
  /** `PRAGMA schema_version` beim Bau des Plans — jede Schemaänderung erhöht ihn. */
  readonly schemaVersion: number
  readonly tabellen: readonly TabellenPlan[]
}

/**
 * Plan-Cache je Verbindung (Folgepunkt U-130-undo-bitgleich-laufzeit, docs/80 §33). Tabellenliste,
 * Spaltenplan und vorbereitete `SELECT`s hängen NUR am Schema, nicht an den Daten — sie wurden
 * früher bei jedem Abzug neu erfragt und neu vorbereitet (`undo-bitgleich.test.ts` ruft den Abzug
 * ~19 000-mal auf).
 *
 * WANN DER CACHE GILT (genau zwei Bedingungen, sonst wird der Plan frisch gebaut):
 * 1. Die Verbindung steht NICHT in einer offenen Transaktion (`db.inTransaction`). Innerhalb einer
 *    Transaktion wird der Plan weder gelesen noch gespeichert. Grund (hueter PR #185 H1, R6/R7 in
 *    `kanonischer-abzug-referenz.test.ts`): `ROLLBACK` setzt `PRAGMA schema_version` zurück — ein in
 *    einer zurückgerollten Transaktion gebauter Plan trüge sonst dieselbe Zahl wie ein späteres,
 *    ANDERES Schema, und eine neue Tabelle fehlte still im Abzug.
 * 2. `PRAGMA schema_version` ist gleich dem Wert beim Bau. Außerhalb von Transaktionen ist das der
 *    committete Wert, und der steigt mit jedem `CREATE`/`ALTER`/`DROP` streng monoton — ein
 *    gespeicherter Plan gehört damit eindeutig zu genau einem Schema (B-T6 in
 *    `undo-bitgleich-ausnahmen.test.ts`, R3/R4/R6/R7 in `kanonischer-abzug-referenz.test.ts`).
 * Nicht abgedeckt: ein explizites Setzen von `PRAGMA schema_version = n` (laut SQLite-Doku ein Weg,
 * die Datenbank zu beschädigen; kommt weder im Produktivcode noch in den Tests vor).
 * `WeakMap`: eine geschlossene Verbindung hält keinen Plan am Leben; eine neu geöffnete bekommt einen
 * eigenen.
 */
const PLAENE = new WeakMap<Database.Database, AbzugPlan>()

function aktuelleSchemaVersion(db: Database.Database): number {
  const wert: unknown = db.pragma('schema_version', { simple: true })
  if (typeof wert !== 'number') {
    throw new Error(`PRAGMA schema_version lieferte keine Zahl: ${typeof wert}`)
  }
  return wert
}

function planBauen(db: Database.Database, schemaVersion: number): AbzugPlan {
  const tabellen = basisTabellenNamen(db).map((tabelle): TabellenPlan => {
    const { spalten, sortierSpalten } = spaltenPlan(db, tabelle)
    if (spalten.length === 0) {
      // Unerreichbar für die heutigen Basistabellen (jede hat mindestens eine Spalte) — rein defensiv.
      return { art: 'leer', tabelle }
    }
    const sql = `SELECT ${spalten.join(', ')} FROM ${tabelle} ORDER BY ${sortierSpalten.join(', ')}`
    return { art: 'zeilen', tabelle, anweisung: db.prepare<[], ZeileWerte>(sql), schluessel: [...spalten].sort() }
  })
  return { schemaVersion, tabellen }
}

/** Gültiger Plan für den aktuellen Schemastand dieser Verbindung (s. `PLAENE`). */
function abzugPlan(db: Database.Database): AbzugPlan {
  const schemaVersion = aktuelleSchemaVersion(db)
  if (db.inTransaction) {
    // Bedingung 1 (s. `PLAENE`): in einer Transaktion kann `schema_version` durch ROLLBACK zurückfallen.
    return planBauen(db, schemaVersion)
  }
  const vorhanden = PLAENE.get(db)
  if (vorhanden !== undefined && vorhanden.schemaVersion === schemaVersion) {
    return vorhanden
  }
  const plan = planBauen(db, schemaVersion)
  PLAENE.set(db, plan)
  return plan
}

/** Deterministischer, sortierter Textabzug einer einzelnen Basistabelle. */
function tabellenAbzug(plan: TabellenPlan): string {
  if (plan.art === 'leer') {
    return `## ${plan.tabelle}\n`
  }
  const zeilen = plan.anweisung.all()
  const zeilenText = zeilen.map((zeile) => JSON.stringify(zeile, plan.schluessel)).join('\n')
  return `## ${plan.tabelle} (${zeilen.length})\n${zeilenText}`
}

/**
 * Kanonischer, deterministischer Textabzug ALLER Basistabellen (`AUSGENOMMEN` s. o.) —
 * 55_Architektur.md §4.9 Punkt 5. Zwei Aufrufe gegen denselben Datenbankinhalt liefern immer
 * dieselbe Zeichenkette, unabhängig von physischer Speicherreihenfolge (rowid,
 * Einfüge-/Undo-Reihenfolge) — genau das macht ihn tauglich für einen Vorher/Nachher-Vergleich
 * über eine beliebige Befehlsfolge + vollständiges Undo hinweg
 * (`test/invarianten/undo-bitgleich.test.ts`). Rein und deterministisch: kein `Date.now()`, kein
 * `Math.random()` — nur eine reine Funktion der aktuellen Tabelleninhalte (und des Schemas). Der
 * Plan-Cache (`PLAENE`) ändert daran nichts: die Ausgabe ist zeichengleich der Fassung ohne Cache
 * (wortgleiche Referenz in `kanonischer-abzug-referenz.test.ts`, ADR-009-Nachtrag 25.09.2026).
 */
export function kanonischerAbzug(db: Database.Database): string {
  return abzugPlan(db)
    .tabellen.map((tabelle) => tabellenAbzug(tabelle))
    .join('\n\n')
}
