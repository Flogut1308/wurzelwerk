// AP-1.30 PR 9c-b (Prüfpfad-Folge zu #170, docs/80 §33 V-130-9c-b) — geschützter Prüfpfad
// (CLAUDE.md §5/§13, ADR-025). Neue Invariante: `PersonDetailName.ist_bevorzugt`
// (`abfrage:person.detail`, src/main/abfragen/person-detail.ts) stimmt mit `name_form` überein.
//
// Seit V-130-9c E4 erkennt der Reiter „Person" den Hauptnamen an diesem Feld (nicht an der Position
// in der Liste) und bearbeitet genau diese Form. Ein falsch gelesenes `ist_bevorzugt` ließe ihn eine
// Nebenform überschreiben — die Datenbank widerspräche nicht, `genau-ein-hauptname` prüft nur die
// Tabelle. Zusicherungen je Person P nach JEDEM Schritt einer Befehlsfolge (echter Befehlsbus,
// `_befehlsfolge-generator.ts`, inkl. `name.*`, `hauptname.wechseln`, Nachrücken beim Löschen) und
// nach jedem Undo-Schritt zurück:
//   H1  `namen` enthält genau die Formen von P aus `name_form` (keine fehlt, keine doppelt).
//   H2  Hat P Formen, ist in `namen` GENAU EINE `ist_bevorzugt` — und zwar die mit
//       `name_form.ist_bevorzugt = 1`; ohne Formen ist `namen` leer.
//   H3  Für jede Form gilt `ist_bevorzugt` ⇔ `name_form.ist_bevorzugt = 1` (auch die Nebenformen).
// Das Orakel liest `name_form` direkt, nicht über dieselbe Abfrage.
// Deckung: der Lauf zählt Prüfungen an Personen mit mindestens zwei Formen und an Schritten nach
// einem Hauptnamenwechsel bzw. Nachrücken und nach deren Rücknahme — sonst prüfte die Invariante nur
// den Fall „eine Form, also bevorzugt".
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
import { personDetail } from '../../src/main/abfragen/person-detail'
import { aktionAusfuehren, befehlsfolgeArbitrary, neuerZustand, type Zweig } from './_befehlsfolge-generator'

const SEED = 20260929
const LAEUFE = 300

interface FormZeile {
  readonly person_id: string
  readonly id: string
  readonly ist_bevorzugt: number
}

interface Deckung {
  mehrereFormen: number
  nachWechsel: number
  nachNachruecken: number
  nachUndoWechsel: number
}

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

function personIds(db: Database.Database): readonly string[] {
  return db
    .prepare<[], { readonly id: string }>('SELECT id FROM person ORDER BY id')
    .all()
    .map((zeile) => zeile.id)
}

/** `name_form` je Person, direkt aus der Tabelle (Orakel). */
function formenJePerson(db: Database.Database): ReadonlyMap<string, readonly FormZeile[]> {
  const karte = new Map<string, FormZeile[]>()
  for (const zeile of db.prepare<[], FormZeile>('SELECT person_id, id, ist_bevorzugt FROM name_form ORDER BY person_id, id').all()) {
    const liste = karte.get(zeile.person_id) ?? []
    liste.push(zeile)
    karte.set(zeile.person_id, liste)
  }
  return karte
}

/** Prüft H1–H3 für jede Person; gibt die Zahl der geprüften Personen mit mindestens zwei Formen zurück. */
function pruefen(db: Database.Database, wo: string): number {
  const formen = formenJePerson(db)
  let mehrere = 0
  for (const personId of personIds(db)) {
    const soll = formen.get(personId) ?? []
    const namen = personDetail(db, { personId }).namen
    const kontext = `${wo}, Person ${personId}`
    // H1
    expect([...namen.map((name) => name.id)].sort(), `H1 ${kontext}`).toEqual(soll.map((form) => form.id))
    // H2
    const bevorzugt = namen.filter((name) => name.ist_bevorzugt).map((name) => name.id)
    const bevorzugtSoll = soll.filter((form) => form.ist_bevorzugt === 1).map((form) => form.id)
    expect(bevorzugt, `H2 ${kontext}`).toEqual(soll.length === 0 ? [] : bevorzugtSoll)
    expect(bevorzugt, `H2 genau eine ${kontext}`).toHaveLength(soll.length === 0 ? 0 : 1)
    // H3
    for (const name of namen) {
      const form = soll.find((kandidat) => kandidat.id === name.id)
      expect(name.ist_bevorzugt, `H3 ${kontext}, Form ${name.id}`).toBe(form?.ist_bevorzugt === 1)
    }
    if (soll.length >= 2) {
      mehrere += 1
    }
  }
  return mehrere
}

