import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { integritaetPruefen } from '../../src/main/datenbank/integritaet'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'

/**
 * AP-0.5, §9.3: `PRAGMA quick_check` ist der erste Schritt beim Öffnen — vor jeder Migration.
 * Eine beschädigte Datei muss auffallen, bevor irgendetwas versucht wird, sie zu migrieren.
 */
describe('main/datenbank/integritaet', () => {
  let ordner: string
  let dbPfad: string

  beforeEach(() => {
    ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-integritaet-'))
    dbPfad = join(ordner, 'test.sqlite')
  })

  afterEach(() => {
    rmSync(ordner, { recursive: true, force: true })
  })

  it('wirft nicht bei einer frischen, intakten Datenbank', () => {
    const db = new Database(dbPfad)
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    expect(() => integritaetPruefen(db)).not.toThrow()
    db.close()
  })

  it('wirft DATENBANK_INTEGRITAET bei einer zerschossenen Datei', () => {
    writeFileSync(dbPfad, Buffer.from('das ist keine sqlite-datei, nur müll'))
    const db = new Database(dbPfad)
    try {
      expect(() => integritaetPruefen(db)).toThrow(WurzelFehler)
      try {
        integritaetPruefen(db)
        expect.unreachable()
      } catch (u) {
        expect(u).toBeInstanceOf(WurzelFehler)
        if (u instanceof WurzelFehler) {
          expect(u.code).toBe('DATENBANK_INTEGRITAET')
        }
      }
    } finally {
      db.close()
    }
  })
})
