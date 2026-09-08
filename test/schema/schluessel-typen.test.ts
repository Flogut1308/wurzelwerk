// AP-0.6 PR-B, test/schema/schluessel-typen.test.ts (CLAUDE.md §6/§13): kein INTEGER PRIMARY KEY
// außer den dokumentierten Ausnahmen, jede Tabelle STRICT, jeder Primärschlüssel TEXT.
import { describe, expect, it } from 'vitest'
import { anwenderTabellen, frischeMigrierteDatenbank, spaltenInfo } from './_hilfen'

/**
 * Die einzigen erlaubten Ausnahmen vom Verbot "kein INTEGER PRIMARY KEY" (CLAUDE.md §6, F-05).
 * CLAUDE.md §6 formuliert das Verbot ausdrücklich für "journalisierte Tabellen" — beide Ausnahmen
 * hier sind laut Kopfkommentar von docs/schema/0001_grundgeruest.sql explizit NICHT_JOURNALISIERT,
 * fallen also auch beim Wortlaut der Regel nicht darunter:
 *
 * - `journal_kontext.id` (`INTEGER PRIMARY KEY CHECK (id = 1)`, 55_Architektur.md §4.3): eine
 *   Einzeiler-Kontexttabelle — kein UUID-Datensatz, sondern ein Schalter mit genau einer Zeile,
 *   die nie gelöscht und neu angelegt wird (kein Wiedereinfüge-Risiko).
 * - `schema_migration.version` (`INTEGER PRIMARY KEY`, 55_Architektur.md §9.1): der Primärschlüssel
 *   IST die Schemaversion, dieselbe Zahl wie `PRAGMA user_version` — von Natur aus eine fortlaufende
 *   Ganzzahl, keine UUID-fähige Entität.
 * - `suche_fts_quelle.rowid` (`INTEGER PRIMARY KEY AUTOINCREMENT`, docs/schema/0003_abgeleitet.sql,
 *   AP-0.7): NICHT_JOURNALISIERT-Mapping-Tabelle für die contentless FTS5-Tabelle `suche_fts` — der
 *   `rowid` hier muss zugleich der `rowid` in `suche_fts` sein, FTS5 verlangt dafür technisch eine
 *   durchlaufende Ganzzahl, keine UUID (siehe Schema-Kommentar unmittelbar über `CREATE TABLE
 *   suche_fts_quelle` in 0003_abgeleitet.sql).
 *
 * Schema-Fund (siehe Abschlussbericht): `schema_migration.version` fehlte in der ersten Fassung
 * dieser Ausnahmeliste — der Test unten fing das.
 */
const ERLAUBTE_INTEGER_PK_AUSNAHMEN: Record<string, readonly string[]> = {
  journal_kontext: ['id'],
  schema_migration: ['version'],
  suche_fts_quelle: ['rowid'],
}

describe('test/schema/schluessel-typen (CLAUDE.md §6, F-05)', () => {
  it('jede Tabelle ist STRICT', () => {
    const db = frischeMigrierteDatenbank()
    try {
      const nichtStrikt = anwenderTabellen(db)
        .filter((zeile) => zeile.strict !== 1)
        .map((zeile) => zeile.name)
        .sort((a, b) => a.localeCompare(b))
      expect(nichtStrikt).toEqual([])
    } finally {
      db.close()
    }
  })

  it('kein INTEGER-Primärschlüssel außer den dokumentierten Ausnahmen', () => {
    const db = frischeMigrierteDatenbank()
    try {
      const verstoesse: string[] = []
      for (const tabelle of anwenderTabellen(db).map((zeile) => zeile.name)) {
        const erlaubt = ERLAUBTE_INTEGER_PK_AUSNAHMEN[tabelle] ?? []
        const pkSpalten = spaltenInfo(db, tabelle).filter((spalte) => spalte.pk > 0)
        for (const spalte of pkSpalten) {
          if (erlaubt.includes(spalte.name)) {
            continue
          }
          if (spalte.type === 'INTEGER') {
            verstoesse.push(`${tabelle}.${spalte.name}`)
          }
        }
      }
      expect(verstoesse.sort((a, b) => a.localeCompare(b))).toEqual([])
    } finally {
      db.close()
    }
  })

  it('jeder Primärschlüssel ist TEXT (bzw. bei Verknüpfungstabellen zusammengesetzt aus TEXT-Spalten)', () => {
    const db = frischeMigrierteDatenbank()
    try {
      const abweichungen: string[] = []
      for (const tabelle of anwenderTabellen(db).map((zeile) => zeile.name)) {
        const erlaubt = ERLAUBTE_INTEGER_PK_AUSNAHMEN[tabelle] ?? []
        const pkSpalten = spaltenInfo(db, tabelle).filter((spalte) => spalte.pk > 0)
        for (const spalte of pkSpalten) {
          if (erlaubt.includes(spalte.name)) {
            continue
          }
          if (spalte.type !== 'TEXT') {
            abweichungen.push(`${tabelle}.${spalte.name} (Typ ${spalte.type}, erwartet TEXT)`)
          }
        }
      }
      expect(abweichungen.sort((a, b) => a.localeCompare(b))).toEqual([])
    } finally {
      db.close()
    }
  })
})
