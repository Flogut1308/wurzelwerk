// @vitest-environment jsdom
//
// AP-1.30 PR 6: `Speicherstatus` — Kopf von „Person bearbeiten" (docs/design/Entwicklungsvorgaben
// Person bearbeiten & Medien.md §1: „Gespeichert · gerade eben" / „Speichert …" / „Nicht
// gespeichert – erneut versuchen"). Die relative Zeit ist eine reine Funktion über zwei
// übergebene Zeitpunkte — kein `Date.now` im Baustein, damit Test und Bild deterministisch sind.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '../../src/renderer/i18n/einrichten'
import { Speicherstatus } from '../../src/renderer/bausteine/speicherstatus'
import { relativeSpeicherzeit } from '../../src/renderer/bausteine/speicherstatus-logik'

// React-19-Schalter für `act(...)` unter Vitest+jsdom (s. `profil-bearbeiten-debounce.test.tsx`).
// `as` erweitert nur den Testprozess-globalThis-Typ um den React-eigenen Schalter.
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const JETZT = 1_750_000_000_000
const SEKUNDE = 1000
const MINUTE = 60 * SEKUNDE
const STUNDE = 60 * MINUTE

describe('relativeSpeicherzeit (reine Funktion)', () => {
  it('unter einer Minute: gerade eben', () => {
    expect(relativeSpeicherzeit(JETZT, JETZT)).toEqual({ art: 'gerade_eben' })
    expect(relativeSpeicherzeit(JETZT - 59 * SEKUNDE, JETZT)).toEqual({ art: 'gerade_eben' })
  })

  it('Zeitpunkt in der Zukunft (Uhrensprung) gilt als gerade eben', () => {
    expect(relativeSpeicherzeit(JETZT + 5 * SEKUNDE, JETZT)).toEqual({ art: 'gerade_eben' })
  })

  it('ab einer Minute: ganze Minuten, abgerundet', () => {
    expect(relativeSpeicherzeit(JETZT - MINUTE, JETZT)).toEqual({ art: 'minuten', anzahl: 1 })
    expect(relativeSpeicherzeit(JETZT - (59 * MINUTE + 59 * SEKUNDE), JETZT)).toEqual({ art: 'minuten', anzahl: 59 })
  })

  it('ab einer Stunde: ganze Stunden, abgerundet', () => {
    expect(relativeSpeicherzeit(JETZT - STUNDE, JETZT)).toEqual({ art: 'stunden', anzahl: 1 })
    expect(relativeSpeicherzeit(JETZT - 30 * STUNDE, JETZT)).toEqual({ art: 'stunden', anzahl: 30 })
  })
})

describe('Speicherstatus — Darstellung (AP-1.30 PR 6)', () => {
  it('gespeichert: „Gespeichert · gerade eben"', () => {
    const markup = renderToStaticMarkup(<Speicherstatus zustand="gespeichert" gespeichertUm={JETZT} jetzt={JETZT} />)
    expect(markup).toContain(i18n.t('allgemein:speicherstatus_gespeichert', { zeit: i18n.t('allgemein:speicherstatus_zeit_gerade_eben') }))
    expect(markup).toContain('Gespeichert · gerade eben')
    expect(markup).toContain('wz-speicherstatus--gespeichert')
  })

  it('gespeichert vor Minuten/Stunden: pluralisierte relative Zeit', () => {
    const eine = renderToStaticMarkup(<Speicherstatus zustand="gespeichert" gespeichertUm={JETZT - MINUTE} jetzt={JETZT} />)
    expect(eine).toContain(i18n.t('allgemein:speicherstatus_zeit_minuten', { count: 1 }))
    const drei = renderToStaticMarkup(<Speicherstatus zustand="gespeichert" gespeichertUm={JETZT - 3 * STUNDE} jetzt={JETZT} />)
    expect(drei).toContain(i18n.t('allgemein:speicherstatus_zeit_stunden', { count: 3 }))
    expect(i18n.t('allgemein:speicherstatus_zeit_minuten', { count: 1 })).not.toBe(i18n.t('allgemein:speicherstatus_zeit_minuten', { count: 2 }))
  })

  it('speichert: „Speichert …", ohne Knopf', () => {
    const markup = renderToStaticMarkup(<Speicherstatus zustand="speichert" />)
    expect(markup).toContain(i18n.t('allgemein:speicherstatus_speichert'))
    expect(markup).toContain('wz-speicherstatus--speichert')
    expect(markup).not.toContain('<button')
  })

  it('fehler: „Nicht gespeichert" mit Knopf „erneut versuchen"', () => {
    const markup = renderToStaticMarkup(<Speicherstatus zustand="fehler" aufErneutVersuchen={() => {}} />)
    expect(markup).toContain(i18n.t('allgemein:speicherstatus_fehler'))
    expect(markup).toContain(i18n.t('allgemein:speicherstatus_erneut_versuchen'))
    expect(markup).toContain('<button')
    expect(markup).toContain('wz-speicherstatus--fehler')
  })

  it('alle drei Zustände sind eine höfliche Statusregion (aria-live="polite")', () => {
    for (const markup of [
      renderToStaticMarkup(<Speicherstatus zustand="gespeichert" gespeichertUm={JETZT} jetzt={JETZT} />),
      renderToStaticMarkup(<Speicherstatus zustand="speichert" />),
      renderToStaticMarkup(<Speicherstatus zustand="fehler" aufErneutVersuchen={() => {}} />),
    ]) {
      expect(markup).toContain('role="status"')
      expect(markup).toContain('aria-live="polite"')
    }
  })

  it('der Zustandspunkt ist dekorativ (Bedeutung trägt der Text)', () => {
    const markup = renderToStaticMarkup(<Speicherstatus zustand="speichert" />)
    expect(markup).toMatch(/wz-speicherstatus__punkt[^>]*aria-hidden="true"|aria-hidden="true"[^>]*wz-speicherstatus__punkt/)
  })
})

describe('Speicherstatus — Aktion (AP-1.30 PR 6)', () => {
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

  it('„erneut versuchen" ruft den Callback genau einmal', () => {
    const erneut = vi.fn()
    act(() => root.render(<Speicherstatus zustand="fehler" aufErneutVersuchen={erneut} />))
    const knopf = container.querySelector('button')
    if (knopf === null) throw new Error('Knopf fehlt')
    act(() => knopf.click())
    expect(erneut).toHaveBeenCalledTimes(1)
  })

  it('Zustandswechsel bleibt in derselben Statusregion (Ansage statt Neuaufbau)', () => {
    act(() => root.render(<Speicherstatus zustand="speichert" />))
    const region = container.querySelector('[role="status"]')
    act(() => root.render(<Speicherstatus zustand="gespeichert" gespeichertUm={JETZT} jetzt={JETZT} />))
    expect(container.querySelector('[role="status"]')).toBe(region)
    expect(region?.textContent).toContain('Gespeichert')
  })
})
