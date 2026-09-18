// AP-1.11: `TastenKappe` — Atom (docs/71_Designsystem.md §2.1), zeigt `⌘K` bzw. `Ctrl+K`
// plattformabhängig. CLAUDE.md §11: die Cmd/Ctrl-Konvention lebt NUR in
// `src/main/menue/tastenkuerzel.ts` — der Renderer darf sie nicht selbst ermitteln (kein
// `metaKey`/`navigator.platform` hier). `TastenKappe` bleibt deshalb rein präsentational: sie
// rendert genau die Segmente, die ihr der Aufrufer bereits plattformgerecht aufgelöst übergibt.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TastenKappe } from '../../src/renderer/bausteine/tastenkappe'

describe('TastenKappe (docs/71_Designsystem.md §2.1, AP-1.11)', () => {
  it('rendert jedes übergebene Segment als eigene Taste', () => {
    const markup = renderToStaticMarkup(<TastenKappe segmente={['⌘', 'K']} />)
    expect(markup).toContain('<kbd')
    expect(markup).toContain('⌘')
    expect(markup).toContain('K')
    expect((markup.match(/<kbd/g) ?? []).length).toBe(2)
  })

  it('ist dekorativ (aria-hidden) — der zugängliche Name kommt vom umgebenden Bedienelement', () => {
    const markup = renderToStaticMarkup(<TastenKappe segmente={['Ctrl', 'K']} />)
    expect(markup).toContain('aria-hidden="true"')
  })

  it('erfindet selbst keine Plattformunterscheidung — Segmente bleiben, wie übergeben', () => {
    const macMarkup = renderToStaticMarkup(<TastenKappe segmente={['⌘', 'K']} />)
    const winMarkup = renderToStaticMarkup(<TastenKappe segmente={['Ctrl', 'K']} />)
    expect(macMarkup).not.toBe(winMarkup)
  })
})
