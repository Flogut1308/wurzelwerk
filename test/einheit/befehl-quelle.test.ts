// AP-1.17 PR-A2: `quelle.anlegen`/`quelle.aendern`/`abfrage:quelle.detail` über den echten
// Befehlsbus (`src/main/befehle/bus.ts`) gegen eine migrierte `:memory:`-Datenbank. Muster
// identisch zu `test/einheit/befehl-archiv.test.ts`. Bewusst KEIN `quelle.loeschen` (Kaskaden-
// Entscheidung offen, analog `ort.loeschen`) und KEIN Zitat-Schreibbefehl (PR-A3) — der
// `abfrage:quelle.detail`-Test legt sein Zitat darum direkt über `beleg-repo.ts::zitatEinfuegen`
// an, nicht über einen (noch nicht existierenden) Befehl. Die undo-bitgleich-Generator-Deckung
// bleibt PR-B (geschützter Prüfpfad, docs/80_Offene_Fragen.md).
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
import { quelleDetail } from '../../src/main/abfragen/quelle-detail'
import { zitatEinfuegen } from '../../src/main/repositories/beleg-repo'
import { journalAn, journalAus } from '../../src/main/journal/kontext'
import { quelleAnlegenEinSchema } from '../../src/shared/schemata/befehle'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'
import { neueId } from '../../src/main/id'

interface QuelleZeile {
  readonly id: string
  readonly typ: string | null
  readonly titel: string | null
  readonly autor: string | null
  readonly verlag: string | null
  readonly jahr: number | null
  readonly art: string | null
  readonly informationsart: string | null
  readonly archiv_id: string | null
  readonly signatur: string | null
  readonly notiz: string | null
  readonly informant_person_id: string | null
  readonly gespraechsdatum_wert1: string | null
  readonly form: string | null
  readonly unmittelbarkeit: string | null
  readonly audio_medium_id: string | null
  readonly geaendert_am: number | null
}

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

function quelleLesenRoh(db: ReturnType<typeof oeffnen>, id: string): QuelleZeile | undefined {
  return db
    .prepare<{ readonly id: string }, QuelleZeile>(
      `SELECT id, typ, titel, autor, verlag, jahr, art, informationsart, archiv_id, signatur, notiz,
              informant_person_id, gespraechsdatum_wert1, form, unmittelbarkeit, audio_medium_id, geaendert_am
       FROM quelle WHERE id = @id`,
    )
    .get({ id })
}

interface AenderungZeile {
  readonly operation: string
}

function aenderungenFuerQuelle(db: ReturnType<typeof oeffnen>, id: string): readonly AenderungZeile[] {
  return db
    .prepare<{ readonly id: string }, AenderungZeile>(
      `SELECT operation FROM aenderung WHERE tabelle = 'quelle' AND datensatz_id = @id ORDER BY reihenfolge`,
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

describe('quelle.anlegen (AP-1.17 PR-A2)', () => {
  it('legt eine Quelle Feld für Feld an, EINE aenderung-Zeile (operation=insert)', () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'quelle.anlegen', {
        typ: 'literatur',
        titel: 'Chronik der Stadt Beispiel',
        autor: 'Max Mustermann',
        verlag: 'Beispiel Verlag',
        jahr: 1987,
        art: 'derivat',
        informationsart: 'sekundaer',
        signatur: 'Sig-123',
        notiz: 'aus dem Antiquariat',
      })

      const quelle = quelleLesenRoh(db, id)
      expect(quelle?.typ).toBe('literatur')
      expect(quelle?.titel).toBe('Chronik der Stadt Beispiel')
      expect(quelle?.autor).toBe('Max Mustermann')
      expect(quelle?.verlag).toBe('Beispiel Verlag')
      expect(quelle?.jahr).toBe(1987)
      expect(quelle?.art).toBe('derivat')
      expect(quelle?.informationsart).toBe('sekundaer')
      expect(quelle?.archiv_id).toBeNull()
      expect(quelle?.signatur).toBe('Sig-123')
      expect(quelle?.notiz).toBe('aus dem Antiquariat')

      expect(aenderungenFuerQuelle(db, id)).toHaveLength(1)
      expect(aenderungenFuerQuelle(db, id)[0]?.operation).toBe('insert')
    } finally {
      db.close()
    }
  })

  it('übernimmt den mündlich-Block (informantPersonId/gespraechsdatum/form/unmittelbarkeit)', () => {
    const db = neueTestDatenbank()
    try {
      const { id: personId } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })

      const { id } = fuehreAus(db, 'quelle.anlegen', {
        typ: 'muendlich',
        informantPersonId: personId,
        gespraechsdatum: { modifikator: 'exakt', praezision: 'tag', wert1: '1998-05-01' },
        form: 'gespraech',
        unmittelbarkeit: 'selbst_erlebt',
      })

      const quelle = quelleLesenRoh(db, id)
      expect(quelle?.typ).toBe('muendlich')
      expect(quelle?.informant_person_id).toBe(personId)
      expect(quelle?.gespraechsdatum_wert1).toBe('1998-05-01')
      expect(quelle?.form).toBe('gespraech')
      expect(quelle?.unmittelbarkeit).toBe('selbst_erlebt')
    } finally {
      db.close()
    }
  })

  it('übernimmt optionales archivId, wenn das Archiv existiert', () => {
    const db = neueTestDatenbank()
    try {
      const { id: archivId } = fuehreAus(db, 'archiv.anlegen', { name: 'Landesarchiv Berlin' })
      const { id } = fuehreAus(db, 'quelle.anlegen', { typ: 'kirchenbuch', archivId })

      const quelle = quelleLesenRoh(db, id)
      expect(quelle?.archiv_id).toBe(archivId)
    } finally {
      db.close()
    }
  })

  it('nicht existierende archivId → NICHT_GEFUNDEN_ARCHIV, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'quelle.anlegen', { typ: 'kirchenbuch', archivId: 'nicht-vorhanden' }))
      expect(code).toBe('NICHT_GEFUNDEN_ARCHIV')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('typ ist Pflicht (Zod-Schema)', () => {
    expect(quelleAnlegenEinSchema.safeParse({}).success).toBe(false)
    expect(quelleAnlegenEinSchema.safeParse({ typ: 'sonstiges' }).success).toBe(true)
    expect(quelleAnlegenEinSchema.safeParse({ typ: 'kein-gueltiger-typ' }).success).toBe(false)
  })
})

