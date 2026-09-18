// AP-1.11: `Fortschritt` — Atom (docs/71_Designsystem.md §2.1), zwei Varianten: bestimmt ·
// unbestimmt. §1.5/CLAUDE.md §13: „unbestimmt" darf KEINEN Dauerpuls zeigen, der keinen echten
// Fortschritt kennt — dieselbe Sperre wie `Ladeschimmer` (ladeschimmer.css).
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Fortschritt } from '../../src/renderer/bausteine/fortschritt'

describe('Fortschritt (docs/71_Designsystem.md §2.1, AP-1.11)', () => {
  it('bestimmt: role="progressbar" mit aria-valuenow', () => {
    const markup = renderToStaticMarkup(<Fortschritt art="bestimmt" prozent={42} bezeichnung="Import" />)
    expect(markup).toContain('role="progressbar"')
    expect(markup).toContain('aria-valuenow="42"')
    expect(markup).toContain('wz-fortschritt--bestimmt')
  })

  it('bestimmt begrenzt auf 0–100', () => {
    const zuHoch = renderToStaticMarkup(<Fortschritt art="bestimmt" prozent={150} bezeichnung="Import" />)
    expect(zuHoch).toContain('aria-valuenow="100"')
    const zuNiedrig = renderToStaticMarkup(<Fortschritt art="bestimmt" prozent={-10} bezeichnung="Import" />)
    expect(zuNiedrig).toContain('aria-valuenow="0"')
  })

  it('unbestimmt: kein aria-valuenow, eigene Klasse', () => {
    const markup = renderToStaticMarkup(<Fortschritt art="unbestimmt" bezeichnung="Lädt" />)
    expect(markup).toContain('wz-fortschritt--unbestimmt')
    expect(markup).not.toContain('aria-valuenow')
  })

  it('zugänglicher Name kommt vom Aufrufer', () => {
    const markup = renderToStaticMarkup(<Fortschritt art="unbestimmt" bezeichnung="Wird geladen" />)
    expect(markup).toContain('aria-label="Wird geladen"')
  })
})
