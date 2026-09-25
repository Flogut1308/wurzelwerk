// @vitest-environment jsdom
//
// hueter #152 (AP-1.30 PR 2, docs/80_Offene_Fragen.md §32 V-4-ohne-namen): zwei Aufrufstellen von
// `personennameText` sind nur nach einer Interaktion sichtbar und darum mit `renderToStaticMarkup`
// (`personenname-aufrufstellen.test.tsx`) nicht erreichbar:
//   1. Prüfhinweis-Schublade der Listenansicht — erst nach Klick auf die Fußzeile geöffnet.
//   2. „weiterer Beteiligter" im Ereignis-Formular — der gewählte Name erscheint erst nach
//      „hinzufügen" → Suchtext tippen → Treffer wählen.
// Darum hier `jsdom` + `react-dom/client` + `act` (Muster `profil-bearbeiten-debounce.test.tsx`),
// ohne Produktivcode zu ändern. Hook-Module sind vollständig gestummelt: kein QueryClient, kein IPC.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '../../src/renderer/i18n/einrichten'
import type { PersonListeZeile, SucheTreffer } from '../../src/shared/schemata/person-liste'
import type { PruefhinweisEintrag } from '../../src/shared/schemata/pruefhinweise'

// React-19-Schalter für `act(...)` unter Vitest+jsdom (s. `profil-bearbeiten-debounce.test.tsx`).
// `as` erweitert nur den Testprozess-globalThis-Typ um den React-eigenen Schalter.
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const OHNE_NAMEN = '(ohne Namen)'

const daten: { pruefhinweise: readonly PruefhinweisEintrag[]; treffer: readonly SucheTreffer[] } = { pruefhinweise: [], treffer: [] }

function stummelHooks(original: Readonly<Record<string, unknown>>, stummel: () => unknown): Record<string, unknown> {
  return Object.fromEntries(Object.keys(original).map((name) => [name, stummel]))
}

vi.mock('../../src/renderer/brücke/abfrage-hooks', async (importOriginal) => {
  const original: Readonly<Record<string, unknown>> = await importOriginal()
  return {
    ...stummelHooks(original, () => ({ data: undefined, isPending: false, isSuccess: false, isError: false })),
    usePruefhinweise: () => ({
      data: { eintraege: daten.pruefhinweise, anzahl: daten.pruefhinweise.length },
      isPending: false,
      isSuccess: true,
      isError: false,
    }),
    useSuche: () => ({ data: { treffer: daten.treffer, gesamt: daten.treffer.length }, isPending: false, isSuccess: true, isError: false }),
  }
})

vi.mock('../../src/renderer/brücke/befehl-hooks', async (importOriginal) => {
  const original: Readonly<Record<string, unknown>> = await importOriginal()
  return stummelHooks(original, () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }))
})

import { ListenAnsicht } from '../../src/renderer/ansichten/liste/listen-ansicht'
import { EreignisseBearbeitenAbschnitt } from '../../src/renderer/ansichten/profil/profil-bearbeiten-ereignisse'

function listenZeile(ueberschreibung: Partial<PersonListeZeile> = {}): PersonListeZeile {
  return {
    person_id: 'p-1',
    anzeigename: 'Anna Beispiel',
    geburt_jahr: null,
    tod_jahr: null,
    geburt_ort_name: null,
    konfidenz_min: null,
    hat_widerspruch: false,
    ist_platzhalter: false,
    beruf: null,
    belegzahl: 0,
    kinderzahl: 0,
    geburt_datum: null,
    tod_datum: null,
    ...ueberschreibung,
  }
}

function knopfMitText(container: HTMLElement, text: string): HTMLButtonElement {
  const knopf = Array.from(container.querySelectorAll('button')).find((kandidat) => kandidat.textContent === text)
  if (knopf === undefined) throw new Error(`Knopf nicht gefunden: ${text}`)
  return knopf
}

/** Setzt den Wert eines kontrollierten React-`<input>` und löst das `input`-Ereignis aus, das
 * React als `onChange` verarbeitet (Wert über den nativen Setter, sonst verschluckt React ihn). */
function eintippen(eingabe: HTMLInputElement, wert: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (setter === undefined) throw new Error('kein nativer value-Setter')
  setter.call(eingabe, wert)
  eingabe.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('Aufrufstellen nach Interaktion zeigen „(ohne Namen)" (hueter #152, §32 V-4-ohne-namen)', () => {
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
    daten.pruefhinweise = []
    daten.treffer = []
  })

  it('Prüfhinweis-Schublade: ein Eintrag mit leerem Anzeigenamen zeigt „(ohne Namen)"', () => {
    daten.pruefhinweise = [{ code: 'tod_vor_geburt', personId: 'p-1', anzeigename: '' }]
    act(() => root.render(<ListenAnsicht projekt={{ pfad: '/tmp/x.wurzelwerk', name: 'x', schemaversion: '1' }} aufProjektGeschlossen={() => {}} />))
    expect(container.querySelector('.wz-pruefhinweis-liste')).toBeNull()

    act(() => knopfMitText(container, i18n.t('pruefhinweise:fusszeile_anzahl', { count: 1 })).click())

    const eintrag = container.querySelector('.wz-pruefhinweis-liste__text')
    expect(eintrag?.textContent).toContain(OHNE_NAMEN)
  })

  it('weiterer Beteiligter: ein gewählter Treffer mit leerem Anzeigenamen zeigt „(ohne Namen)"', () => {
    daten.treffer = [{ ...listenZeile({ person_id: 'p-7', anzeigename: '' }), quelle: 'volltext' }]
    act(() => root.render(<EreignisseBearbeitenAbschnitt personId="p-1" ereignisse={[]} />))

    act(() => knopfMitText(container, i18n.t('profil:ereignis_neu_weiterer_beteiligter_hinzufuegen')).click())
    const beteiligter = container.querySelector('.wz-profil-bearbeiten-ereignisse__beteiligter')
    const eingabe = beteiligter?.querySelector('input')
    if (!(eingabe instanceof HTMLInputElement)) throw new Error('Suchfeld des weiteren Beteiligten fehlt')
    act(() => eintippen(eingabe, 'x'))

    const option = beteiligter?.querySelector('[role="option"].wz-personenwaehler__zeile--treffer')
    if (option === null || option === undefined) throw new Error('Treffer-Zeile fehlt')
    act(() => {
      option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    })

    // Nach der Wahl ist der Personenwähler weg; die Zeile zeigt nur noch den gewählten Namen.
    const nachher = container.querySelector('.wz-profil-bearbeiten-ereignisse__beteiligter')
    expect(nachher?.querySelector('input[type="search"]')).toBeNull()
    expect(nachher?.textContent).toContain(OHNE_NAMEN)
  })
})
