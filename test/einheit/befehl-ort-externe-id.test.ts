// AP-1.16 PR-A: `ort-externe-id.anlegen`/`ort-externe-id.loeschen` über den echten Befehlsbus
// (`src/main/befehle/bus.ts`) gegen eine migrierte `:memory:`-Datenbank. `ort_externe_id` hat
// KEIN eigenes `id` (zusammengesetzter Primärschlüssel `(ort_id, system)`, s.
// `docs/schema/0002_kern.sql` §2.4) — die Existenz-/Duplikatprüfung liest darum über beide
// Spalten (`ortRepo.ortExterneIdLesen`), nicht über `datensatzExistiert()`.
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

interface OrtExterneIdZeile {
  readonly ort_id: string
  readonly system: string
  readonly wert: string
}

interface AenderungZeile {
  readonly operation: string
}

interface TransaktionZahl {
  readonly anzahl: number
}

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

function externeIdLesen(db: ReturnType<typeof oeffnen>, ortId: string, system: string): OrtExterneIdZeile | undefined {
  return db
    .prepare<{ readonly ortId: string; readonly system: string }, OrtExterneIdZeile>(
      'SELECT ort_id, system, wert FROM ort_externe_id WHERE ort_id = @ortId AND system = @system',
    )
    .get({ ortId, system })
}

function aenderungenFuerExterneId(db: ReturnType<typeof oeffnen>, ortId: string, system: string): readonly AenderungZeile[] {
  return db
    .prepare<{ readonly datensatzId: string }, AenderungZeile>(
      `SELECT operation FROM aenderung WHERE tabelle = 'ort_externe_id' AND datensatz_id = @datensatzId ORDER BY reihenfolge`,
    )
    .all({ datensatzId: `${ortId}|${system}` })
}

function transaktionAnzahl(db: ReturnType<typeof oeffnen>): number {
  const zeile = db.prepare<[], TransaktionZahl>('SELECT COUNT(*) AS anzahl FROM transaktion').get()
  if (zeile === undefined) {
    throw new Error('transaktionAnzahl(): COUNT(*)-Abfrage lieferte unerwartet keine Zeile.')
  }
  return zeile.anzahl
}

function neuerOrt(db: ReturnType<typeof oeffnen>): string {
  return fuehreAus(db, 'ort.anlegen', { name: 'Marienwerder' }).id
}

function fehlerCode(fn: () => void): string | undefined {
  try {
    fn()
    return undefined
  } catch (fehler) {
    return fehler instanceof WurzelFehler ? fehler.code : `KEIN_WURZELFEHLER:${String(fehler)}`
  }
}

