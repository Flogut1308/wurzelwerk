// AP-1.12: `partnerschaft.anlegen`/`partnerschaft.aendern`/`partnerschaft.loeschen` über den echten
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
import { redo, undo } from '../../src/main/journal/undo'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'

interface PartnerschaftZeile {
  readonly id: string
  readonly typ: string
  readonly beginn_wert1: string | null
  readonly ende_grund: string | null
  readonly notiz: string | null
}

interface PartnerschaftPersonZeile {
  readonly partnerschaft_id: string
  readonly person_id: string
  readonly rolle: string | null
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

function partnerschaftLesen(db: ReturnType<typeof oeffnen>, id: string): PartnerschaftZeile | undefined {
  return db
    .prepare<{ readonly id: string }, PartnerschaftZeile>('SELECT id, typ, beginn_wert1, ende_grund, notiz FROM partnerschaft WHERE id = @id')
    .get({ id })
}

function partnerschaftPersonListe(db: ReturnType<typeof oeffnen>, partnerschaftId: string): readonly PartnerschaftPersonZeile[] {
  return db
    .prepare<{ readonly partnerschaftId: string }, PartnerschaftPersonZeile>(
      'SELECT partnerschaft_id, person_id, rolle FROM partnerschaft_person WHERE partnerschaft_id = @partnerschaftId',
    )
    .all({ partnerschaftId })
}

function aussagenFuerPartnerschaft(db: ReturnType<typeof oeffnen>, partnerschaftId: string): readonly AussageZeile[] {
  return db
    .prepare<{ readonly partnerschaftId: string }, AussageZeile>(
      `SELECT praedikat, wert_text, konfidenz FROM aussage WHERE subjekt_typ = 'partnerschaft' AND subjekt_id = @partnerschaftId`,
    )
    .all({ partnerschaftId })
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

/** Sortiert nach `person_id`, damit ein Vorher/Nachher-Vergleich unabhängig von der physischen
 * Einfüge-/Undo-Reihenfolge ist (die Bitgleichheit gilt pro Zeile, nicht für die Zeilenreihenfolge). */
function nachPersonSortiert(zeilen: readonly PartnerschaftPersonZeile[]): readonly PartnerschaftPersonZeile[] {
  return [...zeilen].sort((a, b) => a.person_id.localeCompare(b.person_id))
}

function fehlerCode(fn: () => void): string | undefined {
  try {
    fn()
    return undefined
  } catch (fehler) {
    return fehler instanceof WurzelFehler ? fehler.code : `KEIN_WURZELFEHLER:${String(fehler)}`
  }
}

describe('partnerschaft.anlegen (AP-1.12)', () => {
  it('legt eine partnerschaft-Zeile + partnerschaft_person je Beteiligten + Existenz-Aussage an', () => {
    const db = neueTestDatenbank()
    try {
      const a = neuePerson(db)
      const b = neuePerson(db)

      const { id } = fuehreAus(db, 'partnerschaft.anlegen', {
        typ: 'ehe_zivil',
        beteiligte: [
          { personId: a, rolle: 'ehepartner' },
          { personId: b, rolle: 'ehepartner' },
        ],
        konfidenz: 4,
      })

      const zeile = partnerschaftLesen(db, id)
      expect(zeile?.typ).toBe('ehe_zivil')

      const beteiligte = partnerschaftPersonListe(db, id)
      expect(beteiligte).toHaveLength(2)
      expect(beteiligte.map((b2) => b2.person_id).sort()).toEqual([a, b].sort())

      const aussagen = aussagenFuerPartnerschaft(db, id)
      expect(aussagen).toHaveLength(1)
      expect(aussagen[0]?.praedikat).toBe('existenz')
      expect(aussagen[0]?.wert_text).toBe('ja')
    } finally {
      db.close()
    }
  })

  it('nicht existierende Beteiligten-personId → NICHT_GEFUNDEN_PERSON, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const a = neuePerson(db)
      const anzahlVorher = transaktionAnzahl(db)

      const code = fehlerCode(() =>
        fuehreAus(db, 'partnerschaft.anlegen', {
          typ: 'ehe_zivil',
          beteiligte: [{ personId: a }, { personId: 'nicht-vorhanden' }],
          konfidenz: 3,
        }),
      )

      expect(code).toBe('NICHT_GEFUNDEN_PERSON')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('Undo entfernt Kante + partnerschaft_person-Kinder + Existenz-Aussage bitgleich, Redo legt alle wieder an', () => {
    const db = neueTestDatenbank()
    try {
      const a = neuePerson(db)
      const b = neuePerson(db)
      const { id } = fuehreAus(db, 'partnerschaft.anlegen', {
        typ: 'ehe_zivil',
        beteiligte: [
          { personId: a, rolle: 'ehepartner' },
          { personId: b, rolle: 'ehepartner' },
        ],
        konfidenz: 4,
      })

      const zeileNachAnlegen = partnerschaftLesen(db, id)
      const beteiligteNachAnlegen = nachPersonSortiert(partnerschaftPersonListe(db, id))
      const aussagenNachAnlegen = aussagenFuerPartnerschaft(db, id)
      expect(zeileNachAnlegen).toBeDefined()
      expect(beteiligteNachAnlegen).toHaveLength(2)
      expect(aussagenNachAnlegen).toHaveLength(1)

      undo(db)
      expect(partnerschaftLesen(db, id)).toBeUndefined()
      expect(partnerschaftPersonListe(db, id)).toHaveLength(0)
      expect(aussagenFuerPartnerschaft(db, id)).toHaveLength(0)

      redo(db)
      expect(partnerschaftLesen(db, id)).toEqual(zeileNachAnlegen)
      expect(nachPersonSortiert(partnerschaftPersonListe(db, id))).toEqual(beteiligteNachAnlegen)
      expect(aussagenFuerPartnerschaft(db, id)).toEqual(aussagenNachAnlegen)
    } finally {
      db.close()
    }
  })
})

describe('partnerschaft.aendern (AP-1.12)', () => {
  it('ändert typ/ende_grund/notiz, No-op bei identischen Werten (AP-0.22)', () => {
    const db = neueTestDatenbank()
    try {
      const a = neuePerson(db)
      const b = neuePerson(db)
      const { id } = fuehreAus(db, 'partnerschaft.anlegen', {
        typ: 'ehe_zivil',
        beteiligte: [{ personId: a }, { personId: b }],
        konfidenz: 3,
      })

      fuehreAus(db, 'partnerschaft.aendern', { id, typ: 'ehe_zivil', endeGrund: 'scheidung', notiz: 'geschieden 1930' })
      const nachher = partnerschaftLesen(db, id)
      expect(nachher?.ende_grund).toBe('scheidung')
      expect(nachher?.notiz).toBe('geschieden 1930')

      const anzahlVorher = transaktionAnzahl(db)
      fuehreAus(db, 'partnerschaft.aendern', { id, typ: 'ehe_zivil', endeGrund: 'scheidung', notiz: 'geschieden 1930' })
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_PARTNERSCHAFT', () => {
    const db = neueTestDatenbank()
    try {
      const code = fehlerCode(() => fuehreAus(db, 'partnerschaft.aendern', { id: 'nicht-vorhanden', typ: 'ehe_zivil' }))
      expect(code).toBe('NICHT_GEFUNDEN_PARTNERSCHAFT')
    } finally {
      db.close()
    }
  })

  it('Undo stellt den vorherigen endeGrund/notiz bitgleich wieder her, Redo die Änderung', () => {
    const db = neueTestDatenbank()
    try {
      const a = neuePerson(db)
      const b = neuePerson(db)
      const { id } = fuehreAus(db, 'partnerschaft.anlegen', {
        typ: 'ehe_zivil',
        beteiligte: [{ personId: a }, { personId: b }],
        konfidenz: 3,
      })
      const vorAendern = partnerschaftLesen(db, id)

      fuehreAus(db, 'partnerschaft.aendern', { id, typ: 'ehe_zivil', endeGrund: 'scheidung', notiz: 'geschieden 1930' })
      const nachAendern = partnerschaftLesen(db, id)

      undo(db)
      expect(partnerschaftLesen(db, id)).toEqual(vorAendern)

      redo(db)
      expect(partnerschaftLesen(db, id)).toEqual(nachAendern)
    } finally {
      db.close()
    }
  })
})

describe('partnerschaft.loeschen (AP-1.12)', () => {
  it('löscht partnerschaft (CASCADE räumt partnerschaft_person ab) UND die Existenz-Aussage', () => {
    const db = neueTestDatenbank()
    try {
      const a = neuePerson(db)
      const b = neuePerson(db)
      const { id } = fuehreAus(db, 'partnerschaft.anlegen', {
        typ: 'ehe_zivil',
        beteiligte: [{ personId: a }, { personId: b }],
        konfidenz: 3,
      })

      fuehreAus(db, 'partnerschaft.loeschen', { id })

      expect(partnerschaftLesen(db, id)).toBeUndefined()
      expect(partnerschaftPersonListe(db, id)).toHaveLength(0)
      expect(aussagenFuerPartnerschaft(db, id)).toHaveLength(0)
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_PARTNERSCHAFT, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'partnerschaft.loeschen', { id: 'nicht-vorhanden' }))
      expect(code).toBe('NICHT_GEFUNDEN_PARTNERSCHAFT')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('Undo stellt Kante + partnerschaft_person-Kinder + Existenz-Aussage bitgleich wieder her, Redo löscht alle erneut', () => {
    const db = neueTestDatenbank()
    try {
      const a = neuePerson(db)
      const b = neuePerson(db)
      const { id } = fuehreAus(db, 'partnerschaft.anlegen', {
        typ: 'ehe_zivil',
        beteiligte: [{ personId: a }, { personId: b }],
        konfidenz: 3,
      })
      const vorLoeschen = partnerschaftLesen(db, id)
      const beteiligteVorLoeschen = nachPersonSortiert(partnerschaftPersonListe(db, id))
      const aussagenVorLoeschen = aussagenFuerPartnerschaft(db, id)

      fuehreAus(db, 'partnerschaft.loeschen', { id })
      expect(partnerschaftLesen(db, id)).toBeUndefined()

      undo(db)
      expect(partnerschaftLesen(db, id)).toEqual(vorLoeschen)
      expect(nachPersonSortiert(partnerschaftPersonListe(db, id))).toEqual(beteiligteVorLoeschen)
      expect(aussagenFuerPartnerschaft(db, id)).toEqual(aussagenVorLoeschen)

      redo(db)
      expect(partnerschaftLesen(db, id)).toBeUndefined()
      expect(partnerschaftPersonListe(db, id)).toHaveLength(0)
      expect(aussagenFuerPartnerschaft(db, id)).toHaveLength(0)
    } finally {
      db.close()
    }
  })
})
