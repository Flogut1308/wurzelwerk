// @vitest-environment jsdom
//
// AP-1.30 (PR 4), Abnahme „Kein Speichern-Knopf: Blur oder 400 ms Debounce schreibt". Zwei Teile:
// 1. `useEntwurfMitVerzoegertemCommit` entprellt ohne ausdrückliche Frist mit `AUTOSAVE_DEBOUNCE_MS`
//    (400 ms, `src/shared/autosave.ts`) und schreibt einen ausstehenden Entwurf beim Verlassen des
//    Felds SOFORT (`sofortSchreiben`, dritter Rückgabewert) — genau einmal, ohne Nachzügler-Commit
//    des Timers.
// 2. Die Eingabefelder (`Textfeld`, `Langtextfeld`) reichen das Verlassen als `aufVerlassen` durch.
//
// Blur beendet die Koaleszenz NICHT: das Zeitfenster entscheidet im Bus
// (`src/main/journal/koaleszenz.ts`); ein Blur-Commit ist nur ein früherer Schreibzeitpunkt.
// Harness-Muster wie `test/einheit/profil-bearbeiten-debounce.test.tsx` (jsdom nur in dieser Datei).
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEntwurfMitVerzoegertemCommit } from '../../src/renderer/ansichten/profil/profil-bearbeiten-debounce'
import { Textfeld } from '../../src/renderer/bausteine/textfeld'
import { Langtextfeld } from '../../src/renderer/bausteine/langtextfeld'
import { AUTOSAVE_DEBOUNCE_MS } from '../../src/shared/autosave'

// s. `profil-bearbeiten-debounce.test.tsx`: React-eigener act-Schalter, nur im Testprozess.
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface Steuerung {
  setEntwurf: (wert: string) => void
  sofortSchreiben: () => void
}

function Harness({ wert, aufCommit, steuerung }: { readonly wert: string; readonly aufCommit: (wert: string) => void; readonly steuerung: Steuerung }) {
  const [, setEntwurf, sofortSchreiben] = useEntwurfMitVerzoegertemCommit(wert, aufCommit)
  steuerung.setEntwurf = setEntwurf
  steuerung.sofortSchreiben = sofortSchreiben
  return null
}

function neueSteuerung(): Steuerung {
  return { setEntwurf: () => {}, sofortSchreiben: () => {} }
}

describe('Autosave: 400-ms-Debounce und Blur-Commit (AP-1.30 PR 4)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.useRealTimers()
  })

  it('die Frist ist 400 ms', () => {
    expect(AUTOSAVE_DEBOUNCE_MS).toBe(400)
  })

  it('ohne ausdrückliche Frist: nach 399 ms noch nichts, nach 400 ms genau ein Commit', () => {
    const aufCommit = vi.fn()
    const steuerung = neueSteuerung()
    act(() => {
      root.render(<Harness wert="anfang" aufCommit={aufCommit} steuerung={steuerung} />)
    })
    act(() => {
      steuerung.setEntwurf('neu')
    })
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS - 1)
    })
    expect(aufCommit).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(aufCommit).toHaveBeenCalledTimes(1)
    expect(aufCommit).toHaveBeenCalledWith('neu')
  })

  it('Blur mit ausstehendem Entwurf schreibt sofort — und der Timer schreibt danach nicht noch einmal', () => {
    const aufCommit = vi.fn()
    const steuerung = neueSteuerung()
    act(() => {
      root.render(<Harness wert="anfang" aufCommit={aufCommit} steuerung={steuerung} />)
    })
    act(() => {
      steuerung.setEntwurf('verlassen')
    })
    act(() => {
      steuerung.sofortSchreiben()
    })
    expect(aufCommit).toHaveBeenCalledTimes(1)
    expect(aufCommit).toHaveBeenCalledWith('verlassen')
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 2)
    })
    expect(aufCommit).toHaveBeenCalledTimes(1)
  })

  it('Blur ohne ausstehenden Entwurf schreibt nichts (kein Phantom-Commit)', () => {
    const aufCommit = vi.fn()
    const steuerung = neueSteuerung()
    act(() => {
      root.render(<Harness wert="anfang" aufCommit={aufCommit} steuerung={steuerung} />)
    })
    act(() => {
      steuerung.sofortSchreiben()
    })
    expect(aufCommit).not.toHaveBeenCalled()
  })

  it('Blur nach dem Timer-Commit schreibt nicht doppelt; weiteres Tippen danach entprellt wieder', () => {
    const aufCommit = vi.fn()
    const steuerung = neueSteuerung()
    act(() => {
      root.render(<Harness wert="anfang" aufCommit={aufCommit} steuerung={steuerung} />)
    })
    act(() => {
      steuerung.setEntwurf('eins')
    })
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
    })
    act(() => {
      steuerung.sofortSchreiben()
    })
    expect(aufCommit).toHaveBeenCalledTimes(1)
    act(() => {
      steuerung.setEntwurf('zwei')
    })
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
    })
    expect(aufCommit).toHaveBeenCalledTimes(2)
    expect(aufCommit).toHaveBeenLastCalledWith('zwei')
  })

  it('Unmount nach einem Blur-Commit schreibt nicht noch einmal', () => {
    const aufCommit = vi.fn()
    const steuerung = neueSteuerung()
    act(() => {
      root.render(<Harness wert="anfang" aufCommit={aufCommit} steuerung={steuerung} />)
    })
    act(() => {
      steuerung.setEntwurf('verlassen')
    })
    act(() => {
      steuerung.sofortSchreiben()
    })
    act(() => {
      root.render(<div />)
    })
    expect(aufCommit).toHaveBeenCalledTimes(1)
  })
})

describe('Eingabefelder reichen das Verlassen durch (`aufVerlassen`, AP-1.30 PR 4)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('Textfeld: Blur ruft aufVerlassen genau einmal', () => {
    const aufVerlassen = vi.fn()
    act(() => {
      root.render(<Textfeld wert="x" aufAenderung={() => {}} aufVerlassen={aufVerlassen} />)
    })
    const feld = container.querySelector('input')
    if (feld === null) throw new Error('kein input gerendert')
    act(() => {
      feld.focus()
      feld.blur()
    })
    expect(aufVerlassen).toHaveBeenCalledTimes(1)
  })

  it('Langtextfeld: Blur ruft aufVerlassen genau einmal', () => {
    const aufVerlassen = vi.fn()
    act(() => {
      root.render(<Langtextfeld wert="x" aufAenderung={() => {}} aufVerlassen={aufVerlassen} />)
    })
    const feld = container.querySelector('textarea')
    if (feld === null) throw new Error('kein textarea gerendert')
    act(() => {
      feld.focus()
      feld.blur()
    })
    expect(aufVerlassen).toHaveBeenCalledTimes(1)
  })
})
