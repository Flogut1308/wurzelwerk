// AP-0.8, test/einheit/journal-trigger.test.ts: emulierte Bus-Sequenz von Hand (der echte
// Befehlsbus ist AP-0.9) - transaktionAnlegen → armieren → INSERT/UPDATE/DELETE → entwaffnen, alles
// in einer `BEGIN IMMEDIATE`-Transaktion (55_Architektur.md §4.5-Vorlage). Prüft: je Operation eine
// vollständige `aenderung`-Zeile mit korrekter `operation`, aufsteigender `reihenfolge` und
// vollständigem `wert_alt_json`/`wert_neu_json` (alle Spalten, ADR-017).
import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { join } from 'node:path'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { triggerdriftAusgleichen } from '../../src/main/datenbank/journal-trigger-anwenden'
import { armieren, entwaffnen } from '../../src/main/journal/kontext'
import { transaktionAnlegen } from '../../src/main/repositories/journal-repo'

const SCHEMA_BASIS = join(process.cwd(), 'docs', 'schema')

interface TriggerSqlZeile {
  readonly sql: string | null
}

function triggerSql(db: ReturnType<typeof oeffnen>, name: string): string | null {
  const zeile = db
    .prepare<{ readonly name: string }, TriggerSqlZeile>("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = @name")
    .get({ name })
  return zeile === undefined ? null : zeile.sql
}

interface AenderungZeile {
  readonly id: string
  readonly transaktion_id: string
  readonly reihenfolge: number
  readonly tabelle: string
  readonly datensatz_id: string
  readonly wert_alt_json: string | null
  readonly wert_neu_json: string | null
  readonly operation: string
}

function aenderungenFuerTransaktion(db: ReturnType<typeof oeffnen>, transaktionId: string): readonly AenderungZeile[] {
  return db
    .prepare<{ readonly transaktionId: string }, AenderungZeile>(
      `SELECT id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation
       FROM aenderung WHERE transaktion_id = @transaktionId ORDER BY reihenfolge`,
    )
    .all({ transaktionId })
}

const PERSON_SPALTEN = [
  'id',
  'geschlecht',
  'lebend_status',
  'privat',
  'notiz',
  'gesperrt_bis',
  'ist_platzhalter',
  'platzhalter_grund',
  'erstellt_am',
  'geaendert_am',
].sort((a, b) => a.localeCompare(b))

function spaltenVon(json: string | null): readonly string[] {
  if (json === null) {
    throw new Error('spaltenVon(): erwartet non-null JSON.')
  }
  const wert: unknown = JSON.parse(json)
  if (typeof wert !== 'object' || wert === null) {
    throw new Error('spaltenVon(): erwartet ein JSON-Objekt.')
  }
  return Object.keys(wert).sort((a, b) => a.localeCompare(b))
}

function geschlechtVon(json: string | null): unknown {
  if (json === null) {
    throw new Error('geschlechtVon(): erwartet non-null JSON.')
  }
  const wert: unknown = JSON.parse(json)
  if (typeof wert !== 'object' || wert === null) {
    throw new Error('geschlechtVon(): erwartet ein JSON-Objekt.')
  }
  return (wert as Record<string, unknown>)['geschlecht']
}

