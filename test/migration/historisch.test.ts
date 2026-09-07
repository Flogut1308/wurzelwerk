import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { v7 as uuidv7 } from 'uuid'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { SCHEMA_VERSION } from '../../src/main/datenbank/migration/registrierung'
import { schemaAbzugErstellen, schemaAbzugFrischerDatenbank } from '../../skripte/schema-dump'

interface TransaktionZeile {
  readonly id: string
  readonly zeitpunkt: number
  readonly art: string
  readonly lfd: number
}

/**
 * Die vier Prüfungen aus 55_Architektur.md §9.4, für Schemaversion 1 (AP-0.5). Prüfung 1 läuft
 * hier gegen eine frische Datei statt gegen eine echte Alt-Fixture: `fixtures/datenbanken/` bringt
 * erst ab der zweiten Migration eine Vorgängerversion mit (§9.4: "für die laufende Version
 * geschieht das beim Einführen der nächsten") — es gibt also noch keine v0-Fixture, die es geben
 * könnte.
 */
describe('test/migration/historisch (55_Architektur.md §9.4)', () => {
  let ordner: string
  let dbPfad: string

  beforeEach(() => {
    ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-migration-historisch-'))
    dbPfad = join(ordner, 'baum.sqlite')
  })

  afterEach(() => {
    rmSync(ordner, { recursive: true, force: true })
  })

  it('1. Öffnen und migrieren: eine frische Datei landet nach migrieren() auf SCHEMA_VERSION', () => {
    const db = oeffnen(dbPfad)
    try {
      expect(db.pragma('user_version', { simple: true })).toBe(0)
      migrieren(db)
      expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
    } finally {
      db.close()
    }
  })

  it('2. Schemagleichheit: eine über Migration gebaute Datei entspricht einer frisch angelegten', () => {
    const db = oeffnen(dbPfad)
    let abzugUeberMigration: string
    try {
      migrieren(db)
      abzugUeberMigration = schemaAbzugErstellen(db)
    } finally {
      db.close()
    }

    const abzugFrischAngelegt = schemaAbzugFrischerDatenbank()
    expect(abzugUeberMigration).toBe(abzugFrischAngelegt)
    expect(abzugUeberMigration.length).toBeGreaterThan(0)
  })

  it('3. Datenerhalt: ein erneuter migrieren()-Aufruf (No-op) lässt vorhandene Zeilen unverändert', () => {
    const db = oeffnen(dbPfad)
    try {
      migrieren(db)

      const transaktionId = uuidv7()
      db.prepare('INSERT INTO transaktion (id, zeitpunkt, art, lfd) VALUES (@id, @zeitpunkt, @art, @lfd)').run({
        id: transaktionId,
        zeitpunkt: 1_700_000_000_000,
        art: 'nutzer',
        lfd: 1,
      })

      // migrieren() ist ein No-op, da user_version bereits SCHEMA_VERSION entspricht — es darf
      // keine Transaktion öffnen und keine Zeile berühren.
      migrieren(db)

      const zeile = db
        .prepare<{ readonly id: string }, TransaktionZeile>(
          'SELECT id, zeitpunkt, art, lfd FROM transaktion WHERE id = @id',
        )
        .get({ id: transaktionId })

      expect(zeile).toEqual({ id: transaktionId, zeitpunkt: 1_700_000_000_000, art: 'nutzer', lfd: 1 })
    } finally {
      db.close()
    }
  })

  it('4. Fixture-Vollständigkeit: für jede Version 1..SCHEMA_VERSION-1 existiert eine Fixture-Datei', () => {
    const fixturesOrdner = join(process.cwd(), 'fixtures', 'datenbanken')
    for (let version = 1; version < SCHEMA_VERSION; version += 1) {
      expect(existsSync(join(fixturesOrdner, `schema-v${String(version)}.sqlite`))).toBe(true)
    }
    // Bei SCHEMA_VERSION = 1 ist diese Menge leer (kein v0-Vorgänger) — die Schleife oben läuft
    // dann nicht, und dieser Test bleibt trotzdem aussagekräftig statt stillschweigend grün ohne
    // eine einzige Zusicherung.
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(1)
  })
})
