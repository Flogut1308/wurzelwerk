// AP-1.33 PR-B — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025, docs/80 §30
// U-1.33-invariante-genau-ein-hauptname). Property für die Anzeigename-Rückfallkette der reinen
// Kern-Funktion `anzeigenameFuer` (`src/core/name/anzeigename.ts`, docs/arbeitspakete.md AP-1.33:
// „Sprache → Umschrift → Hauptname, Rückgabe {text, quelle, formId}"). Die Einheitstests in
// `test/einheit/name-anzeigename.test.ts` decken je Stufe einen handgebauten Fall; diese Property
// prüft die Kette für BELIEBIGE Formmengen (0..6 Formen, beliebige Sprachen/Umschriften, höchstens
// eine bevorzugte — wie es „genau ein Hauptname je Person" in der Datenbank garantiert):
//   - `null` genau dann, wenn es keine Form gibt; sonst stammt `formId` aus der Eingabe.
//   - Stufe 1: gibt es eine Form in der Wunschsprache, gewinnt sie (`quelle: 'sprache'`).
//   - Stufe 2: sonst gewinnt eine Umschrift DER HAUPTFORM mit Anzeigetext (`quelle: 'umschrift'`);
//     die Umschrift einer Nebenform, ein fremder oder ein Selbstverweis und eine leere Umschrift
//     führen nie zu `'umschrift'` (Eigentümer 25.09.2026, docs/80 §32 V-4-umschrift). Hauptform ist
//     die Form, die Stufe 3 wählt: die bevorzugte, sonst die kleinste `formId` (§32 V-4b-hauptform).
//   - Stufe 3: sonst `quelle: 'hauptname'`, und zwar genau die Hauptform.
//   - innerhalb jeder Stufe gewinnt die bevorzugte Form, sofern sie zu den Kandidaten gehört.
//   - das Ergebnis hängt nicht von der Reihenfolge der Eingabe ab (Liste, Karte, Suche und Export
//     laden Formen in unterschiedlicher Reihenfolge).
// „Hat Anzeigetext" (Stufe 2) entscheidet `anzeigetextVon` — die Textregel hat unten ihre eigene
// Property, hier wird nur die Auswahl geprüft (§32 V-4b-orakel). Zweiseitig testlokal geklammert: eine
// Form ohne jedes Nicht-Leerzeichen hat nie Text; ein nicht leerer Vorname, Vatersname oder Nachname
// gibt immer Text (diese Arten verlieren beim Zusammensetzen keinen Wert). Dazwischen (mehrere Titel,
// Präfixe, Zusätze) gilt allein `anzeigetextVon`; ob dort das Verwerfen weiterer Werte gewollt ist,
// ist offen (§32 V-4b-ersterwert).
// Die vorübergehende Einengung des Generators aus PR 1 (#134, §32 V-4b-einengung) ist aufgehoben.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { anzeigenameFuer, anzeigetextVon, type AnzeigeForm } from '../../src/core/name/anzeigename'
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

/** Worauf `umschrift_von` zeigt: auf die Hauptform, auf eine beliebige Form der Liste (auch eine
 * Nebenform oder die eigene), auf sich selbst oder auf eine Form außerhalb der Liste. */
type UmschriftZiel = { readonly art: 'hauptform' | 'selbst' | 'fremd' } | { readonly art: 'index'; readonly index: number }

const umschriftZielArbitrary: fc.Arbitrary<UmschriftZiel> = fc.oneof(
  fc.constantFrom<UmschriftZiel>({ art: 'hauptform' }, { art: 'selbst' }, { art: 'fremd' }),
  fc.nat().map((index): UmschriftZiel => ({ art: 'index', index })),
)

interface FormRohMitZiel extends Omit<FormRoh, 'umschriftVon'> {
  readonly umschriftZiel: UmschriftZiel | null
}

const formRohArbitrary: fc.Arbitrary<FormRohMitZiel> = fc.record({
  sprache: fc.option(fc.constantFrom(...SPRACHEN), { nil: null }),
  schrift: fc.option(fc.constantFrom('Latn', 'Cyrl'), { nil: null }),
  umschriftZiel: fc.option(umschriftZielArbitrary, { nil: null }),
  originalText: fc.option(fc.string({ maxLength: 8 }), { nil: null }),
  teile: fc.array(teilArbitrary, { maxLength: 4 }),
})

function formIdFuer(index: number): string {
  return `form-${String(index).padStart(2, '0')}`
}