describe('quelle.aendern (AP-1.17 PR-A2)', () => {
  it('ändert Grundfelder, trägt operation=update mit neuem geaendert_am', () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'quelle.anlegen', { typ: 'literatur', titel: 'Alter Titel' })
      const vorher = quelleLesenRoh(db, id)

      fuehreAus(db, 'quelle.aendern', { id, typ: 'literatur', titel: 'Neuer Titel', notiz: 'aktualisiert' })

      const nachher = quelleLesenRoh(db, id)
      expect(nachher?.titel).toBe('Neuer Titel')
      expect(nachher?.notiz).toBe('aktualisiert')
      expect(nachher?.geaendert_am ?? 0).toBeGreaterThanOrEqual(vorher?.geaendert_am ?? 0)

      const aenderungen = aenderungenFuerQuelle(db, id)
      expect(aenderungen[aenderungen.length - 1]?.operation).toBe('update')
    } finally {
      db.close()
    }
  })

  it('AP-0.22: identische Werte erzeugen keine zweite Transaktion (No-op)', () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'quelle.anlegen', { typ: 'literatur', titel: 'Titel', notiz: 'Notiz' })
      const anzahlVorher = transaktionAnzahl(db)

      fuehreAus(db, 'quelle.aendern', { id, typ: 'literatur', titel: 'Titel', notiz: 'Notiz' })

      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
      expect(aenderungenFuerQuelle(db, id)).toHaveLength(1) // nur das ursprüngliche insert
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_QUELLE, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'quelle.aendern', { id: 'nicht-vorhanden', typ: 'literatur' }))
      expect(code).toBe('NICHT_GEFUNDEN_QUELLE')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('nicht existierende archivId → NICHT_GEFUNDEN_ARCHIV, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'quelle.anlegen', { typ: 'literatur' })
      const anzahlVorher = transaktionAnzahl(db)

      const code = fehlerCode(() => fuehreAus(db, 'quelle.aendern', { id, typ: 'literatur', archivId: 'nicht-vorhanden' }))

      expect(code).toBe('NICHT_GEFUNDEN_ARCHIV')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })
})

describe('abfrage:quelle.detail (AP-1.17 PR-A2)', () => {
  it('liefert Quelle + Zitate + Archivname', () => {
    const db = neueTestDatenbank()
    try {
      const { id: archivId } = fuehreAus(db, 'archiv.anlegen', { name: 'Landesarchiv Berlin' })
      const { id: quelleId } = fuehreAus(db, 'quelle.anlegen', {
        typ: 'kirchenbuch',
        titel: 'Taufregister',
        archivId,
      })

      // Kein Zitat-Schreibbefehl in diesem PR (s. Kopfkommentar) — das Fixture-Zitat entsteht
      // direkt über das Repository, außerhalb einer armierten Journal-Transaktion, analog
      // `test/hilfsmittel/fixture-bauen.ts`.
      const zitatId = neueId()
      journalAus(db, 'test: Zitat-Fixture ohne Journal (abfrage:quelle.detail)')
      zitatEinfuegen(db, {
        id: zitatId,
        quelleId,
        seite: '42',
        eintragsnummer: '7',
        band: null,
        jahr: 1850,
        zeitmarkeSekunden: null,
        transkript: 'Getauft wurde…',
        uebersetzung: null,
        digitalisatUrl: null,
        konfidenz: 3,
        erstelltAm: Date.now(),
        geaendertAm: Date.now(),
      })
      journalAn(db)

      const detail = quelleDetail(db, { quelleId })
      expect(detail.kopf.id).toBe(quelleId)
      expect(detail.kopf.titel).toBe('Taufregister')
      expect(detail.kopf.archiv_id).toBe(archivId)
      expect(detail.kopf.archiv_name).toBe('Landesarchiv Berlin')
      expect(detail.zitate).toHaveLength(1)
      expect(detail.zitate[0]?.id).toBe(zitatId)
      expect(detail.zitate[0]?.transkript).toBe('Getauft wurde…')
      expect(detail.zitate[0]?.seite).toBe('42')
    } finally {
      db.close()
    }
  })

  it('nicht existierende quelleId → NICHT_GEFUNDEN_QUELLE', () => {
    const db = neueTestDatenbank()
    try {
      const code = fehlerCode(() => quelleDetail(db, { quelleId: 'nicht-vorhanden' }))
      expect(code).toBe('NICHT_GEFUNDEN_QUELLE')
    } finally {
      db.close()
    }
  })
})
