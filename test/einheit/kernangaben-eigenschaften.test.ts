// AP-1.34 PR-D (ADR-031): Eigenschaften von `kernangabenAuswerten` über zufällige Eingaben (fester Seed).
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { kernangabenAuswerten, type KernangabenEingabe } from '../../src/core/person/kernangaben'

const SEED = 20260925
const LAEUFE = 500

const aussage = fc.record({ hatWert: fc.boolean(), belegt: fc.boolean() })
const aussagen = fc.array(aussage, { maxLength: 3 })

const eingabeArb: fc.Arbitrary<KernangabenEingabe> = fc.record({
  istPlatzhalter: fc.constant(false),
  lebendStatus: fc.constantFrom('lebend', 'verstorben', 'vermutet_verstorben', null),
  geschlecht: fc.constantFrom('M', 'F', 'U', 'X', null),
  hauptformBelegt: fc.boolean(),
  geburtsdatum: aussagen,
  geburtsort: aussagen,
  todesdatum: aussagen,
  todesort: aussagen,
  todEreignisse: fc.array(fc.record({ ortVorhanden: fc.boolean(), ortBelegt: fc.boolean() }), { maxLength: 2 }),
  // Kleiner Id-Raum, damit Doppelkanten entstehen.
  eltern: fc.array(fc.record({ id: fc.constantFrom('a', 'b', 'c', 'd'), geschlecht: fc.constantFrom('M', 'F', 'U', 'X', null), belegt: fc.boolean() }), { maxLength: 4 }),
})

/** Alle Eingaben, die aus `e` durch Setzen GENAU EINES Beleg-Flags von false auf true entstehen. */
function mitEinemBelegMehr(e: KernangabenEingabe): readonly KernangabenEingabe[] {
  const ergebnis: KernangabenEingabe[] = []
  if (!e.hauptformBelegt) ergebnis.push({ ...e, hauptformBelegt: true })
  for (const schluessel of ['geburtsdatum', 'geburtsort', 'todesdatum', 'todesort'] as const) {
    e[schluessel].forEach((a, i) => {
      if (!a.belegt) ergebnis.push({ ...e, [schluessel]: e[schluessel].map((b, j) => (j === i ? { ...b, belegt: true } : b)) })
    })
  }
  e.todEreignisse.forEach((t, i) => {
    if (!t.ortBelegt) ergebnis.push({ ...e, todEreignisse: e.todEreignisse.map((b, j) => (j === i ? { ...b, ortBelegt: true } : b)) })
  })
  e.eltern.forEach((t, i) => {
    if (!t.belegt) ergebnis.push({ ...e, eltern: e.eltern.map((b, j) => (j === i ? { ...b, belegt: true } : b)) })
  })
  return ergebnis
}

describe('kernangabenAuswerten — Eigenschaften (AP-1.34 PR-D)', () => {
  it('E1: Nicht-Platzhalter nie null; fehlend.length = anwendbar − erfuellt; anwendbar ∈ {6, 8}; prozent = floor', () => {
    fc.assert(
      fc.property(eingabeArb, (e) => {
        const k = kernangabenAuswerten(e)
        expect(k).not.toBeNull()
        if (k === null) return
        expect(k.anwendbar).toBe(e.lebendStatus === 'verstorben' ? 8 : 6)
        expect(k.fehlend.length).toBe(k.anwendbar - k.erfuellt)
        expect(k.erfuellt).toBeGreaterThanOrEqual(0)
        expect(k.prozent).toBe(Math.floor((100 * k.erfuellt) / k.anwendbar))
        expect(k.prozent).toBeGreaterThanOrEqual(0)
        expect(k.prozent).toBeLessThanOrEqual(100)
      }),
      { seed: SEED, numRuns: LAEUFE },
    )
  })

  it('E2: Monotonie — ein zusätzlicher Beleg senkt erfuellt nie', () => {
    fc.assert(
      fc.property(eingabeArb, (e) => {
        const vorher = kernangabenAuswerten(e)?.erfuellt ?? -1
        for (const mehr of mitEinemBelegMehr(e)) {
          expect(kernangabenAuswerten(mehr)?.erfuellt ?? -1).toBeGreaterThanOrEqual(vorher)
        }
      }),
      { seed: SEED, numRuns: LAEUFE },
    )
  })

  it('E3: Platzhalter immer null', () => {
    fc.assert(
      fc.property(eingabeArb, (e) => {
        expect(kernangabenAuswerten({ ...e, istPlatzhalter: true })).toBeNull()
      }),
      { seed: SEED, numRuns: 100 },
    )
  })
})
