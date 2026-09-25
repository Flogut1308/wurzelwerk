// test/migration/indizes-0008.test.ts (Vorarbeiten AP-1.30, PR 6; docs/schema/0008_indizes.sql;
// docs/80 §31 U-1.34-C2b-aussage-index und U-1.34-C2c-titelbild-index). Rein additiv — zwei Indizes,
// keine Tabelle, keine Spalte, kein Trigger:
//   - `aussage(subjekt_typ, subjekt_id, praedikat)`: `person.detail` (Umfeld-Lader, Kernangaben)
//     liest Aussagen je Subjekt und Prädikat, bisher als Tabellendurchlauf,
//   - `medium_zuordnung(subjekt_typ, subjekt_id)`: die Titelbild-Abfrage der Regel `kein_portraet`
//     (aktiv ab AP-1.31b), bisher nur über `medium_id` indiziert.
// Geprüft: Aufstieg 7 -> 8 aus der eingefrorenen fixtures/datenbanken/schema-v7.sqlite, beide
// Indizes mit genau diesen Spalten, der Anfrageplan nutzt sie, Bestand unverändert,
// `foreign_key_check`/`integrity_check` sauber. Rot, solange 0008 fehlt (CLAUDE.md §5).
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { SCHEMA_VERSION } from '../../src/main/datenbank/migration/registrierung'

const FIXTURE_V7_PFAD = join(process.cwd(), 'fixtures', 'datenbanken', 'schema-v7.sqlite')

interface IndexSpalte {
  readonly name: string
}

function indexSpalten(db: Database.Database, index: string): readonly string[] {
  return db
    .prepare<{ readonly index: string }, IndexSpalte>(`SELECT name FROM pragma_index_info(@index) ORDER BY seqno`)
    .all({ index })
    .map((zeile) => zeile.name)
}

function plan(db: Database.Database, sql: string): string {
  return db
    .prepare<[], { readonly detail: string }>(`EXPLAIN QUERY PLAN ${sql}`)
    .all()
    .map((zeile) => zeile.detail)
    .join(' | ')
}

describe('test/migration/indizes-0008 (Vorarbeiten AP-1.30, PR 6)', () => {
  let ordner: string
  let dbPfad: string

  beforeEach(() => {
    ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-0008-'))
    dbPfad = join(ordner, 'projekt.sqlite')
    copyFileSync(FIXTURE_V7_PFAD, dbPfad)
  })

  afterEach(() => {
    rmSync(ordner, { recursive: true, force: true })
  })

  it('I1: der Aufstieg ab v7 landet auf SCHEMA_VERSION (>= 8)', () => {
    const db = oeffnen(dbPfad)
    try {
      expect(db.pragma('user_version', { simple: true })).toBe(7)
      migrieren(db)
      expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(8)
      expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
    } finally {
      db.close()
    }
  })

  it('I2: beide Indizes existieren mit genau diesen Spalten in dieser Reihenfolge', () => {
    const db = oeffnen(dbPfad)
    try {
      migrieren(db)
      expect(indexSpalten(db, 'idx_aussage_subjekt_praedikat')).toEqual(['subjekt_typ', 'subjekt_id', 'praedikat'])
      expect(indexSpalten(db, 'idx_medium_zuordnung_subjekt')).toEqual(['subjekt_typ', 'subjekt_id'])
    } finally {
      db.close()
    }
  })

  it('I3: der Anfrageplan nutzt die Indizes statt eines Tabellendurchlaufs', () => {
    const db = oeffnen(dbPfad)
    try {
      migrieren(db)
      const aussagePlan = plan(db, `SELECT id FROM aussage WHERE subjekt_typ = 'person' AND subjekt_id = 'x' AND praedikat = 'geburtsdatum'`)
      expect(aussagePlan).toContain('idx_aussage_subjekt_praedikat')
      const zuordnungPlan = plan(db, `SELECT medium_id FROM medium_zuordnung WHERE subjekt_typ = 'person' AND subjekt_id = 'x'`)
      expect(zuordnungPlan).toContain('idx_medium_zuordnung_subjekt')
    } finally {
      db.close()
    }
  })

  it('I4: Bestand unverändert, Integrität und Fremdschlüssel sauber', () => {
    const db = oeffnen(dbPfad)
    try {
      const vorher = db.prepare<[], { readonly n: number }>(`SELECT COUNT(*) AS n FROM aenderung`).get()?.n
      migrieren(db)
      expect(db.prepare<[], { readonly n: number }>(`SELECT COUNT(*) AS n FROM aenderung`).get()?.n).toBe(vorher)
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
      expect(db.pragma('foreign_key_check')).toEqual([])
    } finally {
      db.close()
    }
  })
})
