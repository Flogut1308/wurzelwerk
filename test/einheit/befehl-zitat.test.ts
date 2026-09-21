// AP-1.17 PR-A3: `zitat.anlegen`/`zitat.aendern`/`zitat.loeschen` über den echten Befehlsbus
// (`src/main/befehle/bus.ts`) gegen eine migrierte `:memory:`-Datenbank. Muster identisch zu
// `test/einheit/befehl-quelle.test.ts`. Bewusst KEINE undo-bitgleich-Generator-Deckung (PR-B,
// geschützter Prüfpfad, docs/80_Offene_Fragen.md).
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
import { zitatAnlegenEinSchema } from '../../src/shared/schemata/befehle'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

interface ZitatZeile {
  readonly id: string
  readonly quelle_id: string
  readonly seite: string | null
  readonly eintragsnummer: string | null
  readonly band: string | null
  readonly jahr: number | null
  readonly zugriffsdatum_wert1: string | null
  readonly zeitmarke_sekunden: number | null
  readonly digitalisat_url: string | null
  readonly transkript: string | null
  readonly uebersetzung: string | null
  readonly konfidenz: number | null
  readonly medium_id: string | null
  readonly geaendert_am: number | null
}

function zitatLesenRoh(db: ReturnType<typeof oeffnen>, id: string): ZitatZeile | undefined {
  return db
    .prepare<{ readonly id: string }, ZitatZeile>(
      `SELECT id, quelle_id, seite, eintragsnummer, band, jahr, zugriffsdatum_wert1, zeitmarke_sekunden,
              digitalisat_url, transkript, uebersetzung, konfidenz, medium_id, geaendert_am
       FROM zitat WHERE id = @id`,
    )
    .get({ id })
}

interface AussageZitatZahl {
  readonly anzahl: number
}

function aussageZitatAnzahl(db: ReturnType<typeof oeffnen>, zitatId: string): number {
  const zeile = db
    .prepare<{ readonly zitatId: string }, AussageZitatZahl>('SELECT COUNT(*) AS anzahl FROM aussage_zitat WHERE zitat_id = @zitatId')
    .get({ zitatId })
  if (zeile === undefined) {
    throw new Error('aussageZitatAnzahl(): COUNT(*)-Abfrage lieferte unerwartet keine Zeile.')
  }
  return zeile.anzahl
}

interface AenderungZeile {
  readonly operation: string
}

function aenderungenFuerZitat(db: ReturnType<typeof oeffnen>, id: string): readonly AenderungZeile[] {
  return db
    .prepare<{ readonly id: string }, AenderungZeile>(
      `SELECT operation FROM aenderung WHERE tabelle = 'zitat' AND datensatz_id = @id ORDER BY reihenfolge`,
    )
    .all({ id })
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

function fehlerCode(fn: () => void): string | undefined {
  try {
    fn()
    return undefined
  } catch (fehler) {
    return fehler instanceof WurzelFehler ? fehler.code : `KEIN_WURZELFEHLER:${String(fehler)}`
  }
}

describe('zitat.anlegen (AP-1.17 PR-A3)', () => {
  it('legt ein Zitat Feld für Feld an, EINE aenderung-Zeile (operation=insert)', () => {
    const db = neueTestDatenbank()
    try {
      const { id: quelleId } = fuehreAus(db, 'quelle.anlegen', { typ: 'kirchenbuch', titel: 'Taufregister' })

      const { id } = fuehreAus(db, 'zitat.anlegen', {
        quelleId,
        seite: '42',
        eintragsnummer: '7',
        band: 'II',
        jahr: 1850,
        zugriffsdatum: { modifikator: 'exakt', praezision: 'tag', wert1: '2024-01-15' },
        zeitmarkeSekunden: 120,
        digitalisatUrl: 'https://example.org/scan/42',
        transkript: 'Getauft wurde…',
        uebersetzung: 'Baptized was…',
        konfidenz: 3,
      })

      const zitat = zitatLesenRoh(db, id)
      expect(zitat?.quelle_id).toBe(quelleId)
      expect(zitat?.seite).toBe('42')
      expect(zitat?.eintragsnummer).toBe('7')
      expect(zitat?.band).toBe('II')
      expect(zitat?.jahr).toBe(1850)
      expect(zitat?.zugriffsdatum_wert1).toBe('2024-01-15')
      expect(zitat?.zeitmarke_sekunden).toBe(120)
      expect(zitat?.digitalisat_url).toBe('https://example.org/scan/42')
      expect(zitat?.transkript).toBe('Getauft wurde…')
      expect(zitat?.uebersetzung).toBe('Baptized was…')
      expect(zitat?.konfidenz).toBe(3)
      expect(zitat?.medium_id).toBeNull()

      expect(aenderungenFuerZitat(db, id)).toHaveLength(1)
      expect(aenderungenFuerZitat(db, id)[0]?.operation).toBe('insert')
    } finally {
      db.close()
    }
  })

  it('legt ein Zitat mit nur quelleId an — alle anderen Felder bleiben NULL', () => {
    const db = neueTestDatenbank()
    try {
      const { id: quelleId } = fuehreAus(db, 'quelle.anlegen', { typ: 'sonstiges' })

      const { id } = fuehreAus(db, 'zitat.anlegen', { quelleId })

      const zitat = zitatLesenRoh(db, id)
      expect(zitat?.quelle_id).toBe(quelleId)
      expect(zitat?.seite).toBeNull()
      expect(zitat?.eintragsnummer).toBeNull()
      expect(zitat?.band).toBeNull()
      expect(zitat?.jahr).toBeNull()
      expect(zitat?.zugriffsdatum_wert1).toBeNull()
      expect(zitat?.zeitmarke_sekunden).toBeNull()
      expect(zitat?.digitalisat_url).toBeNull()
      expect(zitat?.transkript).toBeNull()
      expect(zitat?.uebersetzung).toBeNull()
      expect(zitat?.konfidenz).toBeNull()
      expect(zitat?.medium_id).toBeNull()
    } finally {
      db.close()
    }
  })

  it('quelleId ist Pflicht (Zod-Schema)', () => {
    expect(zitatAnlegenEinSchema.safeParse({}).success).toBe(false)
    expect(zitatAnlegenEinSchema.safeParse({ quelleId: 'x' }).success).toBe(true)
  })

  it('nicht existierende quelleId → NICHT_GEFUNDEN_QUELLE, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'zitat.anlegen', { quelleId: 'nicht-vorhanden' }))
      expect(code).toBe('NICHT_GEFUNDEN_QUELLE')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })
})

