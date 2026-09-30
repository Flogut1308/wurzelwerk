// AP-1.30 PR 11-1b — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025, docs/80 §33 V-130-11-1b).
// Invariante zur Fachregel aus PR 11-1 (#197, V-130-11-E2/E3): `anzeigetextVon`
// (`src/core/name/anzeigename.ts`) wertet `name_form.reihenfolge` aus.
//   (a) `reihenfolge` null, fehlend oder `'vorname_zuerst'`: das Ergebnis ist bitgleich mit der
//       ALTEN Folge Titel Vornamen Vatersname Präfix Nachname Zusatz (hueter #197: als Eigenschaft
//       über zufällige Teilmengen, nicht über Einzelbeispiele).
//   (b) `'nachname_zuerst'`: die Folge Titel Präfix Nachname Vornamen Vatersname Zusatz.
//   (c) Die Multimenge der durch Leerraum getrennten Wörter ist unter allen Reihenfolgen gleich — und
//       gleich der Wörter aller Bestandteile (kein Wort geht verloren, keines entsteht).
//   (d) Ohne Bestandteil mit Inhalt ist das Ergebnis in allen Fällen der wortgetreue `originalText`
//       bzw. '' — `original_text` wird nie umgestellt.
//   (e) `sortierName` und `hatAnzeigetext` hängen nicht von `reihenfolge` ab.
// Die Referenz ist testlokal und UNABHÄNGIG formuliert: sie ruft weder `anzeigetextVon` noch
// `rekonstruiereFlach` auf, sondern baut die Segmente je Art selbst (Teile nach `sortierIndex`,
// leerzeichengetrennt; Teile aus reinem Leerraum zählen bei allen Arten außer `vorname` nicht, bei
// `vorname` bleibt jede Position erhalten und nur ein insgesamt leeres Segment fällt weg). Ehrlich
// benannt (hueter #198 H5): diese Segmentregel ist die dokumentierte Regel aus `zerlegung.ts`
// (`verkette`/`rekonstruiereFlach`, V-4b-ersterwert, V-E2-leer), hier nachformuliert — weicht die
// Zerlegung davon ab, wird dieser Test rot, auch wenn nur die Zerlegung und nicht die Reihenfolge
// betroffen ist. Grenzen: `sortierIndex` je Art eindeutig (Gleichstand ist U-E2-sortierindex).
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { anzeigetextVon, hatAnzeigetext, sortierName, type AnzeigeForm } from '../../src/core/name/anzeigename'
import type { GeladenerTeil } from '../../src/core/name/zerlegung'
import type { NameFormReihenfolge, NamePartArt } from '../../src/core/name/typen'

const SEED = 20260930
const LAEUFE = 1000

type ReihenfolgeFall = NameFormReihenfolge | null | undefined
const ALTE_FAELLE: readonly ReihenfolgeFall[] = [null, undefined, 'vorname_zuerst']
const ALLE_FAELLE: readonly ReihenfolgeFall[] = [...ALTE_FAELLE, 'nachname_zuerst']

const ALTE_FOLGE: readonly NamePartArt[] = ['titel', 'vorname', 'vatersname', 'praefix', 'nachname', 'suffix']
const NEUE_FOLGE: readonly NamePartArt[] = ['titel', 'praefix', 'nachname', 'vorname', 'vatersname', 'suffix']

const LEERRAUM = ['', ' ', '  ', '\t', '\n', ' ', '　'] as const

