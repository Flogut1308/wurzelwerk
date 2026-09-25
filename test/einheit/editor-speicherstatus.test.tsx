// @vitest-environment jsdom
//
// AP-1.30 PR 7c (docs/80 §33 V-130-7-speicherfehler): `useEditorSpeicherstatus` verdrahtet die
// reinen Übergänge (`editor-speicherstatus-logik.ts`) mit den Schreibvorgängen des Editors.
// Geprüft wird, was die reine Funktion nicht zeigen kann: „erneut versuchen" wiederholt GENAU den
// fehlgeschlagenen Schreibvorgang (dieselbe Funktion, dieselben Variablen), ein Erfolg an einem
// anderen Feld hebt den Fehler nicht auf, und der Beobachter reicht den Fehler an den Aufrufer
// (die Mutation) weiter. jsdom + `act` wie `profil-bearbeiten-debounce.test.tsx`.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorSpeicherstatus, type EditorSpeicherstatus } from '../../src/renderer/ansichten/profil/editor-speicherstatus'

// React-19-Schalter für `act(...)` unter Vitest+jsdom (s. `profil-bearbeiten-debounce.test.tsx`).
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const UM = 1_750_000_000_000

/** Mutable Ablage, in die die Harness den jeweils aktuellen Hook-Stand schreibt. */
const stand: { aktuell: EditorSpeicherstatus | null } = { aktuell: null }

function Harness() {
  const status = useEditorSpeicherstatus(() => UM)
  stand.aktuell = status
  return null
}

function aktuell(): EditorSpeicherstatus {
  if (stand.aktuell === null) throw new Error('Harness nicht gerendert')
  return stand.aktuell
}

let wurzel: Root
let behaelter: HTMLDivElement

beforeEach(() => {
  behaelter = document.createElement('div')
  document.body.append(behaelter)
  wurzel = createRoot(behaelter)
  act(() => wurzel.render(<Harness />))
})

afterEach(() => {
  act(() => wurzel.unmount())
  behaelter.remove()
  stand.aktuell = null
})

describe('useEditorSpeicherstatus', () => {
  it('vor dem ersten Schreiben Ruhe, nach einem Erfolg „gespeichert"', async () => {
    expect(aktuell().anzeige).toEqual({ zustand: 'ruhe' })
    await act(async () => {
      await expect(aktuell().beobachter.beobachten('a', () => Promise.resolve('ok'))).resolves.toBe('ok')
    })
    expect(aktuell().anzeige).toEqual({ zustand: 'gespeichert', gespeichertUm: UM })
  })

  it('Fehler bleibt trotz Erfolg an anderem Feld; „erneut versuchen" wiederholt genau diesen Schreibvorgang', async () => {
    const variablen = { id: 'p1', feld: 'notiz', wert: 'Text' } as const
    const gesehen: unknown[] = []
    let versuche = 0
    const schreibeA = vi.fn(() => {
      gesehen.push(variablen)
      versuche += 1
      return versuche === 1 ? Promise.reject(new Error('gesperrt')) : Promise.resolve(null)
    })

    await act(async () => {
      await expect(aktuell().beobachter.beobachten('a', schreibeA)).rejects.toThrow('gesperrt')
    })
    expect(aktuell().anzeige).toEqual({ zustand: 'fehler', felder: ['a'] })

    await act(async () => {
      await aktuell().beobachter.beobachten('b', () => Promise.resolve(null))
    })
    expect(aktuell().anzeige).toEqual({ zustand: 'fehler', felder: ['a'] })

    await act(async () => {
      aktuell().erneutVersuchen()
      await Promise.resolve()
    })
    expect(schreibeA).toHaveBeenCalledTimes(2)
    expect(gesehen).toEqual([variablen, variablen])
    expect(aktuell().anzeige).toEqual({ zustand: 'gespeichert', gespeichertUm: UM })
  })

  it('eine gescheiterte Wiederholung lässt den Fehler stehen (kein unbehandeltes Promise)', async () => {
    const schreibeA = vi.fn(() => Promise.reject(new Error('gesperrt')))
    await act(async () => {
      await aktuell().beobachter.beobachten('a', schreibeA).catch(() => undefined)
    })
    await act(async () => {
      aktuell().erneutVersuchen()
      await Promise.resolve()
    })
    expect(schreibeA).toHaveBeenCalledTimes(2)
    expect(aktuell().anzeige).toEqual({ zustand: 'fehler', felder: ['a'] })
  })

  it('„erneut versuchen" wiederholt den NEUESTEN Fehlschlag, auch wenn ein älterer danach eintrifft', async () => {
    let aelterAblehnen: (fehler: Error) => void = () => undefined
    const aelter = vi.fn(
      () =>
        new Promise<null>((_, ablehnen) => {
          aelterAblehnen = ablehnen
        }),
    )
    const neuer = vi.fn(() => Promise.reject(new Error('neuer')))
    await act(async () => {
      const ersterLauf = aktuell().beobachter.beobachten('a', aelter).catch(() => undefined)
      await aktuell().beobachter.beobachten('a', neuer).catch(() => undefined)
      aelterAblehnen(new Error('aelter'))
      await ersterLauf
    })
    expect(aktuell().anzeige).toEqual({ zustand: 'fehler', felder: ['a'] })
    await act(async () => {
      aktuell().erneutVersuchen()
      await Promise.resolve()
    })
    expect(aelter).toHaveBeenCalledTimes(1)
    expect(neuer).toHaveBeenCalledTimes(2)
  })
})
