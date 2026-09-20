// AP-1.13 PR-A: `Vorschlagskarte` — Molekül (docs/71_Designsystem.md §2.2/§3.5, Grundlage für
// AP-1.21/Interview-Modus, 70_UX §12): drei Zustände Vorschlag/bestätigt/verworfen. Bestätigen mit
// EINER Taste, ohne Maus, ohne Dialog — hier über einen nativen <button> (Enter/Space aktiviert
// ihn ohne weitere Rückfrage, kein Modal).
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Vorschlagskarte } from '../../src/renderer/bausteine/vorschlagskarte'

describe('Vorschlagskarte (docs/71_Designsystem.md §2.2/§3.5, AP-1.13 PR-A)', () => {
  it('zustand "vorschlag": zeigt Inhalt, Originalwortlaut UND zwei native Aktionsknöpfe', () => {
    const markup = renderToStaticMarkup(
      <Vorschlagskarte zustand="vorschlag" originalwortlaut="Karl wurde 1890 in Marienwerder geboren." aufBestaetigen={() => {}} aufVerwerfen={() => {}}>
        <span data-testid="inhalt">Geburt: 1890, Marienwerder</span>
      </Vorschlagskarte>,
    )
    expect(markup).toContain('data-testid="inhalt"')
    expect(markup).toContain('Karl wurde 1890 in Marienwerder geboren.')
    expect((markup.match(/<button/g) ?? []).length).toBe(2)
    expect(markup).toContain('wz-vorschlagskarte--vorschlag')
  })

  it('Originalwortlaut trägt die Rolle "original" (--wz-familie-original)', () => {
    const markup = renderToStaticMarkup(
      <Vorschlagskarte zustand="vorschlag" originalwortlaut="Originaltext" aufBestaetigen={() => {}} aufVerwerfen={() => {}}>
        <span />
      </Vorschlagskarte>,
    )
    expect(markup).toContain('wz-text--original')
  })

  it('zustand "bestaetigt": zeigt Inhalt und Originalwortlaut, KEINE Aktionsknöpfe mehr', () => {
    const markup = renderToStaticMarkup(
      <Vorschlagskarte zustand="bestaetigt" originalwortlaut="Karl wurde 1890 geboren.">
        <span data-testid="inhalt">Geburt: 1890</span>
      </Vorschlagskarte>,
    )
    expect(markup).toContain('data-testid="inhalt"')
    expect(markup).not.toContain('<button')
    expect(markup).toContain('wz-vorschlagskarte--bestaetigt')
  })

  it('zustand "verworfen": ausgeblendet (kompakt), aber mit einem "wiederherstellen"-Knopf', () => {
    const markup = renderToStaticMarkup(
      <Vorschlagskarte zustand="verworfen" originalwortlaut="Karl wurde 1890 geboren." aufWiederherstellen={() => {}}>
        <span data-testid="inhalt">Geburt: 1890</span>
      </Vorschlagskarte>,
    )
    expect(markup).not.toContain('data-testid="inhalt"')
    expect(markup).toContain('<button')
    expect(markup).toContain('wz-vorschlagskarte--verworfen')
  })

  it('vorschlag/bestaetigt/verworfen sind über ihre Modifikatorklasse klar unterscheidbar (nicht nur eine Nuance, §3.5)', () => {
    const vorschlag = renderToStaticMarkup(
      <Vorschlagskarte zustand="vorschlag" originalwortlaut="x" aufBestaetigen={() => {}} aufVerwerfen={() => {}}>
        <span />
      </Vorschlagskarte>,
    )
    const bestaetigt = renderToStaticMarkup(
      <Vorschlagskarte zustand="bestaetigt" originalwortlaut="x">
        <span />
      </Vorschlagskarte>,
    )
    const verworfen = renderToStaticMarkup(
      <Vorschlagskarte zustand="verworfen" originalwortlaut="x" aufWiederherstellen={() => {}}>
        <span />
      </Vorschlagskarte>,
    )
    expect(vorschlag).not.toBe(bestaetigt)
    expect(bestaetigt).not.toBe(verworfen)
    expect(vorschlag).not.toBe(verworfen)
  })
})
