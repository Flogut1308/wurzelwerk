// AP-1.16 PR-A: `ortszugehoerigkeit.anlegen`/`ortszugehoerigkeit.aendern`/
// `ortszugehoerigkeit.loeschen` über den echten Befehlsbus (`src/main/befehle/bus.ts`) gegen eine
// migrierte `:memory:`-Datenbank. Muster identisch zu `test/einheit/befehl-name.test.ts`, der
// Zyklusschutz-Test spiegelt `elternschaft-anlegen.ts`s `KONFLIKT_ZYKLUS`-Fall, hier für
// `src/core/ort/zyklus.ts` und `KONFLIKT_ZYKLUS_ORT`.
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

interface OrtszugehoerigkeitZeile {
  readonly id: string
  readonly ort_id: string
  readonly uebergeordnet_id: string
  readonly art: string
  readonly gueltig_von: number | null
  readonly gueltig_bis: number | null
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

function zugehoerigkeitLesen(db: ReturnType<typeof oeffnen>, id: string): OrtszugehoerigkeitZeile | undefined {
  return db
    .prepare<{ readonly id: string }, OrtszugehoerigkeitZeile>(
      'SELECT id, ort_id, uebergeordnet_id, art, gueltig_von, gueltig_bis, geaendert_am FROM ortszugehoerigkeit WHERE id = @id',
    )
    .get({ id })
}

function aenderungenFuerZugehoerigkeit(db: ReturnType<typeof oeffnen>, id: string): readonly AenderungZeile[] {
  return db
    .prepare<{ readonly id: string }, AenderungZeile>(
      `SELECT operation FROM aenderung WHERE tabelle = 'ortszugehoerigkeit' AND datensatz_id = @id ORDER BY reihenfolge`,
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

function neuerOrt(db: ReturnType<typeof oeffnen>, name: string): string {
  return fuehreAus(db, 'ort.anlegen', { name }).id
}

function fehlerCode(fn: () => void): string | undefined {
  try {
    fn()
    return undefined
  } catch (fehler) {
    return fehler instanceof WurzelFehler ? fehler.code : `KEIN_WURZELFEHLER:${String(fehler)}`
  }
}

describe('ortszugehoerigkeit.anlegen (AP-1.16 PR-A)', () => {
  it('legt eine ortszugehoerigkeit-Zeile an, genau eine aenderung-Zeile (operation=insert)', () => {
    const db = neueTestDatenbank()
    try {
      const dorf = neuerOrt(db, 'Kirchdorf')
      const kreis = neuerOrt(db, 'Kreis Marienwerder')
      const { id } = fuehreAus(db, 'ortszugehoerigkeit.anlegen', { ortId: dorf, uebergeordnetId: kreis, art: 'politisch', gueltigVon: 10000 })

      const zeile = zugehoerigkeitLesen(db, id)
      expect(zeile).toBeDefined()
      expect(zeile?.ort_id).toBe(dorf)
      expect(zeile?.uebergeordnet_id).toBe(kreis)
      expect(zeile?.art).toBe('politisch')
      expect(zeile?.gueltig_von).toBe(10000)

      expect(aenderungenFuerZugehoerigkeit(db, id)).toHaveLength(1)
      expect(aenderungenFuerZugehoerigkeit(db, id)[0]?.operation).toBe('insert')
    } finally {
      db.close()
    }
  })

  it('politisch und kirchlich sind unabhängige Ketten: derselbe Ort kann in beiden art-Werten zum selben Übergeordneten gehören', () => {
    const db = neueTestDatenbank()
    try {
      const dorf = neuerOrt(db, 'Kirchdorf')
      const uebergeordnet = neuerOrt(db, 'Sprengel')

      expect(() => fuehreAus(db, 'ortszugehoerigkeit.anlegen', { ortId: dorf, uebergeordnetId: uebergeordnet, art: 'politisch' })).not.toThrow()
      expect(() => fuehreAus(db, 'ortszugehoerigkeit.anlegen', { ortId: dorf, uebergeordnetId: uebergeordnet, art: 'kirchlich' })).not.toThrow()
    } finally {
      db.close()
    }
  })

  it('nicht existierende ortId → NICHT_GEFUNDEN_ORT, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const kreis = neuerOrt(db, 'Kreis Marienwerder')
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'ortszugehoerigkeit.anlegen', { ortId: 'nicht-vorhanden', uebergeordnetId: kreis, art: 'politisch' }))
      expect(code).toBe('NICHT_GEFUNDEN_ORT')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('nicht existierende uebergeordnetId → NICHT_GEFUNDEN_ORT, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const dorf = neuerOrt(db, 'Kirchdorf')
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'ortszugehoerigkeit.anlegen', { ortId: dorf, uebergeordnetId: 'nicht-vorhanden', art: 'politisch' }))
      expect(code).toBe('NICHT_GEFUNDEN_ORT')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('Selbstkante (ortId === uebergeordnetId) → KONFLIKT_ZYKLUS_ORT, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const dorf = neuerOrt(db, 'Kirchdorf')
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'ortszugehoerigkeit.anlegen', { ortId: dorf, uebergeordnetId: dorf, art: 'politisch' }))
      expect(code).toBe('KONFLIKT_ZYKLUS_ORT')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('transitiver Zyklus (A gehört zu B, B gehört zu C, C soll zu A gehören) → KONFLIKT_ZYKLUS_ORT, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const a = neuerOrt(db, 'A')
      const b = neuerOrt(db, 'B')
      const c = neuerOrt(db, 'C')
      fuehreAus(db, 'ortszugehoerigkeit.anlegen', { ortId: a, uebergeordnetId: b, art: 'politisch' })
      fuehreAus(db, 'ortszugehoerigkeit.anlegen', { ortId: b, uebergeordnetId: c, art: 'politisch' })

      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'ortszugehoerigkeit.anlegen', { ortId: c, uebergeordnetId: a, art: 'politisch' }))
      expect(code).toBe('KONFLIKT_ZYKLUS_ORT')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('ein Zyklus in "politisch" verhindert NICHT dieselbe Kante in "kirchlich" (getrennt geprüft)', () => {
    const db = neueTestDatenbank()
    try {
      const a = neuerOrt(db, 'A')
      const b = neuerOrt(db, 'B')
      fuehreAus(db, 'ortszugehoerigkeit.anlegen', { ortId: a, uebergeordnetId: b, art: 'politisch' })

      // b -> a wäre in "politisch" ein Zyklus, ist es in "kirchlich" (leere Kette dort) nicht.
      expect(() => fuehreAus(db, 'ortszugehoerigkeit.anlegen', { ortId: b, uebergeordnetId: a, art: 'kirchlich' })).not.toThrow()
    } finally {
      db.close()
    }
  })

