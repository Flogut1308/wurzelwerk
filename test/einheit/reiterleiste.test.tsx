// @vitest-environment jsdom
//
// AP-1.30 PR 6: `Reiterleiste` — Molekül `Reiter` (docs/71_Designsystem.md §2.2), Vorlage Artboard
// 1a (docs/design/Entwicklungsvorgaben Person bearbeiten & Medien.md §3.1: „Zähler je Reiter …
// Gelber Punkt = offener Punkt in diesem Reiter"). Geprüft wird das WAI-ARIA-Tabs-Muster
// (`tablist`/`tab`, `aria-selected`, `aria-controls`, Roving-Tabindex, Pfeiltasten + Pos1/Ende),
// die Textalternative des Punkts (WCAG 1.4.1: Farbe allein genügt nicht) und der Zähler.
// `jsdom` + `react-dom/client` + `act` (Muster `personenname-aufrufstellen-interaktiv.test.tsx`),
// weil Tastatur und Fokus ohne echtes DOM nicht prüfbar sind.
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '../../src/renderer/i18n/einrichten'
import { Reiterleiste, reiterElementId, reiterInhaltId, type ReiterleisteReiter } from '../../src/renderer/bausteine/reiterleiste'

// React-19-Schalter für `act(...)` unter Vitest+jsdom (s. `profil-bearbeiten-debounce.test.tsx`).
// `as` erweitert nur den Testprozess-globalThis-Typ um den React-eigenen Schalter.
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const REITER: readonly ReiterleisteReiter[] = [
  { id: 'person', beschriftung: 'Person' },
  { id: 'namen', beschriftung: 'Namen', anzahl: 3 },
  { id: 'beziehungen', beschriftung: 'Beziehungen', anzahl: 5, offenerPunkt: true },
  { id: 'notizen', beschriftung: 'Notizen', offenerPunkt: true },
]

/** Kontrollierte Hülle: hält den aktiven Reiter wie ein echter Aufrufer. */
function Huelle({ start, aufWechsel }: { readonly start: string; readonly aufWechsel: (id: string) => void }) {
  const [aktiv, setAktiv] = useState(start)
  return (
    <Reiterleiste
      idPraefix="probe"
      beschriftung="Bereiche"
      reiter={REITER}
      aktiv={aktiv}
      aufWechsel={(id) => {
        aufWechsel(id)
        setAktiv(id)
      }}
    />
  )
}

function reiterKnoepfe(container: HTMLElement): readonly HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'))
}

function reiterMitId(container: HTMLElement, id: string): HTMLElement {
  const knopf = container.querySelector<HTMLElement>(`#${reiterElementId('probe', id)}`)
  if (knopf === null) throw new Error(`Reiter nicht gefunden: ${id}`)
  return knopf
}

