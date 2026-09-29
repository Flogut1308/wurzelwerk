// @vitest-environment jsdom
//
// U-130-nachladen-sofortaendern (AP-1.30 / AP-0.15, docs/80 §33): die Hook-API `sofortSetzen` von
// `useEntwurfMitVerzoegertemCommit` — der Schreibweg für Auswahlfelder (Kopfkommentar
// `profil-bearbeiten-debounce.ts`). Die Aufrufer-Sicht steht in `autosave-auswahl-sofort.test.tsx`;
// hier der Vertrag des Hooks selbst, einschließlich des Wartens auf eine Rücknahme.
// Harness-Muster wie `autosave-undo-vor-echo.test.tsx` (jsdom nur in dieser Datei).
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEntwurfMitVerzoegertemCommit } from '../../src/renderer/ansichten/profil/profil-bearbeiten-debounce'
import { NachladenKontext, nachladenMelderErzeugen, type NachladenMelder } from '../../src/renderer/brücke/nachladen-stand'
import { AUTOSAVE_DEBOUNCE_MS } from '../../src/shared/autosave'

// s. `profil-bearbeiten-debounce.test.tsx`: React-eigener act-Schalter, nur im Testprozess.
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface Steuerung {
  entwurf: string | undefined
  setEntwurf: (wert: string) => void
  sofortSetzen: (wert: string) => void
}

function neueSteuerung(): Steuerung {
  return { entwurf: undefined, setEntwurf: () => {}, sofortSetzen: () => {} }
}

function Harness({ wert, aufCommit, steuerung }: { readonly wert: string; readonly aufCommit: (wert: string) => void; readonly steuerung: Steuerung }) {
  const [entwurf, setEntwurf, , sofortSetzen] = useEntwurfMitVerzoegertemCommit(wert, aufCommit)
  steuerung.entwurf = entwurf
  steuerung.setEntwurf = setEntwurf
  steuerung.sofortSetzen = sofortSetzen
  return null
}

describe('Autosave: sofortSetzen (U-130-nachladen-sofortaendern)', () => {
  let container: HTMLDivElement
  let root: Root
  let melder: NachladenMelder
  let geplant: (() => void)[]

  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    geplant = []
    melder = nachladenMelderErzeugen((aufgabe) => {
      geplant.push(aufgabe)
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.useRealTimers()
  })

  function zeige(wert: string, aufCommit: (wert: string) => void, s: Steuerung): void {
    act(() => {
      root.render(
        <NachladenKontext.Provider value={melder}>
          <Harness wert={wert} aufCommit={aufCommit} steuerung={s} />
        </NachladenKontext.Provider>,
      )
    })
  }

  function warte(ms: number): void {
    act(() => {
      vi.advanceTimersByTime(ms)
    })
  }

  it('schreibt sofort, zeigt den Wert und schreibt nach der Frist nicht noch einmal', () => {
    const aufCommit = vi.fn()
    const s = neueSteuerung()
    zeige('A', aufCommit, s)
    act(() => s.sofortSetzen('B'))
    expect(aufCommit).toHaveBeenCalledTimes(1)
    expect(aufCommit).toHaveBeenLastCalledWith('B')
    expect(s.entwurf).toBe('B')
    warte(AUTOSAVE_DEBOUNCE_MS * 3)
    expect(aufCommit).toHaveBeenCalledTimes(1)
  })

  it('nimmt einen ausstehenden Tipp-Entwurf mit: EIN Schreiben, der Timer findet danach nichts', () => {
    const aufCommit = vi.fn()
    const s = neueSteuerung()
    zeige('A', aufCommit, s)
    act(() => s.setEntwurf('Ax'))
    act(() => s.sofortSetzen('Axy'))
    warte(AUTOSAVE_DEBOUNCE_MS * 3)
    expect(aufCommit.mock.calls).toEqual([['Axy']])
  })

  // Mutationsprobe (ohne `ausstehendRef.current = null` in `sofortSetzen`): hängt die Ansicht im
  // selben Zug aus (Auswahl, dann sofort „Schließen"), schriebe der Unmount-Flush den älteren
  // Tipp-Entwurf NACH der Auswahl zurück.
  it('Aushängen direkt nach sofortSetzen schreibt keinen älteren Tipp-Entwurf hinterher', () => {
    const aufCommit = vi.fn()
    const s = neueSteuerung()
    zeige('A', aufCommit, s)
    act(() => s.setEntwurf('Ax'))
    act(() => {
      s.sofortSetzen('Axy')
      root.unmount()
    })
    expect(aufCommit.mock.calls).toEqual([['Axy']])
    // afterEach hängt erneut aus — eine frische Wurzel, damit das nicht scheitert.
    root = createRoot(container)
  })

  it('das Echo des Sofort-Schreibens überschreibt einen danach getippten Entwurf nicht', () => {
    const aufCommit = vi.fn()
    const s = neueSteuerung()
    zeige('A', aufCommit, s)
    act(() => s.sofortSetzen('B'))
    act(() => s.setEntwurf('Bx'))
    zeige('B', aufCommit, s) // Echo
    expect(s.entwurf).toBe('Bx')
    warte(AUTOSAVE_DEBOUNCE_MS)
    expect(aufCommit.mock.calls).toEqual([['B'], ['Bx']])
  })

  it('eine fremde Änderung nach dem Sofort-Schreiben wird übernommen', () => {
    const aufCommit = vi.fn()
    const s = neueSteuerung()
    zeige('A', aufCommit, s)
    act(() => s.sofortSetzen('B'))
    zeige('C', aufCommit, s)
    expect(s.entwurf).toBe('C')
    warte(AUTOSAVE_DEBOUNCE_MS * 2)
    expect(aufCommit).toHaveBeenCalledTimes(1)
  })

  it('während eine Rücknahme nachlädt, schreibt es nicht; betraf das Undo etwas anderes, folgt das Schreiben danach', () => {
    const aufCommit = vi.fn()
    const s = neueSteuerung()
    zeige('A', aufCommit, s)
    let fertig: () => void = () => {}
    act(() => {
      fertig = melder.invalidierungBegonnen(true)
    })
    act(() => s.sofortSetzen('B'))
    expect(s.entwurf).toBe('B')
    warte(AUTOSAVE_DEBOUNCE_MS * 2)
    expect(aufCommit).not.toHaveBeenCalled()
    act(() => {
      fertig()
      for (const aufgabe of geplant.splice(0)) aufgabe()
    })
    zeige('A', aufCommit, s) // frisch geladen, unverändert: das Undo nahm etwas anderes zurück
    expect(s.entwurf).toBe('B')
    warte(AUTOSAVE_DEBOUNCE_MS)
    expect(aufCommit.mock.calls).toEqual([['B']])
  })
})
