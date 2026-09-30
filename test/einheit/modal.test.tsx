// @vitest-environment jsdom
//
// AP-1.30 PR 11a (C-26; docs/71_Designsystem.md §2.3 „Modal: Titel, Inhalt, Fußaktionen", Template
// `T-Dialog` §2.4): der wiederverwendbare Baustein `Modal`, später Träger von „Namensform
// bearbeiten" (Vorgaben §3.5). Rot zuerst (CLAUDE.md §5): vor PR 11a gibt es keinen Baustein —
// jede Zusicherung unten scheitert.
//
// Geprüft: ARIA-Dialogmuster (`role="dialog"`, `aria-modal`, `aria-labelledby` → Titel), Fokus beim
// Öffnen im Dialog, Tab-Fang in beide Richtungen, Escape schließt über `beiSchliessen`, Fokus kehrt
// zum auslösenden Element zurück, und kein Tastendruck aus dem Modal erreicht Lauscher dahinter —
// weder einen `document`-Lauscher noch einen React-Vorfahren (Editor: Escape/Tab-Fang, Reiterleiste:
// Pfeile) noch die Kontexttasten 1…8 (`darfKontexttasteWirken`, die Entscheidung im Renderer für
// `ereignis:kontexttaste`). jsdom + `react-dom/client` + `act` (Muster `reiterleiste.test.tsx`).
import { act, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '../../src/renderer/i18n/einrichten'
import { Modal } from '../../src/renderer/bausteine/modal'
import { darfKontexttasteWirken } from '../../src/renderer/ansichten/profil/kontexttaste-logik'

// React-19-Schalter für `act(...)` unter Vitest+jsdom (s. `profil-bearbeiten-debounce.test.tsx`).
// `as` erweitert nur den Testprozess-globalThis-Typ um den React-eigenen Schalter.
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface HuelleProps {
  readonly startOffen: boolean
  readonly beiSchliessen?: () => void
  readonly vorfahrTaste?: (ereignis: ReactKeyboardEvent<HTMLDivElement>) => void
}

/**
 * Wie ein künftiger Aufrufer im Editor: ein Auslöser öffnet das Modal, `beiSchliessen` schließt es.
 * Der umschließende `div` steht für den Editor (`role="dialog"` + `aria-modal` wie
 * `person-bearbeiten-ansicht.tsx`) mit eigenem `onKeyDown`.
 */
function Huelle({ startOffen, beiSchliessen, vorfahrTaste }: HuelleProps) {
  const [offen, setOffen] = useState(startOffen)
  return (
    <div role="dialog" aria-modal="true" aria-label="Editor" tabIndex={-1} data-testid="editor" onKeyDown={vorfahrTaste}>
      <button type="button" data-testid="ausloeser" onClick={() => setOffen(true)}>
        Namensform bearbeiten
      </button>
      <Modal
        titel="Namensform bearbeiten"
        offen={offen}
        beiSchliessen={() => {
          beiSchliessen?.()
          setOffen(false)
        }}
        fussaktionen={
          <>
            <button type="button" data-testid="abbrechen">
              Abbrechen
            </button>
            <button type="button" data-testid="uebernehmen">
              Übernehmen
            </button>
          </>
        }
      >
        <input data-testid="sprache" aria-label="Sprache" />
        <input data-testid="schrift" aria-label="Schrift" />
      </Modal>
    </div>
  )
}

function element(container: HTMLElement, testId: string): HTMLElement {
  const gefunden = container.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
  if (gefunden === null) throw new Error(`Element nicht gefunden: ${testId}`)
  return gefunden
}

function modal(container: HTMLElement): HTMLElement {
  const alle = Array.from(container.querySelectorAll<HTMLElement>('[role="dialog"]')).filter((knoten) => knoten.dataset['testid'] !== 'editor')
  const gefunden = alle[0]
  if (gefunden === undefined) throw new Error('Modal nicht gefunden')
  return gefunden
}

function taste(ziel: HTMLElement, key: string, shiftKey = false): KeyboardEvent {
  const ereignis = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })
  ziel.dispatchEvent(ereignis)
  return ereignis
}

