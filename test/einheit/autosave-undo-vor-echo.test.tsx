// @vitest-environment jsdom
//
// U-130-nachladen-undo-vor-echo (AP-1.30 / AP-0.15, docs/80 §33, hueter-Review PR #173 S1): ein
// Undo, das ankommt, BEVOR das Nachladen des eigenen Schreibens den Cache erreicht.
//
// Ablauf in der App: `wert` „Start" → Entwurf „Starta" → 400 ms → `aufCommit("Starta")` → Undo
// (Menü, Hauptprozess) → der Speicher hat wieder „Start" → das Nachladen liefert „Start", denselben
// Stand, den der Cache noch hält. Für den Hook ändert sich `wert` nicht:
//   (a) ohne ausstehenden Entwurf zeigt das Feld „Starta", gespeichert ist „Start" (stille Divergenz);
//   (b) mit ausstehendem Entwurf „Startab" schreibt der Timer ihn über das Undo.
// Das Undo erreicht den Hook darum über den Nachladen-Stand (`src/renderer/brücke/nachladen-stand.ts`),
// hier von Hand gemeldet; die Warteschlange `planen` steht für `notifyManager.schedule`.
// Harness-Muster wie `autosave-nachladen-entwurf.test.tsx` (jsdom nur in dieser Datei).
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
  sofortSchreiben: () => void
}

function neueSteuerung(): Steuerung {
  return { entwurf: undefined, setEntwurf: () => {}, sofortSchreiben: () => {} }
}

function Harness({ wert, aufCommit, steuerung }: { readonly wert: string; readonly aufCommit: (wert: string) => void; readonly steuerung: Steuerung }) {
  const [entwurf, setEntwurf, sofortSchreiben] = useEntwurfMitVerzoegertemCommit(wert, aufCommit)
  steuerung.entwurf = entwurf
  steuerung.setEntwurf = setEntwurf
  steuerung.sofortSchreiben = sofortSchreiben
  return null
}