  it('Undo entfernt die angelegte ortszugehoerigkeit-Zeile wieder, Redo legt sie bitgleich erneut an', () => {
    const db = neueTestDatenbank()
    try {
      const dorf = neuerOrt(db, 'Kirchdorf')
      const kreis = neuerOrt(db, 'Kreis Marienwerder')
      const { id } = fuehreAus(db, 'ortszugehoerigkeit.anlegen', { ortId: dorf, uebergeordnetId: kreis, art: 'politisch' })
      const nachAnlegen = zugehoerigkeitLesen(db, id)
      expect(nachAnlegen).toBeDefined()

      undo(db)
      expect(zugehoerigkeitLesen(db, id)).toBeUndefined()

      redo(db)
      expect(zugehoerigkeitLesen(db, id)).toEqual(nachAnlegen)
    } finally {
      db.close()
    }
  })
})

describe('ortszugehoerigkeit.aendern (AP-1.16 PR-A)', () => {
  it('ändert gueltigVon/gueltigBis, trägt operation=update mit neuem geaendert_am', () => {
    const db = neueTestDatenbank()
    try {
      const dorf = neuerOrt(db, 'Kirchdorf')
      const kreis = neuerOrt(db, 'Kreis Marienwerder')
      const { id } = fuehreAus(db, 'ortszugehoerigkeit.anlegen', { ortId: dorf, uebergeordnetId: kreis, art: 'politisch' })
      const vorher = zugehoerigkeitLesen(db, id)

      fuehreAus(db, 'ortszugehoerigkeit.aendern', { id, gueltigVon: 10000, gueltigBis: 20000 })

      const nachher = zugehoerigkeitLesen(db, id)
      expect(nachher?.gueltig_von).toBe(10000)
      expect(nachher?.gueltig_bis).toBe(20000)
      expect(nachher?.geaendert_am ?? 0).toBeGreaterThanOrEqual(vorher?.geaendert_am ?? 0)

      const aenderungen = aenderungenFuerZugehoerigkeit(db, id)
      expect(aenderungen[aenderungen.length - 1]?.operation).toBe('update')
    } finally {
      db.close()
    }
  })

  it('AP-0.22: identische Werte erzeugen keine zweite Transaktion (No-op)', () => {
    const db = neueTestDatenbank()
    try {
      const dorf = neuerOrt(db, 'Kirchdorf')
      const kreis = neuerOrt(db, 'Kreis Marienwerder')
      const { id } = fuehreAus(db, 'ortszugehoerigkeit.anlegen', { ortId: dorf, uebergeordnetId: kreis, art: 'politisch', gueltigVon: 10000 })
      const anzahlVorher = transaktionAnzahl(db)

      fuehreAus(db, 'ortszugehoerigkeit.aendern', { id, gueltigVon: 10000 })

      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
      expect(aenderungenFuerZugehoerigkeit(db, id)).toHaveLength(1) // nur das ursprüngliche insert
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_ORTSZUGEHOERIGKEIT, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'ortszugehoerigkeit.aendern', { id: 'nicht-vorhanden', gueltigVon: 1 }))
      expect(code).toBe('NICHT_GEFUNDEN_ORTSZUGEHOERIGKEIT')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('Undo stellt die vorherige Zugehörigkeit bitgleich wieder her, Redo die geänderte', () => {
    const db = neueTestDatenbank()
    try {
      const dorf = neuerOrt(db, 'Kirchdorf')
      const kreis = neuerOrt(db, 'Kreis Marienwerder')
      const { id } = fuehreAus(db, 'ortszugehoerigkeit.anlegen', { ortId: dorf, uebergeordnetId: kreis, art: 'politisch' })
      const vorAendern = zugehoerigkeitLesen(db, id)

      fuehreAus(db, 'ortszugehoerigkeit.aendern', { id, gueltigVon: 10000, gueltigBis: 20000 })
      const nachAendern = zugehoerigkeitLesen(db, id)

      undo(db)
      expect(zugehoerigkeitLesen(db, id)).toEqual(vorAendern)

      redo(db)
      expect(zugehoerigkeitLesen(db, id)).toEqual(nachAendern)
    } finally {
      db.close()
    }
  })
})

describe('ortszugehoerigkeit.loeschen (AP-1.16 PR-A)', () => {
  it('löscht die ortszugehoerigkeit-Zeile, trägt genau eine weitere aenderung-Zeile (operation=delete)', () => {
    const db = neueTestDatenbank()
    try {
      const dorf = neuerOrt(db, 'Kirchdorf')
      const kreis = neuerOrt(db, 'Kreis Marienwerder')
      const { id } = fuehreAus(db, 'ortszugehoerigkeit.anlegen', { ortId: dorf, uebergeordnetId: kreis, art: 'politisch' })

      fuehreAus(db, 'ortszugehoerigkeit.loeschen', { id })

      expect(zugehoerigkeitLesen(db, id)).toBeUndefined()
      const aenderungen = aenderungenFuerZugehoerigkeit(db, id)
      expect(aenderungen).toHaveLength(2) // insert (anlegen) + delete (löschen)
      expect(aenderungen[aenderungen.length - 1]?.operation).toBe('delete')
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_ORTSZUGEHOERIGKEIT, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'ortszugehoerigkeit.loeschen', { id: 'nicht-vorhanden' }))
      expect(code).toBe('NICHT_GEFUNDEN_ORTSZUGEHOERIGKEIT')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('Undo stellt die gelöschte Zugehörigkeit bitgleich wieder her, Redo löscht sie erneut', () => {
    const db = neueTestDatenbank()
    try {
      const dorf = neuerOrt(db, 'Kirchdorf')
      const kreis = neuerOrt(db, 'Kreis Marienwerder')
      const { id } = fuehreAus(db, 'ortszugehoerigkeit.anlegen', { ortId: dorf, uebergeordnetId: kreis, art: 'politisch' })
      const vorLoeschen = zugehoerigkeitLesen(db, id)

      fuehreAus(db, 'ortszugehoerigkeit.loeschen', { id })
      expect(zugehoerigkeitLesen(db, id)).toBeUndefined()

      undo(db)
      expect(zugehoerigkeitLesen(db, id)).toEqual(vorLoeschen)

      redo(db)
      expect(zugehoerigkeitLesen(db, id)).toBeUndefined()
    } finally {
      db.close()
    }
  })
})
