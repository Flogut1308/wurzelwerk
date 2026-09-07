import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'

/**
 * AP-0.5, §9.3: Der Prüfsummenvergleich ist die Zeile, die KI-gestützte Entwicklung braucht — eine
 * nachträglich geänderte, bereits angewendete Migrationsdatei (oder eine manipulierte Zeile in
 * `schema_migration`) muss beim nächsten Öffnen sofort auffallen.
 */
describe('main/datenbank/migration/laeufer — Prüfsummenschutz', () => {
  let ordner: string
  let dbPfad: string

  beforeEach(() => {
    ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-migration-pruefsumme-'))
    dbPfad = join(ordner, 'baum.sqlite')
  })

  afterEach(() => {
    rmSync(ordner, { recursive: true, force: true })
  })

  it('eine manipulierte schema_migration.pruefsumme-Zeile verhindert weiteres Migrieren', () => {
    const db = new Database(dbPfad)
    try {
      migrieren(db)
      db.prepare('UPDATE schema_migration SET pruefsumme = @wert WHERE version = @version').run({
        wert: 'sha256-manipuliert',
        version: 1,
      })

      try {
        migrieren(db)
        expect.unreachable()
      } catch (u) {
        expect(u).toBeInstanceOf(WurzelFehler)
        if (u instanceof WurzelFehler) {
          expect(u.code).toBe('PROJEKT_MIGRATION_GEAENDERT')
        }
      }
    } finally {
      db.close()
    }
  })

  it('eine Registry-Prüfsumme, die nicht zum Datei-Inhalt passt, verhindert das Anwenden', () => {
    const db = new Database(dbPfad)
    try {
      try {
        migrieren(db, {
          migrationen: [{ version: 1, datei: '0001_grundgeruest.sql', pruefsumme: 'sha256-falsch' }],
        })
        expect.unreachable()
      } catch (u) {
        expect(u).toBeInstanceOf(WurzelFehler)
        if (u instanceof WurzelFehler) {
          expect(u.code).toBe('PROJEKT_MIGRATION_GEAENDERT')
        }
      }
    } finally {
      db.close()
    }
  })
})
