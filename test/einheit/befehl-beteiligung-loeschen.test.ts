// AP-1.15 PR-A: `beteiligung.loeschen` über den echten Befehlsbus (`src/main/befehle/bus.ts`)
// gegen eine migrierte `:memory:`-Datenbank. Muster identisch zu `test/einheit/befehl-ereignis.test.ts`.
// Variante A (docs/80_Offene_Fragen.md §27): NUR die `beteiligung`-Zeile verschwindet, das
// `ereignis` selbst bleibt bestehen — auch dann, wenn danach keine `beteiligung`-Zeile mehr übrig
// ist.
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

interface EreignisZeile {
  readonly id: string
}

interface BeteiligungZeile {
  readonly id: string
  readonly ereignis_id: string
  readonly person_id: string
  readonly rolle: string
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
  return db.prepare<{ readonly id: string }, EreignisZeile>('SELECT id FROM ereignis WHERE id = @id').get({ id })
}

function beteiligungListe(db: ReturnType<typeof oeffnen>, ereignisId: string): readonly BeteiligungZeile[] {
  return db
    .prepare<{ readonly ereignisId: string }, BeteiligungZeile>(
      'SELECT id, ereignis_id, person_id, rolle FROM beteiligung WHERE ereignis_id = @ereignisId',
    )
    .all({ ereignisId })
}

function beteiligungLesen(db: ReturnType<typeof oeffnen>, id: string): BeteiligungZeile | undefined {
  return db
    .prepare<{ readonly id: string }, BeteiligungZeile>('SELECT id, ereignis_id, person_id, rolle FROM beteiligung WHERE id = @id')
    .get({ id })
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

function neuesEreignisMitZweiBeteiligten(db: ReturnType<typeof oeffnen>): {
  readonly ereignisId: string
  readonly hauptperson: string
  readonly pate: string
  readonly beteiligungIdPate: string
} {
  const hauptperson = neuePerson(db)
  const pate = neuePerson(db)
  const { id: ereignisId } = fuehreAus(db, 'ereignis.anlegen', {
    typ: 'taufe',
    beteiligungen: [
      { personId: hauptperson, rolle: 'hauptperson' },
      { personId: pate, rolle: 'pate' },
    ],
    konfidenz: 3,
  })
  const beteiligungen = beteiligungListe(db, ereignisId)
  const beteiligungPate = beteiligungen.find((zeile) => zeile.person_id === pate)
  if (beteiligungPate === undefined) {
    throw new Error('Testaufbau: keine beteiligung-Zeile für den Paten gefunden.')
  }
  return { ereignisId, hauptperson, pate, beteiligungIdPate: beteiligungPate.id }
}

function fehlerCode(fn: () => void): string | undefined {
  try {
    fn()
    return undefined
  } catch (fehler) {
    return fehler instanceof WurzelFehler ? fehler.code : `KEIN_WURZELFEHLER:${String(fehler)}`
  }
}

describe('beteiligung.loeschen (AP-1.15 PR-A)', () => {
  it('entfernt NUR die beteiligung-Zeile des Paten — das ereignis bleibt bestehen, die Hauptperson-Beteiligung auch', () => {
    const db = neueTestDatenbank()
    try {
      const { ereignisId, hauptperson, beteiligungIdPate } = neuesEreignisMitZweiBeteiligten(db)

      fuehreAus(db, 'beteiligung.loeschen', { id: beteiligungIdPate })

      expect(ereignisLesen(db, ereignisId)).toBeDefined()
      const uebrig = beteiligungListe(db, ereignisId)
      expect(uebrig).toHaveLength(1)
      expect(uebrig[0]?.person_id).toBe(hauptperson)
      expect(uebrig[0]?.rolle).toBe('hauptperson')
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_BETEILIGUNG, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'beteiligung.loeschen', { id: 'nicht-vorhanden' }))
      expect(code).toBe('NICHT_GEFUNDEN_BETEILIGUNG')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('Undo stellt die beteiligung-Zeile bitgleich wieder her, Redo löscht sie erneut', () => {
    const db = neueTestDatenbank()
    try {
      const { ereignisId, beteiligungIdPate } = neuesEreignisMitZweiBeteiligten(db)
      const vorLoeschen = beteiligungLesen(db, beteiligungIdPate)
      expect(vorLoeschen).toBeDefined()

      fuehreAus(db, 'beteiligung.loeschen', { id: beteiligungIdPate })
      expect(beteiligungLesen(db, beteiligungIdPate)).toBeUndefined()
      expect(ereignisLesen(db, ereignisId)).toBeDefined()

      undo(db)
      expect(beteiligungLesen(db, beteiligungIdPate)).toEqual(vorLoeschen)

      redo(db)
      expect(beteiligungLesen(db, beteiligungIdPate)).toBeUndefined()
      expect(ereignisLesen(db, ereignisId)).toBeDefined()
    } finally {
      db.close()
    }
  })
})