describe('jrn_*-Trigger schreiben vollständige aenderung-Zeilen (AP-0.8, 55_Architektur.md §4.2-4.3)', () => {
  it('zwei INSERT + ein UPDATE + ein DELETE auf person: vier Zeilen, reihenfolge 1..4, korrekte operation', () => {
    const db = oeffnen(':memory:')
    try {
      migrieren(db)
      const txId = uuidv7()
      const personIdEins = uuidv7()
      const personIdZwei = uuidv7()

      db.transaction(() => {
        transaktionAnlegen(db, { id: txId, zeitpunkt: 1_700_000_000_000, art: 'nutzer', lfd: 1 })
        armieren(db, txId)
        db.prepare('INSERT INTO person (id, geschlecht, privat, ist_platzhalter) VALUES (@id, @geschlecht, 0, 0)').run({
          id: personIdEins,
          geschlecht: 'F',
        })
        db.prepare('INSERT INTO person (id, geschlecht, privat, ist_platzhalter) VALUES (@id, @geschlecht, 0, 0)').run({
          id: personIdZwei,
          geschlecht: 'M',
        })
        db.prepare('UPDATE person SET geschlecht = @geschlecht WHERE id = @id').run({ id: personIdEins, geschlecht: 'U' })
        db.prepare('DELETE FROM person WHERE id = @id').run({ id: personIdZwei })
        entwaffnen(db)
      }).immediate()

      const zeilen = aenderungenFuerTransaktion(db, txId)

      expect(zeilen.map((zeile) => zeile.reihenfolge)).toEqual([1, 2, 3, 4])
      expect(zeilen.map((zeile) => zeile.operation)).toEqual(['insert', 'insert', 'update', 'delete'])
      expect(zeilen.every((zeile) => zeile.transaktion_id === txId)).toBe(true)
      expect(zeilen.every((zeile) => zeile.tabelle === 'person')).toBe(true)

      // 1: erster INSERT (personIdEins)
      expect(zeilen[0]?.datensatz_id).toBe(personIdEins)
      expect(zeilen[0]?.wert_alt_json).toBeNull()
      expect(spaltenVon(zeilen[0]?.wert_neu_json ?? null)).toEqual(PERSON_SPALTEN)
      expect(geschlechtVon(zeilen[0]?.wert_neu_json ?? null)).toBe('F')

      // 2: zweiter INSERT (personIdZwei)
      expect(zeilen[1]?.datensatz_id).toBe(personIdZwei)
      expect(spaltenVon(zeilen[1]?.wert_neu_json ?? null)).toEqual(PERSON_SPALTEN)

      // 3: UPDATE auf personIdEins — vollständiges Vorher UND Nachher, nicht nur das geänderte Feld
      expect(zeilen[2]?.datensatz_id).toBe(personIdEins)
      expect(spaltenVon(zeilen[2]?.wert_alt_json ?? null)).toEqual(PERSON_SPALTEN)
      expect(spaltenVon(zeilen[2]?.wert_neu_json ?? null)).toEqual(PERSON_SPALTEN)
      expect(geschlechtVon(zeilen[2]?.wert_alt_json ?? null)).toBe('F')
      expect(geschlechtVon(zeilen[2]?.wert_neu_json ?? null)).toBe('U')

      // 4: DELETE auf personIdZwei — nur wert_alt_json, wert_neu_json ist NULL
      expect(zeilen[3]?.datensatz_id).toBe(personIdZwei)
      expect(spaltenVon(zeilen[3]?.wert_alt_json ?? null)).toEqual(PERSON_SPALTEN)
      expect(zeilen[3]?.wert_neu_json).toBeNull()
    } finally {
      db.close()
    }
  })

  it('zusammengesetzter Primärschlüssel (ort_externe_id): datensatz_id = ort_id || "|" || system (D-2)', () => {
    const db = oeffnen(':memory:')
    try {
      migrieren(db)
      const txId = uuidv7()
      const ortId = uuidv7()

      db.transaction(() => {
        transaktionAnlegen(db, { id: txId, zeitpunkt: 1_700_000_000_000, art: 'nutzer', lfd: 1 })
        armieren(db, txId)
        db.prepare('INSERT INTO ort (id) VALUES (@id)').run({ id: ortId })
        db.prepare("INSERT INTO ort_externe_id (ort_id, system, wert) VALUES (@ortId, 'gov', 'ABC123')").run({ ortId })
        entwaffnen(db)
      }).immediate()

      const zeilen = aenderungenFuerTransaktion(db, txId).filter((zeile) => zeile.tabelle === 'ort_externe_id')
      expect(zeilen).toHaveLength(1)
      expect(zeilen[0]?.datensatz_id).toBe(`${ortId}|gov`)
      expect(spaltenVon(zeilen[0]?.wert_neu_json ?? null)).toEqual(
        ['ort_id', 'system', 'wert', 'erstellt_am', 'geaendert_am'].sort((a, b) => a.localeCompare(b)),
      )
    } finally {
      db.close()
    }
  })

  it('ein Schreibvorgang ohne armierte Transaktion (aenderung.transaktion_id NOT NULL) scheitert', () => {
    const db = oeffnen(':memory:')
    try {
      migrieren(db)
      // Kein transaktionAnlegen()/armieren() — journal_kontext.transaktion_id ist NULL (Default
      // nach docs/schema/0004_journal.sql), aktiv = 1 ("scharfer Ruhezustand", §4.3).
      expect(() => db.prepare('INSERT INTO person (id, privat, ist_platzhalter) VALUES (@id, 0, 0)').run({ id: uuidv7() })).toThrow(
        /NOT NULL constraint failed: aenderung\.transaktion_id/,
      )
    } finally {
      db.close()
    }
  })
})

