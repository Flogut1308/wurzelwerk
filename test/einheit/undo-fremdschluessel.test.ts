// AP-0.10, 55_Architektur.md §4.9 Stolperstelle 1: "Fremdschlüssel in der falschen Reihenfolge."
// Zwei `ort`-Zeilen, die sich beim Anlegen wechselseitig referenzieren (`ort.nachfolger_ort_id`),
// haben KEINE Reihenfolge, die Schritt für Schritt gültig bleibt - `PRAGMA defer_foreign_keys = ON`
// verschiebt die Prüfung auf den COMMIT. Ohne diese Zeile in `undo()`/`redo()` scheitert genau
// dieses Datenmuster (siehe Rückgabebericht des Auftrags für das beobachtete Rot).
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { v7 as uuidv7 } from 'uuid'

vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { fuehreAusDef } from '../../src/main/befehle/bus'
import type { BefehlDef } from '../../src/main/befehle/registrierung'
import { redo, undo } from '../../src/main/journal/undo'

interface OrtZeile {
  readonly id: string
  readonly nachfolger_ort_id: string | null
}

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

function ortZeile(db: ReturnType<typeof oeffnen>, id: string): OrtZeile | undefined {
  return db.prepare<{ readonly id: string }, OrtZeile>('SELECT id, nachfolger_ort_id FROM ort WHERE id = @id').get({ id })
}

/**
 * Legt zwei `ort`-Zeilen an, die sich wechselseitig referenzieren (A.nachfolger=B, B.nachfolger=A).
 * `defer_foreign_keys = ON` ist hier nötig, damit die erste INSERT (die auf die noch nicht
 * existierende zweite Zeile verweist) innerhalb DIESER Transaktion überhaupt gelingt - unabhängig
 * davon, ob `undo()`/`redo()` dieselbe Pragma später auch selbst setzen.
 */
function ortWechselseitigBefehl(): BefehlDef<null, { readonly idA: string; readonly idB: string }> {
  return {
    schema: z.null(),
    art: 'nutzer',
    beschreibung: () => 'test.ort_wechselseitig',
    handler: (tx) => {
      const idA = uuidv7()
      const idB = uuidv7()
      tx.pragma('defer_foreign_keys = ON')
      tx.prepare('INSERT INTO ort (id, nachfolger_ort_id) VALUES (@id, @nachfolger)').run({ id: idA, nachfolger: idB })
      tx.prepare('INSERT INTO ort (id, nachfolger_ort_id) VALUES (@id, @nachfolger)').run({ id: idB, nachfolger: idA })
      return { idA, idB }
    },
  }
}

describe('undo()/redo() mit wechselseitigen Fremdschlüsseln (55_Architektur.md §4.9 Stolperstelle 1, AP-0.10)', () => {
  it('undo löscht beide ort-Zeilen, redo fügt beide mit intakter wechselseitiger Referenz wieder ein', () => {
    const db = neueTestDatenbank()
    try {
      const { idA, idB } = fuehreAusDef(db, 'test.ortWechselseitig', ortWechselseitigBefehl(), null)

      expect(ortZeile(db, idA)?.nachfolger_ort_id).toBe(idB)
      expect(ortZeile(db, idB)?.nachfolger_ort_id).toBe(idA)

      undo(db)
      expect(ortZeile(db, idA)).toBeUndefined()
      expect(ortZeile(db, idB)).toBeUndefined()

      redo(db)
      expect(ortZeile(db, idA)?.nachfolger_ort_id).toBe(idB)
      expect(ortZeile(db, idB)?.nachfolger_ort_id).toBe(idA)

      expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
    } finally {
      db.close()
    }
  })
})
