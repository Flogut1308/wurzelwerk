// AP-1.34 PR-C1a (B-01): `aussage_zitat.anlegen` mit Textanker über den echten Befehlsbus gegen eine
// migrierte `:memory:`-Datenbank. Der Anker wird gegen das Transkript des Zitats geprüft
// (src/core/beleg/textanker.ts); ein ungültiger Anker schreibt nichts. Muster wie
// `test/einheit/befehl-aussage-zitat.test.ts`.
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
import { aussageZitatAnlegenEinSchema } from '../../src/shared/schemata/befehle'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'

type Db = ReturnType<typeof oeffnen>

function neueTestDatenbank(): Db {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

function neueAussage(db: Db): string {
  const { id: personId } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
  return fuehreAus(db, 'aussage.anlegen', {
    subjektTyp: 'person',
    subjektId: personId,
    praedikat: 'beruf',
    wertText: 'Schmied',
    konfidenz: 3,
  }).id
}

function neuesZitat(db: Db, transkript?: string): string {
  const { id: quelleId } = fuehreAus(db, 'quelle.anlegen', { typ: 'kirchenbuch', titel: 'Taufregister' })
  return fuehreAus(db, 'zitat.anlegen', transkript === undefined ? { quelleId } : { quelleId, transkript }).id
}

interface VerknuepfungZeile {
  readonly aussage_id: string
  readonly zitat_id: string
  readonly feld: string | null
  readonly textanker_von: number | null
  readonly textanker_bis: number | null
}

function verknuepfungLesen(db: Db, aussageId: string, zitatId: string): VerknuepfungZeile | undefined {
  return db
    .prepare<{ readonly aussageId: string; readonly zitatId: string }, VerknuepfungZeile>(
      `SELECT aussage_id, zitat_id, feld, textanker_von, textanker_bis
       FROM aussage_zitat WHERE aussage_id = @aussageId AND zitat_id = @zitatId`,
    )
    .get({ aussageId, zitatId })
}

function transaktionAnzahl(db: Db): number {
  const zeile = db.prepare<[], { readonly anzahl: number }>('SELECT COUNT(*) AS anzahl FROM transaktion').get()
  if (zeile === undefined) {
    throw new Error('transaktionAnzahl(): COUNT(*)-Abfrage lieferte unerwartet keine Zeile.')
  }
  return zeile.anzahl
}

function fehlerCode(fn: () => void): string | undefined {
  try {
    fn()
    return undefined
  } catch (fehler) {
    return fehler instanceof WurzelFehler ? fehler.code : `KEIN_WURZELFEHLER:${String(fehler)}`
  }
}

const TRANSKRIPT = 'Getauft wurde Johann Müller'

describe('aussage_zitat.anlegen mit Textanker (AP-1.34 PR-C1a)', () => {
  it('A1 speichert von und bis', () => {
    const db = neueTestDatenbank()
    try {
      const aussageId = neueAussage(db)
      const zitatId = neuesZitat(db, TRANSKRIPT)

      fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId, textanker: { von: 14, bis: 20 } })

      expect(verknuepfungLesen(db, aussageId, zitatId)).toEqual({
        aussage_id: aussageId,
        zitat_id: zitatId,
        feld: null,
        textanker_von: 14,
        textanker_bis: 20,
      })
      expect(TRANSKRIPT.slice(14, 20)).toBe('Johann')
    } finally {
      db.close()
    }
  })

  it('A2 ohne Anker bleiben von und bis NULL', () => {
    const db = neueTestDatenbank()
    try {
      const aussageId = neueAussage(db)
      const zitatId = neuesZitat(db, TRANSKRIPT)

      fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId })

      const zeile = verknuepfungLesen(db, aussageId, zitatId)
      expect(zeile?.textanker_von).toBeNull()
      expect(zeile?.textanker_bis).toBeNull()
    } finally {
      db.close()
    }
  })

  it('A3 halber, leerer, verkehrter oder negativer Anker scheitert am Zod-Schema', () => {
    const basis = { aussageId: 'a', zitatId: 'z' }
    expect(aussageZitatAnlegenEinSchema.safeParse({ ...basis, textanker: { von: 2 } }).success).toBe(false)
    expect(aussageZitatAnlegenEinSchema.safeParse({ ...basis, textanker: { bis: 2 } }).success).toBe(false)
    expect(aussageZitatAnlegenEinSchema.safeParse({ ...basis, textanker: { von: 3, bis: 3 } }).success).toBe(false)
    expect(aussageZitatAnlegenEinSchema.safeParse({ ...basis, textanker: { von: 4, bis: 2 } }).success).toBe(false)
    expect(aussageZitatAnlegenEinSchema.safeParse({ ...basis, textanker: { von: -1, bis: 2 } }).success).toBe(false)
    expect(aussageZitatAnlegenEinSchema.safeParse({ ...basis, textanker: { von: 0.5, bis: 2 } }).success).toBe(false)
    expect(aussageZitatAnlegenEinSchema.safeParse({ ...basis, textanker: { von: 0, bis: 2.5 } }).success).toBe(false)
    expect(aussageZitatAnlegenEinSchema.safeParse({ ...basis, textanker: { von: 0, bis: 2 } }).success).toBe(true)
    expect(aussageZitatAnlegenEinSchema.safeParse(basis).success).toBe(true)

    const db = neueTestDatenbank()
    try {
      const aussageId = neueAussage(db)
      const zitatId = neuesZitat(db, TRANSKRIPT)
      const anzahlVorher = transaktionAnzahl(db)
      expect(() => fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId, textanker: { von: 5, bis: 5 } })).toThrow()
      expect(verknuepfungLesen(db, aussageId, zitatId)).toBeUndefined()
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('A4 bis > Länge des Transkripts → VALIDIERUNG_WERTEBEREICH, keine Zeile', () => {
    const db = neueTestDatenbank()
    try {
      const aussageId = neueAussage(db)
      const zitatId = neuesZitat(db, TRANSKRIPT)
      const anzahlVorher = transaktionAnzahl(db)

      const code = fehlerCode(() =>
        fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId, textanker: { von: 0, bis: TRANSKRIPT.length + 1 } }),
      )

      expect(code).toBe('VALIDIERUNG_WERTEBEREICH')
      expect(verknuepfungLesen(db, aussageId, zitatId)).toBeUndefined()
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)

      // Grenzfall: bis = Länge ist gültig (halboffen).
      fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId, textanker: { von: 0, bis: TRANSKRIPT.length } })
      expect(verknuepfungLesen(db, aussageId, zitatId)?.textanker_bis).toBe(TRANSKRIPT.length)
    } finally {
      db.close()
    }
  })

  it('A5 Zitat ohne Transkript → VALIDIERUNG_WERTEBEREICH, keine Zeile', () => {
    const db = neueTestDatenbank()
    try {
      const aussageId = neueAussage(db)
      const zitatId = neuesZitat(db)
      const anzahlVorher = transaktionAnzahl(db)

      const code = fehlerCode(() => fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId, textanker: { von: 0, bis: 1 } }))

      expect(code).toBe('VALIDIERUNG_WERTEBEREICH')
      expect(verknuepfungLesen(db, aussageId, zitatId)).toBeUndefined()
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('A5b Grenze teilt ein Ersatzpaar → VALIDIERUNG_WERTEBEREICH, keine Zeile (F4)', () => {
    const db = neueTestDatenbank()
    try {
      const aussageId = neueAussage(db)
      const zitatId = neuesZitat(db, 'Müller 👶 1850')
      const anzahlVorher = transaktionAnzahl(db)

      const code = fehlerCode(() => fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId, textanker: { von: 8, bis: 10 } }))

      expect(code).toBe('VALIDIERUNG_WERTEBEREICH')
      expect(verknuepfungLesen(db, aussageId, zitatId)).toBeUndefined()
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)

      fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId, textanker: { von: 7, bis: 9 } })
      expect(verknuepfungLesen(db, aussageId, zitatId)?.textanker_von).toBe(7)
    } finally {
      db.close()
    }
  })

  it('A6 Undo entfernt die Zeile samt Anker, Redo stellt sie gleich wieder her', () => {
    const db = neueTestDatenbank()
    try {
      const aussageId = neueAussage(db)
      const zitatId = neuesZitat(db, TRANSKRIPT)
      fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId, textanker: { von: 0, bis: 7 } })
      const nachAnlegen = verknuepfungLesen(db, aussageId, zitatId)
      expect(nachAnlegen?.textanker_bis).toBe(7)

      undo(db)
      expect(verknuepfungLesen(db, aussageId, zitatId)).toBeUndefined()

      redo(db)
      expect(verknuepfungLesen(db, aussageId, zitatId)).toEqual(nachAnlegen)
    } finally {
      db.close()
    }
  })
})
