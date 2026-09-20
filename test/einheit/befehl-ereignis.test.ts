// AP-1.12: `ereignis.anlegen`/`ereignis.aendern`/`ereignis.loeschen` über den echten Befehlsbus
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

interface EreignisZeile {
  readonly id: string
  readonly typ: string
  readonly ort_id: string | null
  readonly beschreibung: string | null
  readonly notiz: string | null
}

interface BeteiligungZeile {
  readonly ereignis_id: string
  readonly person_id: string
  readonly rolle: string
}

interface AussageZeile {
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

function ereignisLesen(db: ReturnType<typeof oeffnen>, id: string): EreignisZeile | undefined {
  return db
    .prepare<{ readonly id: string }, EreignisZeile>('SELECT id, typ, ort_id, beschreibung, notiz FROM ereignis WHERE id = @id')
    .get({ id })
}

function beteiligungListe(db: ReturnType<typeof oeffnen>, ereignisId: string): readonly BeteiligungZeile[] {
  return db
    .prepare<{ readonly ereignisId: string }, BeteiligungZeile>(
      'SELECT ereignis_id, person_id, rolle FROM beteiligung WHERE ereignis_id = @ereignisId',
    )
    .all({ ereignisId })
}

function aussagenFuerEreignis(db: ReturnType<typeof oeffnen>, ereignisId: string): readonly AussageZeile[] {
  return db
    .prepare<{ readonly ereignisId: string }, AussageZeile>(
      `SELECT praedikat, wert_text, konfidenz FROM aussage WHERE subjekt_typ = 'ereignis' AND subjekt_id = @ereignisId`,
    )
    .all({ ereignisId })
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

describe('ereignis.anlegen (AP-1.12)', () => {
  it('legt eine ereignis-Zeile + beteiligung je Beteiligtem + Existenz-Aussage an', () => {
    const db = neueTestDatenbank()
    try {
      const hauptperson = neuePerson(db)

      const { id } = fuehreAus(db, 'ereignis.anlegen', {
        typ: 'geburt',
        beteiligungen: [{ personId: hauptperson, rolle: 'hauptperson' }],
        konfidenz: 3,
      })

      const zeile = ereignisLesen(db, id)
      expect(zeile?.typ).toBe('geburt')

      const beteiligungen = beteiligungListe(db, id)
      expect(beteiligungen).toHaveLength(1)
      expect(beteiligungen[0]?.person_id).toBe(hauptperson)
      expect(beteiligungen[0]?.rolle).toBe('hauptperson')

      const aussagen = aussagenFuerEreignis(db, id)
      expect(aussagen).toHaveLength(1)
      expect(aussagen[0]?.praedikat).toBe('existenz')
      expect(aussagen[0]?.wert_text).toBe('ja')
    } finally {
      db.close()
    }
  })

  it('nicht existierende ortId → NICHT_GEFUNDEN_ORT, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const hauptperson = neuePerson(db)
      const anzahlVorher = transaktionAnzahl(db)

      const code = fehlerCode(() =>
        fuehreAus(db, 'ereignis.anlegen', {
          typ: 'geburt',
          ortId: 'nicht-vorhanden',
          beteiligungen: [{ personId: hauptperson, rolle: 'hauptperson' }],
          konfidenz: 3,
        }),
      )

      expect(code).toBe('NICHT_GEFUNDEN_ORT')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('nicht existierende Beteiligungs-personId → NICHT_GEFUNDEN_PERSON, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)

      const code = fehlerCode(() =>
        fuehreAus(db, 'ereignis.anlegen', {
          typ: 'geburt',
          beteiligungen: [{ personId: 'nicht-vorhanden', rolle: 'hauptperson' }],
          konfidenz: 3,
        }),
      )

      expect(code).toBe('NICHT_GEFUNDEN_PERSON')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })
})

describe('ereignis.aendern (AP-1.12)', () => {
  it('ändert beschreibung/notiz, No-op bei identischen Werten (AP-0.22)', () => {
    const db = neueTestDatenbank()
    try {
      const hauptperson = neuePerson(db)
      const { id } = fuehreAus(db, 'ereignis.anlegen', {
        typ: 'geburt',
        beteiligungen: [{ personId: hauptperson, rolle: 'hauptperson' }],
        konfidenz: 3,
      })

      fuehreAus(db, 'ereignis.aendern', { id, typ: 'geburt', beschreibung: 'Hausgeburt', notiz: 'Notiz' })
      const nachher = ereignisLesen(db, id)
      expect(nachher?.beschreibung).toBe('Hausgeburt')
      expect(nachher?.notiz).toBe('Notiz')

      const anzahlVorher = transaktionAnzahl(db)
      fuehreAus(db, 'ereignis.aendern', { id, typ: 'geburt', beschreibung: 'Hausgeburt', notiz: 'Notiz' })
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_EREIGNIS', () => {
    const db = neueTestDatenbank()
    try {
      const code = fehlerCode(() => fuehreAus(db, 'ereignis.aendern', { id: 'nicht-vorhanden', typ: 'geburt' }))
      expect(code).toBe('NICHT_GEFUNDEN_EREIGNIS')
    } finally {
      db.close()
    }
  })
})

describe('ereignis.loeschen (AP-1.12)', () => {
  it('löscht ereignis (CASCADE räumt beteiligung ab) UND die Existenz-Aussage', () => {
    const db = neueTestDatenbank()
    try {
      const hauptperson = neuePerson(db)
      const { id } = fuehreAus(db, 'ereignis.anlegen', {
        typ: 'geburt',
        beteiligungen: [{ personId: hauptperson, rolle: 'hauptperson' }],
        konfidenz: 3,
      })

      fuehreAus(db, 'ereignis.loeschen', { id })

      expect(ereignisLesen(db, id)).toBeUndefined()
      expect(beteiligungListe(db, id)).toHaveLength(0)
      expect(aussagenFuerEreignis(db, id)).toHaveLength(0)
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_EREIGNIS, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'ereignis.loeschen', { id: 'nicht-vorhanden' }))
      expect(code).toBe('NICHT_GEFUNDEN_EREIGNIS')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })
})
