// AP-0.10, 55_Architektur.md §4.9 Stolperstelle 3: "Abgeleitete Daten laufen aus dem Tritt."
// undo()/redo() schreiben nur die Basistabellen (person, name, ...) roh zurück - die abl_*-Trigger
// (AP-0.7) bleiben dabei aktiv (nur die jrn_*-Journal-Trigger werden über `journalAus()`
// abgeschaltet) und pflegen `person_flach` automatisch mit. Dieser Test vergleicht den
// inkrementell von `undo()` hinterlassenen Stand gegen einen vollständigen Neuaufbau
// (`alleAbgeleitetenNeuAufbauen()`, AP-0.7) - exakt die Bitgleichheits-Garantie aus §5.2/§5.3.
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
import { alleAbgeleitetenNeuAufbauen } from '../../src/main/datenbank/trigger'
import { undo } from '../../src/main/journal/undo'

interface PersonFlachZeile {
  readonly person_id: string
  readonly anzeigename: string
  readonly sortier_nachname: string | null
  readonly sortier_vornamen: string | null
  readonly geburt_jahr: number | null
  readonly geburt_sort_von: number | null
  readonly geburt_ort_name: string | null
  readonly tod_jahr: number | null
  readonly tod_sort_von: number | null
  readonly konfidenz_min: number | null
  readonly hat_widerspruch: number | null
}

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

/** Kanonischer, sortierter Abzug von `person_flach` - dieselbe Idee wie `sucheFtsInhaltAbzug` in `test/einheit/_hilfen-abgeleitet.ts`, hier für `person_flach`. */
function personFlachAbzug(db: ReturnType<typeof oeffnen>): string {
  const zeilen = db
    .prepare<[], PersonFlachZeile>(
      `SELECT person_id, anzeigename, sortier_nachname, sortier_vornamen, geburt_jahr, geburt_sort_von,
              geburt_ort_name, tod_jahr, tod_sort_von, konfidenz_min, hat_widerspruch
       FROM person_flach ORDER BY person_id`,
    )
    .all()
  return JSON.stringify(zeilen)
}

describe('undo() hält abgeleitete Tabellen konsistent (55_Architektur.md §4.9 Stolperstelle 3, AP-0.10)', () => {
  it('nach undo(): person_flach stimmt mit einem vollständigen Neuaufbau überein', () => {
    const db = neueTestDatenbank()
    try {
      const { id: idA } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      fuehreAus(db, 'person.feldSetzen', { id: idA, feld: 'notiz', wert: 'Testnotiz' })
      fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })

      undo(db) // nimmt die zweite Person-Anlage zurück
      undo(db) // nimmt das feldSetzen zurück

      const inkrementell = personFlachAbzug(db)
      alleAbgeleitetenNeuAufbauen(db)
      const nachNeuaufbau = personFlachAbzug(db)

      expect(inkrementell).toBe(nachNeuaufbau)
      expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
    } finally {
      db.close()
    }
  })
})
