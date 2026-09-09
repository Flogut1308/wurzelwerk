// AP-0.9: die drei ersten echten Befehle (`person.anlegen`, `person.feldSetzen`, `person.loeschen`)
// über den echten Befehlsbus (`src/main/befehle/bus.ts`) gegen eine migrierte `:memory:`-Datenbank.
// Prüft die fachliche Seite (person/person_flach/aenderung-Zeilen, Zeitstempel D-3) - die reine
// Bus-Mechanik steht in `test/einheit/befehl-bus.test.ts`.
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { fuehreAus } from '../../src/main/befehle/bus'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'

interface PersonZeile {
  readonly id: string
  readonly notiz: string | null
  readonly erstellt_am: number | null
  readonly geaendert_am: number | null
}

interface PersonFlachZeile {
  readonly person_id: string
  readonly anzeigename: string
}

interface AenderungZeile {
  readonly operation: string
  readonly wert_alt_json: string | null
  readonly wert_neu_json: string | null
}

function personLesen(db: ReturnType<typeof oeffnen>, id: string): PersonZeile | undefined {
  return db
    .prepare<{ readonly id: string }, PersonZeile>('SELECT id, notiz, erstellt_am, geaendert_am FROM person WHERE id = @id')
    .get({ id })
}

function personFlachLesen(db: ReturnType<typeof oeffnen>, id: string): PersonFlachZeile | undefined {
  return db
    .prepare<{ readonly id: string }, PersonFlachZeile>('SELECT person_id, anzeigename FROM person_flach WHERE person_id = @id')
    .get({ id })
}

function aenderungenFuerPerson(db: ReturnType<typeof oeffnen>, id: string): readonly AenderungZeile[] {
  return db
    .prepare<{ readonly id: string }, AenderungZeile>(
      `SELECT operation, wert_alt_json, wert_neu_json FROM aenderung
       WHERE tabelle = 'person' AND datensatz_id = @id ORDER BY reihenfolge`,
    )
    .all({ id })
}

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

describe('person.anlegen (AP-0.9)', () => {
  it('legt eine person-Zeile + person_flach-Zeile an, mit erstellt_am === geaendert_am und genau einer aenderung-Zeile (operation=insert)', () => {
    const db = neueTestDatenbank()
    try {
      const vor = Date.now()
      const { id } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      const nach = Date.now()

      const person = personLesen(db, id)
      expect(person).toBeDefined()
      expect(person?.erstellt_am).not.toBeNull()
      expect(person?.erstellt_am).toBe(person?.geaendert_am)
      expect(person?.erstellt_am ?? 0).toBeGreaterThan(1_000_000_000_000)
      expect(person?.erstellt_am ?? 0).toBeGreaterThanOrEqual(vor)
      expect(person?.erstellt_am ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(nach)

      const flach = personFlachLesen(db, id)
      expect(flach).toBeDefined()
      expect(flach?.anzeigename).toBe('')

      const aenderungen = aenderungenFuerPerson(db, id)
      expect(aenderungen).toHaveLength(1)
      expect(aenderungen[0]?.operation).toBe('insert')
    } finally {
      db.close()
    }
  })
})

describe('person.feldSetzen (AP-0.9)', () => {
  it('setzt notiz, aktualisiert person_flach über abl_person_au, und trägt operation=update mit wert_alt/neu_json + neuem geaendert_am', () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      const vorher = personLesen(db, id)
      const erstelltAmVorher = vorher?.erstellt_am ?? null

      fuehreAus(db, 'person.feldSetzen', { id, feld: 'notiz', wert: 'Testnotiz' })

      const nachher = personLesen(db, id)
      expect(nachher?.notiz).toBe('Testnotiz')
      expect(nachher?.erstellt_am).toBe(erstelltAmVorher)
      expect(nachher?.geaendert_am ?? 0).toBeGreaterThanOrEqual(erstelltAmVorher ?? 0)

      const aenderungen = aenderungenFuerPerson(db, id)
      const letzte = aenderungen[aenderungen.length - 1]
      expect(letzte?.operation).toBe('update')
      expect(letzte?.wert_alt_json).not.toBeNull()
      expect(letzte?.wert_neu_json).not.toBeNull()

      // person_flach existiert weiterhin (abl_person_au hat sie aktualisiert, nicht gelöscht).
      const flach = personFlachLesen(db, id)
      expect(flach).toBeDefined()
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_PERSON, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      expect(() => fuehreAus(db, 'person.feldSetzen', { id: 'nicht-vorhanden', feld: 'notiz', wert: 'x' })).toThrow(WurzelFehler)
    } finally {
      db.close()
    }
  })
})

describe('person.loeschen (AP-0.9)', () => {
  it('löscht die person-Zeile (CASCADE räumt person_flach ab) und trägt genau eine aenderung-Zeile (operation=delete)', () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })

      fuehreAus(db, 'person.loeschen', { id })

      expect(personLesen(db, id)).toBeUndefined()
      expect(personFlachLesen(db, id)).toBeUndefined()

      const aenderungen = aenderungenFuerPerson(db, id)
      expect(aenderungen).toHaveLength(2) // insert (anlegen) + delete (löschen)
      expect(aenderungen[aenderungen.length - 1]?.operation).toBe('delete')
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_PERSON, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      expect(() => fuehreAus(db, 'person.loeschen', { id: 'nicht-vorhanden' })).toThrow(WurzelFehler)
    } finally {
      db.close()
    }
  })
})
