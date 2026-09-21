// AP-1.13 PR-C: `ort.anlegen` über den echten Befehlsbus (`src/main/befehle/bus.ts`) gegen eine
// migrierte `:memory:`-Datenbank. Muster identisch zu `test/einheit/befehl-name.test.ts` — NUR
// der einfache Fall (Ort + EIN primärer Ortsname), s. Kopfkommentar `src/main/befehle/ort-anlegen.ts`.
// AP-1.16 PR-A ergänzt `ort.aendern` (Stammfelder) — die volle Ortsverwaltung (weitere Namen,
// Zugehörigkeitsketten, externe Kennungen) steht in den eigenen Testdateien
// `test/einheit/befehl-ortsname.test.ts`/`befehl-ortszugehoerigkeit.test.ts`/
// `befehl-ort-externe-id.test.ts`. Die undo-bitgleich-Generator-Deckung bleibt weiterhin PR-B
// (geschützter Prüfpfad, docs/80_Offene_Fragen.md).
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
import { ortAnlegenEinSchema } from '../../src/shared/schemata/befehle'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'

interface OrtZeile {
  readonly id: string
  readonly typ: string | null
  readonly koordinaten_lat: number | null
  readonly koordinaten_lon: number | null
  readonly existiert_von: number | null
  readonly existiert_bis: number | null
  readonly notiz: string | null
  readonly geaendert_am: number | null
}

interface OrtsnameZeile {
  readonly id: string
  readonly ort_id: string
  readonly name: string | null
  readonly ist_bevorzugt: 0 | 1 | null
}

interface AenderungZeile {
  readonly operation: string
}

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

function ortLesen(db: ReturnType<typeof oeffnen>, id: string): OrtZeile | undefined {
  return db
    .prepare<{ readonly id: string }, OrtZeile>(
      'SELECT id, typ, koordinaten_lat, koordinaten_lon, existiert_von, existiert_bis, notiz, geaendert_am FROM ort WHERE id = @id',
    )
    .get({ id })
}

function ortsnamenFuerOrt(db: ReturnType<typeof oeffnen>, ortId: string): readonly OrtsnameZeile[] {
  return db
    .prepare<{ readonly ortId: string }, OrtsnameZeile>('SELECT id, ort_id, name, ist_bevorzugt FROM ortsname WHERE ort_id = @ortId')
    .all({ ortId })
}

function aenderungenFuerOrt(db: ReturnType<typeof oeffnen>, id: string): readonly AenderungZeile[] {
  return db
    .prepare<{ readonly id: string }, AenderungZeile>(`SELECT operation FROM aenderung WHERE tabelle = 'ort' AND datensatz_id = @id ORDER BY reihenfolge`)
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

describe('ort.anlegen (AP-1.13 PR-C)', () => {
  it('legt eine ort-Zeile UND genau EINEN bevorzugten ortsname an, je eine aenderung-Zeile (operation=insert)', () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'ort.anlegen', { name: 'Marienwerder' })

      const ort = ortLesen(db, id)
      expect(ort).toBeDefined()

      const namen = ortsnamenFuerOrt(db, id)
      expect(namen).toHaveLength(1)
      expect(namen[0]?.name).toBe('Marienwerder')
      expect(namen[0]?.ist_bevorzugt).toBe(1)

      expect(aenderungenFuerOrt(db, id)).toHaveLength(1)
      expect(aenderungenFuerOrt(db, id)[0]?.operation).toBe('insert')
    } finally {
      db.close()
    }
  })

  it('übernimmt optionales typ/notiz', () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'ort.anlegen', { name: 'Kirchdorf', typ: 'dorf', notiz: 'aus dem Ortsfeld angelegt' })
      const ort = ortLesen(db, id)
      expect(ort?.typ).toBe('dorf')
      expect(ort?.notiz).toBe('aus dem Ortsfeld angelegt')
    } finally {
      db.close()
    }
  })

  it('leerer Name → Zod-Schema lehnt ab, BEVOR der Bus etwas schreibt (IPC-Kanal-Ebene, huelle.ts)', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const geprueft = ortAnlegenEinSchema.safeParse({ name: '' })
      expect(geprueft.success).toBe(false)
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('Undo entfernt ort UND ortsname wieder, Redo legt beide bitgleich erneut an', () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'ort.anlegen', { name: 'Marienwerder' })
      const ortVorher = ortLesen(db, id)
      const namenVorher = ortsnamenFuerOrt(db, id)
      expect(ortVorher).toBeDefined()
      expect(namenVorher).toHaveLength(1)

      undo(db)
      expect(ortLesen(db, id)).toBeUndefined()
      expect(ortsnamenFuerOrt(db, id)).toHaveLength(0)

      redo(db)
      expect(ortLesen(db, id)).toEqual(ortVorher)
      expect(ortsnamenFuerOrt(db, id)).toEqual(namenVorher)
    } finally {
      db.close()
    }
  })
})

describe('ort.aendern (AP-1.16 PR-A)', () => {
  it('ändert typ/Koordinaten/existiert_von/bis/notiz, trägt operation=update mit neuem geaendert_am', () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'ort.anlegen', { name: 'Marienwerder' })
      const vorher = ortLesen(db, id)

      fuehreAus(db, 'ort.aendern', {
        id,
        typ: 'stadt',
        koordinatenLat: 53.65,
        koordinatenLon: 18.95,
        existiertVon: -30000,
        existiertBis: 20000,
        notiz: 'jetzt Kwidzyn',
      })

      const nachher = ortLesen(db, id)
      expect(nachher?.typ).toBe('stadt')
      expect(nachher?.koordinaten_lat).toBe(53.65)
      expect(nachher?.koordinaten_lon).toBe(18.95)
      expect(nachher?.existiert_von).toBe(-30000)
      expect(nachher?.existiert_bis).toBe(20000)
      expect(nachher?.notiz).toBe('jetzt Kwidzyn')
      expect(nachher?.geaendert_am ?? 0).toBeGreaterThanOrEqual(vorher?.geaendert_am ?? 0)

      const aenderungen = aenderungenFuerOrt(db, id)
      expect(aenderungen[aenderungen.length - 1]?.operation).toBe('update')
    } finally {
      db.close()
    }
  })

  it('AP-0.22: identische Werte erzeugen keine zweite Transaktion (No-op)', () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'ort.anlegen', { name: 'Kirchdorf', typ: 'dorf', notiz: 'Notiz' })
      const anzahlVorher = transaktionAnzahl(db)

      fuehreAus(db, 'ort.aendern', { id, typ: 'dorf', notiz: 'Notiz' })

      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
      expect(aenderungenFuerOrt(db, id)).toHaveLength(1) // nur das ursprüngliche insert
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_ORT, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'ort.aendern', { id: 'nicht-vorhanden', notiz: 'X' }))
      expect(code).toBe('NICHT_GEFUNDEN_ORT')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('Undo stellt die vorherigen Stammfelder bitgleich wieder her, Redo die geänderten', () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'ort.anlegen', { name: 'Marienwerder', typ: 'dorf' })
      const vorAendern = ortLesen(db, id)

      fuehreAus(db, 'ort.aendern', { id, typ: 'stadt', notiz: 'jetzt Kwidzyn' })
      const nachAendern = ortLesen(db, id)

      undo(db)
      expect(ortLesen(db, id)).toEqual(vorAendern)

      redo(db)
      expect(ortLesen(db, id)).toEqual(nachAendern)
    } finally {
      db.close()
    }
  })
})
