// AP-1.33 PR-B — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025, docs/80 §30
// U-1.33-invariante-genau-ein-hauptname). Neue Invariante „genau ein Hauptname je Person":
// jede Person, die mindestens eine `name_form` hat, hat GENAU EINE mit `ist_bevorzugt = 1`. Eine
// Person ohne Form ist erlaubt (0006_namensformen.sql §6).
//
// Warum zusätzlich zur Datenbank: der partielle UNIQUE-Index `idx_name_form_ein_hauptname`
// verhindert nur ZWEI bevorzugte Formen. „Mindestens eine" erzwingen die Constraint-Trigger
// `chk_name_form_hauptname_au/_ad` — die feuern aber NICHT bei INSERT und werden von
// `mitHauptnameConstraintAus()` (`hauptname.wechseln`, `name.loeschen` mit Nachrücken) für die
// Dauer der Umstellung bewusst ausgehängt. Genau dort kann ein Fehler im Produktivcode eine Person
// ohne Hauptnamen hinterlassen, ohne dass die Datenbank widerspricht. Diese Invariante prüft den
// END-Zustand unabhängig von den Triggern:
//   1. über den Fixture-Korpus (acht handgebaute Bäume + Generator-Korpus, 200 Personen),
//   2. nach JEDEM Schritt einer zufälligen Befehlsfolge über den echten Befehlsbus
//      (`_befehlsfolge-generator.ts`, inkl. `name.*` und `hauptname.wechseln`) UND nach jedem
//      Undo-Schritt zurück bis zum Anfang.
import { afterAll, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import type Database from 'better-sqlite3'

vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { undo } from '../../src/main/journal/undo'
import { undoZiel } from '../../src/main/repositories/journal-repo'
import { generiere } from '../../fixtures/generiert/generator'
import { fixtureLaden, type FixtureName } from '../hilfsmittel/fixture-laden'
import { aktionAusfuehren, befehlsfolgeArbitrary, neuerZustand } from './_befehlsfolge-generator'

interface HauptnameVerstossZeile {
  readonly person_id: string
  readonly formen: number
  readonly bevorzugte: number
}

/** Alle Personen mit Formen, deren Zahl bevorzugter Formen nicht genau 1 ist — leer = Invariante hält. */
function hauptnameVerstoesse(db: Database.Database): readonly HauptnameVerstossZeile[] {
  return db
    .prepare<[], HauptnameVerstossZeile>(
      `SELECT person_id, COUNT(*) AS formen, SUM(ist_bevorzugt = 1) AS bevorzugte
         FROM name_form
        GROUP BY person_id
       HAVING SUM(ist_bevorzugt = 1) <> 1
        ORDER BY person_id`,
    )
    .all()
}

interface AnzahlZeile {
  readonly anzahl: number
}

/** Zahl der Personen mit mindestens zwei Formen — belegt, dass der Korpus den Fall überhaupt enthält. */
function personenMitMehrerenFormen(db: Database.Database): number {
  const zeile = db
    .prepare<[], AnzahlZeile>(
      'SELECT COUNT(*) AS anzahl FROM (SELECT person_id FROM name_form GROUP BY person_id HAVING COUNT(*) >= 2)',
    )
    .get()
  return zeile?.anzahl ?? 0
}

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

/** Die acht Fixture-Bäume (identisch zu `fixture-gesund.test.ts`). */
const ACHT_FIXTURE_NAMEN: readonly FixtureName[] = [
  'minimal',
  'mehrfachehe',
  'adoption',
  'cousinenheirat',
  'fehlende-daten',
  'kaputte-kodierung',
  'unscharfe-datumsangaben',
  'kyrillisch-polnisch',
]

const GENERATOR_KORPUS_SEED = 20260910

describe('Invariante: genau ein Hauptname je Person (AP-1.33, 0006_namensformen.sql)', () => {
  // AP-1.30 PR 4b: der Generator stellt `Date` über `vi.setSystemTime()` (Testuhr,
  // `_befehlsfolge-koaleszenz.ts`) — danach wieder die echte Uhr.
  afterAll(() => {
    vi.useRealTimers()
  })

  describe('Fixture-Korpus', () => {
    it.each(ACHT_FIXTURE_NAMEN)('Fixture "%s": jede Person mit Formen hat genau eine bevorzugte', (name) => {
      const db = fixtureLaden(name)
      try {
        expect(hauptnameVerstoesse(db)).toEqual([])
      } finally {
        db.close()
      }
    })

    it(
      'Generator-Korpus (200 Personen): jede Person mit Formen hat genau eine bevorzugte',
      () => {
        const db = generiere(200, GENERATOR_KORPUS_SEED)
        try {
          expect(hauptnameVerstoesse(db)).toEqual([])
        } finally {
          db.close()
        }
      },
      30_000,
    )

    it('der handgebaute Korpus enthält mindestens eine Person mit mehreren Formen (sonst prüfte die Invariante nur den Trivialfall)', () => {
      let summe = 0
      for (const name of ACHT_FIXTURE_NAMEN) {
        const db = fixtureLaden(name)
        try {
          summe += personenMitMehrerenFormen(db)
        } finally {
          db.close()
        }
      }
      expect(summe).toBeGreaterThan(0)
    })
  })

  it('gilt nach jedem Schritt einer beliebigen Befehlsfolge und nach jedem Undo-Schritt zurück', () => {
    fc.assert(
      fc.property(befehlsfolgeArbitrary(), (folge) => {
        const db = neueTestDatenbank()
        try {
          const zustand = neuerZustand()
          for (const aktion of folge) {
            aktionAusfuehren(db, zustand, aktion)
            expect(hauptnameVerstoesse(db)).toEqual([])
          }
          while (undoZiel(db) !== undefined) {
            undo(db)
            expect(hauptnameVerstoesse(db)).toEqual([])
          }
        } finally {
          db.close()
        }
      }),
      { seed: 20260924, numRuns: 300 },
    )
  }, 180_000)
})
