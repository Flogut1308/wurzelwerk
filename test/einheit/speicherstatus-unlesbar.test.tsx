// AP-1.30 U-130-9b-unlesbar (docs/80 §33 V-130-unlesbar, Entscheidung B): vierter Zustand des
// `Speicherstatus` — „Nicht gespeichert — Datum nicht lesbar". Fehlerdarstellung, dieselbe
// höfliche Statusregion wie die anderen Zustände, ohne Aktion (behoben wird am Feld).
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import '../../src/renderer/i18n/einrichten'
import { Speicherstatus } from '../../src/renderer/bausteine/speicherstatus'

describe('Speicherstatus „unlesbar" (U-130-9b-unlesbar)', () => {
  const html = renderToStaticMarkup(<Speicherstatus zustand="unlesbar" />)

  it('zeigt den eigenen Text in der Fehlerdarstellung', () => {
    expect(html).toContain('Nicht gespeichert — Datum nicht lesbar')
    expect(html).toContain('wz-speicherstatus--fehler')
  })

  it('in der Statusregion (role=status, aria-live=polite), ohne Knopf', () => {
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
    expect(html).not.toContain('<button')
  })
})