// AP-0.24 (F-06): eine geänderte/neu erzeugte Datei-Fassung von `trigger_generiert.sql` (etwa nach
// einem Trigger-Fix ohne begleitende neue Migration) erreicht eine bereits bestehende Datenbank
// nie - `generierteTriggerAnwenden()` läuft heute nur innerhalb `migrieren()`, wenn tatsächlich
// mindestens eine Migration angewendet wird. `triggerdriftAusgleichen()` schließt diese Lücke beim
// Öffnen (unabhängig von einer Migration).
describe('triggerdriftAusgleichen erkennt und behebt Trigger-Drift beim Öffnen (AP-0.24, F-06)', () => {
  it('ein body-mutierter jrn_*-Trigger wird erkannt (anzahl > 0) und auf den Datei-Stand zurückgesetzt', () => {
    const db = oeffnen(':memory:')
    try {
      migrieren(db)
      const referenz = triggerSql(db, 'jrn_person_ai')
      if (referenz === null) {
        throw new Error('Testvoraussetzung verletzt: jrn_person_ai fehlt nach frischer Migration.')
      }

      db.exec('DROP TRIGGER jrn_person_ai')
      db.exec(
        `CREATE TRIGGER jrn_person_ai AFTER INSERT ON person
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  SELECT 1;
END;`,
      )
      expect(triggerSql(db, 'jrn_person_ai')).not.toBe(referenz)

      const anzahl = triggerdriftAusgleichen(db, SCHEMA_BASIS)

      expect(anzahl).toBeGreaterThan(0)
      expect(triggerSql(db, 'jrn_person_ai')).toBe(referenz)
    } finally {
      db.close()
    }
  })

  it('ein fehlender jrn_*-Trigger wird erkannt (anzahl > 0) und wiederhergestellt', () => {
    const db = oeffnen(':memory:')
    try {
      migrieren(db)
      const referenz = triggerSql(db, 'jrn_person_ai')
      if (referenz === null) {
        throw new Error('Testvoraussetzung verletzt: jrn_person_ai fehlt nach frischer Migration.')
      }

      db.exec('DROP TRIGGER jrn_person_ai')
      expect(triggerSql(db, 'jrn_person_ai')).toBeNull()

      const anzahl = triggerdriftAusgleichen(db, SCHEMA_BASIS)

      expect(anzahl).toBeGreaterThan(0)
      expect(triggerSql(db, 'jrn_person_ai')).toBe(referenz)
    } finally {
      db.close()
    }
  })

  it('kein Drift (frisch migrierte Datenbank): anzahl = 0', () => {
    const db = oeffnen(':memory:')
    try {
      migrieren(db)
      expect(triggerdriftAusgleichen(db, SCHEMA_BASIS)).toBe(0)
    } finally {
      db.close()
    }
  })
})
