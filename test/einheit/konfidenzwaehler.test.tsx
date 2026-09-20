// AP-1.13 PR-A: `Konfidenzwaehler` — Molekül (docs/71_Designsystem.md §2.2/§3.4): vier
// `KonfidenzPunkt` als Gruppe, ordinal, KEIN Auswahlfeld. Kein Vorgabewert (`wert: null` möglich).
// Bedeutung nie allein über Farbe (§1.2 Regel 4) — hier über `aria-checked` (Zustand) UND die
// Beschriftung von `KonfidenzPunkt` selbst (Reihenfolge + Label), nicht nur die Punktfarbe.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Konfidenzwaehler } from '../../src/renderer/bausteine/konfidenzwaehler'

describe('Konfidenzwaehler (docs/71_Designsystem.md §2.2/§3.4, AP-1.13 PR-A)', () => {
  it('rendert eine Gruppe aus vier nativen <button role="radio">', () => {
    const markup = renderToStaticMarkup(<Konfidenzwaehler wert={null} aufAenderung={() => {}} ariaLabel="Konfidenz" />)
    expect(markup).toContain('role="radiogroup"')
    expect((markup.match(/role="radio"/g) ?? []).length).toBe(4)
    expect((markup.match(/<button/g) ?? []).length).toBe(4)
  })

  it('kein Vorgabewert: keine Stufe ist aria-checked="true"', () => {
    const markup = renderToStaticMarkup(<Konfidenzwaehler wert={null} aufAenderung={() => {}} ariaLabel="Konfidenz" />)
    expect(markup).not.toContain('aria-checked="true"')
  })

  it('gewählte Stufe trägt aria-checked="true", die anderen "false"', () => {
    const markup = renderToStaticMarkup(<Konfidenzwaehler wert={3} aufAenderung={() => {}} ariaLabel="Konfidenz" />)
    expect((markup.match(/aria-checked="true"/g) ?? []).length).toBe(1)
    expect((markup.match(/aria-checked="false"/g) ?? []).length).toBe(3)
  })

  it('gesperrt: alle vier Stufen disabled', () => {
    const markup = renderToStaticMarkup(<Konfidenzwaehler wert={null} aufAenderung={() => {}} ariaLabel="Konfidenz" gesperrt />)
    expect((markup.match(/disabled=""/g) ?? []).length).toBe(4)
  })

  it('jede Stufe trägt ihre eigene, aus KonfidenzPunkt geerbte Beschriftung (zweite Kodierung neben Farbe)', () => {
    // Ohne i18next-Provider (renderToStaticMarkup, wie in symbol.test.tsx/kontrollkaestchen.test.tsx)
    // liefert `t()` den rohen Schlüssel zurück — genug, um zu belegen, dass JEDE Stufe eine EIGENE,
    // von den anderen verschiedene Beschriftung trägt (KonfidenzPunkt: konfidenz-punkt.tsx).
    const markup = renderToStaticMarkup(<Konfidenzwaehler wert={null} aufAenderung={() => {}} ariaLabel="Konfidenz" />)
    expect(markup).toContain('konfidenz_1')
    expect(markup).toContain('konfidenz_2')
    expect(markup).toContain('konfidenz_3')
    expect(markup).toContain('konfidenz_4')
  })

  it('Trefferfläche ≥32×32: jede Stufe trägt die Trefferflächen-Klasse', () => {
    const markup = renderToStaticMarkup(<Konfidenzwaehler wert={null} aufAenderung={() => {}} ariaLabel="Konfidenz" />)
    expect((markup.match(/wz-konfidenzwaehler__stufe/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })
})
