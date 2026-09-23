// AP-1.29 PR-A: `aussage_zitat.anlegen`/`aussage_zitat.loeschen` über den echten Befehlsbus
// (`src/main/befehle/bus.ts`) gegen eine migrierte `:memory:`-Datenbank — verknüpft/entkoppelt
// EINEN bestehenden Beleg (`zitat`) mit einer bestehenden `aussage`, ohne die `aussage`- oder
// `zitat`-Zeile selbst zu berühren (s. Abschnittskommentar `src/shared/schemata/befehle.ts`).
// Muster identisch zu `test/einheit/befehl-aussage.test.ts`/`test/einheit/befehl-zitat.test.ts`.
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
import { journalAn, journalAus } from '../../src/main/journal/kontext'

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
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

function neueAussage(db: ReturnType<typeof oeffnen>, personId: string): string {
  return fuehreAus(db, 'aussage.anlegen', {
    subjektTyp: 'person',
    subjektId: personId,
    praedikat: 'beruf',
    wertText: 'Schmied',
    konfidenz: 3,
  }).id
}

let zitatZaehler = 0

/** Legt eine minimale `quelle` + ein `zitat` roh an (kein Vertrags-/Befehlspfad in diesem Test) —
 * Muster identisch zu `neuesZitat()` in `test/einheit/befehl-aussage.test.ts`. */
function neuesZitat(db: ReturnType<typeof oeffnen>): string {
  zitatZaehler += 1
  const quelleId = 'quelle-test'
  const zitatId = `zitat-test-${zitatZaehler}`
  journalAus(db, 'test-fixture: Beleg für aussage_zitat-Tests')
  try {
    db.prepare(
      `INSERT INTO quelle (id, typ, titel, erstellt_am, geaendert_am)
       SELECT @id, 'kirchenbuch', 'Testquelle', 0, 0
       WHERE NOT EXISTS (SELECT 1 FROM quelle WHERE id = @id)`,
    ).run({ id: quelleId })
    db.prepare('INSERT INTO zitat (id, quelle_id, erstellt_am, geaendert_am) VALUES (@id, @quelleId, 0, 0)').run({ id: zitatId, quelleId })
  } finally {
    journalAn(db)
  }
  return zitatId
}

interface AussageZitatZeile {
  readonly aussage_id: string
  readonly zitat_id: string
}

function verknuepfungLesen(db: ReturnType<typeof oeffnen>, aussageId: string, zitatId: string): AussageZitatZeile | undefined {
  return db
    .prepare<{ readonly aussageId: string; readonly zitatId: string }, AussageZitatZeile>(
      'SELECT aussage_id, zitat_id FROM aussage_zitat WHERE aussage_id = @aussageId AND zitat_id = @zitatId',
    )
    .get({ aussageId, zitatId })
}

function fehlerCode(fn: () => void): string | undefined {
  try {
    fn()
    return undefined
  } catch (fehler) {
    return fehler instanceof WurzelFehler ? fehler.code : `KEIN_WURZELFEHLER:${String(fehler)}`
  }
}

describe('aussage_zitat.anlegen (AP-1.29 PR-A)', () => {
  it('verknüpft eine bestehende aussage mit einem bestehenden zitat', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const aussageId = neueAussage(db, personId)
      const zitatId = neuesZitat(db)

      fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId })

      expect(verknuepfungLesen(db, aussageId, zitatId)).toBeDefined()
    } finally {
      db.close()
    }
  })

  it('Undo entfernt die Verknüpfung bitgleich, Redo legt sie wieder an', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const aussageId = neueAussage(db, personId)
      const zitatId = neuesZitat(db)

      fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId })
      const nachAnlegen = verknuepfungLesen(db, aussageId, zitatId)
      expect(nachAnlegen).toBeDefined()

      undo(db)
      expect(verknuepfungLesen(db, aussageId, zitatId)).toBeUndefined()

      redo(db)
      expect(verknuepfungLesen(db, aussageId, zitatId)).toEqual(nachAnlegen)
    } finally {
      db.close()
    }
  })

  it('bereits bestehende Verknüpfung (Duplikat) → KONFLIKT_BEREITS_VORHANDEN, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const aussageId = neueAussage(db, personId)
      const zitatId = neuesZitat(db)
      fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId })
      const anzahlVorher = transaktionAnzahl(db)

      const code = fehlerCode(() => fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId }))

      expect(code).toBe('KONFLIKT_BEREITS_VORHANDEN')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('nicht existierende aussageId → NICHT_GEFUNDEN_AUSSAGE, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const zitatId = neuesZitat(db)
      const anzahlVorher = transaktionAnzahl(db)

      const code = fehlerCode(() => fuehreAus(db, 'aussage_zitat.anlegen', { aussageId: 'nicht-vorhanden', zitatId }))

      expect(code).toBe('NICHT_GEFUNDEN_AUSSAGE')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('nicht existierende zitatId → NICHT_GEFUNDEN_ZITAT, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const aussageId = neueAussage(db, personId)
      const anzahlVorher = transaktionAnzahl(db)

      const code = fehlerCode(() => fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId: 'nicht-vorhanden' }))

      expect(code).toBe('NICHT_GEFUNDEN_ZITAT')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })
})

describe('aussage_zitat.loeschen (AP-1.29 PR-A)', () => {
  it('löst eine bestehende Verknüpfung, ohne aussage/zitat selbst zu berühren', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const aussageId = neueAussage(db, personId)
      const zitatId = neuesZitat(db)
      fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId })

      fuehreAus(db, 'aussage_zitat.loeschen', { aussageId, zitatId })

      expect(verknuepfungLesen(db, aussageId, zitatId)).toBeUndefined()
    } finally {
      db.close()
    }
  })

  it('Undo legt die gelöste Verknüpfung bitgleich wieder an, Redo löst erneut', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const aussageId = neueAussage(db, personId)
      const zitatId = neuesZitat(db)
      fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId })
      const vorLoesen = verknuepfungLesen(db, aussageId, zitatId)

      fuehreAus(db, 'aussage_zitat.loeschen', { aussageId, zitatId })
      expect(verknuepfungLesen(db, aussageId, zitatId)).toBeUndefined()

      undo(db)
      expect(verknuepfungLesen(db, aussageId, zitatId)).toEqual(vorLoesen)

      redo(db)
      expect(verknuepfungLesen(db, aussageId, zitatId)).toBeUndefined()
    } finally {
      db.close()
    }
  })

  it('fehlende Verknüpfung (aussage und zitat bestehen, sind aber nicht verknüpft) → Fehler, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const aussageId = neueAussage(db, personId)
      const zitatId = neuesZitat(db)
      const anzahlVorher = transaktionAnzahl(db)

      const code = fehlerCode(() => fuehreAus(db, 'aussage_zitat.loeschen', { aussageId, zitatId }))

      expect(code).toBe('NICHT_GEFUNDEN_AUSSAGE')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })
})
