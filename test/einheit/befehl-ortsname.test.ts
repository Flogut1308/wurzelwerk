// AP-1.16 PR-A: `ortsname.anlegen`/`ortsname.aendern`/`ortsname.loeschen` über den echten
// Befehlsbus (`src/main/befehle/bus.ts`) gegen eine migrierte `:memory:`-Datenbank. Muster
// identisch zu `test/einheit/befehl-name.test.ts`. Legt einen WEITEREN Namen zu einem bereits
// über `ort.anlegen` bestehenden Ort an — KEIN automatisches Demote eines bisherigen
// `istBevorzugt`-Namens (Nutzerentscheidung dieser Abnahme, s. `src/shared/schemata/befehle.ts`).
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

interface OrtsnameZeile {
  readonly id: string
  readonly ort_id: string
  readonly name: string | null
  readonly sprache: string | null
  readonly gueltig_von: number | null
  readonly gueltig_bis: number | null
  readonly ist_bevorzugt: 0 | 1 | null
  readonly original_text: string | null
  readonly geaendert_am: number | null
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

function ortsnameLesen(db: ReturnType<typeof oeffnen>, id: string): OrtsnameZeile | undefined {
  return db
    .prepare<{ readonly id: string }, OrtsnameZeile>(
      'SELECT id, ort_id, name, sprache, gueltig_von, gueltig_bis, ist_bevorzugt, original_text, geaendert_am FROM ortsname WHERE id = @id',
    )
    .get({ id })
}

function aenderungenFuerOrtsname(db: ReturnType<typeof oeffnen>, id: string): readonly AenderungZeile[] {
  return db
    .prepare<{ readonly id: string }, AenderungZeile>(
      `SELECT operation FROM aenderung WHERE tabelle = 'ortsname' AND datensatz_id = @id ORDER BY reihenfolge`,
    )
    .all({ id })
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

describe('ortsname.anlegen (AP-1.16 PR-A)', () => {
  it('legt einen WEITEREN Ortsnamen zum bestehenden Ort an, genau eine aenderung-Zeile (operation=insert)', () => {
    const db = neueTestDatenbank()
    try {
      const ortId = neuerOrt(db)
      const { id } = fuehreAus(db, 'ortsname.anlegen', { ortId, name: 'Kwidzyn', gueltigVon: 20000 })

      const zeile = ortsnameLesen(db, id)
      expect(zeile).toBeDefined()
      expect(zeile?.ort_id).toBe(ortId)
      expect(zeile?.name).toBe('Kwidzyn')
      expect(zeile?.gueltig_von).toBe(20000)

      expect(aenderungenFuerOrtsname(db, id)).toHaveLength(1)
      expect(aenderungenFuerOrtsname(db, id)[0]?.operation).toBe('insert')
    } finally {
      db.close()
    }
  })

  it('KEIN automatisches Demote: ein zweiter istBevorzugt=1-Name lässt den ersten unangetastet', () => {
    const db = neueTestDatenbank()
    try {
      const ortId = neuerOrt(db)
      const { id: ersterId } = fuehreAus(db, 'ortsname.anlegen', { ortId, name: 'Marienwerder-Alt', istBevorzugt: 1 })

      const { id: zweiterId } = fuehreAus(db, 'ortsname.anlegen', { ortId, name: 'Kwidzyn', istBevorzugt: 1 })

      expect(ortsnameLesen(db, ersterId)?.ist_bevorzugt).toBe(1)
      expect(ortsnameLesen(db, zweiterId)?.ist_bevorzugt).toBe(1)
    } finally {
      db.close()
    }
  })

  it('nicht existierende ortId → NICHT_GEFUNDEN_ORT, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'ortsname.anlegen', { ortId: 'nicht-vorhanden', name: 'X' }))
      expect(code).toBe('NICHT_GEFUNDEN_ORT')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('Undo entfernt den angelegten Ortsnamen wieder, Redo legt ihn bitgleich erneut an', () => {
    const db = neueTestDatenbank()
    try {
      const ortId = neuerOrt(db)
      const { id } = fuehreAus(db, 'ortsname.anlegen', { ortId, name: 'Kwidzyn' })
      const nachAnlegen = ortsnameLesen(db, id)
      expect(nachAnlegen).toBeDefined()

      undo(db)
      expect(ortsnameLesen(db, id)).toBeUndefined()

      redo(db)
      expect(ortsnameLesen(db, id)).toEqual(nachAnlegen)
    } finally {
      db.close()
    }
  })
})

describe('ortsname.aendern (AP-1.16 PR-A)', () => {
  it('ändert name/gueltigVon/gueltigBis, trägt operation=update mit neuem geaendert_am', () => {
    const db = neueTestDatenbank()
    try {
      const ortId = neuerOrt(db)
      const { id } = fuehreAus(db, 'ortsname.anlegen', { ortId, name: 'Kwidzyn' })
      const vorher = ortsnameLesen(db, id)

      fuehreAus(db, 'ortsname.aendern', { id, name: 'Kwidzyn (Woiwodschaft Pommern)', gueltigVon: 20000, gueltigBis: 30000 })

      const nachher = ortsnameLesen(db, id)
      expect(nachher?.name).toBe('Kwidzyn (Woiwodschaft Pommern)')
      expect(nachher?.gueltig_von).toBe(20000)
      expect(nachher?.gueltig_bis).toBe(30000)
      expect(nachher?.geaendert_am ?? 0).toBeGreaterThanOrEqual(vorher?.geaendert_am ?? 0)

      const aenderungen = aenderungenFuerOrtsname(db, id)
      expect(aenderungen[aenderungen.length - 1]?.operation).toBe('update')
    } finally {
      db.close()
    }
  })

  it('AP-0.22: identische Werte erzeugen keine zweite Transaktion (No-op)', () => {
    const db = neueTestDatenbank()
    try {
      const ortId = neuerOrt(db)
      const { id } = fuehreAus(db, 'ortsname.anlegen', { ortId, name: 'Kwidzyn' })
      const anzahlVorher = transaktionAnzahl(db)

      fuehreAus(db, 'ortsname.aendern', { id, name: 'Kwidzyn' })

      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
      expect(aenderungenFuerOrtsname(db, id)).toHaveLength(1) // nur das ursprüngliche insert
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_ORTSNAME, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'ortsname.aendern', { id: 'nicht-vorhanden', name: 'X' }))
      expect(code).toBe('NICHT_GEFUNDEN_ORTSNAME')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('Undo stellt den vorherigen Ortsnamen bitgleich wieder her, Redo den geänderten', () => {
    const db = neueTestDatenbank()
    try {
      const ortId = neuerOrt(db)
      const { id } = fuehreAus(db, 'ortsname.anlegen', { ortId, name: 'Kwidzyn' })
      const vorAendern = ortsnameLesen(db, id)

      fuehreAus(db, 'ortsname.aendern', { id, name: 'Kwidzyn (heute)' })
      const nachAendern = ortsnameLesen(db, id)

      undo(db)
      expect(ortsnameLesen(db, id)).toEqual(vorAendern)

      redo(db)
      expect(ortsnameLesen(db, id)).toEqual(nachAendern)
    } finally {
      db.close()
    }
  })
})

describe('ortsname.loeschen (AP-1.16 PR-A)', () => {
  it('löscht die ortsname-Zeile, trägt genau eine weitere aenderung-Zeile (operation=delete)', () => {
    const db = neueTestDatenbank()
    try {
      const ortId = neuerOrt(db)
      const { id } = fuehreAus(db, 'ortsname.anlegen', { ortId, name: 'Kwidzyn' })

      fuehreAus(db, 'ortsname.loeschen', { id })

      expect(ortsnameLesen(db, id)).toBeUndefined()
      const aenderungen = aenderungenFuerOrtsname(db, id)
      expect(aenderungen).toHaveLength(2) // insert (anlegen) + delete (löschen)
      expect(aenderungen[aenderungen.length - 1]?.operation).toBe('delete')
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_ORTSNAME, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'ortsname.loeschen', { id: 'nicht-vorhanden' }))
      expect(code).toBe('NICHT_GEFUNDEN_ORTSNAME')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('Undo stellt den gelöschten Ortsnamen bitgleich wieder her, Redo löscht ihn erneut', () => {
    const db = neueTestDatenbank()
    try {
      const ortId = neuerOrt(db)
      const { id } = fuehreAus(db, 'ortsname.anlegen', { ortId, name: 'Kwidzyn' })
      const vorLoeschen = ortsnameLesen(db, id)

      fuehreAus(db, 'ortsname.loeschen', { id })
      expect(ortsnameLesen(db, id)).toBeUndefined()

      undo(db)
      expect(ortsnameLesen(db, id)).toEqual(vorLoeschen)

      redo(db)
      expect(ortsnameLesen(db, id)).toBeUndefined()
    } finally {
      db.close()
    }
  })
})
