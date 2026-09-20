// AP-1.13 PR-A: `Zahlfeld` — Molekül (docs/71_Designsystem.md §2.2): „Eingabekörper", Ziffern
// gleicher Breite (`--wz-ziffern-tabelle: tabular-nums`, tokens.css §1.3).
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Zahlfeld } from '../../src/renderer/bausteine/zahlfeld'

describe('Zahlfeld (docs/71_Designsystem.md §2.2, AP-1.13 PR-A)', () => {
  it('rendert ein natives <input type="number">', () => {
    const markup = renderToStaticMarkup(<Zahlfeld wert="" aufAenderung={() => {}} />)
    expect(markup).toContain('<input')
    expect(markup).toContain('type="number"')
  })

  it('trägt die Modifikatorklasse für Ziffern gleicher Breite', () => {
    const markup = renderToStaticMarkup(<Zahlfeld wert="1890" aufAenderung={() => {}} />)
    expect(markup).toContain('wz-zahlfeld')
  })

  it('gesperrt: disabled', () => {
    const markup = renderToStaticMarkup(<Zahlfeld wert="" aufAenderung={() => {}} gesperrt />)
    expect(markup).toContain('disabled=""')
  })

  it('ungültig: aria-invalid="true"', () => {
    const markup = renderToStaticMarkup(<Zahlfeld wert="" aufAenderung={() => {}} ungueltig />)
    expect(markup).toContain('aria-invalid="true"')
  })
})
