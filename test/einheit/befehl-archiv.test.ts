// AP-1.17 PR-A1 (B-07): `archiv.anlegen`/`archiv.aendern`/`abfrage:archiv.suche` über den echten
// Befehlsbus (`src/main/befehle/bus.ts`) gegen eine migrierte `:memory:`-Datenbank. Muster
// identisch zu `test/einheit/befehl-ort.test.ts`. Die undo-bitgleich-Generator-Deckung bleibt
// PR-B (geschützter Prüfpfad, docs/80_Offene_Fragen.md).
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
import { archivSuche } from '../../src/main/abfragen/archiv-suche'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'

interface ArchivZeile {
  readonly id: string
  readonly name: string | null
  readonly ort_id: string | null
  readonly kontakt: string | null
  readonly url: string | null
  readonly notiz: string | null
  readonly geaendert_am: number | null
}

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

function archivLesen(db: ReturnType<typeof oeffnen>, id: string): ArchivZeile | undefined {
  return db
    .prepare<{ readonly id: string }, ArchivZeile>(
      'SELECT id, name, ort_id, kontakt, url, notiz, geaendert_am FROM archiv WHERE id = @id',
    )
    .get({ id })
}

interface AenderungZeile {
  readonly operation: string
}

function aenderungenFuerArchiv(db: ReturnType<typeof oeffnen>, id: string): readonly AenderungZeile[] {
  return db
    .prepare<{ readonly id: string }, AenderungZeile>(
      `SELECT operation FROM aenderung WHERE tabelle = 'archiv' AND datensatz_id = @id ORDER BY reihenfolge`,
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

describe('archiv.anlegen (AP-1.17 PR-A1)', () => {
  it('legt eine archiv-Zeile Feld für Feld an, EINE aenderung-Zeile (operation=insert)', () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'archiv.anlegen', {
        name: 'Landesarchiv Berlin',
        kontakt: 'info@landesarchiv-berlin.de',
        url: 'https://www.landesarchiv-berlin.de',
        notiz: 'Bestand Standesamtsunterlagen',
      })

      const archiv = archivLesen(db, id)
      expect(archiv?.name).toBe('Landesarchiv Berlin')
      expect(archiv?.ort_id).toBeNull()
      expect(archiv?.kontakt).toBe('info@landesarchiv-berlin.de')
      expect(archiv?.url).toBe('https://www.landesarchiv-berlin.de')
      expect(archiv?.notiz).toBe('Bestand Standesamtsunterlagen')

      expect(aenderungenFuerArchiv(db, id)).toHaveLength(1)
      expect(aenderungenFuerArchiv(db, id)[0]?.operation).toBe('insert')
    } finally {
      db.close()
    }
  })

  it('übernimmt optionales ortId, wenn der Ort existiert', () => {
    const db = neueTestDatenbank()
    try {
      const { id: ortId } = fuehreAus(db, 'ort.anlegen', { name: 'Berlin' })
      const { id } = fuehreAus(db, 'archiv.anlegen', { name: 'Landesarchiv Berlin', ortId })

      const archiv = archivLesen(db, id)
      expect(archiv?.ort_id).toBe(ortId)
    } finally {
      db.close()
    }
  })

  it('nicht existierende ortId → NICHT_GEFUNDEN_ORT, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'archiv.anlegen', { name: 'Landesarchiv Berlin', ortId: 'nicht-vorhanden' }))
      expect(code).toBe('NICHT_GEFUNDEN_ORT')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })
})

describe('archiv.aendern (AP-1.17 PR-A1)', () => {
  it('ändert name/kontakt/url/notiz, trägt operation=update mit neuem geaendert_am', () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'archiv.anlegen', { name: 'Landesarchiv Berlin' })
      const vorher = archivLesen(db, id)

      fuehreAus(db, 'archiv.aendern', {
        id,
        name: 'Landesarchiv Berlin (umbenannt)',
        kontakt: 'kontakt@example.org',
        url: 'https://example.org',
        notiz: 'aktualisiert',
      })

      const nachher = archivLesen(db, id)
      expect(nachher?.name).toBe('Landesarchiv Berlin (umbenannt)')
      expect(nachher?.kontakt).toBe('kontakt@example.org')
      expect(nachher?.url).toBe('https://example.org')
      expect(nachher?.notiz).toBe('aktualisiert')
      expect(nachher?.geaendert_am ?? 0).toBeGreaterThanOrEqual(vorher?.geaendert_am ?? 0)

      const aenderungen = aenderungenFuerArchiv(db, id)
      expect(aenderungen[aenderungen.length - 1]?.operation).toBe('update')
    } finally {
      db.close()
    }
  })

  it('AP-0.22: identische Werte erzeugen keine zweite Transaktion (No-op)', () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'archiv.anlegen', { name: 'Landesarchiv Berlin', notiz: 'Notiz' })
      const anzahlVorher = transaktionAnzahl(db)

      fuehreAus(db, 'archiv.aendern', { id, name: 'Landesarchiv Berlin', notiz: 'Notiz' })

      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
      expect(aenderungenFuerArchiv(db, id)).toHaveLength(1) // nur das ursprüngliche insert
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_ARCHIV, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'archiv.aendern', { id: 'nicht-vorhanden', name: 'X' }))
      expect(code).toBe('NICHT_GEFUNDEN_ARCHIV')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('nicht existierende ortId → NICHT_GEFUNDEN_ORT, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'archiv.anlegen', { name: 'Landesarchiv Berlin' })
      const anzahlVorher = transaktionAnzahl(db)

      const code = fehlerCode(() => fuehreAus(db, 'archiv.aendern', { id, name: 'Landesarchiv Berlin', ortId: 'nicht-vorhanden' }))

      expect(code).toBe('NICHT_GEFUNDEN_ORT')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })
})

describe('abfrage:archiv.suche (AP-1.17 PR-A1)', () => {
  it('findet nach Namensteil, groß-/kleinschreibungsunabhängig', () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'archiv.anlegen', { name: 'Landesarchiv Berlin' })
      fuehreAus(db, 'archiv.anlegen', { name: 'Staatsarchiv Hamburg' })

      const ergebnis = archivSuche(db, { text: 'berlin' })

      expect(ergebnis.treffer).toHaveLength(1)
      expect(ergebnis.treffer[0]?.id).toBe(id)
      expect(ergebnis.treffer[0]?.name).toBe('Landesarchiv Berlin')
    } finally {
      db.close()
    }
  })

  it('leerer Suchtext liefert keine Treffer', () => {
    const db = neueTestDatenbank()
    try {
      fuehreAus(db, 'archiv.anlegen', { name: 'Landesarchiv Berlin' })
      const ergebnis = archivSuche(db, { text: '' })
      expect(ergebnis.treffer).toHaveLength(0)
    } finally {
      db.close()
    }
  })
})
