// AP-1.11: `Optionsfeld` — Atom (docs/71_Designsystem.md §2.1), vier Zustände wie `Umschalter`.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Optionsfeld } from '../../src/renderer/bausteine/optionsfeld'

describe('Optionsfeld (docs/71_Designsystem.md §2.1, AP-1.11)', () => {
  it('zustand "ein": role="radio", aria-checked="true"', () => {
    const markup = renderToStaticMarkup(<Optionsfeld zustand="ein" bezeichnung="Test" aufAenderung={() => {}} />)
    expect(markup).toContain('role="radio"')
    expect(markup).toContain('aria-checked="true"')
  })

  it('zustand "aus": aria-checked="false"', () => {
    const markup = renderToStaticMarkup(<Optionsfeld zustand="aus" bezeichnung="Test" aufAenderung={() => {}} />)
    expect(markup).toContain('aria-checked="false"')
  })

  it('zustand "unbestimmt": aria-checked="mixed"', () => {
    const markup = renderToStaticMarkup(<Optionsfeld zustand="unbestimmt" bezeichnung="Test" aufAenderung={() => {}} />)
    expect(markup).toContain('aria-checked="mixed"')
  })

  it('gesperrt: disabled', () => {
    const markup = renderToStaticMarkup(<Optionsfeld zustand="aus" bezeichnung="Test" gesperrt aufAenderung={() => {}} />)
    expect(markup).toContain('disabled=""')
  })
})
