// @vitest-environment jsdom
//
// AP-1.30 PR 9b: `Datumsfeld` und `Ortsfeld` melden das Verlassen des Eingabefelds (`aufVerlassen`,
// wie `Textfeld`/`Langtextfeld` seit PR 4) — der Reiter „Person" schreibt beim Blur sofort bzw.
// stellt den gespeicherten Ort wieder her. Ein Klick auf einen Ortsvorschlag darf KEIN Verlassen
// auslösen (sonst setzte der Aufrufer den Text zurück, bevor die Auswahl ankommt).
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Datumsfeld } from '../../src/renderer/bausteine/datumsfeld'
import { Ortsfeld } from '../../src/renderer/bausteine/ortsfeld'

// React-19-Schalter für `act(...)` unter Vitest+jsdom (s. `profil-bearbeiten-debounce.test.tsx`).
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('Datumsfeld/Ortsfeld: aufVerlassen (AP-1.30 PR 9b)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function eingabe(): HTMLInputElement {
    const knoten = container.querySelector('input')
    if (knoten === null) throw new Error('Eingabe fehlt')
    return knoten
  }

  it('Datumsfeld: Blur ruft aufVerlassen', () => {
    const aufVerlassen = vi.fn()
    act(() =>
      root.render(
        <Datumsfeld
          text="1901"
          aufAenderung={() => undefined}
          kalender="gregorian"
          aufKalenderAenderung={() => undefined}
          kalenderErweitert={false}
          aufKalenderErweitertAenderung={() => undefined}
          aufVerlassen={aufVerlassen}
        />,
      ),
    )
    act(() => eingabe().focus())
    expect(aufVerlassen).not.toHaveBeenCalled()
    act(() => eingabe().blur())
    expect(aufVerlassen).toHaveBeenCalledTimes(1)
  })

  it('Ortsfeld: Blur ruft aufVerlassen, ein Klick auf einen Vorschlag nicht', () => {
    const aufVerlassen = vi.fn()
    const aufAusgewaehlt = vi.fn()
    act(() =>
      root.render(
        <Ortsfeld
          text="Danz"
          aufAenderung={() => undefined}
          zustand="bereit"
          treffer={[{ id: 'o-1', anzeigename: 'Danzig', politischeKette: [] }]}
          hervorgehobenerIndex={null}
          aufAusgewaehlt={aufAusgewaehlt}
          aufNeuAnlegen={() => undefined}
          aufVerlassen={aufVerlassen}
        />,
      ),
    )
    act(() => eingabe().focus())
    const vorschlag = container.querySelector('[role="option"]')
    if (vorschlag === null) throw new Error('Vorschlag fehlt')
    act(() => {
      vorschlag.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    })
    expect(aufAusgewaehlt).toHaveBeenCalledWith('o-1')
    expect(document.activeElement).toBe(eingabe())
    expect(aufVerlassen).not.toHaveBeenCalled()
    act(() => eingabe().blur())
    expect(aufVerlassen).toHaveBeenCalledTimes(1)
  })
})
