// @vitest-environment jsdom
//
// hueter-Auflage AP-1.14a #1 (Korrektheit, stiller Datenverlust): `useEntwurfMitVerzoegertemCommit`
// committet nur über den 600ms-Timer; die Effekt-Aufräumung war `clearTimeout` OHNE Flush. Wer in
// Notiz-/Namensfeld tippt und binnen 600ms „Fertig"/„Schließen" klickt (→ `ProfilBearbeitenInhalt`
// hängt aus, s. `profil-ansicht.tsx`) verlor die letzte Eingabe still, obwohl die Fußzeile „sofort
// gespeichert" verspricht (`bearbeitungsstatus_hinweis`).
//
// Eiserne Regel §5: dieser Test ist ROT gegen den unveränderten Hook (Cleanup nur `clearTimeout`,
// kein Flush) und GRÜN nach dem Fix. Braucht eine echte Effekt-/Unmount-Lebensdauer — das kann
// `renderToStaticMarkup` (wie die übrigen `test/einheit/*.test.tsx`, s. Modulkommentar dort) NICHT
// leisten, darum hier `// @vitest-environment jsdom` NUR für diese Datei (Vitest-Doku „Test
// environment", per-Datei-Override) + `react-dom/client` + `act`. `jsdom` ist eigens für diese
// Datei als devDependency ergänzt (`package.json`), keine bestehende `environment: 'node'`-Datei
// (`vitest.config.ts`) ist betroffen.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEntwurfMitVerzoegertemCommit } from '../../src/renderer/ansichten/profil/profil-bearbeiten-debounce'

// React 19 erkennt eine `act(...)`-taugliche Umgebung an diesem globalen Schalter (kein
// automatisches Erkennen unter Vitest+jsdom ohne @testing-library/react, das ihn sonst selbst
// setzt) — ohne ihn läuft `act(...)` trotzdem korrekt synchron, warnt aber auf `stderr`. `as` hier
// erweitert bewusst nur den Testprozess-globalThis-Typ um den React-eigenen Schalter, kein
// Zod-Ergebnis nötig (CLAUDE.md §4 gilt für Produktionscode-`as`).
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Mutable „Fernbedienung" statt `setState` im Testkörper: die Harness trägt ihren `setEntwurf`
 * hier ein, sobald sie rendert — eine reine Objektmutation, kein React-Zustand, darum keine
 * kaskadierende Zustandsänderung. */
interface Steuerung {
  setEntwurf: (wert: string) => void
}

function Harness({ wert, aufCommit, steuerung }: { readonly wert: string; readonly aufCommit: (wert: string) => void; readonly steuerung: Steuerung }) {
  const [, setEntwurf] = useEntwurfMitVerzoegertemCommit(wert, aufCommit, 600)
  steuerung.setEntwurf = setEntwurf
  return null
}

