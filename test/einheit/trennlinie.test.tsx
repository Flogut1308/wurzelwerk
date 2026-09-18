// AP-1.11: `Trennlinie` — Atom (docs/71_Designsystem.md §2.1), zwei Ausrichtungen: waagerecht ·
// senkrecht. `role="separator"` statt `<hr>` (das native `<hr>` ist immer horizontal).
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Trennlinie } from '../../src/renderer/bausteine/trennlinie'

describe('Trennlinie (docs/71_Designsystem.md §2.1, AP-1.11)', () => {
  it('Vorgabe ist waagerecht, mit passendem aria-orientation', () => {
    const markup = renderToStaticMarkup(<Trennlinie />)
    expect(markup).toContain('role="separator"')
    expect(markup).toContain('wz-trennlinie--waagerecht')
    expect(markup).toContain('aria-orientation="horizontal"')
  })

  it('senkrecht setzt die passende Klasse und aria-orientation', () => {
    const markup = renderToStaticMarkup(<Trennlinie ausrichtung="senkrecht" />)
    expect(markup).toContain('wz-trennlinie--senkrecht')
    expect(markup).toContain('aria-orientation="vertical"')
  })
})