describe('Invariante: PersonDetailName.ist_bevorzugt stimmt mit name_form überein (V-130-9c E4)', () => {
  // Der Generator stellt `Date` über `vi.setSystemTime()` (Testuhr, `_befehlsfolge-koaleszenz.ts`).
  afterAll(() => {
    vi.useRealTimers()
  })

  it('gilt nach jedem Schritt einer beliebigen Befehlsfolge und nach jedem Undo-Schritt zurück', () => {
    const deckung: Deckung = { mehrereFormen: 0, nachWechsel: 0, nachNachruecken: 0, nachUndoWechsel: 0 }
    fc.assert(
      fc.property(befehlsfolgeArbitrary(), (folge) => {
        const db = neueTestDatenbank()
        try {
          const zustand = neuerZustand()
          // Transaktionen, die einen Hauptnamenwechsel oder ein Nachrücken tragen (beide sind je ein
          // einzelner Befehl, also die oberste Transaktion nach ihrer Aktion).
          const wechselTransaktionen = new Set<string>()
          for (const [i, aktion] of folge.entries()) {
            const zweige: readonly Zweig[] = aktionAusfuehren(db, zustand, aktion)
            const mehrere = pruefen(db, `nach Aktion ${i} (${aktion.art})`)
            deckung.mehrereFormen += mehrere
            const wechsel = zweige.includes('befehl:hauptname.wechseln')
            const nachruecken = zweige.includes('nachruecken')
            if (wechsel && mehrere > 0) deckung.nachWechsel += 1
            if (nachruecken) deckung.nachNachruecken += 1
            const oberste = undoZiel(db)?.id
            if ((wechsel || nachruecken) && oberste !== undefined) wechselTransaktionen.add(oberste)
          }
          let schritt = 0
          for (let ziel = undoZiel(db); ziel !== undefined; ziel = undoZiel(db)) {
            undo(db)
            pruefen(db, `nach Undo-Schritt ${schritt}`)
            if (wechselTransaktionen.has(ziel.id)) deckung.nachUndoWechsel += 1
            schritt += 1
          }
        } finally {
          db.close()
        }
      }),
      { seed: SEED, numRuns: LAEUFE },
    )
    // Mindestzahlen: je die Hälfte des gemessenen Werts mit diesem Seed/`numRuns` (730, 5, 6, 11),
    // aufgerundet — Muster `NEUE_MINDESTTREFFER` in `undo-bitgleich.test.ts`. Fällt einer darunter:
    // Gewichte im Generator korrigieren, nie Seed oder Laufzahl (ADR-009-Nachtrag).
    expect(deckung.mehrereFormen, 'Prüfungen an Personen mit mehreren Formen').toBeGreaterThanOrEqual(365)
    expect(deckung.nachWechsel, 'Prüfungen nach hauptname.wechseln').toBeGreaterThanOrEqual(3)
    expect(deckung.nachNachruecken, 'Prüfungen nach Nachrücken').toBeGreaterThanOrEqual(3)
    expect(deckung.nachUndoWechsel, 'Prüfungen nach Rücknahme eines Wechsels/Nachrückens').toBeGreaterThanOrEqual(6)
  }, 180_000)
  // it()-Timeout 180 s wie `undo-bitgleich`/`genau-ein-hauptname`: lokal (macOS) ~28 s.
})