describe('Autosave: Undo vor dem Echo des eigenen Schreibens (U-130-nachladen-undo-vor-echo)', () => {
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

  function zeige(wert: string, aufCommit: (wert: string) => void, steuerung: Steuerung): void {
    act(() => {
      root.render(
        <NachladenKontext.Provider value={melder}>
          <Harness wert={wert} aufCommit={aufCommit} steuerung={steuerung} />
        </NachladenKontext.Provider>,
      )
    })
  }

  function tippe(steuerung: Steuerung, wert: string): void {
    act(() => {
      steuerung.setEntwurf(wert)
    })
  }

  function warte(ms: number): void {
    act(() => {
      vi.advanceTimersByTime(ms)
    })
  }

  /** `ereignis:datenGeaendert` mit Ursache Undo: Invalidierung beginnt. Liefert „Nachladen fertig". */
  function undoBeginnt(): () => void {
    let fertig: () => void = () => {}
    act(() => {
      fertig = melder.invalidierungBegonnen(true)
    })
    return () => {
      act(() => {
        fertig()
        for (const aufgabe of geplant.splice(0)) aufgabe()
      })
    }
  }

  it('(a) ohne ausstehenden Entwurf: das Feld übernimmt den zurückgenommenen Stand, obwohl sich wert nicht ändert', () => {
    const aufCommit = vi.fn()
    const s = neueSteuerung()
    zeige('Start', aufCommit, s)
    tippe(s, 'Starta')
    warte(AUTOSAVE_DEBOUNCE_MS)
    expect(aufCommit).toHaveBeenLastCalledWith('Starta')
    const nachgeladen = undoBeginnt() // kein Echo „Starta" dazwischen
    nachgeladen()
    zeige('Start', aufCommit, s) // der frische Stand ist derselbe wie im Cache
    expect(s.entwurf).toBe('Start')
    warte(AUTOSAVE_DEBOUNCE_MS * 2)
    expect(aufCommit).toHaveBeenCalledTimes(1)
  })

  it('(b) mit ausstehendem Entwurf: Undo gewinnt, der Timer schreibt den Entwurf nicht über das Undo', () => {
    const aufCommit = vi.fn()
    const s = neueSteuerung()
    zeige('Start', aufCommit, s)
    tippe(s, 'Starta')
    warte(AUTOSAVE_DEBOUNCE_MS)
    tippe(s, 'Startab') // ausstehend
    const nachgeladen = undoBeginnt()
    nachgeladen()
    expect(s.entwurf).toBe('Start')
    warte(AUTOSAVE_DEBOUNCE_MS * 2)
    expect(aufCommit).toHaveBeenCalledTimes(1)
  })

  it('(b) bis das Nachladen nach dem Undo da ist, schreibt der Timer nicht', () => {
    const aufCommit = vi.fn()
    const s = neueSteuerung()
    zeige('Start', aufCommit, s)
    tippe(s, 'Starta')
    warte(AUTOSAVE_DEBOUNCE_MS)
    tippe(s, 'Startab')
    const nachgeladen = undoBeginnt()
    warte(AUTOSAVE_DEBOUNCE_MS * 2) // das Nachladen hängt
    expect(aufCommit).toHaveBeenCalledTimes(1)
    nachgeladen()
    expect(s.entwurf).toBe('Start')
  })

  it('(b) ein Undo, das zwischen Timer-Fälligkeit und Rendern ankommt, hält den Timer an', () => {
    const aufCommit = vi.fn()
    const s = neueSteuerung()
    zeige('Start', aufCommit, s)
    tippe(s, 'Starta')
    warte(AUTOSAVE_DEBOUNCE_MS)
    tippe(s, 'Startab')
    warte(AUTOSAVE_DEBOUNCE_MS - 1)
    act(() => {
      melder.invalidierungBegonnen(true) // gemeldet, und im selben Schritt wird der Timer fällig
      vi.advanceTimersByTime(1)
    })
    expect(aufCommit).toHaveBeenCalledTimes(1)
  })

  it('(b) Verlassen des Felds während des Nachladens schreibt nicht über das Undo', () => {
    const aufCommit = vi.fn()
    const s = neueSteuerung()
    zeige('Start', aufCommit, s)
    tippe(s, 'Starta')
    warte(AUTOSAVE_DEBOUNCE_MS)
    tippe(s, 'Startab')
    const nachgeladen = undoBeginnt()
    act(() => {
      s.sofortSchreiben()
    })
    expect(aufCommit).toHaveBeenCalledTimes(1)
    nachgeladen()
    expect(s.entwurf).toBe('Start')
    warte(AUTOSAVE_DEBOUNCE_MS * 2)
    expect(aufCommit).toHaveBeenCalledTimes(1)
  })

  // Ein bereits gesendeter Entwurf ist nicht mehr ausstehend: hängt der Editor aus, während das
  // Undo nachlädt, darf der Unmount-Flush ihn nicht noch einmal über das Undo schreiben.
  it('Aus-Hängen während des Nachladens schreibt den schon gesendeten Entwurf nicht erneut', () => {
    const aufCommit = vi.fn()
    const s = neueSteuerung()
    zeige('Start', aufCommit, s)
    tippe(s, 'Starta')
    warte(AUTOSAVE_DEBOUNCE_MS)
    undoBeginnt()
    act(() => {
      root.render(<NachladenKontext.Provider value={melder}>{null}</NachladenKontext.Provider>)
    })
    expect(aufCommit).toHaveBeenCalledTimes(1)
  })

  // Gegenprobe: ein Undo, das etwas ANDERES zurücknimmt, verwirft den ausstehenden Entwurf nicht.
  // Der frische Stand gleicht dem zuletzt gesendeten — das Echo ist schon da oder kommt mit dem
  // Nachladen; der Entwurf wird danach regulär geschrieben.
  it('fremdes Undo nach dem Echo: der ausstehende Entwurf bleibt und wird geschrieben', () => {
    const aufCommit = vi.fn()
    const s = neueSteuerung()
    zeige('Start', aufCommit, s)
    tippe(s, 'Starta')
    warte(AUTOSAVE_DEBOUNCE_MS)
    zeige('Starta', aufCommit, s) // Echo
    tippe(s, 'Startab')
    const nachgeladen = undoBeginnt()
    nachgeladen() // der Speicher hält weiter „Starta"
    expect(s.entwurf).toBe('Startab')
    warte(AUTOSAVE_DEBOUNCE_MS)
    expect(aufCommit).toHaveBeenCalledTimes(2)
    expect(aufCommit).toHaveBeenLastCalledWith('Startab')
  })

  it('fremdes Undo vor dem Echo: das Nachladen bringt das Echo, der ausstehende Entwurf bleibt', () => {
    const aufCommit = vi.fn()
    const s = neueSteuerung()
    zeige('Start', aufCommit, s)
    tippe(s, 'Starta')
    warte(AUTOSAVE_DEBOUNCE_MS)
    tippe(s, 'Startab')
    const nachgeladen = undoBeginnt()
    zeige('Starta', aufCommit, s) // der frische Stand ist das Echo
    nachgeladen()
    expect(s.entwurf).toBe('Startab')
    warte(AUTOSAVE_DEBOUNCE_MS)
    expect(aufCommit).toHaveBeenCalledTimes(2)
    expect(aufCommit).toHaveBeenLastCalledWith('Startab')
  })

  it('ohne eigenes Schreiben ändert ein Undo nichts am Feld', () => {
    const aufCommit = vi.fn()
    const s = neueSteuerung()
    zeige('Start', aufCommit, s)
    const nachgeladen = undoBeginnt()
    nachgeladen()
    expect(s.entwurf).toBe('Start')
    warte(AUTOSAVE_DEBOUNCE_MS * 2)
    expect(aufCommit).not.toHaveBeenCalled()
  })
})