describe('zitat.aendern (AP-1.17 PR-A3)', () => {
  it('ändert Grundfelder, trägt operation=update mit neuem geaendert_am', () => {
    const db = neueTestDatenbank()
    try {
      const { id: quelleId } = fuehreAus(db, 'quelle.anlegen', { typ: 'kirchenbuch' })
      const { id } = fuehreAus(db, 'zitat.anlegen', { quelleId, seite: '1', transkript: 'Alter Text' })
      const vorher = zitatLesenRoh(db, id)

      fuehreAus(db, 'zitat.aendern', { id, quelleId, seite: '2', transkript: 'Neuer Text' })

      const nachher = zitatLesenRoh(db, id)
      expect(nachher?.seite).toBe('2')
      expect(nachher?.transkript).toBe('Neuer Text')
      expect(nachher?.geaendert_am ?? 0).toBeGreaterThanOrEqual(vorher?.geaendert_am ?? 0)

      const aenderungen = aenderungenFuerZitat(db, id)
      expect(aenderungen[aenderungen.length - 1]?.operation).toBe('update')
    } finally {
      db.close()
    }
  })

  it('AP-0.22: identische Werte erzeugen keine zweite Transaktion (No-op)', () => {
    const db = neueTestDatenbank()
    try {
      const { id: quelleId } = fuehreAus(db, 'quelle.anlegen', { typ: 'kirchenbuch' })
      const { id } = fuehreAus(db, 'zitat.anlegen', { quelleId, seite: '1', transkript: 'Text' })
      const anzahlVorher = transaktionAnzahl(db)

      fuehreAus(db, 'zitat.aendern', { id, quelleId, seite: '1', transkript: 'Text' })

      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
      expect(aenderungenFuerZitat(db, id)).toHaveLength(1) // nur das ursprüngliche insert
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_ZITAT, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const { id: quelleId } = fuehreAus(db, 'quelle.anlegen', { typ: 'kirchenbuch' })
      const anzahlVorher = transaktionAnzahl(db)

      const code = fehlerCode(() => fuehreAus(db, 'zitat.aendern', { id: 'nicht-vorhanden', quelleId }))

      expect(code).toBe('NICHT_GEFUNDEN_ZITAT')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })
})

describe('zitat.loeschen (AP-1.17 PR-A3)', () => {
  it('entfernt genau die Zeile — keine verwaisten aussage_zitat-Referenzen', () => {
    const db = neueTestDatenbank()
    try {
      const { id: quelleId } = fuehreAus(db, 'quelle.anlegen', { typ: 'kirchenbuch' })
      const { id: personId } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      const { id: zitatId } = fuehreAus(db, 'zitat.anlegen', { quelleId, seite: '9' })
      fuehreAus(db, 'aussage.anlegen', {
        subjektTyp: 'person',
        subjektId: personId,
        praedikat: 'geschlecht',
        wertText: 'weiblich',
        konfidenz: 3,
        belege: [zitatId],
      })
      expect(aussageZitatAnzahl(db, zitatId)).toBe(1)

      fuehreAus(db, 'zitat.loeschen', { id: zitatId })

      expect(zitatLesenRoh(db, zitatId)).toBeUndefined()
      expect(aussageZitatAnzahl(db, zitatId)).toBe(0)
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_ZITAT, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'zitat.loeschen', { id: 'nicht-vorhanden' }))
      expect(code).toBe('NICHT_GEFUNDEN_ZITAT')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('ein gelöschtes Zitat verschwindet aus abfrage:quelle.detail', async () => {
    const db = neueTestDatenbank()
    try {
      const { quelleDetail } = await import('../../src/main/abfragen/quelle-detail')
      const { id: quelleId } = fuehreAus(db, 'quelle.anlegen', { typ: 'kirchenbuch', titel: 'Taufregister' })
      const { id: zitatId } = fuehreAus(db, 'zitat.anlegen', { quelleId, seite: '3' })

      expect(quelleDetail(db, { quelleId }).zitate).toHaveLength(1)

      fuehreAus(db, 'zitat.loeschen', { id: zitatId })

      expect(quelleDetail(db, { quelleId }).zitate).toHaveLength(0)
    } finally {
      db.close()
    }
  })
})