function umschriftZielId(ziel: UmschriftZiel | null, eigenerIndex: number, hauptformIndex: number, anzahl: number): string | null {
  if (ziel === null) return null
  switch (ziel.art) {
    case 'hauptform':
      return formIdFuer(hauptformIndex)
    case 'selbst':
      return formIdFuer(eigenerIndex)
    case 'fremd':
      return 'fremde-form'
    case 'index':
      return formIdFuer(ziel.index % anzahl)
  }
}

/** 0..6 Formen mit eindeutigen `formId`s und HÖCHSTENS einer bevorzugten (Index `bevorzugtRoh`
 * modulo Länge, oder keine); `umschrift_von` zeigt frei auf Hauptform, Nebenform, eigene oder fremde
 * Form (§32 V-4b-orakel). */
const formenArbitrary: fc.Arbitrary<readonly AnzeigeForm[]> = fc
  .record({
    roh: fc.array(formRohArbitrary, { maxLength: 6 }),
    bevorzugtRoh: fc.option(fc.nat(), { nil: null }),
  })
  .map(({ roh, bevorzugtRoh }) => {
    const bevorzugtIndex = bevorzugtRoh === null || roh.length === 0 ? null : bevorzugtRoh % roh.length
    const hauptformIndex = bevorzugtIndex ?? 0
    return roh.map(({ umschriftZiel, ...form }, index): AnzeigeForm => {
      return { ...form, umschriftVon: umschriftZielId(umschriftZiel, index, hauptformIndex, roh.length), formId: formIdFuer(index), istBevorzugt: bevorzugtIndex === index }
    })
  })

/** Hauptform (testlokal): die bevorzugte Form, sonst die kleinste `formId`. */
function hauptformVon(formen: readonly AnzeigeForm[]): AnzeigeForm | undefined {
  return formen.find((f) => f.istBevorzugt) ?? [...formen].sort((a, b) => (a.formId < b.formId ? -1 : a.formId > b.formId ? 1 : 0))[0]
}

/** Untere Klammer: ohne jedes Nicht-Leerzeichen in Bestandteilen und `originalText` kein Text. */
function sichtbarLeer(form: AnzeigeForm): boolean {
  return form.teile.every((t) => t.wert.trim() === '') && (form.originalText ?? '').trim() === ''
}

