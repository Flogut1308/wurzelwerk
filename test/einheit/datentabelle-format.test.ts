// AP-1.6 Stufe 3 (C-16), CLAUDE.md §5 eiserne Regel: erst der Test.
import { describe, expect, it } from 'vitest'
import { lebensdatenAnzeige } from '../../src/renderer/bausteine/datentabelle-format'

describe('lebensdatenAnzeige (src/renderer/bausteine/datentabelle-format.ts, AP-1.6)', () => {
  it('beide Jahre bekannt: "Geburt–Tod"', () => {
    expect(lebensdatenAnzeige(1890, 1961)).toBe('1890–1961')
  })

  it('nur Geburtsjahr bekannt: offenes Ende', () => {
    expect(lebensdatenAnzeige(1890, null)).toBe('1890–')
  })

  it('nur Todesjahr bekannt: offener Anfang', () => {
    expect(lebensdatenAnzeige(null, 1961)).toBe('–1961')
  })

  it('beide Jahre unbekannt: leerer Text statt "–" (Platz bleibt frei, 72 §S-26)', () => {
    expect(lebensdatenAnzeige(null, null)).toBe('')
  })
})
