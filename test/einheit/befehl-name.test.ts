// AP-1.12: `name.anlegen`/`name.aendern`/`name.loeschen` über den echten Befehlsbus
// (`src/main/befehle/bus.ts`) gegen eine migrierte `:memory:`-Datenbank. Muster identisch zu
// `test/einheit/befehl-person.test.ts`.
import { describe, expect, it, vi } from 'vitest'

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

interface NameZeile {
  readonly id: string
  readonly person_id: string
  readonly typ: string
  readonly nachname: string | null
  readonly vornamen: string | null
  readonly ist_bevorzugt: 0 | 1 | null
  readonly geaendert_am: number | null
}

interface AenderungZeile {
  readonly operation: string
}

interface AussageZahl {
  readonly anzahl: number
}

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

function nameLesen(db: ReturnType<typeof oeffnen>, id: string): NameZeile | undefined {
  return db
    .prepare<{ readonly id: string }, NameZeile>(
      'SELECT id, person_id, typ, nachname, vornamen, ist_bevorzugt, geaendert_am FROM name WHERE id = @id',
    )
    .get({ id })
}

function aenderungenFuerName(db: ReturnType<typeof oeffnen>, id: string): readonly AenderungZeile[] {
  return db
    .prepare<{ readonly id: string }, AenderungZeile>(
      `SELECT operation FROM aenderung WHERE tabelle = 'name' AND datensatz_id = @id ORDER BY reihenfolge`,
    )
    .all({ id })
}

function aussageAnzahlFuerName(db: ReturnType<typeof oeffnen>, nameId: string): number {
  const zeile = db
    .prepare<{ readonly nameId: string }, AussageZahl>(
      `SELECT COUNT(*) AS anzahl FROM aussage WHERE subjekt_typ = 'name' AND subjekt_id = @nameId`,
    )
    .get({ nameId })
  if (zeile === undefined) {
    throw new Error('aussageAnzahlFuerName(): COUNT(*)-Abfrage lieferte unerwartet keine Zeile.')
  }
  return zeile.anzahl
}

interface TransaktionZahl {
  readonly anzahl: number
}

function transaktionAnzahl(db: ReturnType<typeof oeffnen>): number {
  const zeile = db.prepare<[], TransaktionZahl>('SELECT COUNT(*) AS anzahl FROM transaktion').get()
  if (zeile === undefined) {
    throw new Error('transaktionAnzahl(): COUNT(*)-Abfrage lieferte unerwartet keine Zeile.')
  }
  return zeile.anzahl
}

function neuePerson(db: ReturnType<typeof oeffnen>): string {
  return fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
}

function fehlerCode(fn: () => void): string | undefined {
  try {
    fn()
    return undefined
  } catch (fehler) {
    return fehler instanceof WurzelFehler ? fehler.code : `KEIN_WURZELFEHLER:${String(fehler)}`
  }
}

describe('name.anlegen (AP-1.12)', () => {
  it('legt eine name-Zeile an, genau eine aenderung-Zeile (operation=insert), KEINE Existenz-Aussage', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname: 'Müller', vornamen: 'Anna' })

      const zeile = nameLesen(db, id)
      expect(zeile).toBeDefined()
      expect(zeile?.person_id).toBe(personId)
      expect(zeile?.nachname).toBe('Müller')
      expect(zeile?.vornamen).toBe('Anna')

      expect(aenderungenFuerName(db, id)).toHaveLength(1)
      expect(aenderungenFuerName(db, id)[0]?.operation).toBe('insert')

      expect(aussageAnzahlFuerName(db, id)).toBe(0)
    } finally {
      db.close()
    }
  })

  it('nicht existierende personId → NICHT_GEFUNDEN_PERSON, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() =>
        fuehreAus(db, 'name.anlegen', { personId: 'nicht-vorhanden', typ: 'geburtsname', nachname: 'X' }),
      )
      expect(code).toBe('NICHT_GEFUNDEN_PERSON')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })
})

describe('name.aendern (AP-1.12)', () => {
  it('ändert nachname/vornamen, trägt operation=update mit neuem geaendert_am', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname: 'Müller' })
      const vorher = nameLesen(db, id)

      fuehreAus(db, 'name.aendern', { id, typ: 'geburtsname', nachname: 'Müller-Schmidt', vornamen: 'Anna' })

      const nachher = nameLesen(db, id)
      expect(nachher?.nachname).toBe('Müller-Schmidt')
      expect(nachher?.vornamen).toBe('Anna')
      expect(nachher?.geaendert_am ?? 0).toBeGreaterThanOrEqual(vorher?.geaendert_am ?? 0)

      const aenderungen = aenderungenFuerName(db, id)
      expect(aenderungen[aenderungen.length - 1]?.operation).toBe('update')
    } finally {
      db.close()
    }
  })

  it('AP-0.22: identische Werte erzeugen keine zweite Transaktion (No-op)', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname: 'Müller' })
      const anzahlVorher = transaktionAnzahl(db)

      fuehreAus(db, 'name.aendern', { id, typ: 'geburtsname', nachname: 'Müller' })

      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
      expect(aenderungenFuerName(db, id)).toHaveLength(1) // nur das ursprüngliche insert
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_NAME, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'name.aendern', { id: 'nicht-vorhanden', typ: 'geburtsname', nachname: 'X' }))
      expect(code).toBe('NICHT_GEFUNDEN_NAME')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })
})

describe('name.loeschen (AP-1.12)', () => {
  it('löscht die name-Zeile, trägt genau eine weitere aenderung-Zeile (operation=delete)', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname: 'Müller' })

      fuehreAus(db, 'name.loeschen', { id })

      expect(nameLesen(db, id)).toBeUndefined()
      const aenderungen = aenderungenFuerName(db, id)
      expect(aenderungen).toHaveLength(2) // insert (anlegen) + delete (löschen)
      expect(aenderungen[aenderungen.length - 1]?.operation).toBe('delete')
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_NAME, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'name.loeschen', { id: 'nicht-vorhanden' }))
      expect(code).toBe('NICHT_GEFUNDEN_NAME')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })
})
