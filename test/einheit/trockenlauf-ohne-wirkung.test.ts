// AP-1.4a, 56_Import_Vertrag.md §6.1: "Der Trockenlauf verändert die Datenbank nicht." Kanonischer
// Voll-Abzug VOR und NACH dem Trockenlauf muss bitgleich sein — für `beispiel-1-einfach.json` UND
// `beispiel-2-widersprueche.json`. Bewusst EIN EIGENER Abzug-Helfer statt
// `test/hilfsmittel/kanonischer-abzug.ts`: jener klammert `transaktion`/`aenderung` und die
// abgeleiteten Tabellen bewusst aus (AP-0.12-Kopfkommentar dort) — genau diese Tabellen sind hier
// der Kern der Zusicherung (der Trockenlauf legt eine Wegwerf-`transaktion`-Zeile + `aenderung`-
// Zeilen an und rollt sie zurück; `person_flach`/`suche_fts` würden sich bei einem echten Import
// mitändern). Zusätzlich zum Volltextabzug ein explizites `COUNT(*)` auf `transaktion`/`aenderung`
// (§6.1: die Wegwerf-Transaktionszeile darf nach dem Rollback nicht übrig bleiben).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { abgeleiteterAbzug } from '../../src/main/datenbank/abgeleitet-abzug'
import { importTrockenlaufDurchfuehren } from '../../src/main/befehle/import-trockenlauf'
import { frischeDatenbankMitJournal } from './_hilfen-trockenlauf'

const BEISPIEL_1 = fileURLToPath(new URL('../../fixtures/import/v1/gueltig/beispiel-1-einfach.json', import.meta.url))
const BEISPIEL_2 = fileURLToPath(new URL('../../fixtures/import/v1/gueltig/beispiel-2-widersprueche.json', import.meta.url))

// FTS5-Schattentabellen: kein sinnvoller `PRAGMA table_info`/`SELECT`-Abzug über benannte Spalten
// (CLAUDE.md §6) — ihr Inhalt wird stattdessen über `abgeleiteterAbzug()` (fts5vocab) geprüft.
const AUSGENOMMEN = new Set<string>(['suche_fts', 'suche_fts_data', 'suche_fts_idx', 'suche_fts_docsize', 'suche_fts_config'])

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

type ZeileWerte = Record<string, string | number | bigint | Uint8Array | null>

function tabellenAbzug(db: Database.Database, tabelle: string): string {
  const { spalten, sortierSpalten } = spaltenUndSortierung(db, tabelle)
  if (spalten.length === 0) return `## ${tabelle}\n`
  const sql = `SELECT ${spalten.join(', ')} FROM ${tabelle} ORDER BY ${sortierSpalten.join(', ')}`
  const zeilen = db.prepare<[], ZeileWerte>(sql).all()
  const zeilenText = zeilen.map((zeile) => JSON.stringify(zeile, Object.keys(zeile).sort())).join('\n')
  return `## ${tabelle} (${zeilen.length})\n${zeilenText}`
}

/** Vollabzug ALLER Basistabellen — anders als `test/hilfsmittel/kanonischer-abzug.ts` OHNE
 * Ausnahme für `transaktion`/`aenderung`/abgeleitete Tabellen (s. Kopfkommentar). */
function vollAbzug(db: Database.Database): string {
  return basisTabellenNamen(db)
    .map((tabelle) => tabellenAbzug(db, tabelle))
    .join('\n\n')
}

interface AnzahlZeile {
  readonly anzahl: number
}

function zaehle(db: Database.Database, tabelle: string): number {
  const zeile = db.prepare<[], AnzahlZeile>(`SELECT COUNT(*) AS anzahl FROM ${tabelle}`).get()
  if (zeile === undefined) throw new Error('COUNT(*) lieferte keine Zeile.')
  return zeile.anzahl
}

describe.each([
  ['beispiel-1-einfach.json', BEISPIEL_1],
  ['beispiel-2-widersprueche.json', BEISPIEL_2],
])('Trockenlauf ohne Wirkung (%s, 56_Import_Vertrag.md §6.1)', (_name, pfad) => {
  it('Datenbank ist nach dem Trockenlauf bitgleich zu vorher (Basistabellen, transaktion/aenderung-Zähler, abgeleitete Tabellen)', () => {
    const db = frischeDatenbankMitJournal()
    try {
      const vorTransaktionen = zaehle(db, 'transaktion')
      const vorAenderungen = zaehle(db, 'aenderung')
      const vorAbzug = vollAbzug(db)
      const vorAbgeleitet = abgeleiteterAbzug(db, 'vocab')

      const bericht = importTrockenlaufDurchfuehren(db, pfad)

      expect(bericht.importGesperrt).toBe(false)
      expect(zaehle(db, 'transaktion')).toBe(vorTransaktionen)
      expect(zaehle(db, 'aenderung')).toBe(vorAenderungen)
      expect(vollAbzug(db)).toBe(vorAbzug)
      expect(abgeleiteterAbzug(db, 'vocab')).toEqual(vorAbgeleitet)
    } finally {
      db.close()
    }
  })
})

// Fixture-Existenz absichern (liest den Rohtext bereits hier, statt erst im Trockenlauf zu scheitern).
describe('Fixture-Dateien lesbar', () => {
  it.each([BEISPIEL_1, BEISPIEL_2])('%s existiert und ist lesbar', (pfad) => {
    expect(() => readFileSync(pfad, 'utf8')).not.toThrow()
  })
})
