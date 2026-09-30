// @vitest-environment jsdom
//
// AP-1.30 PR 11b (A-02, C-26; docs/80 §33 V-130-11b): Vorschau-Umschalter im Reiter „Namen" (Artboard 2a,
// „Vorschau in … · Zeigt: … · Rückfall: Sprache → Umschrift → Hauptname"). Rot zuerst (CLAUDE.md §5): vor
// PR 11b gibt es `reiter-namen-vorschau.tsx` nicht.
//
// Muster `reiterleiste.test.tsx`: jsdom + `react-dom/client` + `act`, weil Tastatur und Fokus ohne echtes
// DOM nicht prüfbar sind. Die Komponente schreibt nichts (reine Anzeige), darum keine Hook-Attrappen.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '../../src/renderer/i18n/einrichten'
import type { PersonDetailName, PersonDetailNamensteil } from '../../src/shared/schemata/person-detail'
import { NamenVorschau } from '../../src/renderer/ansichten/profil/reiter-namen-vorschau'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function teil(id: string, art: PersonDetailNamensteil['art'], wert: string, sortierIndex = 0): PersonDetailNamensteil {
  return { id, art, wert, ist_rufname: false, sortier_index: sortierIndex, feminine_variante: null }
}

function form(id: string, ueberschreibung: Partial<PersonDetailName>): PersonDetailName {
  return {
    id,
    ist_bevorzugt: false,
    typ: 'geburtsname',
    schrift: null,
    vornamen: null,
    nachname: null,
    praefix: null,
    titel_vor: null,
    zusatz_nach: null,
    vatersname: null,
    rufname_text: null,
    rufname_index: null,
    umschrift_von: null,
    umschrift_norm: null,
    sprache: null,
    gueltig_von: null,
    gueltig_bis: null,
    original_text: null,
    rolle: 'geburtsname',
    rollen_notiz: null,
    reihenfolge: null,
    konfidenz: null,
    sortier_index: null,
    teile: [],
    ...ueberschreibung,
  }
}

/** Hauptname ossetisch (nachname_zuerst) mit lateinischer Umschrift, dazu eine russische Form. */
const NAMEN: readonly PersonDetailName[] = [
  form('f1', { ist_bevorzugt: true, sprache: 'os', schrift: 'cyrl', reihenfolge: 'nachname_zuerst', teile: [teil('a', 'vorname', 'Карл'), teil('b', 'nachname', 'Гуытнаты')] }),
  form('f2', { rolle: null, umschrift_von: 'f1', schrift: 'latn', teile: [teil('c', 'vorname', 'Karl'), teil('d', 'nachname', 'Gwytnaty')] }),
  form('f3', { sprache: 'ru', schrift: 'cyrl', rolle: 'sonstiges', teile: [teil('e', 'vorname', 'Карл'), teil('f', 'nachname', 'Гутнов')] }),
]

function optionen(container: HTMLElement): readonly HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="radiogroup"] [role="radio"]'))
}

function option(container: HTMLElement, beschriftung: string): HTMLElement {
  const treffer = optionen(container).find((element) => element.textContent === beschriftung)
  if (treffer === undefined) throw new Error(`Option nicht gefunden: ${beschriftung}`)
  return treffer
}

function gezeigt(container: HTMLElement): { readonly name: string | null | undefined; readonly herkunft: string | null | undefined } {
  return {
    name: container.querySelector('.wz-namen-vorschau__name')?.textContent,
    herkunft: container.querySelector('.wz-namen-vorschau__herkunft')?.textContent,
  }
}

function taste(ziel: HTMLElement, key: string): KeyboardEvent {
  const ereignis = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  act(() => {
    ziel.dispatchEvent(ereignis)
  })
  return ereignis
}

