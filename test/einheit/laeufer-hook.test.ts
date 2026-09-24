// AP-1.34 (U-1.34-O1, A2b): Aufrufer-Hook `nachMigrationsSql` im Migrationslauf
// (`src/main/datenbank/migration/laeufer.ts`). Der Hook läuft je angewendeter Version genau einmal,
// innerhalb der Migrations-Transaktion und bei ausgeschaltetem Journal; wirft er, bleibt die
// Version unangewendet. Rot vor A2b: die Option wird ignoriert (keine Aufrufe, kein Rollback).
import type Database from 'better-sqlite3'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { SCHEMA_VERSION } from '../../src/main/datenbank/migration/registrierung'

const FIXTURE_V6_PFAD = join(process.cwd(), 'fixtures', 'datenbanken', 'schema-v6.sqlite')

interface HookAufruf {
  readonly version: number
  readonly inTransaktion: boolean
  /** `journal_kontext.aktiv` (id = 1) zum Hook-Zeitpunkt, `null` vor Migration 0004 (Zeile fehlt). */
  readonly journalAktiv: number | null
}

function journalAktiv(db: Database.Database): number | null {
  const zeile = db.prepare<[], { readonly aktiv: number }>('SELECT aktiv FROM journal_kontext WHERE id = 1').get()
  return zeile === undefined ? null : zeile.aktiv
}

function userVersion(db: Database.Database): unknown {
  return db.pragma('user_version', { simple: true })
}

function hatSpalte(db: Database.Database, tabelle: string, spalte: string): boolean {
  return db
    .prepare<{ readonly tabelle: string; readonly spalte: string }, { readonly name: string }>(
      'SELECT name FROM pragma_table_info(@tabelle) WHERE name = @spalte',
    )
    .get({ tabelle, spalte }) !== undefined
}

describe('migrieren() — Aufrufer-Hook nachMigrationsSql (AP-1.34, U-1.34-O1)', () => {
  let ordner: string

  beforeEach(() => {
    ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-laeufer-hook-'))
  })

  afterEach(() => {
    rmSync(ordner, { recursive: true, force: true })
  })

  it('frische Datei: der Hook läuft genau einmal je Version, aufsteigend, jeweils in der Transaktion', () => {
    const db = oeffnen(join(ordner, 'frisch.sqlite'))
    try {
      const aufrufe: HookAufruf[] = []
      migrieren(db, {
        nachMigrationsSql: (hookDb, version) => {
          aufrufe.push({ version, inTransaktion: hookDb.inTransaction, journalAktiv: journalAktiv(hookDb) })
        },
      })
      expect(aufrufe.map((aufruf) => aufruf.version)).toEqual(Array.from({ length: SCHEMA_VERSION }, (_, i) => i + 1))
      expect(aufrufe.every((aufruf) => aufruf.inTransaktion)).toBe(true)
      // 0004 legt die Zeile id = 1 (aktiv = 1) erst in ihrem eigenen SQL an — `journalAus` lief davor
      // ins Leere. Ab 0005 ist das Journal während des Hooks aus.
      expect(aufrufe.filter((aufruf) => aufruf.version >= 5).every((aufruf) => aufruf.journalAktiv === 0)).toBe(true)
      // Nach dem Lauf ist das Journal wieder scharf.
      expect(journalAktiv(db)).toBe(1)
    } finally {
      db.close()
    }
  })

  it('v6-Datei: der Hook läuft einmal für Version 7, sieht deren Schema und das Journal aus', () => {
    const pfad = join(ordner, 'v6.sqlite')
    copyFileSync(FIXTURE_V6_PFAD, pfad)
    const db = oeffnen(pfad)
    try {
      const aufrufe: (HookAufruf & { readonly kennungSpalte: boolean; readonly userVersion: unknown })[] = []
      migrieren(db, {
        nachMigrationsSql: (hookDb, version) => {
          aufrufe.push({
            version,
            inTransaktion: hookDb.inTransaction,
            journalAktiv: journalAktiv(hookDb),
            kennungSpalte: hatSpalte(hookDb, 'person', 'kennung'),
            userVersion: userVersion(hookDb),
          })
        },
      })
      expect(aufrufe).toEqual([{ version: 7, inTransaktion: true, journalAktiv: 0, kennungSpalte: true, userVersion: 6 }])
      expect(userVersion(db)).toBe(SCHEMA_VERSION)
    } finally {
      db.close()
    }
  })

  it('wirft der Hook, bleibt die Version unangewendet: user_version, schema_migration und Schema unverändert, Journal wieder an', () => {
    const pfad = join(ordner, 'v6.sqlite')
    copyFileSync(FIXTURE_V6_PFAD, pfad)
    const db = oeffnen(pfad)
    try {
      const fehler = new Error('Hook scheitert absichtlich')
      expect(() =>
        migrieren(db, {
          nachMigrationsSql: () => {
            throw fehler
          },
        }),
      ).toThrow(fehler)
      expect(db.inTransaction).toBe(false)
      expect(userVersion(db)).toBe(6)
      const zeile7 = db.prepare<[], { readonly version: number }>('SELECT version FROM schema_migration WHERE version = 7').get()
      expect(zeile7).toBeUndefined()
      expect(hatSpalte(db, 'person', 'kennung')).toBe(false)
      expect(journalAktiv(db)).toBe(1)
    } finally {
      db.close()
    }
  })

  it('bereits aktuelle Datei: der Hook wird nicht aufgerufen', () => {
    const db = oeffnen(join(ordner, 'aktuell.sqlite'))
    try {
      migrieren(db)
      let aufrufe = 0
      migrieren(db, {
        nachMigrationsSql: () => {
          aufrufe += 1
        },
      })
      expect(aufrufe).toBe(0)
    } finally {
      db.close()
    }
  })
})
