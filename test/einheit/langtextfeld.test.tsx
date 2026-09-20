// AP-1.13 PR-A: `Langtextfeld` — Molekül (docs/71_Designsystem.md §2.2): „Eingabekörper", wächst
// mit, Höhenbegrenzung. Eigenes `<textarea>` (kein `Eingabekoerper`, der nur `<input>` kennt),
// wiederverwendet aber dessen visuelle Klasse `.wz-eingabekoerper` (Rahmen/Radius/Zustände).
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Langtextfeld } from '../../src/renderer/bausteine/langtextfeld'

describe('Langtextfeld (docs/71_Designsystem.md §2.2, AP-1.13 PR-A)', () => {
  it('rendert ein natives <textarea> (Tastatur nativ erreichbar)', () => {
    const markup = renderToStaticMarkup(<Langtextfeld wert="" aufAenderung={() => {}} />)
    expect(markup).toContain('<textarea')
  })

  it('gibt den Wert unverändert wieder', () => {
    const markup = renderToStaticMarkup(<Langtextfeld wert="Schreinermeister, drei Kinder" aufAenderung={() => {}} />)
    expect(markup).toContain('Schreinermeister, drei Kinder')
  })

  it('teilt sich die Rahmen-/Radius-Klasse mit Eingabekoerper', () => {
    const markup = renderToStaticMarkup(<Langtextfeld wert="" aufAenderung={() => {}} />)
    expect(markup).toContain('wz-eingabekoerper')
  })

  it('gesperrt: disabled', () => {
    const markup = renderToStaticMarkup(<Langtextfeld wert="" aufAenderung={() => {}} gesperrt />)
    expect(markup).toContain('disabled=""')
  })

  it('ungültig: aria-invalid="true"', () => {
    const markup = renderToStaticMarkup(<Langtextfeld wert="" aufAenderung={() => {}} ungueltig />)
    expect(markup).toContain('aria-invalid="true"')
  })

  it('Zeilenzahl ist konfigurierbar (Vorgabe 3)', () => {
    const vorgabe = renderToStaticMarkup(<Langtextfeld wert="" aufAenderung={() => {}} />)
    expect(vorgabe).toContain('rows="3"')
    const eigen = renderToStaticMarkup(<Langtextfeld wert="" aufAenderung={() => {}} zeilen={6} />)
    expect(eigen).toContain('rows="6"')
  })
})