describe('NamenVorschau (AP-1.30 PR 11b, Artboard 2a)', () => {
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

  it('Optionsgruppe mit zugänglichem Namen: Oberflächensprache zuerst, dann die Sprachen der Formen (Endonyme)', () => {
    act(() => root.render(<NamenVorschau namen={NAMEN} istPlatzhalter={false} />))
    const gruppe = container.querySelector('[role="radiogroup"]')
    expect(gruppe).not.toBeNull()
    const beschriftungId = gruppe?.getAttribute('aria-labelledby')
    expect(beschriftungId).toBeTruthy()
    expect(document.getElementById(beschriftungId ?? '')?.textContent).toBe('Vorschau in')
    expect(optionen(container).map((element) => element.textContent)).toEqual(['Deutsch', 'Ирон', 'Русский'])
    expect(optionen(container).map((element) => element.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
    expect(container.textContent).toContain('Rückfall: Sprache → Umschrift → Hauptname')
  })

  it('Start in der Oberflächensprache zeigt, was der Kopf zeigt — hier die Umschrift, mit sichtbarer Herkunft', () => {
    act(() => root.render(<NamenVorschau namen={NAMEN} istPlatzhalter={false} />))
    expect(gezeigt(container)).toEqual({ name: 'Karl Gwytnaty', herkunft: 'Herkunft: Umschrift des Hauptnamens' })
    expect(container.textContent).toContain('Zeigt:')
  })

  it('Umschalten per Klick ändert „Zeigt:" und die Herkunft', () => {
    act(() => root.render(<NamenVorschau namen={NAMEN} istPlatzhalter={false} />))
    act(() => option(container, 'Ирон').click())
    expect(gezeigt(container)).toEqual({ name: 'Гуытнаты Карл', herkunft: 'Herkunft: Namensform dieser Sprache' })
    expect(option(container, 'Ирон').getAttribute('aria-checked')).toBe('true')
    expect(option(container, 'Deutsch').getAttribute('aria-checked')).toBe('false')

    act(() => option(container, 'Русский').click())
    expect(gezeigt(container)).toEqual({ name: 'Карл Гутнов', herkunft: 'Herkunft: Namensform dieser Sprache' })
  })

  it('Hauptname als Herkunft, wenn es weder Sprachform noch Umschrift gibt', () => {
    act(() => root.render(<NamenVorschau namen={[NAMEN[0] ?? form('x', {}), NAMEN[2] ?? form('y', {})]} istPlatzhalter={false} />))
    expect(gezeigt(container)).toEqual({ name: 'Гуытнаты Карл', herkunft: 'Herkunft: Hauptname' })
  })

  it('Tastatur: Roving-Tabindex, Pfeile wählen und fokussieren (mit Umlauf), Pos1/Ende; Ziffern bleiben unberührt', () => {
    act(() => root.render(<NamenVorschau namen={NAMEN} istPlatzhalter={false} />))
    expect(optionen(container).map((element) => element.tabIndex)).toEqual([0, -1, -1])

    const deutsch = option(container, 'Deutsch')
    act(() => deutsch.focus())
    expect(taste(deutsch, 'ArrowRight').defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(option(container, 'Ирон'))
    expect(gezeigt(container).name).toBe('Гуытнаты Карл')
    expect(optionen(container).map((element) => element.tabIndex)).toEqual([-1, 0, -1])

    taste(option(container, 'Ирон'), 'ArrowDown')
    expect(document.activeElement).toBe(option(container, 'Русский'))
    expect(gezeigt(container).name).toBe('Карл Гутнов')

    taste(option(container, 'Русский'), 'ArrowRight')
    expect(document.activeElement).toBe(option(container, 'Deutsch'))
    expect(gezeigt(container).name).toBe('Karl Gwytnaty')

    taste(option(container, 'Deutsch'), 'ArrowLeft')
    expect(document.activeElement).toBe(option(container, 'Русский'))
    taste(option(container, 'Русский'), 'ArrowUp')
    expect(document.activeElement).toBe(option(container, 'Ирон'))
    taste(option(container, 'Ирон'), 'Home')
    expect(document.activeElement).toBe(option(container, 'Deutsch'))
    taste(option(container, 'Deutsch'), 'End')
    expect(document.activeElement).toBe(option(container, 'Русский'))

    // Tasten 1…8 wählen im Editor den Reiter (App-Ebene, `darfKontexttasteWirken`) — die Gruppe
    // beansprucht sie nicht.
    const ziffer = taste(option(container, 'Русский'), '2')
    expect(ziffer.defaultPrevented).toBe(false)
    expect(option(container, 'Русский').getAttribute('aria-checked')).toBe('true')
  })

  it('ohne Namensformen: keine Vorschau', () => {
    act(() => root.render(<NamenVorschau namen={[]} istPlatzhalter={false} />))
    expect(container.querySelector('[role="radiogroup"]')).toBeNull()
  })

  it('Platzhalter: statt eines Namens der Ersatztext wie im Kopf (A-17)', () => {
    act(() => root.render(<NamenVorschau namen={NAMEN} istPlatzhalter />))
    expect(gezeigt(container).name).toBe('Platzhalter')
  })
})
