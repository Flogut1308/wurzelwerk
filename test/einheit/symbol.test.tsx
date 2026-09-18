// AP-1.11: `Symbol` — Atom (docs/71_Designsystem.md §2.1). `renderToStaticMarkup` (react-dom/server,
// vorhandene Abhängigkeit) statt einer neuen Testbibliothek — vitest läuft mit `environment: 'node'`
// (vitest.config.ts), eine echte DOM-Testbibliothek (jsdom/@testing-library) bräuchte eine neue
// Abhängigkeit, die der Auftrag ausdrücklich ausschließt.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Symbol } from '../../src/renderer/bausteine/symbol'
import { ALLE_SYMBOLE } from '../../src/renderer/gestaltung/symbole/namen'

describe('Symbol (docs/71_Designsystem.md §2.1, AP-1.11)', () => {
  it('ist ohne "titel" dekorativ: aria-hidden, kein role="img"', () => {
    const markup = renderToStaticMarkup(<Symbol name="geburt" />)
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).not.toContain('role="img"')
  })

  it('ist mit "titel" bedeutungstragend: role="img" + aria-label, kein aria-hidden', () => {
    const markup = renderToStaticMarkup(<Symbol name="geburt" titel="Geburt" />)
    expect(markup).toContain('role="img"')
    expect(markup).toContain('aria-label="Geburt"')
    expect(markup).not.toContain('aria-hidden')
  })

  it('rendert echtes inline-SVG aus der Registry (kein <img src=…>)', () => {
    const markup = renderToStaticMarkup(<Symbol name="geburt" />)
    expect(markup).toContain('<svg')
    expect(markup).not.toContain('<img')
  })

  it('Standardgröße ist 20', () => {
    const markup = renderToStaticMarkup(<Symbol name="geburt" />)
    expect(markup).toContain('wz-symbol--20')
  })

  it('eine andere Größe ändert die Größenklasse', () => {
    const markup = renderToStaticMarkup(<Symbol name="geburt" groesse={16} />)
    expect(markup).toContain('wz-symbol--16')
  })

  it('Regular- und Fill-Gewicht liefern unterschiedliches Markup für dasselbe Symbol', () => {
    const regulaer = renderToStaticMarkup(<Symbol name="geburt" gewicht="regular" />)
    const gefuellt = renderToStaticMarkup(<Symbol name="geburt" gewicht="fill" />)
    expect(regulaer).not.toBe(gefuellt)
  })

  it('jeder Symbolname aus ALLE_SYMBOLE lässt sich rendern, ohne zu werfen', () => {
    for (const name of ALLE_SYMBOLE) {
      expect(() => renderToStaticMarkup(<Symbol name={name} />)).not.toThrow()
    }
  })
})
