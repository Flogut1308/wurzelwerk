// AP-1.12: `elternschaft.anlegen`/`elternschaft.aendern`/`elternschaft.loeschen` über den echten
// Befehlsbus (`src/main/befehle/bus.ts`) gegen eine migrierte `:memory:`-Datenbank. Muster
// identisch zu `test/einheit/befehl-person.test.ts`.
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

interface ElternschaftZeile {
  readonly id: string
  readonly elternteil_id: string
  readonly kind_id: string
  readonly typ: string
  readonly notiz: string | null
  readonly geaendert_am: number | null
}

interface AussageZeile {
  readonly id: string
  readonly praedikat: string
  readonly wert_text: string | null
  readonly konfidenz: number | null
}

interface TransaktionZahl {
  readonly anzahl: number
}

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

function elternschaftLesen(db: ReturnType<typeof oeffnen>, id: string): ElternschaftZeile | undefined {
  return db
    .prepare<{ readonly id: string }, ElternschaftZeile>(
      'SELECT id, elternteil_id, kind_id, typ, notiz, geaendert_am FROM elternschaft WHERE id = @id',
    )
    .get({ id })
}

function aussagenFuerElternschaft(db: ReturnType<typeof oeffnen>, elternschaftId: string): readonly AussageZeile[] {
  return db
    .prepare<{ readonly elternschaftId: string }, AussageZeile>(
      `SELECT id, praedikat, wert_text, konfidenz FROM aussage WHERE subjekt_typ = 'elternschaft' AND subjekt_id = @elternschaftId`,
    )
    .all({ elternschaftId })
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

describe('elternschaft.anlegen (AP-1.12)', () => {
  it('legt eine elternschaft-Zeile + genau eine Existenz-Aussage (praedikat=existenz, wert_text=ja) an', () => {
    const db = neueTestDatenbank()
    try {
      const elternteilId = neuePerson(db)
      const kindId = neuePerson(db)

      const { id } = fuehreAus(db, 'elternschaft.anlegen', { elternteilId, kindId, typ: 'biologisch', konfidenz: 3 })

      const zeile = elternschaftLesen(db, id)
      expect(zeile?.elternteil_id).toBe(elternteilId)
      expect(zeile?.kind_id).toBe(kindId)
      expect(zeile?.typ).toBe('biologisch')

      const aussagen = aussagenFuerElternschaft(db, id)
      expect(aussagen).toHaveLength(1)
      expect(aussagen[0]?.praedikat).toBe('existenz')
      expect(aussagen[0]?.wert_text).toBe('ja')
      expect(aussagen[0]?.konfidenz).toBe(3)
    } finally {
      db.close()
    }
  })

  it('nicht existierende elternteilId → NICHT_GEFUNDEN_PERSON, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const kindId = neuePerson(db)
      const anzahlVorher = transaktionAnzahl(db)

      const code = fehlerCode(() => fuehreAus(db, 'elternschaft.anlegen', { elternteilId: 'nicht-vorhanden', kindId, typ: 'biologisch', konfidenz: 3 }))

      expect(code).toBe('NICHT_GEFUNDEN_PERSON')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('würde einen Zyklus erzeugen (Person wäre ihr eigener Vorfahre) → KONFLIKT_ZYKLUS, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const a = neuePerson(db)
      const b = neuePerson(db)
      // a ist Kind von b (b -> a bereits vorhanden).
      fuehreAus(db, 'elternschaft.anlegen', { elternteilId: b, kindId: a, typ: 'biologisch', konfidenz: 3 })
      const anzahlVorher = transaktionAnzahl(db)

      // b als Kind von a anzulegen würde den Zyklus a -> b -> a schließen.
      const code = fehlerCode(() => fuehreAus(db, 'elternschaft.anlegen', { elternteilId: a, kindId: b, typ: 'biologisch', konfidenz: 3 }))

      expect(code).toBe('KONFLIKT_ZYKLUS')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('eine Person als ihr eigener Elternteil → KONFLIKT_ZYKLUS (Selbstkante)', () => {
    const db = neueTestDatenbank()
    try {
      const a = neuePerson(db)
      const code = fehlerCode(() => fuehreAus(db, 'elternschaft.anlegen', { elternteilId: a, kindId: a, typ: 'biologisch', konfidenz: 3 }))
      expect(code).toBe('KONFLIKT_ZYKLUS')
    } finally {
      db.close()
    }
  })
})

describe('elternschaft.aendern (AP-1.12)', () => {
  it('ändert typ/notiz, No-op bei identischen Werten (AP-0.22)', () => {
    const db = neueTestDatenbank()
    try {
      const elternteilId = neuePerson(db)
      const kindId = neuePerson(db)
      const { id } = fuehreAus(db, 'elternschaft.anlegen', { elternteilId, kindId, typ: 'biologisch', konfidenz: 3 })

      fuehreAus(db, 'elternschaft.aendern', { id, typ: 'adoptiv', notiz: 'Adoption 1920' })
      const nachher = elternschaftLesen(db, id)
      expect(nachher?.typ).toBe('adoptiv')
      expect(nachher?.notiz).toBe('Adoption 1920')

      const anzahlVorher = transaktionAnzahl(db)
      fuehreAus(db, 'elternschaft.aendern', { id, typ: 'adoptiv', notiz: 'Adoption 1920' })
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_ELTERNSCHAFT', () => {
    const db = neueTestDatenbank()
    try {
      const code = fehlerCode(() => fuehreAus(db, 'elternschaft.aendern', { id: 'nicht-vorhanden', typ: 'biologisch' }))
      expect(code).toBe('NICHT_GEFUNDEN_ELTERNSCHAFT')
    } finally {
      db.close()
    }
  })
})

describe('elternschaft.loeschen (AP-1.12)', () => {
  it('löscht die elternschaft-Zeile UND die Existenz-Aussage (keine verwaiste Aussage)', () => {
    const db = neueTestDatenbank()
    try {
      const elternteilId = neuePerson(db)
      const kindId = neuePerson(db)
      const { id } = fuehreAus(db, 'elternschaft.anlegen', { elternteilId, kindId, typ: 'biologisch', konfidenz: 3 })
      expect(aussagenFuerElternschaft(db, id)).toHaveLength(1)

      fuehreAus(db, 'elternschaft.loeschen', { id })

      expect(elternschaftLesen(db, id)).toBeUndefined()
      expect(aussagenFuerElternschaft(db, id)).toHaveLength(0)
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_ELTERNSCHAFT, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'elternschaft.loeschen', { id: 'nicht-vorhanden' }))
      expect(code).toBe('NICHT_GEFUNDEN_ELTERNSCHAFT')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })
})
