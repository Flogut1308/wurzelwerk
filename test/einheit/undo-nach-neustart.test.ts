// AP-0.10, 55_Architektur.md §4.7: "Der Undo-Stapel liegt nirgends im Arbeitsspeicher. Er ist eine
// Abfrage." - F-03 ("Undo/Redo ... auch über Programmneustart hinweg") ist damit ohne
// Serialisierungscode erfüllt, WEIL die Wahrheit in der Datei steht. Dieser Test ist der Beweis:
// eine Dateidatenbank (NICHT `:memory:` - das wäre kein Neustart-Beweis), Verbindung schließen,
// neu öffnen, `undo()` funktioniert. Verbindung wird vor jedem erneuten Öffnen sauber geschlossen
// (AP-0.4-Lehre: EBUSY unter Windows bei noch offenem Handle).
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
import { undo } from '../../src/main/journal/undo'

describe('undo() über einen Programmneustart hinweg (55_Architektur.md §4.7, AP-0.10, F-03)', () => {
  let ordner: string
  let dbPfad: string

  beforeEach(() => {
    ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-undo-neustart-'))
    dbPfad = join(ordner, 'baum.sqlite')
  })

  afterEach(() => {
    rmSync(ordner, { recursive: true, force: true })
  })

  it('legt eine Person an, schließt/öffnet die Datei neu, undo() nimmt die Anlage trotzdem zurück', () => {
    const dbVorNeustart = oeffnen(dbPfad)
    let id: string
    try {
      migrieren(dbVorNeustart)
      id = fuehreAus(dbVorNeustart, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
    } finally {
      dbVorNeustart.close() // sauber schließen VOR dem erneuten Öffnen (AP-0.4: sonst EBUSY unter Windows)
    }

    const dbNachNeustart = oeffnen(dbPfad)
    try {
      migrieren(dbNachNeustart) // wie beim echten Programmstart: migrieren() ist ein No-Op auf einer bereits aktuellen Datei

      const vorUndo = dbNachNeustart
        .prepare<{ readonly id: string }, { readonly vorhanden: number }>('SELECT 1 AS vorhanden FROM person WHERE id = @id')
        .get({ id })
      expect(vorUndo).toBeDefined()

      const ergebnis = undo(dbNachNeustart)
      expect(ergebnis.transaktionId).toEqual(expect.any(String))

      const nachUndo = dbNachNeustart
        .prepare<{ readonly id: string }, { readonly vorhanden: number }>('SELECT 1 AS vorhanden FROM person WHERE id = @id')
        .get({ id })
      expect(nachUndo).toBeUndefined()
    } finally {
      dbNachNeustart.close()
    }
  })
})
