// AP-1.33 PR-B — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025, docs/80 §30
// U-1.33-invariante-genau-ein-hauptname). Property für die Anzeigename-Rückfallkette der reinen
// Kern-Funktion `anzeigenameFuer` (`src/core/name/anzeigename.ts`, docs/arbeitspakete.md AP-1.33:
// „Sprache → Umschrift → Hauptname, Rückgabe {text, quelle, formId}"). Die Einheitstests in
// `test/einheit/name-anzeigename.test.ts` decken je Stufe einen handgebauten Fall; diese Property
// prüft die Kette für BELIEBIGE Formmengen (0..6 Formen, beliebige Sprachen/Umschriften, höchstens
// eine bevorzugte — wie es „genau ein Hauptname je Person" in der Datenbank garantiert):
//   - `null` genau dann, wenn es keine Form gibt; sonst stammt `formId` aus der Eingabe.
//   - Stufe 1: gibt es eine Form in der Wunschsprache, gewinnt sie (`quelle: 'sprache'`).
//   - Stufe 2: sonst gewinnt eine Umschrift-Form (`umschrift_von` gesetzt, `quelle: 'umschrift'`).
//   - Stufe 3: sonst `quelle: 'hauptname'`, und zwar die bevorzugte Form, wenn es eine gibt.
//   - innerhalb jeder Stufe gewinnt die bevorzugte Form, sofern sie zu den Kandidaten gehört.
//   - das Ergebnis hängt nicht von der Reihenfolge der Eingabe ab (Liste, Karte, Suche und Export
//     laden Formen in unterschiedlicher Reihenfolge).
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { anzeigenameFuer, type AnzeigeForm } from '../../src/core/name/anzeigename'
import type { GeladenerTeil } from '../../src/core/name/zerlegung'
import type { NamePartArt } from '../../src/core/name/typen'

const SPRACHEN = ['de', 'pl', 'ru', 'la'] as const
const ARTEN: readonly NamePartArt[] = ['vorname', 'praefix', 'nachname', 'suffix', 'titel', 'vatersname']

const teilArbitrary: fc.Arbitrary<GeladenerTeil> = fc.record({
  art: fc.constantFrom(...ARTEN),
  wert: fc.string({ minLength: 1, maxLength: 8 }),
  istRufname: fc.constant(false),
  sortierIndex: fc.nat({ max: 5 }),
})

interface FormRoh {
  readonly sprache: string | null
  readonly schrift: string | null
  readonly umschriftVon: string | null
  readonly originalText: string | null
  readonly teile: readonly GeladenerTeil[]
}

const formRohArbitrary: fc.Arbitrary<FormRoh> = fc.record({
  sprache: fc.option(fc.constantFrom(...SPRACHEN), { nil: null }),
  schrift: fc.option(fc.constantFrom('Latn', 'Cyrl'), { nil: null }),
  umschriftVon: fc.option(fc.constant('quelle-form'), { nil: null }),
  originalText: fc.option(fc.string({ maxLength: 8 }), { nil: null }),
  teile: fc.array(teilArbitrary, { maxLength: 4 }),
})

/** 0..6 Formen mit eindeutigen `formId`s und HÖCHSTENS einer bevorzugten (Index `bevorzugtRoh`
 * modulo Länge, oder keine). */
const formenArbitrary: fc.Arbitrary<readonly AnzeigeForm[]> = fc
  .record({
    roh: fc.array(formRohArbitrary, { maxLength: 6 }),
    bevorzugtRoh: fc.option(fc.nat(), { nil: null }),
  })
  .map(({ roh, bevorzugtRoh }) =>
    roh.map(
      (form, index): AnzeigeForm => ({
        ...form,
        formId: `form-${String(index).padStart(2, '0')}`,
        istBevorzugt: bevorzugtRoh !== null && bevorzugtRoh % roh.length === index,
      }),
    ),
  )

const wunschArbitrary: fc.Arbitrary<string | undefined> = fc.option(fc.constantFrom(...SPRACHEN), { nil: undefined })

function formMitId(formen: readonly AnzeigeForm[], formId: string): AnzeigeForm {
  const form = formen.find((f) => f.formId === formId)
  if (form === undefined) {
    throw new Error(`formId ${formId} stammt nicht aus der Eingabe.`)
  }
  return form
}

describe('Property: Anzeigename-Rückfallkette Sprache → Umschrift → Hauptname (AP-1.33)', () => {
  it('wählt je Stufe die richtige Form, bevorzugt innerhalb der Stufe den Hauptnamen', () => {
    fc.assert(
      fc.property(formenArbitrary, wunschArbitrary, (formen, wunsch) => {
        const ergebnis = anzeigenameFuer(formen, wunsch)
        if (formen.length === 0) {
          expect(ergebnis).toBeNull()
          return
        }
        if (ergebnis === null) {
          throw new Error('anzeigenameFuer lieferte null trotz vorhandener Formen.')
        }
        const gewaehlt = formMitId(formen, ergebnis.formId)

        const sprachKandidaten = wunsch === undefined ? [] : formen.filter((f) => f.sprache === wunsch)
        const umschriftKandidaten = formen.filter((f) => f.umschriftVon !== null)
        const kandidaten =
          sprachKandidaten.length > 0 ? sprachKandidaten : umschriftKandidaten.length > 0 ? umschriftKandidaten : formen
        const erwarteteQuelle = sprachKandidaten.length > 0 ? 'sprache' : umschriftKandidaten.length > 0 ? 'umschrift' : 'hauptname'

        expect(ergebnis.quelle).toBe(erwarteteQuelle)
        expect(kandidaten).toContain(gewaehlt)
        const bevorzugterKandidat = kandidaten.find((f) => f.istBevorzugt)
        if (bevorzugterKandidat !== undefined) {
          expect(gewaehlt.formId).toBe(bevorzugterKandidat.formId)
        }
      }),
      { seed: 20260924, numRuns: 1000 },
    )
  })

  it('ist unabhängig von der Reihenfolge der Formen', () => {
    fc.assert(
      fc.property(
        formenArbitrary.chain((formen) =>
          fc.tuple(fc.constant(formen), fc.shuffledSubarray([...formen], { minLength: formen.length, maxLength: formen.length })),
        ),
        wunschArbitrary,
        ([formen, gemischt], wunsch) => {
          expect(anzeigenameFuer(gemischt, wunsch)).toEqual(anzeigenameFuer(formen, wunsch))
        },
      ),
      { seed: 20260924, numRuns: 1000 },
    )
  })
})
