import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { integritaetPruefen } from '../../src/main/datenbank/integritaet'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { pruefsummeBerechnen } from '../../src/main/datenbank/migration/registrierung'

/**
 * AP-0.5, Abnahme: "Migration und Versionssetzung liegen in einer Transaktion — ein Abbruch
 * mitten drin lässt eine unmigrierte, aber intakte Datei zurück." Die fehlerhafte Migration wird
 * über den injizierbaren `migrationen`/`inhaltLesen`-Seam eingespeist (kein Produktivcode-Umbau,
 * kein globaler Zustand) — die kaputte SQL existiert nur als String im Test, keine echte Datei.
 */
describe('main/datenbank/migration/laeufer — Abbruch mitten in einer Migration', () => {
  let ordner: string
  let dbPfad: string

  beforeEach(() => {
    ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-migration-abbruch-'))
    dbPfad = join(ordner, 'baum.sqlite')
  })

  afterEach(() => {
    rmSync(ordner, { recursive: true, force: true })
  })

  it('eine syntaktisch kaputte Migration wirft, user_version bleibt 0, die Datei bleibt intakt', () => {
    const kaputtesSql = Buffer.from('DIES IST KEIN GUELTIGES SQL;')
    const db = new Database(dbPfad)

    try {
      expect(() =>
        migrieren(db, {
          migrationen: [{ version: 1, datei: 'kaputt.sql', pruefsumme: pruefsummeBerechnen(kaputtesSql) }],
          inhaltLesen: () => kaputtesSql,
        }),
      ).toThrow()

      expect(db.pragma('user_version', { simple: true })).toBe(0)
      expect(() => integritaetPruefen(db)).not.toThrow()
    } finally {
      db.close()
    }
  })
})
