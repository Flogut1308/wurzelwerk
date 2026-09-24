// AP-1.34 PR-B — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025, ADR-009-Nachtrag 24.09.2026).
// Invariante: Eine vergebene Kennung wird nie neu vergeben (AP-1.34, E14; E12 „ausnahmslos").
//
// `kennung_zaehler` ist die einzige FACHLICHE Ausnahme im kanonischen Abzug der
// Undo-Bitgleich-Invariante (`_kanonischer-abzug.ts`). Eine Ausnahme ist nur dann ehrlich, wenn sie
// auch tatsächlich gebraucht wird und ihr Grund geprüft ist:
//
// - K1: nach person.anlegen + undo ist der kanonische Abzug gleich dem Vorzustand, der ROHE Inhalt
//       von kennung_zaehler aber NICHT — der Zähler bleibt bewusst stehen. Ohne die Ausnahme wäre
//       die Undo-Bitgleich-Invariante hier rot; mit ihr ist sie grün, aus dem richtigen Grund.
// - K2: Property über beliebige Befehlsfolgen: nach vollständiger Rücknahme bekommt eine neue
//       Person eine Kennung, die größer ist als JEDE je in der Folge gesehene.
// - K3: undo + redo von person.anlegen stellt dieselbe Kennung wieder her.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { vi } from 'vitest'

// Mocks wie in undo-bitgleich.test.ts (s. dortige Begründung).
vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { fuehreAus } from '../../src/main/befehle/bus'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { redo, undo } from '../../src/main/journal/undo'
import { undoZiel } from '../../src/main/repositories/journal-repo'
import { kanonischerAbzug } from './_kanonischer-abzug'
import type { AktionAnlegen } from './_befehlsfolge-generator'
import { aktionAusfuehren, befehlsfolgeArbitrary, neuerZustand } from './_befehlsfolge-generator'

type Db = ReturnType<typeof oeffnen>

function neueTestDatenbank(): Db {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

/** Roher, sortierter Inhalt von kennung_zaehler — bewusst am kanonischen Abzug vorbei gelesen. */
function zaehlerRoh(db: Db): string {
  return JSON.stringify(
    db.prepare<[], { readonly bereich: string; readonly naechste: number }>('SELECT bereich, naechste FROM kennung_zaehler ORDER BY bereich').all(),
  )
}

function kennungVon(db: Db, id: string): number | null | undefined {
  return db.prepare<{ readonly id: string }, { readonly kennung: number | null }>('SELECT kennung FROM person WHERE id = @id').get({ id })?.kennung
}

function alleKennungen(db: Db): readonly number[] {
  return db
    .prepare<[], { readonly kennung: number | null }>('SELECT kennung FROM person')
    .all()
    .flatMap((zeile) => (zeile.kennung === null ? [] : [zeile.kennung]))
}

describe('Invariante: eine vergebene Kennung wird nie neu vergeben (AP-1.34, E14)', () => {
  it('K1: person.anlegen + undo — kanonischer Abzug gleich dem Vorzustand, kennung_zaehler roh abweichend', () => {
    const db = neueTestDatenbank()
    try {
      const abzugVorher = kanonischerAbzug(db)
      const zaehlerVorher = zaehlerRoh(db)

      fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      undo(db)

      expect(kanonischerAbzug(db)).toBe(abzugVorher)
      expect(zaehlerRoh(db)).not.toBe(zaehlerVorher)
    } finally {
      db.close()
    }
  })

  it('K2: nach beliebiger Befehlsfolge und vollständiger Rücknahme ist die nächste Kennung größer als jede je gesehene', () => {
    fc.assert(
      fc.property(befehlsfolgeArbitrary(), (folge) => {
        const db = neueTestDatenbank()
        try {
          const gesehen = new Set<number>()
          const zustand = neuerZustand()
          // Eine Anlage vorweg: die generierte Folge enthält nicht zwingend ein person.anlegen,
          // ohne gesehene Kennung wäre die Zusicherung unten leer.
          const erste: AktionAnlegen = { art: 'anlegen', ein: { privat: 0, ist_platzhalter: 0 } }
          for (const aktion of [erste, ...folge]) {
            aktionAusfuehren(db, zustand, aktion)
            for (const kennung of alleKennungen(db)) {
              gesehen.add(kennung)
            }
          }
          // Gegenprobe zur Vorweg-Anlage: die Zusicherung unten ist nicht leer.
          expect(gesehen.size).toBeGreaterThan(0)

          while (undoZiel(db) !== undefined) {
            undo(db)
          }
          expect(alleKennungen(db)).toEqual([])

          const { id } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
          const neu = kennungVon(db, id)
          if (neu === null || neu === undefined) {
            throw new Error('person.anlegen hat keine Kennung vergeben.')
          }
          expect(neu).toBeGreaterThan(Math.max(...gesehen))
        } finally {
          db.close()
        }
      }),
      // Fester Seed (CLAUDE.md §13); kleine Laufzahl wegen der Windows-CI-Laufzeit (s. undo-bitgleich.test.ts).
      { seed: 20260924, numRuns: 100 },
    )
  }, 180_000)

  it('K3: undo + redo von person.anlegen stellt dieselbe Kennung wieder her', () => {
    const db = neueTestDatenbank()
    try {
      fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      const { id } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      const kennungVorher = kennungVon(db, id)
      expect(kennungVorher).toBe(2)

      undo(db)
      expect(kennungVon(db, id)).toBeUndefined()
      redo(db)

      expect(kennungVon(db, id)).toBe(kennungVorher)
    } finally {
      db.close()
    }
  })
})
