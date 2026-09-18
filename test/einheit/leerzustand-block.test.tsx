// AP-1.11 (72_Screens_und_Flows.md S-19 „Symbol + Satz + Aktion"): `LeerzustandBlock` bekommt sein
// Symbol — Nachzug zur AP-1.6-Abweichung (docs/80_Offene_Fragen.md U-1.6-leerzustand-ohne-symbol).
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LeerzustandBlock } from '../../src/renderer/bausteine/leerzustand-block'

describe('LeerzustandBlock — Symbol (S-19, AP-1.11)', () => {
  it('ohne "symbol" bleibt der Block wie bisher, ohne <svg>', () => {
    const markup = renderToStaticMarkup(<LeerzustandBlock titel="Titel" />)
    expect(markup).not.toContain('<svg')
  })

  it('mit "symbol" rendert der Block das angegebene Symbol dekorativ', () => {
    const markup = renderToStaticMarkup(<LeerzustandBlock titel="Titel" symbol="tray" />)
    expect(markup).toContain('<svg')
    expect(markup).toContain('aria-hidden="true"')
  })
})
