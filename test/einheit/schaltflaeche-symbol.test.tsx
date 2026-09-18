// AP-1.11: `SchaltflaecheSymbol` — Atom (docs/71_Designsystem.md §2.1), dieselben vier Varianten
// und sechs Zustände wie `Schaltflaeche`, genau ein `Symbol`, zugänglicher Name vom Aufrufer.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SchaltflaecheSymbol } from '../../src/renderer/bausteine/schaltflaeche-symbol'
import type { SchaltflaecheVariante } from '../../src/renderer/bausteine/schaltflaeche'

describe('SchaltflaecheSymbol (docs/71_Designsystem.md §2.1, AP-1.11)', () => {
  it('rendert genau ein Symbol, dekorativ (Knopf trägt den zugänglichen Namen)', () => {
    const markup = renderToStaticMarkup(<SchaltflaecheSymbol name="funnel" beschriftung="Filter" />)
    expect((markup.match(/<svg/g) ?? []).length).toBe(1)
    expect(markup).toContain('aria-label="Filter"')
    expect(markup).toContain('<button')
  })

  it.each<SchaltflaecheVariante>(['primaer', 'sekundaer', 'unauffaellig', 'gefaehrlich'])('trägt die Variantenklasse "%s"', (variante) => {
    const markup = renderToStaticMarkup(<SchaltflaecheSymbol name="funnel" beschriftung="Filter" variante={variante} />)
    expect(markup).toContain(`wz-schaltflaeche--${variante}`)
  })

  it('gesperrt: disabled', () => {
    const markup = renderToStaticMarkup(<SchaltflaecheSymbol name="funnel" beschriftung="Filter" gesperrt />)
    expect(markup).toContain('disabled=""')
  })

  it('ladend: aria-busy', () => {
    const markup = renderToStaticMarkup(<SchaltflaecheSymbol name="funnel" beschriftung="Filter" ladend />)
    expect(markup).toContain('aria-busy="true"')
  })
})
