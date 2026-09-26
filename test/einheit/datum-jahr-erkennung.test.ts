// AP-1.30 U-130-9b-unlesbar (docs/80 §33 V-130-unlesbar, Entscheidung B): ist in einem nicht
// auflösbaren Datumstext eine vierstellige Jahreszahl erkennbar, bietet der Editor „als ‚etwa JJJJ‘
// mit Originaltext speichern" an. Die Erkennung ist eine reine Kernfunktion (kein `parse()`-Umbau).
// Rot zuerst (CLAUDE.md §5): vor diesem PR gibt es `erkennbaresJahr` nicht.
import { describe, expect, it } from 'vitest'
import { erkennbaresJahr } from '../../src/core/datum/jahr-erkennung'

describe('erkennbaresJahr (U-130-9b-unlesbar)', () => {
  it.each([
    ['am Tag nach Martini 1788', 1788],
    ['1788/89', 1788],
    ['31.02.1788', 1788],
    ['1788', 1788],
    ['getauft 1000', 1000],
    ['2999 (Tippfehler?)', 2999],
    // Erstes PLAUSIBLES Jahr: 0999 und 3000 liegen außerhalb, das folgende zählt.
    ['Nr. 0999, Jahr 1790', 1790],
    ['Seite 3000 von 1791', 1791],
    ['zwischen 1750 oder 1760', 1750],
  ])('„%s" → %i', (text, jahr) => {
    expect(erkennbaresJahr(text)).toBe(jahr)
  })

  it.each([
    'kurz nach dem Krieg',
    '',
    '   ',
    '178',
    // Teil einer längeren Ziffernfolge ist keine Jahreszahl.
    '17881',
    'Register 123456',
    '0999',
    '3000',
  ])('„%s" → kein Jahr', (text) => {
    expect(erkennbaresJahr(text)).toBeUndefined()
  })
})
