// AP-1.11: `Zaehler` — Atom (docs/71_Designsystem.md §2.1), zeigt eine Anzahl.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Zaehler } from '../../src/renderer/bausteine/zaehler'

describe('Zaehler (docs/71_Designsystem.md §2.1, AP-1.11)', () => {
  it('zeigt die übergebene Anzahl', () => {
    const markup = renderToStaticMarkup(<Zaehler anzahl={1284} />)
    expect(markup).toContain('1284')
  })

  it('zeigt auch 0 (kein Weglassen bei leerer Menge)', () => {
    const markup = renderToStaticMarkup(<Zaehler anzahl={0} />)
    expect(markup).toContain('>0<')
  })
})