describe('useEntwurfMitVerzoegertemCommit — Flush beim Unmount (hueter-Auflage AP-1.14a #1)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    container.remove()
    vi.useRealTimers()
  })

  it('DATENVERLUST-Fall: Unmount VOR Ablauf des 600ms-Debounce committet dennoch den letzten Entwurf', () => {
    const aufCommit = vi.fn()
    const steuerung: Steuerung = { setEntwurf: () => {} }

    act(() => {
      root.render(<Harness wert="anfang" aufCommit={aufCommit} steuerung={steuerung} />)
    })

    act(() => {
      steuerung.setEntwurf('letzte eingabe vor fertig-klick')
    })
    expect(aufCommit).not.toHaveBeenCalled()

    // „Fertig"/„Schließen" — ProfilBearbeitenInhalt hängt aus, BEVOR der 600ms-Timer abläuft.
    act(() => {
      root.unmount()
    })

    // Selbst wenn der (ohnehin gelöschte) Timer noch abgelaufen wäre, darf hier nichts doppelt
    // committet werden.
    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(aufCommit).toHaveBeenCalledTimes(1)
    expect(aufCommit).toHaveBeenCalledWith('letzte eingabe vor fertig-klick')
  })

  it('kein Entwurf ausstehend: Unmount OHNE ungespeicherte Änderung committet NICHTS (kein Phantom-Commit)', () => {
    const aufCommit = vi.fn()
    const steuerung: Steuerung = { setEntwurf: () => {} }

    act(() => {
      root.render(<Harness wert="unveraendert" aufCommit={aufCommit} steuerung={steuerung} />)
    })

    act(() => {
      root.unmount()
    })

    expect(aufCommit).not.toHaveBeenCalled()
  })

  it('regressionssicher: OHNE Unmount committet der normale 600ms-Timer weiterhin genau einmal', () => {
    const aufCommit = vi.fn()
    const steuerung: Steuerung = { setEntwurf: () => {} }

    act(() => {
      root.render(<Harness wert="anfang" aufCommit={aufCommit} steuerung={steuerung} />)
    })
    act(() => {
      steuerung.setEntwurf('normal committet')
    })

    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(aufCommit).toHaveBeenCalledTimes(1)
    expect(aufCommit).toHaveBeenCalledWith('normal committet')

    act(() => {
      root.unmount()
    })
    // Entwurf === wert nach dem Commit-Effekt-Zyklus? Nein — `wert`-Prop selbst wurde in diesem
    // Test nie von außen nachgezogen (kein `usePersonDetail`-Refetch simuliert), das ist hier kein
    // Fall. Es genügt: kein zweiter Commit beim Unmount.
    expect(aufCommit).toHaveBeenCalledTimes(1)
  })

  it('mehrere Tastendrücke vor dem Unmount: NUR der letzte Entwurf wird geflusht, nicht jeder Zwischenstand', () => {
    const aufCommit = vi.fn()
    const steuerung: Steuerung = { setEntwurf: () => {} }

    act(() => {
      root.render(<Harness wert="anfang" aufCommit={aufCommit} steuerung={steuerung} />)
    })

    act(() => {
      steuerung.setEntwurf('a')
    })
    act(() => {
      steuerung.setEntwurf('ab')
    })
    act(() => {
      steuerung.setEntwurf('abc')
    })

    act(() => {
      root.unmount()
    })

    expect(aufCommit).toHaveBeenCalledTimes(1)
    expect(aufCommit).toHaveBeenCalledWith('abc')
  })

  it('Nebenbefund „aufCommit stabil halten": ein Elternrerender mit NEUER aufCommit-Referenz während der Wartezeit darf den Timer NICHT zurücksetzen', () => {
    const ersteCommitFunktion = vi.fn()
    const zweiteCommitFunktion = vi.fn()
    const steuerung: Steuerung = { setEntwurf: () => {} }

    act(() => {
      root.render(<Harness wert="anfang" aufCommit={ersteCommitFunktion} steuerung={steuerung} />)
    })
    act(() => {
      steuerung.setEntwurf('x')
    })

    // 500 von 600ms verstrichen — der Timer läuft noch.
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(ersteCommitFunktion).not.toHaveBeenCalled()

    // Elternrerender (z. B. eine fremde Query-Invalidierung) reicht eine NEUE `aufCommit`-Funktion
    // hinein, OHNE `wert`/den Entwurf zu ändern — genau der Fall eines inline
    // `(wert) => feldSetzen.mutate(...)` in `profil-bearbeiten-grunddaten.tsx`.
    act(() => {
      root.render(<Harness wert="anfang" aufCommit={zweiteCommitFunktion} steuerung={steuerung} />)
    })

    // Nur die VERBLEIBENDEN 100ms bis zur ursprünglichen Fälligkeit — kein zurückgesetzter
    // 600ms-Timer.
    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(zweiteCommitFunktion).toHaveBeenCalledTimes(1)
    expect(zweiteCommitFunktion).toHaveBeenCalledWith('x')
    expect(ersteCommitFunktion).not.toHaveBeenCalled()
  })
})
