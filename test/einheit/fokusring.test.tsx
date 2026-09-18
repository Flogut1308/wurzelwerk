// AP-1.11: `Fokusring` — Atom (docs/71_Designsystem.md §2.1). Demonstriert in der
// Zustandsbibliothek denselben visuellen Ring, den `basis.css` global über `:focus-visible`
// erzeugt (§5) — ein rein dekoratives Anschauungsstück, kein zweiter Fokus-Mechanismus.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Fokusring } from '../../src/renderer/bausteine/fokusring'

describe('Fokusring (docs/71_Designsystem.md §2.1, AP-1.11)', () => {
  it('rendert ein dekoratives Anschauungsstück mit der Fokusring-Klasse', () => {
    const markup = renderToStaticMarkup(<Fokusring />)
    expect(markup).toContain('wz-fokusring')
    expect(markup).toContain('aria-hidden="true"')
  })
})
