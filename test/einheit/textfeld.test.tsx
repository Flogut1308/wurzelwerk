// AP-1.13 PR-A: `Textfeld` — Molekül (docs/71_Designsystem.md §2.2): „Eingabekörper", einzeilig.
// Dünner Wrapper um `Eingabekoerper` (typ fest "text") — dieselben Zustände wie das Atom.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Textfeld } from '../../src/renderer/bausteine/textfeld'

describe('Textfeld (docs/71_Designsystem.md §2.2, AP-1.13 PR-A)', () => {
  it('rendert ein natives <input type="text"> (Tastatur nativ erreichbar)', () => {
    const markup = renderToStaticMarkup(<Textfeld wert="" aufAenderung={() => {}} />)
    expect(markup).toContain('<input')
    expect(markup).toContain('type="text"')
  })

  it('gibt den Wert unverändert wieder', () => {
    const markup = renderToStaticMarkup(<Textfeld wert="Karl Friedrich Gutnoff" aufAenderung={() => {}} />)
    expect(markup).toContain('value="Karl Friedrich Gutnoff"')
  })

  it('gesperrt: disabled', () => {
    const markup = renderToStaticMarkup(<Textfeld wert="" aufAenderung={() => {}} gesperrt />)
    expect(markup).toContain('disabled=""')
  })

  it('ungültig: aria-invalid="true"', () => {
    const markup = renderToStaticMarkup(<Textfeld wert="" aufAenderung={() => {}} ungueltig />)
    expect(markup).toContain('aria-invalid="true"')
  })

  it('Trefferfläche ≥32×32: min-height sitzt auf .wz-eingabekoerper (geerbt vom Atom)', () => {
    const markup = renderToStaticMarkup(<Textfeld wert="" aufAenderung={() => {}} />)
    expect(markup).toContain('wz-eingabekoerper')
  })
})
