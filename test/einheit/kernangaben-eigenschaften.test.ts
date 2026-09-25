// AP-1.34 PR-D (ADR-031): Eigenschaften von `kernangabenAuswerten` über zufällige Eingaben (fester Seed).
// Vorarbeiten AP-1.30, PR 2 (Nachtrag ADR-031): Ereignis-Rückfall für Geburt/Tod, Aufschlüsselung.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { kernangabenAuswerten, type KernangabenEingabe } from '../../src/core/person/kernangaben'

const SEED = 20260925
const LAEUFE = 500

const aussage = fc.record({ hatWert: fc.boolean(), belegt: fc.boolean() })
const aussagen = fc.array(aussage, { maxLength: 3 })
const ortAussagen = fc.array(
  fc.record({ wertRefId: fc.constantFrom('ort-1', null), wertText: fc.constantFrom('Irgendwo', null), belegt: fc.boolean() }),
  { maxLength: 3 },
)

const ereignisArb = fc.record({ datumVorhanden: fc.boolean(), ortVorhanden: fc.boolean(), datumBelegt: fc.boolean(), ortBelegt: fc.boolean() })

const eingabeArb: fc.Arbitrary<KernangabenEingabe> = fc.record({
  istPlatzhalter: fc.constant(false),
  lebendStatus: fc.constantFrom('lebend', 'verstorben', 'vermutet_verstorben', null),
  geschlecht: fc.constantFrom('M', 'F', 'U', 'X', null),
  nameVorhanden: fc.boolean(),
  hauptformBelegt: fc.boolean(),
  geburtsdatum: aussagen,
  geburtsort: ortAussagen,
  todesdatum: aussagen,
  todesort: ortAussagen,
  geburtEreignisse: fc.array(ereignisArb, { maxLength: 2 }),
  todEreignisse: fc.array(ereignisArb, { maxLength: 2 }),
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
  for (const schluessel of ['geburtEreignisse', 'todEreignisse'] as const) {
    e[schluessel].forEach((t, i) => {
      for (const flag of ['datumBelegt', 'ortBelegt'] as const) {
        if (!t[flag]) ergebnis.push({ ...e, [schluessel]: e[schluessel].map((b, j) => (j === i ? { ...b, [flag]: true } : b)) })
      }
    })
  }
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

  // Monotonie gilt für Beleg-Flags an vorhandenen Einträgen, NICHT für zusätzliche Aussagen: eine
  // neue unbelegte todesort-Aussage verdrängt einen belegten Ereignisort (E5/D6, ADR-031).
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

  it('E4: Aufschlüsselung — eine Zeile je anwendbarer Angabe, fehlend = unbelegt/fehlt in derselben Reihenfolge, erfuellt = belegt/vorhanden', () => {
    fc.assert(
      fc.property(eingabeArb, (e) => {
        const k = kernangabenAuswerten(e)
        if (k === null) throw new Error('null für Nicht-Platzhalter')
        expect(k.aufschluesselung.length).toBe(k.anwendbar)
        expect(k.fehlend).toEqual(k.aufschluesselung.filter((a) => a.zustand === 'unbelegt' || a.zustand === 'fehlt').map((a) => a.id))
        expect(k.erfuellt).toBe(k.aufschluesselung.filter((a) => a.zustand === 'belegt' || a.zustand === 'vorhanden').length)
      }),
      { seed: SEED, numRuns: LAEUFE },
    )
  })

  it('E5: D9 neu — ohne Aussage mit Wert erfüllt ein Rückfall-Ereignis mit Wert die Angabe, belegt oder nicht', () => {
    fc.assert(
      fc.property(eingabeArb, (e) => {
        const k = kernangabenAuswerten(e)
        if (k === null) throw new Error('null für Nicht-Platzhalter')
        const faelle: [string, boolean, boolean][] = [
          ['geburtsdatum', e.geburtsdatum.some((a) => a.hatWert), e.geburtEreignisse.some((x) => x.datumVorhanden)],
          ['geburtsort', e.geburtsort.some((a) => a.wertRefId !== null || a.wertText !== null), e.geburtEreignisse.some((x) => x.ortVorhanden)],
        ]
        if (e.lebendStatus === 'verstorben') {
          faelle.push(
            ['todesdatum', e.todesdatum.some((a) => a.hatWert), e.todEreignisse.some((x) => x.datumVorhanden)],
            ['todesort', e.todesort.some((a) => a.wertRefId !== null || a.wertText !== null), e.todEreignisse.some((x) => x.ortVorhanden)],
          )
        }
        for (const [id, aussageMitWert, ereignisMitWert] of faelle) {
          if (!aussageMitWert && ereignisMitWert) expect(k.fehlend).not.toContain(id)
          if (!aussageMitWert && !ereignisMitWert) expect(k.fehlend).toContain(id)
        }
      }),
      { seed: SEED, numRuns: LAEUFE },
    )
  })

  it('E6: die Aussage führt — gibt es eine Aussage mit Wert, ist die Angabe genau dann erfüllt, wenn eine davon belegt ist', () => {
    fc.assert(
      fc.property(eingabeArb, (e) => {
        const k = kernangabenAuswerten(e)
        if (k === null) throw new Error('null für Nicht-Platzhalter')
        const traegtOrt = (a: { readonly wertRefId: string | null; readonly wertText: string | null }): boolean => a.wertRefId !== null || a.wertText !== null
        const faelle: [string, readonly { readonly belegt: boolean }[]][] = [
          ['geburtsdatum', e.geburtsdatum.filter((a) => a.hatWert)],
          ['geburtsort', e.geburtsort.filter(traegtOrt)],
        ]
        if (e.lebendStatus === 'verstorben') faelle.push(['todesdatum', e.todesdatum.filter((a) => a.hatWert)], ['todesort', e.todesort.filter(traegtOrt)])
        for (const [id, mitWert] of faelle) {
          if (mitWert.length === 0) continue
          expect(k.fehlend.some((f) => f === id)).toBe(!mitWert.some((a) => a.belegt))
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