const wort = fc.stringMatching(/^[A-Za-zÄÖÜäöüßА-Яа-я.'-]{1,6}$/)
const leerraum = fc.constantFrom(...LEERRAUM)
/** Ein Eintrag: ein Wort, beliebiger Text (auch mit innerem Leerraum) oder reiner Leerraum/''. */
const eintrag = fc.oneof({ arbitrary: wort, weight: 5 }, { arbitrary: fc.string({ maxLength: 8 }), weight: 2 }, { arbitrary: leerraum, weight: 2 })

interface Roh {
  readonly werte: Readonly<Record<NamePartArt, readonly string[]>>
  readonly originalText: string | null
}

const originalTextArbitrary: fc.Arbitrary<string | null> = fc.option(
  fc.oneof(fc.string({ maxLength: 12 }), leerraum, fc.constantFrom('Joh. Georg  Müller alias Miller', ' Гуытнаты Карл ')),
  { nil: null },
)

function werteArbitrary(einzel: fc.Arbitrary<string>): fc.Arbitrary<Roh['werte']> {
  const liste = fc.array(einzel, { maxLength: 3 })
  return fc.record({ titel: liste, vorname: liste, vatersname: liste, praefix: liste, nachname: liste, suffix: liste })
}

/** Überwiegend gemischte Formen; jede achte besteht nur aus leeren bzw. Leerraum-Teilen, damit der
 * Rückfall auf `originalText` (d) nicht nur zufällig getroffen wird. */
const rohArbitrary: fc.Arbitrary<Roh> = fc.record({
  werte: fc.oneof({ arbitrary: werteArbitrary(eintrag), weight: 7 }, { arbitrary: werteArbitrary(leerraum), weight: 1 }),
  originalText: originalTextArbitrary,
})

/** Teile je Art mit eindeutigem `sortierIndex` (zufällige Lücken), in zufälliger Ladereihenfolge. */
const eingabeArbitrary: fc.Arbitrary<{ readonly roh: Roh; readonly teile: readonly GeladenerTeil[] }> = rohArbitrary.chain((roh) => {
  const arten: readonly NamePartArt[] = ALTE_FOLGE
  const teile: GeladenerTeil[] = arten.flatMap((art) =>
    roh.werte[art].map((wert, index): GeladenerTeil => ({ art, wert, istRufname: art === 'vorname' && index === 0, sortierIndex: index * 3 })),
  )
  return fc.tuple(fc.constant(roh), fc.shuffledSubarray(teile, { minLength: teile.length, maxLength: teile.length })).map(([r, t]) => ({ roh: r, teile: t }))
})

// --- unabhängige Referenz ---------------------------------------------------------------------

function istLeer(text: string): boolean {
  return text.trim() === ''
}

/** Segment einer Art (siehe Kopfkommentar): Teile nach `sortierIndex`, mit ' ' verbunden; außer bei
 * Vornamen zählen Leerraum-Teile nicht. `null`, wenn kein Teil übrig bleibt. */
function segmentReferenz(teile: readonly GeladenerTeil[], art: NamePartArt): string | null {
  const auswahl = teile
    .filter((t) => t.art === art && (art === 'vorname' || !istLeer(t.wert)))
    .slice()
    .sort((a, b) => a.sortierIndex - b.sortierIndex)
  return auswahl.length === 0 ? null : auswahl.map((t) => t.wert).join(' ')
}

function textReferenz(teile: readonly GeladenerTeil[], originalText: string | null, folge: readonly NamePartArt[]): string {
  const segmente: string[] = []
  for (const art of folge) {
    const segment = segmentReferenz(teile, art)
    if (segment !== null && !istLeer(segment)) segmente.push(segment)
  }
  const text = segmente.join(' ').trim()
  return text !== '' ? text : (originalText ?? '')
}

function woerter(text: string): readonly string[] {
  return text.split(/\s+/u).filter((w) => w !== '').sort()
}

function formMit(teile: readonly GeladenerTeil[], originalText: string | null, fall: ReihenfolgeFall): AnzeigeForm {
  const basis = { formId: 'form-00', sprache: null, schrift: null, istBevorzugt: true, umschriftVon: null, originalText, teile }
  // exactOptionalPropertyTypes: „fehlend" heißt ohne Schlüssel, nicht `reihenfolge: undefined`.
  return fall === undefined ? basis : { ...basis, reihenfolge: fall }
}

function hatInhalt(teile: readonly GeladenerTeil[]): boolean {
  return teile.some((t) => !istLeer(t.wert))
}

// --- Deckung ----------------------------------------------------------------------------------

interface Deckung {
  mitPraefix: number
  mitVatersname: number
  mehrereEinerArt: number
  originalTextRueckfall: number
  /** Ein Vorname aus '' bzw. reinem Leerraum neben einem Teil mit Inhalt — prüft, dass leere
   * Segmente nicht als Doppelleerzeichen im Text landen. */
  leererVornameNebenInhalt: number
}

describe('Property: Anzeigetext nach name_form.reihenfolge (AP-1.30 PR 11-1, V-130-11-E2/E3)', () => {
  it('(a)–(e): alte Folge bitgleich, neue Folge bei nachname_zuerst, gleiche Wörter, Rückfall, Sortierung', () => {
    const deckung: Deckung = { mitPraefix: 0, mitVatersname: 0, mehrereEinerArt: 0, originalTextRueckfall: 0, leererVornameNebenInhalt: 0 }
    fc.assert(
      fc.property(eingabeArbitrary, ({ roh, teile }) => {
        const inhalt = (art: NamePartArt): number => roh.werte[art].filter((w) => !istLeer(w)).length
        if (inhalt('praefix') >= 1) deckung.mitPraefix += 1
        if (inhalt('vatersname') >= 1) deckung.mitVatersname += 1
        if (ALTE_FOLGE.some((art) => inhalt(art) >= 2)) deckung.mehrereEinerArt += 1
        if (!hatInhalt(teile) && roh.originalText !== null && roh.originalText !== '') deckung.originalTextRueckfall += 1
        if (hatInhalt(teile) && roh.werte.vorname.length > 0 && roh.werte.vorname.every(istLeer)) deckung.leererVornameNebenInhalt += 1

        const alt = textReferenz(teile, roh.originalText, ALTE_FOLGE)
        const neu = textReferenz(teile, roh.originalText, NEUE_FOLGE)
        const ergebnisse = ALLE_FAELLE.map((fall) => anzeigetextVon(formMit(teile, roh.originalText, fall)))

        // (a) alte Folge bitgleich für null, fehlend, 'vorname_zuerst'
        for (const fall of ALTE_FAELLE) {
          expect(anzeigetextVon(formMit(teile, roh.originalText, fall))).toBe(alt)
        }
        // (b) neue Folge für 'nachname_zuerst'
        expect(anzeigetextVon(formMit(teile, roh.originalText, 'nachname_zuerst'))).toBe(neu)

        // (c) gleiche Wort-Multimenge unter allen Reihenfolgen; mit Inhalt = Wörter aller Teile
        const ersteWoerter = woerter(ergebnisse[0] ?? '')
        for (const text of ergebnisse) expect(woerter(text)).toEqual(ersteWoerter)
        if (hatInhalt(teile)) {
          expect(ersteWoerter).toEqual(woerter(teile.map((t) => t.wert).join(' ')))
        }

        // (d) ohne Teil mit Inhalt: wortgetreuer originalText bzw. '' — in jedem Fall
        if (!hatInhalt(teile)) {
          for (const text of ergebnisse) expect(text).toBe(roh.originalText ?? '')
        }

        // (e) Sortierung und „hat Anzeigetext" unabhängig von der Reihenfolge
        const sortier = ALLE_FAELLE.map((fall) => sortierName(formMit(teile, roh.originalText, fall)))
        const hat = ALLE_FAELLE.map((fall) => hatAnzeigetext(formMit(teile, roh.originalText, fall)))
        for (const s of sortier) expect(s).toBe(sortier[0])
        for (const h of hat) expect(h).toBe(hat[0])
      }),
      { seed: SEED, numRuns: LAEUFE },
    )
    // Mindestschwellen: je die Hälfte des Messwerts (Seed 20260930, 1000 Läufe; gemessen
    // Präfix 554, Vatersname 562, mehrere einer Art 794, originalText-Rückfall 95, leerer Vorname
    // neben Inhalt 70).
    expect(deckung.mitPraefix).toBeGreaterThanOrEqual(277)
    expect(deckung.mitVatersname).toBeGreaterThanOrEqual(281)
    expect(deckung.mehrereEinerArt).toBeGreaterThanOrEqual(397)
    expect(deckung.originalTextRueckfall).toBeGreaterThanOrEqual(47)
    expect(deckung.leererVornameNebenInhalt).toBeGreaterThanOrEqual(35)
  })

  // Einzelanker, damit die Property nicht nur gegen ihre eigene Referenz stimmt: das ossetische
  // Beispiel aus den Vorgaben §8 (Abnahme 2a) und das alte Beispiel mit Vatersname.
  it('Anker: „Гуытнаты Карл" bei nachname_zuerst, „Dr. Iwan Petrowitsch von Iwanow jr." sonst', () => {
    const teile: readonly GeladenerTeil[] = [
      { art: 'vorname', wert: 'Карл', istRufname: false, sortierIndex: 0 },
      { art: 'nachname', wert: 'Гуытнаты', istRufname: false, sortierIndex: 0 },
    ]
    expect(anzeigetextVon(formMit(teile, null, 'nachname_zuerst'))).toBe('Гуытнаты Карл')
    expect(anzeigetextVon(formMit(teile, null, null))).toBe('Карл Гуытнаты')
    const russisch: readonly GeladenerTeil[] = [
      { art: 'nachname', wert: 'Iwanow', istRufname: false, sortierIndex: 0 },
      { art: 'praefix', wert: 'von', istRufname: false, sortierIndex: 0 },
      { art: 'vatersname', wert: 'Petrowitsch', istRufname: false, sortierIndex: 0 },
      { art: 'suffix', wert: 'jr.', istRufname: false, sortierIndex: 0 },
      { art: 'vorname', wert: 'Iwan', istRufname: false, sortierIndex: 0 },
      { art: 'titel', wert: 'Dr.', istRufname: false, sortierIndex: 0 },
    ]
    expect(anzeigetextVon(formMit(russisch, null, undefined))).toBe('Dr. Iwan Petrowitsch von Iwanow jr.')
    expect(anzeigetextVon(formMit(russisch, null, 'nachname_zuerst'))).toBe('Dr. von Iwanow Iwan Petrowitsch jr.')
  })
})