describe('ort-externe-id.anlegen (AP-1.16 PR-A)', () => {
  it('legt eine ort_externe_id-Zeile an, genau eine aenderung-Zeile (operation=insert)', () => {
    const db = neueTestDatenbank()
    try {
      const ortId = neuerOrt(db)
      fuehreAus(db, 'ort-externe-id.anlegen', { ortId, system: 'gov', wert: 'MARIENWERDER_ID' })

      const zeile = externeIdLesen(db, ortId, 'gov')
      expect(zeile).toBeDefined()
      expect(zeile?.wert).toBe('MARIENWERDER_ID')

      expect(aenderungenFuerExterneId(db, ortId, 'gov')).toHaveLength(1)
      expect(aenderungenFuerExterneId(db, ortId, 'gov')[0]?.operation).toBe('insert')
    } finally {
      db.close()
    }
  })

  it('zwei verschiedene system-Werte für denselben Ort sind unabhängig möglich', () => {
    const db = neueTestDatenbank()
    try {
      const ortId = neuerOrt(db)
      expect(() => fuehreAus(db, 'ort-externe-id.anlegen', { ortId, system: 'gov', wert: 'GOV_ID' })).not.toThrow()
      expect(() => fuehreAus(db, 'ort-externe-id.anlegen', { ortId, system: 'geonames', wert: '12345' })).not.toThrow()
    } finally {
      db.close()
    }
  })

  it('nicht existierende ortId → NICHT_GEFUNDEN_ORT, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'ort-externe-id.anlegen', { ortId: 'nicht-vorhanden', system: 'gov', wert: 'X' }))
      expect(code).toBe('NICHT_GEFUNDEN_ORT')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('doppelter (ortId, system) → KONFLIKT_ORT_EXTERNE_ID_DUPLIKAT, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const ortId = neuerOrt(db)
      fuehreAus(db, 'ort-externe-id.anlegen', { ortId, system: 'gov', wert: 'GOV_ID' })
      const anzahlVorher = transaktionAnzahl(db)

      const code = fehlerCode(() => fuehreAus(db, 'ort-externe-id.anlegen', { ortId, system: 'gov', wert: 'ANDERE_ID' }))
      expect(code).toBe('KONFLIKT_ORT_EXTERNE_ID_DUPLIKAT')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
      expect(externeIdLesen(db, ortId, 'gov')?.wert).toBe('GOV_ID') // unverändert
    } finally {
      db.close()
    }
  })

  it('Undo entfernt die angelegte ort_externe_id-Zeile wieder, Redo legt sie bitgleich erneut an', () => {
    const db = neueTestDatenbank()
    try {
      const ortId = neuerOrt(db)
      fuehreAus(db, 'ort-externe-id.anlegen', { ortId, system: 'gov', wert: 'GOV_ID' })
      const nachAnlegen = externeIdLesen(db, ortId, 'gov')
      expect(nachAnlegen).toBeDefined()

      undo(db)
      expect(externeIdLesen(db, ortId, 'gov')).toBeUndefined()

      redo(db)
      expect(externeIdLesen(db, ortId, 'gov')).toEqual(nachAnlegen)
    } finally {
      db.close()
    }
  })
})

describe('ort-externe-id.loeschen (AP-1.16 PR-A)', () => {
  it('löscht die ort_externe_id-Zeile, trägt genau eine weitere aenderung-Zeile (operation=delete)', () => {
    const db = neueTestDatenbank()
    try {
      const ortId = neuerOrt(db)
      fuehreAus(db, 'ort-externe-id.anlegen', { ortId, system: 'gov', wert: 'GOV_ID' })

      fuehreAus(db, 'ort-externe-id.loeschen', { ortId, system: 'gov' })

      expect(externeIdLesen(db, ortId, 'gov')).toBeUndefined()
      const aenderungen = aenderungenFuerExterneId(db, ortId, 'gov')
      expect(aenderungen).toHaveLength(2) // insert (anlegen) + delete (löschen)
      expect(aenderungen[aenderungen.length - 1]?.operation).toBe('delete')
    } finally {
      db.close()
    }
  })

  it('nicht existierende Kombination → NICHT_GEFUNDEN_ORT_EXTERNE_ID, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const ortId = neuerOrt(db)
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'ort-externe-id.loeschen', { ortId, system: 'gov' }))
      expect(code).toBe('NICHT_GEFUNDEN_ORT_EXTERNE_ID')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('Undo stellt die gelöschte ort_externe_id-Zeile bitgleich wieder her, Redo löscht sie erneut', () => {
    const db = neueTestDatenbank()
    try {
      const ortId = neuerOrt(db)
      fuehreAus(db, 'ort-externe-id.anlegen', { ortId, system: 'gov', wert: 'GOV_ID' })
      const vorLoeschen = externeIdLesen(db, ortId, 'gov')

      fuehreAus(db, 'ort-externe-id.loeschen', { ortId, system: 'gov' })
      expect(externeIdLesen(db, ortId, 'gov')).toBeUndefined()

      undo(db)
      expect(externeIdLesen(db, ortId, 'gov')).toEqual(vorLoeschen)

      redo(db)
      expect(externeIdLesen(db, ortId, 'gov')).toBeUndefined()
    } finally {
      db.close()
    }
  })
})
