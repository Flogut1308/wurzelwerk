// AP-1.11: `Abzeichen` — Atom (docs/71_Designsystem.md §2.1), fünf Varianten: neutral · info ·
// erfolg · warnung · fehler.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Abzeichen, type AbzeichenVariante } from '../../src/renderer/bausteine/abzeichen'

describe('Abzeichen (docs/71_Designsystem.md §2.1, AP-1.11)', () => {
  it('Vorgabevariante ist neutral', () => {
    const markup = renderToStaticMarkup(<Abzeichen>Text</Abzeichen>)
    expect(markup).toContain('wz-abzeichen--neutral')
  })

  it.each<AbzeichenVariante>(['neutral', 'info', 'erfolg', 'warnung', 'fehler'])('trägt die Klasse für Variante "%s"', (variante) => {
    const markup = renderToStaticMarkup(<Abzeichen variante={variante}>Text</Abzeichen>)
    expect(markup).toContain(`wz-abzeichen--${variante}`)
  })

  it('gibt den übergebenen Inhalt unverändert wieder (Text kommt vom Aufrufer, ADR-011)', () => {
    const markup = renderToStaticMarkup(<Abzeichen variante="info">Beispieltext</Abzeichen>)
    expect(markup).toContain('Beispieltext')
  })
})
