// AP-0.10, 55_Architektur.md §4.7/§4.9: das lineare Undo/Redo-Modell über den echten Befehlsbus.
// Prüft die Grundmechanik aus §4.7 ("sobald ein neuer Befehl läuft, ist der Redo-Stapel weg") UND
// dass die `transaktion`-Historie (im Gegensatz zu den `aenderung`-Zeilen, §4.6) für IMMER
// vollständig erhalten bleibt - auch über verworfene Redo-Schritte hinweg.
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false } }))
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
import { redoZiel, undoZiel } from '../../src/main/repositories/journal-repo'

interface TransaktionZeile {
  readonly lfd: number
  readonly status: string
}

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

function transaktionenNachLfd(db: ReturnType<typeof oeffnen>): readonly TransaktionZeile[] {
  return db.prepare<[], TransaktionZeile>('SELECT lfd, status FROM transaktion ORDER BY lfd').all()
}

function personVorhanden(db: ReturnType<typeof oeffnen>, id: string): boolean {
  return db.prepare<{ readonly id: string }, { readonly vorhanden: number }>('SELECT 1 AS vorhanden FROM person WHERE id = @id').get({ id }) !== undefined
}

describe('undo()/redo() — lineares Undo-Modell über den echten Befehlsbus (55_Architektur.md §4.7/§4.9, AP-0.10)', () => {
  it('undo, undo, redo, neuer Befehl: Redo-Stapel danach leer, Historie (transaktion-Zeilen) vollständig erhalten', () => {
    const db = neueTestDatenbank()
    try {
      const { id: idA } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      const { id: idB } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })

      expect(personVorhanden(db, idA)).toBe(true)
      expect(personVorhanden(db, idB)).toBe(true)

      undo(db) // nimmt idB zurück
      expect(personVorhanden(db, idB)).toBe(false)
      expect(personVorhanden(db, idA)).toBe(true)

      undo(db) // nimmt idA zurück
      expect(personVorhanden(db, idA)).toBe(false)

      redo(db) // stellt idA wieder her
      expect(personVorhanden(db, idA)).toBe(true)
      expect(personVorhanden(db, idB)).toBe(false)
      expect(redoZiel(db)).toBeDefined() // idB ist weiterhin auf dem Redo-Stapel

      // Ein NEUER Befehl verwirft den Redo-Stapel (§4.7) - idB bleibt für immer zurückgenommen.
      const { id: idC } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })

      expect(redoZiel(db)).toBeUndefined()
      expect(undoZiel(db)?.id).toBeDefined() // idC ist jetzt das Undo-Ziel

      const historie = transaktionenNachLfd(db)
      expect(historie).toHaveLength(3) // idA-Anlage, idB-Anlage (verworfen), idC-Anlage - NICHTS verschwindet aus transaktion (§4.6)
      expect(historie.map((zeile) => zeile.status)).toEqual(['angewendet', 'verworfen', 'angewendet'])
      expect(personVorhanden(db, idC)).toBe(true)
    } finally {
      db.close()
    }
  })
})
