// @vitest-environment jsdom
//
// U-130-nachladen-undo-vor-echo, hueter PR #174 H1/H2 (Lebendigkeit): nach einer Rücknahme muss der
// Autosave wieder schreiben. Geprüft über die echte Kette `ereignis:datenGeaendert` →
// `useDatenGeaendertAbo` → Nachladen-Stand → `useEntwurfMitVerzoegertemCommit`, mit einem echten
// `QueryClient` (ohne Abfragen: `invalidateQueries` löst sich sofort) und einem gefälschten
// `window.wurzelwerk.abonnieren`, das den Hörer festhält. Tötet u. a. die Mutanten „`fertig` wird nie
// aufgerufen" und „`.then(fertig)` ohne Fehlerzweig" — beide ließen den Hook dauerhaft warten.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEntwurfMitVerzoegertemCommit } from '../../src/renderer/ansichten/profil/profil-bearbeiten-debounce'
import { useDatenGeaendertAbo } from '../../src/renderer/brücke/befehl-hooks'
import { NachladenKontext, nachladenMelderErzeugen, wartetAufRuecknahme, type NachladenMelder } from '../../src/renderer/brücke/nachladen-stand'
import { AUTOSAVE_DEBOUNCE_MS } from '../../src/shared/autosave'

// s. `profil-bearbeiten-debounce.test.tsx`: React-eigener act-Schalter, nur im Testprozess.
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface Steuerung {
  entwurf: string | undefined
  setEntwurf: (wert: string) => void
}

function Bruecke({ melder }: { readonly melder: NachladenMelder }): null {
  useDatenGeaendertAbo(melder)
  return null
}

function Feld({ wert, aufCommit, steuerung }: { readonly wert: string; readonly aufCommit: (wert: string) => void; readonly steuerung: Steuerung }): null {
  const [entwurf, setEntwurf] = useEntwurfMitVerzoegertemCommit(wert, aufCommit)
  steuerung.entwurf = entwurf
  steuerung.setEntwurf = setEntwurf
  return null
}

describe('Autosave schreibt nach einer Rücknahme wieder (hueter PR #174 H1/H2)', () => {
  let container: HTMLDivElement
  let root: Root
  let hoerer: ((nutzlast: unknown) => void) | undefined
  let queryClient: QueryClient
  let melder: NachladenMelder

  beforeEach(() => {
    vi.useFakeTimers()
    hoerer = undefined
    Object.defineProperty(window, 'wurzelwerk', {
      configurable: true,
      value: {
        aufrufen: () => Promise.resolve({ ok: true, daten: null }),
        abonnieren: (kanal: string, bei: (nutzlast: unknown) => void) => {
          if (kanal === 'ereignis:datenGeaendert') hoerer = bei
          return () => {
            hoerer = undefined
          }
        },
      },
    })
    queryClient = new QueryClient()
    // Wie in `app.tsx`, nur über `setTimeout` statt `notifyManager.schedule` (gleiche Art Planung).
    melder = nachladenMelderErzeugen((aufgabe) => {
      setTimeout(aufgabe, 0)
    })
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

  function zeige(wert: string, aufCommit: (wert: string) => void, steuerung: Steuerung): void {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Bruecke melder={melder} />
          <NachladenKontext.Provider value={melder}>
            <Feld wert={wert} aufCommit={aufCommit} steuerung={steuerung} />
          </NachladenKontext.Provider>
        </QueryClientProvider>,
      )
    })
  }

  function ereignis(ursache: string): void {
    const bei = hoerer
    if (bei === undefined) throw new Error('useDatenGeaendertAbo hat nicht abonniert')
    act(() => {
      bei({ transaktionId: 't-1', ursache })
    })
  }

  /** Versprechen und geplante Aufgaben abarbeiten (Invalidierung fertig, Nachziehen geplant). */
  async function nachladenAbwarten(): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
  }

  it('nach einem Undo wird ein neuer Anschlag geschrieben', async () => {
    const aufCommit = vi.fn()
    const s: Steuerung = { entwurf: undefined, setEntwurf: () => {} }
    zeige('Start', aufCommit, s)
    ereignis('journal.undo')
    expect(wartetAufRuecknahme(melder.lesen())).toBe(true)
    await nachladenAbwarten()
    expect(wartetAufRuecknahme(melder.lesen())).toBe(false)
    act(() => {
      s.setEntwurf('Startx')
    })
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
    })
    expect(aufCommit).toHaveBeenCalledTimes(1)
    expect(aufCommit).toHaveBeenLastCalledWith('Startx')
  })

  it('schlägt die Invalidierung fehl, endet der Wartezustand trotzdem', async () => {
    vi.spyOn(queryClient, 'invalidateQueries').mockReturnValue(Promise.reject(new Error('Abruf fehlgeschlagen')))
    const aufCommit = vi.fn()
    const s: Steuerung = { entwurf: undefined, setEntwurf: () => {} }
    zeige('Start', aufCommit, s)
    ereignis('journal.redo')
    await nachladenAbwarten()
    expect(wartetAufRuecknahme(melder.lesen())).toBe(false)
    act(() => {
      s.setEntwurf('Startx')
    })
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
    })
    expect(aufCommit).toHaveBeenCalledTimes(1)
  })
})
