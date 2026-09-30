// @vitest-environment jsdom
//
// A-02, AP-1.30 (Folgepunkt U-130-rufname-doppelt, docs/80 §33): Das Neu-Formular im Reiter Namen
// behält den FREITEXT-Rufnamen (eine Koseform wie „Fritz" zu „Friedrich" muss möglich bleiben). Weist
// `name.anlegen` einen mehrwortigen Rufnamen ab, der schon in den Vornamen steht
// (`VALIDIERUNG_RUFNAME_VERDOPPELT`), zeigt das Formular den Fehler mit Titel UND Handlungsanweisung
// am Rufname-Feld (derselbe Fehlerweg wie `reiter-person-hauptname.tsx`: `lebensdatum_fehler` mit
// `.titel`/`.was_tun`) — und behält die Eingaben, statt sie beim Absenden sofort zu leeren.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '../../src/renderer/i18n/einrichten'

// React-19-Schalter für `act(...)` unter Vitest+jsdom (s. `profil-bearbeiten-debounce.test.tsx`).
// `as` erweitert nur den Testprozess-globalThis-Typ um den React-eigenen Schalter.
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const zustand: { fehler: unknown } = { fehler: null }
const nameAnlegenMutate = vi.fn()

vi.mock('../../src/renderer/brücke/befehl-hooks', () => ({
  useNameAnlegen: () => ({ mutate: nameAnlegenMutate, error: zustand.fehler }),
  useNameAendern: () => ({ mutate: vi.fn(), error: null }),
  useNameLoeschen: () => ({ mutate: vi.fn(), error: null }),
}))

import { NamenBearbeitenAbschnitt } from '../../src/renderer/ansichten/profil/profil-bearbeiten-namen'

const CODE = 'VALIDIERUNG_RUFNAME_VERDOPPELT'

describe('Neu-Formular Namen: Rufname-Verdopplung wird angezeigt, nicht still verworfen', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    zustand.fehler = null
    nameAnlegenMutate.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function formular(): HTMLFormElement {
    const knoten = container.querySelector('form')
    if (knoten === null) throw new Error('Neu-Formular fehlt')
    return knoten
  }

  /** Textfelder des Neu-Formulars in Reihenfolge: Vornamen, Nachname, Rufname, Präfix, Titel, Zusatz. */
  function textfeld(position: number): HTMLInputElement {
    const knoten = formular().querySelectorAll('input')[position]
    if (knoten === undefined) throw new Error(`Textfeld ${String(position)} fehlt`)
    return knoten
  }

  function eintippen(ziel: HTMLInputElement, wert: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (setter === undefined) throw new Error('kein nativer value-Setter')
    setter.call(ziel, wert)
    ziel.dispatchEvent(new Event('input', { bubbles: true }))
  }

  it.fails('zeigt Titel und Handlungsanweisung des Fehlers am Rufname-Feld', () => {
    zustand.fehler = { code: CODE, textSchluessel: `${CODE}.titel`, vorgangsId: 'v-1' }
    act(() => root.render(<NamenBearbeitenAbschnitt personId="p-1" namen={[]} />))
    const titel = i18n.t(`fehler:${CODE}.titel`)
    const wasTun = i18n.t(`fehler:${CODE}.was_tun`)
    // Ohne Schlüssel gäbe i18next den Schlüssel selbst zurück — das wäre kein angezeigter Text.
    expect(titel).not.toContain(CODE)
    expect(wasTun).not.toContain(CODE)
    const rufnameFeld = textfeld(2).closest('label')
    expect(rufnameFeld?.textContent).toContain(titel)
    expect(rufnameFeld?.textContent).toContain(wasTun)
  })

  it.fails('leert die Eingaben erst nach erfolgreichem Anlegen, nicht schon beim Absenden', () => {
    act(() => root.render(<NamenBearbeitenAbschnitt personId="p-1" namen={[]} />))
    act(() => eintippen(textfeld(0), 'Hans Peter'))
    act(() => eintippen(textfeld(2), 'Hans Peter'))
    act(() => formular().requestSubmit())
    expect(nameAnlegenMutate).toHaveBeenCalledTimes(1)
    expect(nameAnlegenMutate.mock.calls[0]?.[0]).toMatchObject({ vornamen: 'Hans Peter', rufnameText: 'Hans Peter' })
    // Die Abweisung kommt asynchron zurück — bis dahin (und danach) bleiben die Eingaben stehen.
    expect(textfeld(0).value).toBe('Hans Peter')
    expect(textfeld(2).value).toBe('Hans Peter')
  })

  it('der Freitext-Rufname bleibt: eine Koseform geht unverändert als rufnameText hinaus', () => {
    act(() => root.render(<NamenBearbeitenAbschnitt personId="p-1" namen={[]} />))
    act(() => eintippen(textfeld(0), 'Friedrich'))
    act(() => eintippen(textfeld(2), 'Fritz'))
    act(() => formular().requestSubmit())
    expect(nameAnlegenMutate.mock.calls[0]?.[0]).toMatchObject({ vornamen: 'Friedrich', rufnameText: 'Fritz' })
  })
})
