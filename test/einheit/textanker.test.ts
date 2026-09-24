// AP-1.34 PR-C1a: reine Textanker-Regeln (src/core/beleg/textanker.ts). Einheit UTF-16-Codeeinheiten,
// halboffen [von, bis) (docs/schema/0007_kennung_textanker.sql); E4 (Anker bleibt nur bei gleicher
// Position UND gleichem Text) und F4 (keine Grenze in einem Ersatzpaar), docs/80_Offene_Fragen.md §31.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { ankerBleibt, ankerPruefen, ausschnitt } from '../../src/core/beleg/textanker'

const MIT_EMOJI = 'Müller 👶 1850'
// 'Müller ' = 7 Einheiten, 👶 belegt die Indizes 7 und 8 (Ersatzpaar), danach ' 1850'.

describe('K1 ankerPruefen', () => {
  it('[0, length] ist gültig', () => {
    expect(ankerPruefen('Getauft', 0, 7)).toBe('ok')
  })

  it('bis = length + 1 liegt außerhalb', () => {
    expect(ankerPruefen('Getauft', 0, 8)).toBe('ausserhalb')
  })

  it('negatives von liegt außerhalb', () => {
    expect(ankerPruefen('Getauft', -1, 3)).toBe('ausserhalb')
  })

  it('nicht ganzzahlige Grenzen liegen außerhalb', () => {
    expect(ankerPruefen('Getauft', 0.5, 3)).toBe('ausserhalb')
    expect(ankerPruefen('Getauft', 0, 2.5)).toBe('ausserhalb')
  })

  it('ohne Transkript kein Anker', () => {
    expect(ankerPruefen(null, 0, 1)).toBe('kein_transkript')
  })

  it('von >= bis ist leer oder verkehrt', () => {
    expect(ankerPruefen('Getauft', 3, 3)).toBe('leer_oder_verkehrt')
    expect(ankerPruefen('Getauft', 4, 2)).toBe('leer_oder_verkehrt')
  })

  it('👶 zählt als zwei UTF-16-Einheiten', () => {
    expect(MIT_EMOJI.length).toBe(14)
    expect(ankerPruefen(MIT_EMOJI, 7, 9)).toBe('ok')
    expect(ausschnitt(MIT_EMOJI, 7, 9)).toBe('👶')
    expect(ankerPruefen(MIT_EMOJI, 0, 14)).toBe('ok')
  })

  it('eine Grenze mitten im Ersatzpaar wird abgelehnt (F4)', () => {
    expect(ankerPruefen(MIT_EMOJI, 8, 10)).toBe('teilt_ersatzpaar')
    expect(ankerPruefen(MIT_EMOJI, 0, 8)).toBe('teilt_ersatzpaar')
    expect(ankerPruefen(MIT_EMOJI, 7, 8)).toBe('teilt_ersatzpaar')
  })
})

describe('ausschnitt', () => {
  it('liefert den Ausschnitt oder null', () => {
    expect(ausschnitt('Getauft wurde', 0, 7)).toBe('Getauft')
    expect(ausschnitt(null, 0, 1)).toBeNull()
    expect(ausschnitt('abc', 0, 4)).toBeNull()
    expect(ausschnitt(MIT_EMOJI, 8, 10)).toBeNull()
  })
})

describe('K2 ankerBleibt', () => {
  const alt = 'Getauft wurde Johann'
  // Anker auf "wurde" = [8, 13)

  it('Änderung hinter bis → bleibt', () => {
    expect(ankerBleibt(alt, 'Getauft wurde Johannes Müller', 8, 13)).toBe(true)
    expect(ankerBleibt(alt, 'Getauft wurde', 8, 13)).toBe(true)
  })

  it('Änderung vor von, gleich lang → bleibt', () => {
    expect(ankerBleibt(alt, 'Getauff wurde Johann', 8, 13)).toBe(true)
  })

  it('Änderung im Ausschnitt → entwertet', () => {
    expect(ankerBleibt(alt, 'Getauft wirde Johann', 8, 13)).toBe(false)
  })

  it('Einfügung vor von verschiebt den Text → entwertet (kein Nachführen)', () => {
    expect(ankerBleibt(alt, 'Heute getauft wurde Johann', 8, 13)).toBe(false)
  })

  it('neues Transkript NULL → entwertet', () => {
    expect(ankerBleibt(alt, null, 8, 13)).toBe(false)
  })

  it('Kürzung unter bis → entwertet', () => {
    expect(ankerBleibt(alt, 'Getauft wur', 8, 13)).toBe(false)
  })

  it('altes Transkript NULL → entwertet', () => {
    expect(ankerBleibt(null, alt, 8, 13)).toBe(false)
  })

  it('neues Transkript ließe die Grenze ein Ersatzpaar teilen → entwertet (F4)', () => {
    // alt: einsames High-Surrogate am Ende; neu hängt das Low-Surrogate an → bis läge im Paar.
    const altEinsam = 'ab\uD83D'
    expect(ankerPruefen(altEinsam, 0, 3)).toBe('ok')
    expect(ankerBleibt(altEinsam, 'ab👶', 0, 3)).toBe(false)
  })
})

describe('K3 Eigenschaften (fast-check, fester Seed)', () => {
  const PARAMETER = { seed: 20260924, numRuns: 300 } as const

  const textMitAnker = fc
    .string({ unit: 'binary', minLength: 1, maxLength: 40 })
    .chain((text) =>
      fc
        .tuple(fc.integer({ min: 0, max: text.length }), fc.integer({ min: 0, max: text.length }))
        .map(([a, b]) => ({ text, von: Math.min(a, b), bis: Math.max(a, b) })),
    )
    .filter(({ text, von, bis }) => ankerPruefen(text, von, bis) === 'ok')

  it('identisches Transkript → Anker bleibt', () => {
    fc.assert(
      fc.property(textMitAnker, ({ text, von, bis }) => {
        expect(ankerBleibt(text, text, von, bis)).toBe(true)
      }),
      PARAMETER,
    )
  })

  it('beliebige Änderung ab Index bis → Anker bleibt, solange keine Grenze ein Paar teilt', () => {
    fc.assert(
      fc.property(textMitAnker, fc.string({ unit: 'binary', maxLength: 20 }), ({ text, von, bis }, rest) => {
        const neu = text.slice(0, bis) + rest
        const erwartet = ankerPruefen(neu, von, bis) === 'ok'
        expect(ankerBleibt(text, neu, von, bis)).toBe(erwartet)
      }),
      PARAMETER,
    )
  })

  it('Änderung ab bis mit ASCII-Rest → Anker bleibt immer', () => {
    fc.assert(
      fc.property(textMitAnker, fc.string({ unit: 'grapheme-ascii', maxLength: 20 }), ({ text, von, bis }, rest) => {
        expect(ankerBleibt(text, text.slice(0, bis) + rest, von, bis)).toBe(true)
      }),
      PARAMETER,
    )
  })
})