function taste(ziel: HTMLElement, key: string): void {
  ziel.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

describe('Reiterleiste (docs/71 §2.2 „Reiter", AP-1.30 PR 6)', () => {
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

  it('Rolle tablist mit zugänglichem Namen, je Reiter role="tab"', () => {
    act(() => root.render(<Huelle start="person" aufWechsel={() => {}} />))
    const liste = container.querySelector('[role="tablist"]')
    expect(liste).not.toBeNull()
    expect(liste?.getAttribute('aria-label')).toBe('Bereiche')
    expect(liste?.getAttribute('aria-orientation')).toBe('horizontal')
    expect(reiterKnoepfe(container)).toHaveLength(REITER.length)
  })

  it('aria-selected nur am aktiven Reiter, aria-controls zeigt auf den Inhaltsbereich', () => {
    act(() => root.render(<Huelle start="namen" aufWechsel={() => {}} />))
    for (const eintrag of REITER) {
      const knopf = reiterMitId(container, eintrag.id)
      expect(knopf.getAttribute('aria-selected')).toBe(eintrag.id === 'namen' ? 'true' : 'false')
      expect(knopf.getAttribute('aria-controls')).toBe(reiterInhaltId('probe', eintrag.id))
    }
  })

  it('Roving-Tabindex: nur der aktive Reiter ist mit Tab erreichbar', () => {
    act(() => root.render(<Huelle start="beziehungen" aufWechsel={() => {}} />))
    const indizes = reiterKnoepfe(container).map((knopf) => knopf.getAttribute('tabindex'))
    expect(indizes).toEqual(['-1', '-1', '0', '-1'])
  })

  it('Pfeil rechts wechselt und fokussiert den nächsten Reiter, am Ende zurück zum ersten', () => {
    const wechsel = vi.fn()
    act(() => root.render(<Huelle start="notizen" aufWechsel={wechsel} />))
    const letzter = reiterMitId(container, 'notizen')
    act(() => letzter.focus())
    act(() => taste(letzter, 'ArrowRight'))
    expect(wechsel).toHaveBeenLastCalledWith('person')
    expect(document.activeElement).toBe(reiterMitId(container, 'person'))
    expect(reiterMitId(container, 'person').getAttribute('tabindex')).toBe('0')
  })

  it('Pfeil links wechselt zum vorigen Reiter, am Anfang zum letzten', () => {
    const wechsel = vi.fn()
    act(() => root.render(<Huelle start="person" aufWechsel={wechsel} />))
    const erster = reiterMitId(container, 'person')
    act(() => erster.focus())
    act(() => taste(erster, 'ArrowLeft'))
    expect(wechsel).toHaveBeenLastCalledWith('notizen')
    expect(document.activeElement).toBe(reiterMitId(container, 'notizen'))
    act(() => taste(reiterMitId(container, 'notizen'), 'ArrowLeft'))
    expect(wechsel).toHaveBeenLastCalledWith('beziehungen')
  })

  it('Pos1 und Ende springen zum ersten bzw. letzten Reiter', () => {
    const wechsel = vi.fn()
    act(() => root.render(<Huelle start="namen" aufWechsel={wechsel} />))
    const knopf = reiterMitId(container, 'namen')
    act(() => knopf.focus())
    act(() => taste(knopf, 'End'))
    expect(wechsel).toHaveBeenLastCalledWith('notizen')
    expect(document.activeElement).toBe(reiterMitId(container, 'notizen'))
    act(() => taste(reiterMitId(container, 'notizen'), 'Home'))
    expect(wechsel).toHaveBeenLastCalledWith('person')
    expect(document.activeElement).toBe(reiterMitId(container, 'person'))
  })

  it('andere Tasten lösen keinen Wechsel aus (Ziffern 1…8 sind App-Ebene, nicht Komponente)', () => {
    const wechsel = vi.fn()
    act(() => root.render(<Huelle start="namen" aufWechsel={wechsel} />))
    const knopf = reiterMitId(container, 'namen')
    act(() => taste(knopf, '1'))
    act(() => taste(knopf, 'ArrowDown'))
    expect(wechsel).not.toHaveBeenCalled()
  })

  it('Klick wechselt den Reiter', () => {
    const wechsel = vi.fn()
    act(() => root.render(<Huelle start="person" aufWechsel={wechsel} />))
    act(() => reiterMitId(container, 'beziehungen').click())
    expect(wechsel).toHaveBeenCalledWith('beziehungen')
    expect(reiterMitId(container, 'beziehungen').getAttribute('aria-selected')).toBe('true')
  })

  it('Zähler erscheint nur bei gesetzter Anzahl, über den Zaehler-Baustein', () => {
    act(() => root.render(<Huelle start="person" aufWechsel={() => {}} />))
    expect(reiterMitId(container, 'person').querySelector('.wz-zaehler')).toBeNull()
    expect(reiterMitId(container, 'namen').querySelector('.wz-zaehler')?.textContent).toBe('3')
  })

  it('offener Punkt hat eine Textalternative (WCAG 1.4.1) und ist Teil des Reiternamens', () => {
    act(() => root.render(<Huelle start="person" aufWechsel={() => {}} />))
    const text = i18n.t('allgemein:reiter_offener_punkt')
    expect(text.trim()).not.toBe('')
    const beziehungen = reiterMitId(container, 'beziehungen')
    const punkt = beziehungen.querySelector('.wz-reiterleiste__punkt')
    expect(punkt).not.toBeNull()
    // Der farbige Punkt selbst ist dekorativ, die Bedeutung trägt verborgener Text im Reiter.
    expect(punkt?.getAttribute('aria-hidden')).toBe('true')
    expect(beziehungen.querySelector('.wz-reiterleiste__verborgen')?.textContent).toBe(text)
    expect(beziehungen.textContent).toContain(text)
    // Ohne offenen Punkt: weder Punkt noch Text.
    const namen = reiterMitId(container, 'namen')
    expect(namen.querySelector('.wz-reiterleiste__punkt')).toBeNull()
    expect(namen.textContent).not.toContain(text)
  })

  it('Punkt ohne Zähler (nur Beschriftung + Punkt) ist möglich', () => {
    act(() => root.render(<Huelle start="person" aufWechsel={() => {}} />))
    const notizen = reiterMitId(container, 'notizen')
    expect(notizen.querySelector('.wz-zaehler')).toBeNull()
    expect(notizen.querySelector('.wz-reiterleiste__punkt')).not.toBeNull()
  })
})
