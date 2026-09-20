// AP-1.13 PR-C: `ort.anlegen` über den echten Befehlsbus (`src/main/befehle/bus.ts`) gegen eine
// migrierte `:memory:`-Datenbank. Muster identisch zu `test/einheit/befehl-name.test.ts` — NUR
// der einfache Fall (Ort + EIN primärer Ortsname), s. Kopfkommentar `src/main/befehle/ort-anlegen.ts`.
// Die volle Ortsverwaltung (zeitabhängige Hierarchie, politisch/kirchliche Zugehörigkeitsketten
// bearbeiten) bleibt AP-1.16 vorbehalten (CLAUDE.md §10) — ebenso die undo-bitgleich-Generator-
// Deckung für `ort.anlegen` (docs/80_Offene_Fragen.md).
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

interface OrtZeile {
  readonly id: string
  readonly typ: string | null
  readonly notiz: string | null
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
  return db.prepare<{ readonly id: string }, OrtZeile>('SELECT id, typ, notiz FROM ort WHERE id = @id').get({ id })
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
