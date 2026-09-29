// @vitest-environment jsdom
//
// U-130-fix-ablauf07-nachladen (AP-1.30 / AP-0.15, `docs/80_Offene_Fragen.md` §33): Wettlauf
// zwischen dem Nachladen nach dem eigenen Schreiben und einem weiteren Anschlag.
//
// Ablauf in der App: Entwurf „Starta" → 400 ms Ruhe → `aufCommit("Starta")` → Bus schreibt →
// `ereignis:datenGeaendert` → Cache invalidiert → Abfrage lädt neu (IPC, asynchron). Tippt die
// Nutzerin in diesem Fenster „b" (Entwurf „Startab"), kommt danach der nachgeladene Stand „Starta"
// als neuer `wert` an. Der Hook darf ihn NICHT über den neueren Entwurf legen — sonst ist das „b"
// still verloren (das Feld zeigt „Starta", der Timer findet `entwurf === wert` und schreibt nichts).
//
// Das Nachladen wird hier als Rerender mit neuem `wert` nachgestellt (kontrollierter Zeitpunkt,
// gefälschte Uhr). Fremde Änderungen (Undo, anderes Fenster), die NICHT das Echo des eigenen
// Schreibens sind, werden weiterhin übernommen — auch dann, wenn gerade ein Entwurf aussteht
// (Entscheidung „Undo gewinnt", Begründung im Kopfkommentar von `profil-bearbeiten-debounce.ts`).
// Harness-Muster wie `autosave-debounce-blur.test.tsx` (jsdom nur in dieser Datei).
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEntwurfMitVerzoegertemCommit } from '../../src/renderer/ansichten/profil/profil-bearbeiten-debounce'
import { AUTOSAVE_DEBOUNCE_MS } from '../../src/shared/autosave'

// s. `profil-bearbeiten-debounce.test.tsx`: React-eigener act-Schalter, nur im Testprozess.
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface Steuerung<T> {
  entwurf: T | undefined
  setEntwurf: (wert: T) => void
  sofortSchreiben: () => void
}

function neueSteuerung<T>(): Steuerung<T> {
  return { entwurf: undefined, setEntwurf: () => {}, sofortSchreiben: () => {} }
}

function Harness<T>({ wert, aufCommit, steuerung }: { readonly wert: T; readonly aufCommit: (wert: T) => void; readonly steuerung: Steuerung<T> }) {
  const [entwurf, setEntwurf, sofortSchreiben] = useEntwurfMitVerzoegertemCommit(wert, aufCommit)
  steuerung.entwurf = entwurf
  steuerung.setEntwurf = setEntwurf
  steuerung.sofortSchreiben = sofortSchreiben
  return null
}

interface Zeile {
  readonly vornamen: string
  readonly nachname: string
}

