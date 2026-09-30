// @vitest-environment jsdom
//
// A-02, AP-1.30 (hueter #184 P2): Auch eine BESTEHENDE Namenszeile im Reiter Namen (`NamenFelder`,
// Autosave über `name.aendern`) kann `VALIDIERUNG_RUFNAME_VERDOPPELT` auslösen — z. B. die Altform
// „Hans Peter Hans Peter" (Rufname „Hans Peter") mit vorn ergänztem „Karl". Der Fehler muss mit Titel
// UND Handlungsanweisung an der Zeile stehen (Rufname-Feld, `Formularfeld`-Metazeile mit
// `aria-live`), nicht nur als allgemeiner Speicherstatus.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '../../src/renderer/i18n/einrichten'
import type { PersonDetailName } from '../../src/shared/schemata/person-detail'

// React-19-Schalter für `act(...)` unter Vitest+jsdom (s. `profil-bearbeiten-debounce.test.tsx`).
// `as` erweitert nur den Testprozess-globalThis-Typ um den React-eigenen Schalter.
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const zustand: { aendernFehler: unknown } = { aendernFehler: null }

vi.mock('../../src/renderer/brücke/befehl-hooks', () => ({
  useNameAnlegen: () => ({ mutate: vi.fn(), error: null }),
  useNameAendern: () => ({ mutate: vi.fn(), error: zustand.aendernFehler }),
  useNameLoeschen: () => ({ mutate: vi.fn(), error: null }),
}))

import { NamenBearbeitenAbschnitt } from '../../src/renderer/ansichten/profil/profil-bearbeiten-namen'

const CODE = 'VALIDIERUNG_RUFNAME_VERDOPPELT'

const ALTFORM: PersonDetailName = {
  id: 'name-1',
  ist_bevorzugt: true,
  typ: 'geburtsname',
  schrift: null,
  vornamen: 'Hans Peter Hans Peter',
  nachname: 'Gutnow',
  praefix: null,
  titel_vor: null,
  zusatz_nach: null,
  vatersname: null,
  rufname_text: 'Hans Peter',
  rufname_index: 2,
  umschrift_von: null,
  umschrift_norm: null,
  sprache: null,
  gueltig_von: null,
  gueltig_bis: null,
  original_text: 'Hans Peter Gutnow',
}

describe('Bestehende Namenszeile: Rufname-Verdopplung wird an der Zeile angezeigt (hueter #184 P2)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    zustand.aendernFehler = null
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function zeile(): HTMLElement {
    const knoten = container.querySelector('.wz-profil-bearbeiten-namen__zeile')
    if (!(knoten instanceof HTMLElement)) throw new Error('Namenszeile fehlt')
    return knoten
  }

  /** Auswahlfelder der Zeile in Reihenfolge: Typ, Schrift, Rufname. */
  function rufnameFeld(): HTMLLabelElement {
    const auswahl = zeile().querySelectorAll('select')[2]
    const feld = auswahl?.closest('label')
    if (!(feld instanceof HTMLLabelElement)) throw new Error('Rufname-Feld fehlt')
    return feld
  }

  it('zeigt Titel und Handlungsanweisung am Rufname-Feld der Zeile, in der aria-live-Metazeile', () => {
    zustand.aendernFehler = { code: CODE, textSchluessel: `${CODE}.titel`, vorgangsId: 'v-1' }
    act(() => root.render(<NamenBearbeitenAbschnitt personId="p-1" namen={[ALTFORM]} />))
    const titel = i18n.t(`fehler:${CODE}.titel`)
    const wasTun = i18n.t(`fehler:${CODE}.was_tun`)
    const meta = rufnameFeld().querySelector('[aria-live="polite"]')
    expect(meta?.textContent).toContain(titel)
    expect(meta?.textContent).toContain(wasTun)
  })

  it('ohne Fehler steht am Rufname-Feld der Zeile keine Meldung', () => {
    act(() => root.render(<NamenBearbeitenAbschnitt personId="p-1" namen={[ALTFORM]} />))
    expect(rufnameFeld().querySelector('[aria-live="polite"]')?.textContent).toBe('')
  })
})
