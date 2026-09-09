// AP-0.10 PR-A2: `abfrage:journal.verlauf` (`src/main/abfragen/journal-verlauf.ts`) - rein lesend,
// über den echten Befehlsbus befüllt (analog zu `test/einheit/undo-redo-linear.test.ts`).
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { journalVerlauf } from '../../src/main/abfragen/journal-verlauf'
import { fuehreAus } from '../../src/main/befehle/bus'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

describe('journalVerlauf() (AP-0.10, 55_Architektur.md §4.7/§2.3)', () => {
  it('liefert nach 2 Befehlen 2 Einträge, neueste zuerst, mit korrektem status/rueckgaengigMoeglich', () => {
    const db = neueTestDatenbank()
    try {
      fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })

      const verlauf = journalVerlauf(db, 10)

      expect(verlauf).toHaveLength(2)
      expect(verlauf[0]).toMatchObject({
        art: 'nutzer',
        status: 'angewendet',
        beschreibung: 'journal.person_angelegt',
        rueckgaengigMoeglich: true,
      })
      expect(verlauf[1]).toMatchObject({
        art: 'nutzer',
        status: 'angewendet',
        beschreibung: 'journal.person_angelegt',
        rueckgaengigMoeglich: true,
      })
      // neueste zuerst (ORDER BY lfd DESC): die spätere der beiden Transaktionen steht vorn.
      expect(typeof verlauf[0]?.id).toBe('string')
      expect(typeof verlauf[1]?.id).toBe('string')
      expect(verlauf[0]?.id).not.toBe(verlauf[1]?.id)
      const lfdA = db.prepare<{ readonly id: string }, { readonly lfd: number }>('SELECT lfd FROM transaktion WHERE id = @id').get({ id: verlauf[0]?.id ?? '' })?.lfd
      const lfdB = db.prepare<{ readonly id: string }, { readonly lfd: number }>('SELECT lfd FROM transaktion WHERE id = @id').get({ id: verlauf[1]?.id ?? '' })?.lfd
      expect(lfdA).toBeGreaterThan(lfdB ?? Number.POSITIVE_INFINITY)
    } finally {
      db.close()
    }
  })

  it('respektiert `grenze` (LIMIT) — bei 3 Befehlen und grenze=2 kommen nur die 2 neuesten zurück', () => {
    const db = neueTestDatenbank()
    try {
      fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      const { id: idC } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })

      const verlauf = journalVerlauf(db, 2)

      expect(verlauf).toHaveLength(2)
      // Die neueste Transaktion (idC-Anlage) muss dabei sein — sie steht wegen ORDER BY lfd DESC vorn.
      const idsInVerlauf = new Set(verlauf.map((eintrag) => eintrag.id))
      const dbNachTransaktionId = db
        .prepare<{ readonly personId: string }, { readonly transaktionId: string }>(
          `SELECT transaktion_id AS transaktionId FROM aenderung WHERE datensatz_id = @personId AND tabelle = 'person' LIMIT 1`,
        )
        .get({ personId: idC })
      expect(dbNachTransaktionId).toBeDefined()
      expect(idsInVerlauf.has(dbNachTransaktionId?.transaktionId ?? '')).toBe(true)
    } finally {
      db.close()
    }
  })
})