describe('Autosave: Nachladen nach dem eigenen Schreiben (U-130-fix-ablauf07-nachladen)', () => {
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

  function zeige<T>(wert: T, aufCommit: (wert: T) => void, steuerung: Steuerung<T>): void {
    act(() => {
      root.render(<Harness wert={wert} aufCommit={aufCommit} steuerung={steuerung} />)
    })
  }

  function tippe<T>(steuerung: Steuerung<T>, wert: T): void {
    act(() => {
      steuerung.setEntwurf(wert)
    })
  }

  function warte(ms: number): void {
    act(() => {
      vi.advanceTimersByTime(ms)
    })
  }

  it('ein Anschlag zwischen Schreiben und Nachladen bleibt im Entwurf und wird geschrieben', () => {
    const aufCommit = vi.fn()
    const s = neueSteuerung<string>()
    zeige('Start', aufCommit, s)
    tippe(s, 'Starta')
    warte(AUTOSAVE_DEBOUNCE_MS)
    expect(aufCommit).toHaveBeenLastCalledWith('Starta')
    tippe(s, 'Startab') // vor dem Nachladen
    zeige('Starta', aufCommit, s) // das Nachladen bringt den eben geschriebenen (älteren) Stand
    expect(s.entwurf).toBe('Startab')
    warte(AUTOSAVE_DEBOUNCE_MS)
    expect(aufCommit).toHaveBeenCalledTimes(2)
    expect(aufCommit).toHaveBeenLastCalledWith('Startab')
  })

  it('Objekt-Entwurf (Namenszeile): inhaltsgleiches Echo in neuer Referenz überschreibt den neueren Entwurf nicht', () => {
    const aufCommit = vi.fn()
    const s = neueSteuerung<Zeile>()
    zeige<Zeile>({ vornamen: 'Anna', nachname: 'Muster' }, aufCommit, s)
    tippe<Zeile>(s, { vornamen: 'Anna', nachname: 'Musterm' })
    warte(AUTOSAVE_DEBOUNCE_MS)
    tippe<Zeile>(s, { vornamen: 'Anna', nachname: 'Musterma' })
    zeige<Zeile>({ vornamen: 'Anna', nachname: 'Musterm' }, aufCommit, s)
    expect(s.entwurf).toEqual({ vornamen: 'Anna', nachname: 'Musterma' })
    warte(AUTOSAVE_DEBOUNCE_MS)
    expect(aufCommit).toHaveBeenCalledTimes(2)
    expect(aufCommit).toHaveBeenLastCalledWith({ vornamen: 'Anna', nachname: 'Musterma' })
  })

  it('fremde Änderung ohne Tippen wird übernommen und nicht zurückgeschrieben', () => {
    const aufCommit = vi.fn()
    const s = neueSteuerung<string>()
    zeige('Start', aufCommit, s)
    zeige('Fremd', aufCommit, s)
    expect(s.entwurf).toBe('Fremd')
    warte(AUTOSAVE_DEBOUNCE_MS * 2)
    expect(aufCommit).not.toHaveBeenCalled()
  })

  it('Undo nach dem Echo des eigenen Schreibens wird übernommen und nicht zurückgeschrieben', () => {
    const aufCommit = vi.fn()
    const s = neueSteuerung<string>()
    zeige('Start', aufCommit, s)
    tippe(s, 'Starta')
    warte(AUTOSAVE_DEBOUNCE_MS)
    zeige('Starta', aufCommit, s) // Echo
    zeige('Start', aufCommit, s) // Undo
    expect(s.entwurf).toBe('Start')
    warte(AUTOSAVE_DEBOUNCE_MS * 2)
    expect(aufCommit).toHaveBeenCalledTimes(1)
  })

  it('Objekt-Echo ohne weiteres Tippen: Entwurf übernimmt die neue Referenz, kein doppeltes Schreiben', () => {
    const aufCommit = vi.fn()
    const s = neueSteuerung<Zeile>()
    zeige<Zeile>({ vornamen: 'Anna', nachname: 'Muster' }, aufCommit, s)
    tippe<Zeile>(s, { vornamen: 'Anna', nachname: 'Musterm' })
    warte(AUTOSAVE_DEBOUNCE_MS)
    const echo: Zeile = { vornamen: 'Anna', nachname: 'Musterm' }
    zeige(echo, aufCommit, s)
    expect(s.entwurf).toBe(echo)
    warte(AUTOSAVE_DEBOUNCE_MS * 2)
    expect(aufCommit).toHaveBeenCalledTimes(1)
  })

  it('Undo während ein Entwurf aussteht: Undo gewinnt, der ungeschriebene Anschlag wird verworfen', () => {
    const aufCommit = vi.fn()
    const s = neueSteuerung<string>()
    zeige('Start', aufCommit, s)
    tippe(s, 'Starta')
    warte(AUTOSAVE_DEBOUNCE_MS)
    zeige('Starta', aufCommit, s) // Echo
    tippe(s, 'Startab') // noch nicht geschrieben
    zeige('Start', aufCommit, s) // Undo (Menü) nimmt „Starta" zurück
    expect(s.entwurf).toBe('Start')
    warte(AUTOSAVE_DEBOUNCE_MS * 2)
    expect(aufCommit).toHaveBeenCalledTimes(1)
  })

  // hueter-Review PR #173, Mutation M6 (ohne `setBekannt(wert)` im Übernahme-Zweig): `bekannt` bliebe
  // auf W0 stehen, das Undo auf W0 sähe aus wie das Echo des eigenen Schreibens und würde verschluckt.
  it('fremde Änderung wird zum bekannten Stand: ein späteres Undo auf den Ausgangswert wird übernommen', () => {
    const aufCommit = vi.fn()
    const s = neueSteuerung<string>()
    zeige('W0', aufCommit, s)
    zeige('X', aufCommit, s) // fremd (anderes Fenster/Redo), übernommen
    expect(s.entwurf).toBe('X')
    tippe(s, 'Xf') // noch nicht geschrieben
    zeige('W0', aufCommit, s) // Undo liefert den Ausgangswert
    expect(s.entwurf).toBe('W0')
    warte(AUTOSAVE_DEBOUNCE_MS * 2)
    expect(aufCommit).not.toHaveBeenCalled()
  })

  // hueter-Review PR #173, Mutation M4 (ohne `setBekannt(ausstehend.entwurf)` in `sofortSchreiben`):
  // das Echo des Blur-Commits sähe fremd aus und überschriebe den Anschlag im nächsten Feld.
  it('Blur-Pfad (Namenszeile): nach dem Blur-Commit im nächsten Feld weitergetippt, Echo überschreibt nicht', () => {
    const aufCommit = vi.fn()
    const s = neueSteuerung<Zeile>()
    zeige<Zeile>({ vornamen: 'Anna', nachname: 'Muster' }, aufCommit, s)
    tippe<Zeile>(s, { vornamen: 'Annax', nachname: 'Muster' })
    act(() => {
      s.sofortSchreiben() // Blur auf „Vornamen"
    })
    expect(aufCommit).toHaveBeenCalledTimes(1)
    expect(aufCommit).toHaveBeenLastCalledWith({ vornamen: 'Annax', nachname: 'Muster' })
    tippe<Zeile>(s, { vornamen: 'Annax', nachname: 'Musterx' }) // sofort im Nachnamen weiter
    zeige<Zeile>({ vornamen: 'Annax', nachname: 'Muster' }, aufCommit, s) // Echo des Blur-Commits
    expect(s.entwurf).toEqual({ vornamen: 'Annax', nachname: 'Musterx' })
    warte(AUTOSAVE_DEBOUNCE_MS)
    expect(aufCommit).toHaveBeenCalledTimes(2)
    expect(aufCommit).toHaveBeenLastCalledWith({ vornamen: 'Annax', nachname: 'Musterx' })
  })

  // Mutation M7 (`strukturGleich` ohne Schlüsselanzahl-Vergleich): ein Wert mit weniger Schlüsseln
  // gälte als gleich und würde als Echo verworfen.
  it('fremder Wert mit weniger Schlüsseln ist kein Echo und wird übernommen', () => {
    const aufCommit = vi.fn()
    const s = neueSteuerung<Readonly<Record<string, string>>>()
    zeige<Readonly<Record<string, string>>>({ a: '1', b: '2' }, aufCommit, s)
    tippe<Readonly<Record<string, string>>>(s, { a: '1', b: '2x' })
    const fremd: Readonly<Record<string, string>> = { a: '1' }
    zeige(fremd, aufCommit, s)
    expect(s.entwurf).toBe(fremd)
    warte(AUTOSAVE_DEBOUNCE_MS * 2)
    expect(aufCommit).not.toHaveBeenCalled()
  })

  // Mutation M8 (`strukturGleich` ohne Array-Prüfung): `[]` und `{}` hätten beide null Schlüssel.
  it('ein leeres Objekt ist kein Echo eines leeren Arrays', () => {
    type Form = readonly string[] | Readonly<Record<string, string>>
    const aufCommit = vi.fn()
    const s = neueSteuerung<Form>()
    zeige<Form>([], aufCommit, s)
    tippe<Form>(s, ['x'])
    const fremd: Form = {}
    zeige(fremd, aufCommit, s)
    expect(s.entwurf).toBe(fremd)
    warte(AUTOSAVE_DEBOUNCE_MS * 2)
    expect(aufCommit).not.toHaveBeenCalled()
  })
})