describe('Modal (docs/71 §2.3, T-Dialog §2.4, AP-1.30 PR 11a)', () => {
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

  it('rendert geschlossen nichts', () => {
    act(() => root.render(<Huelle startOffen={false} />))
    expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1)
  })

  it('role="dialog", aria-modal="true" und aria-labelledby auf den sichtbaren Titel', () => {
    act(() => root.render(<Huelle startOffen />))
    const dialog = modal(container)
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const titelId = dialog.getAttribute('aria-labelledby')
    expect(titelId).not.toBeNull()
    expect(document.getElementById(titelId ?? '')?.textContent).toBe('Namensform bearbeiten')
  })

  it('Schließen-Knopf mit i18n-Namen ruft beiSchliessen', () => {
    const geschlossen = vi.fn()
    act(() => root.render(<Huelle startOffen beiSchliessen={geschlossen} />))
    const beschriftung = i18n.t('allgemein:modal_schliessen')
    // Ein fehlender Schlüssel käme als Schlüsselname zurück — dann wäre die Zusicherung darunter leer.
    expect(beschriftung).not.toBe('modal_schliessen')
    const knopf = modal(container).querySelector<HTMLButtonElement>(`button[aria-label="${beschriftung}"]`)
    expect(knopf).not.toBeNull()
    act(() => knopf?.click())
    expect(geschlossen).toHaveBeenCalledTimes(1)
  })

  it('beim Öffnen liegt der Fokus auf dem ersten Bedienelement des Inhalts', () => {
    act(() => root.render(<Huelle startOffen={false} />))
    act(() => element(container, 'ausloeser').click())
    expect(document.activeElement).toBe(element(container, 'sprache'))
  })

  it('Tab am letzten Element springt zum ersten, Shift+Tab am ersten zum letzten', () => {
    act(() => root.render(<Huelle startOffen />))
    const dialog = modal(container)
    const bedienbar = Array.from(dialog.querySelectorAll<HTMLElement>('button, input'))
    const erstes = bedienbar[0]
    const letztes = bedienbar[bedienbar.length - 1]
    if (erstes === undefined || letztes === undefined) throw new Error('keine Bedienelemente')
    expect(letztes).toBe(element(container, 'uebernehmen'))

    act(() => letztes.focus())
    const vor = taste(letztes, 'Tab')
    expect(vor.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(erstes)

    const zurueck = taste(erstes, 'Tab', true)
    expect(zurueck.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(letztes)
  })

  // Review #199 V1: liegt der Fokus auf dem Dialog selbst (Anfangsfokus ohne Bedienelement im Inhalt,
  // in Chromium auch nach einem Mausklick auf Text im Modal), griff der Fang nicht — Shift+Tab
  // verließ das Modal.
  it('Fokus auf dem Dialog selbst: Shift+Tab springt zum letzten, Tab zum ersten Element', () => {
    act(() => root.render(<Huelle startOffen />))
    const dialog = modal(container)
    const bedienbar = Array.from(dialog.querySelectorAll<HTMLElement>('button, input'))
    const erstes = bedienbar[0]
    const letztes = bedienbar[bedienbar.length - 1]
    if (erstes === undefined || letztes === undefined) throw new Error('keine Bedienelemente')

    act(() => dialog.focus())
    expect(document.activeElement).toBe(dialog)
    const zurueck = taste(dialog, 'Tab', true)
    expect(zurueck.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(letztes)

    act(() => dialog.focus())
    const vor = taste(dialog, 'Tab')
    expect(vor.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(erstes)
  })

  it('Escape schließt über beiSchliessen und erreicht den Editor dahinter nicht', () => {
    const geschlossen = vi.fn()
    const vorfahr = vi.fn()
    act(() => root.render(<Huelle startOffen beiSchliessen={geschlossen} vorfahrTaste={vorfahr} />))
    act(() => {
      taste(element(container, 'sprache'), 'Escape')
    })
    expect(geschlossen).toHaveBeenCalledTimes(1)
    expect(vorfahr).not.toHaveBeenCalled()
    expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1)
  })

  it('beim Schließen kehrt der Fokus zum auslösenden Element zurück', () => {
    act(() => root.render(<Huelle startOffen={false} />))
    const ausloeser = element(container, 'ausloeser')
    act(() => ausloeser.focus())
    act(() => ausloeser.click())
    expect(document.activeElement).toBe(element(container, 'sprache'))
    act(() => {
      taste(element(container, 'sprache'), 'Escape')
    })
    expect(document.activeElement).toBe(ausloeser)
  })

  it.each(['2', 'ArrowRight', 'ArrowLeft', 'Home', 'End'])('Taste "%s" im Modal erreicht weder document noch Vorfahren', (key) => {
    const vorfahr = vi.fn()
    const dokumentLauscher = vi.fn()
    document.addEventListener('keydown', dokumentLauscher)
    try {
      act(() => root.render(<Huelle startOffen vorfahrTaste={vorfahr} />))
      act(() => {
        taste(element(container, 'abbrechen'), key)
      })
      expect(dokumentLauscher).not.toHaveBeenCalled()
      expect(vorfahr).not.toHaveBeenCalled()
    } finally {
      document.removeEventListener('keydown', dokumentLauscher)
    }
  })

  it('Kontexttasten 1…8 wirken im Editor nicht, solange das Modal offen ist — danach wieder', () => {
    act(() => root.render(<Huelle startOffen />))
    const editor = element(container, 'editor')
    act(() => element(container, 'abbrechen').focus())
    expect(darfKontexttasteWirken(editor, document)).toBe(false)
    act(() => {
      taste(element(container, 'abbrechen'), 'Escape')
    })
    expect(darfKontexttasteWirken(editor, document)).toBe(true)
  })
})