/** Obere Klammer: ein nicht leerer Vorname, Vatersname oder Nachname gibt immer Text. */
function sicherMitText(form: AnzeigeForm): boolean {
  return form.teile.some((t) => (t.art === 'vorname' || t.art === 'vatersname' || t.art === 'nachname') && t.wert.trim() !== '')
}

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

        const hauptform = hauptformVon(formen)
        if (hauptform === undefined) throw new Error('Keine Hauptform trotz vorhandener Formen.')
        const sprachKandidaten = wunsch === undefined ? [] : formen.filter((f) => f.sprache === wunsch)
        const zeigtAufHauptform = (f: AnzeigeForm): boolean => f.formId !== hauptform.formId && f.umschriftVon === hauptform.formId
        const umschriftKandidaten = formen.filter((f) => zeigtAufHauptform(f) && anzeigetextVon(f).trim() !== '')
        // Zweiseitige testlokale Klammer um das Orakel `anzeigetextVon` (Kopfkommentar).
        for (const f of formen.filter(zeigtAufHauptform)) {
          if (sichtbarLeer(f)) expect(umschriftKandidaten).not.toContain(f)
          if (sicherMitText(f)) expect(umschriftKandidaten).toContain(f)
        }
        const kandidaten =
          sprachKandidaten.length > 0 ? sprachKandidaten : umschriftKandidaten.length > 0 ? umschriftKandidaten : formen
        const erwarteteQuelle = sprachKandidaten.length > 0 ? 'sprache' : umschriftKandidaten.length > 0 ? 'umschrift' : 'hauptname'

        expect(ergebnis.quelle).toBe(erwarteteQuelle)
        expect(kandidaten).toContain(gewaehlt)
        const bevorzugterKandidat = kandidaten.find((f) => f.istBevorzugt)
        if (bevorzugterKandidat !== undefined) {
          expect(gewaehlt.formId).toBe(bevorzugterKandidat.formId)
        }
        // Neue Regel (V-4-umschrift) ausdrücklich: eine Umschrift einer Nebenform, ein fremder oder
        // ein Selbstverweis und eine leere Umschrift verdrängen den Hauptnamen nie.
        if (ergebnis.quelle === 'umschrift') {
          expect(gewaehlt.umschriftVon).toBe(hauptform.formId)
          expect(gewaehlt.formId).not.toBe(hauptform.formId)
          expect(sichtbarLeer(gewaehlt)).toBe(false)
        }
        if (ergebnis.quelle === 'hauptname') {
          expect(gewaehlt.formId).toBe(hauptform.formId)
        }
      }),
      { seed: 20260924, numRuns: 1000 },
    )
  })

  // AP-1.33 PR-B-Folgepunkt (hueter E1/E2): die Stufen-Property oben prüft nur `quelle`/`formId`.
  // Hier der Text-Vertrag der gewählten Form: „Titel Vornamen Vatersname Präfix Nachname Zusatz",
  // Vornamen und Vatersnamensteile je in `sortierIndex`-Reihenfolge, Leerzeichen-getrennt; ohne
  // Bestandteile `original_text` (oder ''). Die Bestandteile kommen in zufälliger Reihenfolge an (die
  // DB liefert keine garantierte). `vatersname` gehört seit der Eigentümer-Entscheidung vom 25.09.2026
  // (docs/80 §30 U-1.33-vatersname-anzeige: Lücke, zwischen Vornamen und Nachname) in den Text;
  // Produktivfix in PR #127, diese Erweiterung als eigener Prüfpfad-PR danach (ADR-025). Grenzen dieser Property (hueter #110, H3): nur
  // nicht-leere Wörter ohne Leerzeichen, höchstens EIN Titel/Präfix/Nachname/Zusatz — das Verwerfen
  // weiterer Titel/Präfixe/Zusätze (`ersterWert`), das Verketten mehrerer Nachnamen (`verkette`) und
  // der Filter auf reine Leerzeichen-Segmente bleiben hier ungeprüft. Der Rückfall ohne Bestandteile
  // hat einen eigenen Fall unten (sonst erreicht ihn der Generator praktisch nie, hueter #110, A1).
  it('der Text der gewählten Form folgt „Titel Vornamen Vatersname Präfix Nachname Zusatz"', () => {
    const wort = fc.stringMatching(/^[A-Za-zÄÖÜäöüß]{1,6}$/)
    const bestandteile = fc.record({
      titel: fc.option(wort, { nil: null }),
      vornamen: fc.array(wort, { maxLength: 3 }),
      vatersname: fc.array(wort, { maxLength: 2 }),
      praefix: fc.option(wort, { nil: null }),
      nachname: fc.option(wort, { nil: null }),
      suffix: fc.option(wort, { nil: null }),
      originalText: fc.option(fc.string({ maxLength: 8 }), { nil: null }),
    })
    fc.assert(
      fc.property(
        bestandteile.chain((b) => {
          const teile: GeladenerTeil[] = [
            ...(b.titel === null ? [] : [{ art: 'titel' as const, wert: b.titel, istRufname: false, sortierIndex: 0 }]),
            ...b.vornamen.map((wert, index): GeladenerTeil => ({ art: 'vorname', wert, istRufname: false, sortierIndex: index })),
            ...b.vatersname.map((wert, index): GeladenerTeil => ({ art: 'vatersname', wert, istRufname: false, sortierIndex: index })),
            ...(b.praefix === null ? [] : [{ art: 'praefix' as const, wert: b.praefix, istRufname: false, sortierIndex: 0 }]),
            ...(b.nachname === null ? [] : [{ art: 'nachname' as const, wert: b.nachname, istRufname: false, sortierIndex: 0 }]),
            ...(b.suffix === null ? [] : [{ art: 'suffix' as const, wert: b.suffix, istRufname: false, sortierIndex: 0 }]),
          ]
          return fc.tuple(fc.constant(b), fc.shuffledSubarray(teile, { minLength: teile.length, maxLength: teile.length }))
        }),
        ([b, teile]) => {
          const form: AnzeigeForm = {
            formId: 'form-00',
            sprache: null,
            schrift: null,
            istBevorzugt: true,
            umschriftVon: null,
            originalText: b.originalText,
            teile,
          }
          const segmente = [b.titel, ...b.vornamen, ...b.vatersname, b.praefix, b.nachname, b.suffix].filter((s): s is string => s !== null)
          const erwartet = segmente.length > 0 ? segmente.join(' ') : (b.originalText ?? '')
          expect(anzeigenameFuer([form])?.text).toBe(erwartet)
        },
      ),
      { seed: 20260924, numRuns: 1000 },
    )
  })

  it('ohne Bestandteile ist der Text original_text, ohne original_text der leere Text', () => {
    fc.assert(
      fc.property(fc.option(fc.string({ maxLength: 12 }), { nil: null }), (originalText) => {
        const form: AnzeigeForm = {
          formId: 'form-00',
          sprache: null,
          schrift: null,
          istBevorzugt: true,
          umschriftVon: null,
          originalText,
          teile: [],
        }
        expect(anzeigenameFuer([form])?.text).toBe(originalText ?? '')
      }),
      { seed: 20260924, numRuns: 200 },
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
