// AP-1.17 PR-A4: `negativbefund.anlegen`/`.aendern`/`.loeschen` + `abfrage:negativbefund.liste`
// über den echten Befehlsbus (`src/main/befehle/bus.ts`) gegen eine migrierte `:memory:`-
// Datenbank. Muster identisch zu `test/einheit/befehl-zitat.test.ts`. Bewusst KEINE
// undo-bitgleich-Generator-Deckung (PR-B, geschützter Prüfpfad, docs/80_Offene_Fragen.md).
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
import { negativbefundAnlegenEinSchema } from '../../src/shared/schemata/befehle'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

interface NegativbefundZeile {
  readonly id: string
  readonly quelle_id: string | null
  readonly gesuchte_person_id: string
  readonly gesuchtes_praedikat: string | null
  readonly zeitraum_von: number | null
  readonly zeitraum_bis: number | null
  readonly beschreibung: string | null
  readonly datum_der_pruefung: string | null
  readonly geaendert_am: number | null
}

function negativbefundLesenRoh(db: ReturnType<typeof oeffnen>, id: string): NegativbefundZeile | undefined {
  return db
    .prepare<{ readonly id: string }, NegativbefundZeile>(
      `SELECT id, quelle_id, gesuchte_person_id, gesuchtes_praedikat, zeitraum_von, zeitraum_bis,
              beschreibung, datum_der_pruefung, geaendert_am
       FROM negativbefund WHERE id = @id`,
    )
    .get({ id })
}

interface AenderungZeile {
  readonly operation: string
}

