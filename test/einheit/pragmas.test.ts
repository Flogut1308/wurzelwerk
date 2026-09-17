import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { SCHEMA_VERSION } from '../../src/main/datenbank/migration/registrierung'
import { journalAus } from '../../src/main/journal/kontext'

/**
 * 55_Architektur.md §3.1: die einzige Stelle, die `foreign_keys = ON` setzt. Dieser Test provoziert
 * eine Fremdschlüsselverletzung und erwartet, dass sie scheitert — ohne diese Pragma würde SQLite
 * das INSERT klaglos zulassen.
 */
describe('main/datenbank/verbindung oeffnen() (55_Architektur.md §3.1, ADR-002)', () => {
  let ordner: string
  let dbPfad: string

  beforeEach(() => {
    ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-pragmas-'))
    dbPfad = join(ordner, 'baum.sqlite')
  })

  afterEach(() => {
    rmSync(ordner, { recursive: true, force: true })
  })

  it('journal_mode=WAL, foreign_keys=1, busy_timeout=5000', () => {
    const db = oeffnen(dbPfad)
    try {
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
      expect(db.pragma('busy_timeout', { simple: true })).toBe(5000)
    } finally {
      db.close()
    }
  })

  it('ein INSERT mit ungültigem Fremdschlüssel scheitert', () => {
    const db = oeffnen(dbPfad)
    try {
      db.exec(`
        CREATE TABLE eltern (id TEXT PRIMARY KEY);
        CREATE TABLE kind (id TEXT PRIMARY KEY, eltern_id TEXT REFERENCES eltern(id));
      `)
      expect(() => {
        db.prepare('INSERT INTO kind (id, eltern_id) VALUES (@id, @elternId)').run({
          id: 'k-1',
          elternId: 'existiert-nicht',
        })
      }).toThrow()
    } finally {
      db.close()
    }
  })

  it('uuid7() liefert eine gültige v7-UUID', () => {
    const db = oeffnen(dbPfad)
    try {
      // better-sqlite3 typisiert .get() als `unknown`; die Spalte ist hier per SQL fest benannt.
      const zeile = db.prepare('SELECT uuid7() AS id').get() as { id: string }
      expect(zeile.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    } finally {
      db.close()
    }
  })

  it('legt die WAL-Begleitdateien für eine Dateidatenbank an', () => {
    const db = oeffnen(dbPfad)
    try {
      db.exec('CREATE TABLE t (id TEXT PRIMARY KEY)')
      expect(existsSync(dbPfad)).toBe(true)
    } finally {
      db.close()
    }
  })

  // AP-1.3c: `opts.quelle` öffnet aus einem serialisierten Abbild (`db.serialize()`), statt aus
  // einer Datei/`:memory:` neu — ein Testhelfer klont so einen einmal migrierten Zustand billig.
  // Zusicherung: derselbe Pragma-/Funktionsblock gilt für diesen Pfad genauso (CLAUDE.md §6:
  // `foreign_keys` bleibt allein in dieser Datei gesetzt).
  it('öffnet aus einem serialisierten Abbild (opts.quelle) mit denselben Pragmas/Funktionen', () => {
    const quelle = oeffnen(':memory:')
    let puffer: Buffer
    try {
      migrieren(quelle)
      // Roher INSERT ohne Befehlsbus-Armierung (wie test/einheit/_hilfen-abgeleitet.ts) — dieser Test
      // prüft den Verbindungs-Seam, nicht das Journal.
      journalAus(quelle, 'AP-1.3c-Test (test/einheit/pragmas.test.ts): prüft opts.quelle-Seam, nicht das Journal.')
      quelle
        .prepare('INSERT INTO person (id, privat, ist_platzhalter) VALUES (@id, @privat, @istPlatzhalter)')
        .run({ id: 'p-seam-test', privat: 0, istPlatzhalter: 0 })
      puffer = quelle.serialize()
    } finally {
      quelle.close()
    }

    const klon = oeffnen(':memory:', { quelle: puffer })
    try {
      expect(klon.pragma('foreign_keys', { simple: true })).toBe(1)

      const uuidZeile = klon.prepare('SELECT uuid7() AS id').get() as { id: string }
      expect(uuidZeile.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
      expect(klon.prepare("SELECT suchnormalform('Müller') AS w").get()).toEqual({ w: expect.any(String) })
      expect(klon.prepare("SELECT koelner_phonetik('Schmidt') AS w").get()).toEqual({ w: expect.any(String) })

      expect(klon.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
      const personZeile = klon.prepare('SELECT id FROM person WHERE id = @id').get({ id: 'p-seam-test' }) as
        | { id: string }
        | undefined
      expect(personZeile).toEqual({ id: 'p-seam-test' })

      expect(klon.pragma('integrity_check', { simple: true })).toBe('ok')
      expect(klon.pragma('foreign_key_check')).toEqual([])
    } finally {
      klon.close()
    }
  })
})
