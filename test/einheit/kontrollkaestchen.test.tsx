// AP-1.11: `Kontrollkaestchen` — Atom (docs/71_Designsystem.md §2.1), vier Zustände wie
// `Umschalter`: ein · aus · unbestimmt · gesperrt.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Kontrollkaestchen } from '../../src/renderer/bausteine/kontrollkaestchen'

describe('Kontrollkaestchen (docs/71_Designsystem.md §2.1, AP-1.11)', () => {
  it('zustand "ein": aria-checked="true"', () => {
    const markup = renderToStaticMarkup(<Kontrollkaestchen zustand="ein" bezeichnung="Test" aufAenderung={() => {}} />)
    expect(markup).toContain('role="checkbox"')
    expect(markup).toContain('aria-checked="true"')
  })

  it('zustand "aus": aria-checked="false"', () => {
    const markup = renderToStaticMarkup(<Kontrollkaestchen zustand="aus" bezeichnung="Test" aufAenderung={() => {}} />)
    expect(markup).toContain('aria-checked="false"')
  })

  it('zustand "unbestimmt": aria-checked="mixed"', () => {
    const markup = renderToStaticMarkup(<Kontrollkaestchen zustand="unbestimmt" bezeichnung="Test" aufAenderung={() => {}} />)
    expect(markup).toContain('aria-checked="mixed"')
  })

  it('gesperrt: disabled', () => {
    const markup = renderToStaticMarkup(<Kontrollkaestchen zustand="aus" bezeichnung="Test" gesperrt aufAenderung={() => {}} />)
    expect(markup).toContain('disabled=""')
  })

  it('zugänglicher Name kommt vom Aufrufer (aria-label)', () => {
    const markup = renderToStaticMarkup(<Kontrollkaestchen zustand="aus" bezeichnung="Platzhalter anzeigen" aufAenderung={() => {}} />)
    expect(markup).toContain('aria-label="Platzhalter anzeigen"')
  })
})
