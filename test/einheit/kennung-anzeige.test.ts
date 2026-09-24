// AP-1.34 PR-C1b (§31 U-1.34-E1/E13): Anzeige der Personen-Kennung. `person.kennung` ist ein
// INTEGER ≥ 1 oder NULL (docs/schema/0007_kennung_textanker.sql); die Anzeige „P-0142" entsteht
// ausschließlich im Kern (src/core/person/kennung.ts).
import { describe, expect, it } from 'vitest'
import { kennungAnzeige } from '../../src/core/person/kennung'

describe('kennungAnzeige (AP-1.34, E1/E13)', () => {
  it('füllt auf vier Stellen auf', () => {
    expect(kennungAnzeige(1)).toBe('P-0001')
    expect(kennungAnzeige(42)).toBe('P-0042')
    expect(kennungAnzeige(142)).toBe('P-0142')
    expect(kennungAnzeige(9999)).toBe('P-9999')
  })

  it('wird ab 10000 länger, ohne abzuschneiden', () => {
    expect(kennungAnzeige(10000)).toBe('P-10000')
    expect(kennungAnzeige(123456)).toBe('P-123456')
  })

  it('zeigt „–" für eine Person ohne Kennung (NULL, E13)', () => {
    expect(kennungAnzeige(null)).toBe('–')
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'wirft bei der ungültigen Kennung %s (die DB erlaubt nur Ganzzahlen ≥ 1)',
    (ungueltig) => {
      expect(() => kennungAnzeige(ungueltig)).toThrow(RangeError)
    },
  )
})