function aenderungenFuerNegativbefund(db: ReturnType<typeof oeffnen>, id: string): readonly AenderungZeile[] {
  return db
    .prepare<{ readonly id: string }, AenderungZeile>(
      `SELECT operation FROM aenderung WHERE tabelle = 'negativbefund' AND datensatz_id = @id ORDER BY reihenfolge`,
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

function personAnlegen(db: ReturnType<typeof oeffnen>): string {
  const { id } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
  return id
}

describe('negativbefund.anlegen (AP-1.17 PR-A4)', () => {
  it('legt einen Negativbefund Feld für Feld an, EINE aenderung-Zeile (operation=insert)', () => {
    const db = neueTestDatenbank()
    try {
      const personId = personAnlegen(db)
      const { id: quelleId } = fuehreAus(db, 'quelle.anlegen', { typ: 'kirchenbuch', titel: 'Taufregister' })

      const { id } = fuehreAus(db, 'negativbefund.anlegen', {
        gesuchtePersonId: personId,
        quelleId,
        gesuchtesPraedikat: 'geburt',
        zeitraumVon: 1780,
        zeitraumBis: 1790,
        beschreibung: 'Im Taufregister nicht gefunden.',
        datumDerPruefung: '2024-01-15',
      })

      const negativbefund = negativbefundLesenRoh(db, id)
      expect(negativbefund?.gesuchte_person_id).toBe(personId)
      expect(negativbefund?.quelle_id).toBe(quelleId)
      expect(negativbefund?.gesuchtes_praedikat).toBe('geburt')
      expect(negativbefund?.zeitraum_von).toBe(1780)
      expect(negativbefund?.zeitraum_bis).toBe(1790)
      expect(negativbefund?.beschreibung).toBe('Im Taufregister nicht gefunden.')
      expect(negativbefund?.datum_der_pruefung).toBe('2024-01-15')

      expect(aenderungenFuerNegativbefund(db, id)).toHaveLength(1)
      expect(aenderungenFuerNegativbefund(db, id)[0]?.operation).toBe('insert')
    } finally {
      db.close()
    }
  })

  it('legt einen Negativbefund mit nur gesuchtePersonId an — alle anderen Felder bleiben NULL', () => {
    const db = neueTestDatenbank()
    try {
      const personId = personAnlegen(db)

      const { id } = fuehreAus(db, 'negativbefund.anlegen', { gesuchtePersonId: personId })

      const negativbefund = negativbefundLesenRoh(db, id)
      expect(negativbefund?.gesuchte_person_id).toBe(personId)
      expect(negativbefund?.quelle_id).toBeNull()
      expect(negativbefund?.gesuchtes_praedikat).toBeNull()
      expect(negativbefund?.zeitraum_von).toBeNull()
      expect(negativbefund?.zeitraum_bis).toBeNull()
      expect(negativbefund?.beschreibung).toBeNull()
      expect(negativbefund?.datum_der_pruefung).toBeNull()
    } finally {
      db.close()
    }
  })

  it('gesuchtePersonId ist Pflicht (Zod-Schema)', () => {
    expect(negativbefundAnlegenEinSchema.safeParse({}).success).toBe(false)
    expect(negativbefundAnlegenEinSchema.safeParse({ gesuchtePersonId: 'x' }).success).toBe(true)
  })

  it('nicht existierende gesuchtePersonId → NICHT_GEFUNDEN_PERSON, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'negativbefund.anlegen', { gesuchtePersonId: 'nicht-vorhanden' }))
      expect(code).toBe('NICHT_GEFUNDEN_PERSON')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('nicht existierende quelleId → NICHT_GEFUNDEN_QUELLE, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const personId = personAnlegen(db)
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() =>
        fuehreAus(db, 'negativbefund.anlegen', { gesuchtePersonId: personId, quelleId: 'nicht-vorhanden' }),
      )
      expect(code).toBe('NICHT_GEFUNDEN_QUELLE')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })
})

describe('negativbefund.aendern (AP-1.17 PR-A4)', () => {
  it('ändert Grundfelder, trägt operation=update mit neuem geaendert_am', () => {
    const db = neueTestDatenbank()
    try {
      const personId = personAnlegen(db)
      const { id } = fuehreAus(db, 'negativbefund.anlegen', { gesuchtePersonId: personId, gesuchtesPraedikat: 'geburt' })
      const vorher = negativbefundLesenRoh(db, id)

      fuehreAus(db, 'negativbefund.aendern', { id, gesuchtePersonId: personId, gesuchtesPraedikat: 'taufe' })

      const nachher = negativbefundLesenRoh(db, id)
      expect(nachher?.gesuchtes_praedikat).toBe('taufe')
      expect(nachher?.geaendert_am ?? 0).toBeGreaterThanOrEqual(vorher?.geaendert_am ?? 0)

      const aenderungen = aenderungenFuerNegativbefund(db, id)
      expect(aenderungen[aenderungen.length - 1]?.operation).toBe('update')
    } finally {
      db.close()
    }
  })

  it('AP-0.22: identische Werte erzeugen keine zweite Transaktion (No-op)', () => {
    const db = neueTestDatenbank()
    try {
      const personId = personAnlegen(db)
      const { id } = fuehreAus(db, 'negativbefund.anlegen', { gesuchtePersonId: personId, gesuchtesPraedikat: 'geburt' })
      const anzahlVorher = transaktionAnzahl(db)

      fuehreAus(db, 'negativbefund.aendern', { id, gesuchtePersonId: personId, gesuchtesPraedikat: 'geburt' })

      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
      expect(aenderungenFuerNegativbefund(db, id)).toHaveLength(1) // nur das ursprüngliche insert
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_NEGATIVBEFUND, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const personId = personAnlegen(db)
      const anzahlVorher = transaktionAnzahl(db)

      const code = fehlerCode(() => fuehreAus(db, 'negativbefund.aendern', { id: 'nicht-vorhanden', gesuchtePersonId: personId }))

      expect(code).toBe('NICHT_GEFUNDEN_NEGATIVBEFUND')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('nicht existierende quelleId → NICHT_GEFUNDEN_QUELLE, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const personId = personAnlegen(db)
      const { id } = fuehreAus(db, 'negativbefund.anlegen', { gesuchtePersonId: personId })
      const anzahlVorher = transaktionAnzahl(db)

      const code = fehlerCode(() =>
        fuehreAus(db, 'negativbefund.aendern', { id, gesuchtePersonId: personId, quelleId: 'nicht-vorhanden' }),
      )

      expect(code).toBe('NICHT_GEFUNDEN_QUELLE')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })
})

describe('negativbefund.loeschen (AP-1.17 PR-A4)', () => {
  it('entfernt genau die Zeile', () => {
    const db = neueTestDatenbank()
    try {
      const personId = personAnlegen(db)
      const { id } = fuehreAus(db, 'negativbefund.anlegen', { gesuchtePersonId: personId })

      fuehreAus(db, 'negativbefund.loeschen', { id })

      expect(negativbefundLesenRoh(db, id)).toBeUndefined()
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_NEGATIVBEFUND, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'negativbefund.loeschen', { id: 'nicht-vorhanden' }))
      expect(code).toBe('NICHT_GEFUNDEN_NEGATIVBEFUND')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })
})

describe('abfrage:negativbefund.liste (AP-1.17 PR-A4)', () => {
  it('liefert die Negativbefunde je gesuchter Person, leer für eine Person ohne Befund', async () => {
    const db = neueTestDatenbank()
    try {
      const { negativbefundListe } = await import('../../src/main/abfragen/negativbefund-liste')
      const personId = personAnlegen(db)
      const andereId = personAnlegen(db)
      const { id: erste } = fuehreAus(db, 'negativbefund.anlegen', { gesuchtePersonId: personId, gesuchtesPraedikat: 'geburt' })
      const { id: zweite } = fuehreAus(db, 'negativbefund.anlegen', { gesuchtePersonId: personId, gesuchtesPraedikat: 'taufe' })
      fuehreAus(db, 'negativbefund.anlegen', { gesuchtePersonId: andereId })

      const ergebnis = negativbefundListe(db, { gesuchtePersonId: personId })

      expect(ergebnis.eintraege).toHaveLength(2)
      expect(ergebnis.eintraege.map((eintrag) => eintrag.id).sort()).toEqual([erste, zweite].sort())

      const leer = negativbefundListe(db, { gesuchtePersonId: 'nicht-vorhanden' })
      expect(leer.eintraege).toHaveLength(0)
    } finally {
      db.close()
    }
  })

  it('ein gelöschter Negativbefund verschwindet aus abfrage:negativbefund.liste', async () => {
    const db = neueTestDatenbank()
    try {
      const { negativbefundListe } = await import('../../src/main/abfragen/negativbefund-liste')
      const personId = personAnlegen(db)
      const { id } = fuehreAus(db, 'negativbefund.anlegen', { gesuchtePersonId: personId })

      expect(negativbefundListe(db, { gesuchtePersonId: personId }).eintraege).toHaveLength(1)

      fuehreAus(db, 'negativbefund.loeschen', { id })

      expect(negativbefundListe(db, { gesuchtePersonId: personId }).eintraege).toHaveLength(0)
    } finally {
      db.close()
    }
  })
})
