// @vitest-environment jsdom
//
// AP-1.30 PR 7b (docs/80 §33 V-130-7-ansicht, Abnahme AP-1.30 „Beim Öffnen steht immer ‚Person' oben,
// die Reiterwahl wird nicht gemerkt. Reiterwechsel speichert."): der Editor als eigene Ansicht,
// geöffnet aus der Lesesicht über „Bearbeiten". Rot zuerst (CLAUDE.md §5): gegen den Stand vor
// PR 7b gibt es weder Dialog „Person bearbeiten" noch Reiter — jede Zusicherung unten scheitert.
//
// Geprüft über `ProfilAnsicht` (die Hülle der Überlagerung), damit auch der Fokusweg
// Liste → Profil → Editor → Profil → Liste belegt ist. jsdom + `react-dom/client` + `act`
// (Muster `personenname-aufrufstellen-interaktiv.test.tsx`), Hook-Module gestummelt: kein
// QueryClient, kein IPC.
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../src/renderer/i18n/einrichten'
import type { PersonDetailAus, PersonDetailKopf, PersonDetailName } from '../../src/shared/schemata/person-detail'

// React-19-Schalter für `act(...)` unter Vitest+jsdom (s. `profil-bearbeiten-debounce.test.tsx`).
// `as` erweitert nur den Testprozess-globalThis-Typ um den React-eigenen Schalter.
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const personDetail: { aktuell: PersonDetailAus | undefined } = { aktuell: undefined }
const feldSetzen = vi.fn()

function stummelHooks(original: Readonly<Record<string, unknown>>, stummel: () => unknown): Record<string, unknown> {
  return Object.fromEntries(Object.keys(original).map((name) => [name, stummel]))
}

vi.mock('../../src/renderer/brücke/abfrage-hooks', async (importOriginal) => {
  const original: Readonly<Record<string, unknown>> = await importOriginal()
  return {
    ...stummelHooks(original, () => ({ data: undefined, isPending: false, isSuccess: false, isError: false })),
    usePersonDetail: () => ({ data: personDetail.aktuell, isPending: false, isSuccess: personDetail.aktuell !== undefined, isError: false, error: null }),
  }
})

vi.mock('../../src/renderer/brücke/befehl-hooks', async (importOriginal) => {
  const original: Readonly<Record<string, unknown>> = await importOriginal()
  return {
    ...stummelHooks(original, () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })),
    usePersonFeldSetzen: () => ({ mutate: feldSetzen, mutateAsync: vi.fn(), isPending: false }),
  }
})

import { ProfilAnsicht } from '../../src/renderer/ansichten/profil/profil-ansicht'

/** Wie `ListenAnsicht`: hält „welches Profil ist offen" und hängt die Überlagerung beim Schließen aus. */
function Ueberlagerung() {
  const [offen, setOffen] = useState(true)
  return offen ? <ProfilAnsicht personId="p-1" aufSchliessen={() => setOffen(false)} /> : null
}

function kopf(ueberschreibung: Partial<PersonDetailKopf> = {}): PersonDetailKopf {
  return {
    person_id: 'p-1',
    anzeigename: 'Anna Beispiel',
    konfidenz_min: null,
    ist_platzhalter: false,
    privat: false,
    geschlecht: null,
    platzhalter_grund: null,
    kennung: 142,
    lebend_status: null,
    ...ueberschreibung,
  }
}

function name(id: string, vornamen: string): PersonDetailName {
  return {
    id,
    typ: 'geburtsname',
    schrift: null,
    vornamen,
    nachname: 'Beispiel',
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
  }
}

function detail(ueberschreibung: Partial<PersonDetailAus> = {}): PersonDetailAus {
  return {
    kopf: kopf(),
    namen: [name('n-1', 'Anna'), name('n-2', 'Anne')],
    grunddaten: [],
    ereignisse: [],
    beziehungen: [],
    gesundheit: [],
    notiz: 'Start',
    sterbeort: null,
    lebensdaten: [],
    warnungen: [],
    offene_punkte: [],
    kernangaben: null,
    belege_anzahl: 0,
    ...ueberschreibung,
  }
}

function knopfMitText(wurzel: ParentNode, text: string): HTMLButtonElement {
  const knopf = Array.from(wurzel.querySelectorAll('button')).find((kandidat) => kandidat.textContent === text)
  if (knopf === undefined) throw new Error(`Knopf nicht gefunden: ${text}`)
  return knopf
}

function dialog(beschriftung: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[role="dialog"][aria-label="${beschriftung}"]`)
}

function reiter(editor: HTMLElement, beschriftung: string): HTMLButtonElement {
  const treffer = Array.from(editor.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
    (kandidat) => kandidat.querySelector('.wz-reiterleiste__beschriftung')?.textContent === beschriftung,
  )
  if (treffer === undefined) throw new Error(`Reiter nicht gefunden: ${beschriftung}`)
  return treffer
}

function aktiverReiter(editor: HTMLElement): string | null | undefined {
  return editor.querySelector('[role="tab"][aria-selected="true"] .wz-reiterleiste__beschriftung')?.textContent
}

/** Setzt den Wert eines kontrollierten React-`<textarea>` und löst `input` aus (nativer Setter,
 * sonst verschluckt React den Wert). Kein Fokuswechsel — der Blur-Weg bleibt aus dem Spiel. */
function eintippen(feld: HTMLTextAreaElement, wert: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  if (setter === undefined) throw new Error('kein nativer value-Setter')
  setter.call(feld, wert)
  feld.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('PersonBearbeitenAnsicht — eigene Ansicht mit acht Reitern (AP-1.30 PR 7b)', () => {
  let container: HTMLDivElement
  let root: Root
  let listenzeile: HTMLButtonElement
  let listenzeileFokusse: number

  beforeEach(() => {
    personDetail.aktuell = detail()
    feldSetzen.mockClear()
    listenzeile = document.createElement('button')
    listenzeile.textContent = 'Listenzeile'
    document.body.appendChild(listenzeile)
    listenzeileFokusse = 0
    listenzeile.addEventListener('focus', () => {
      listenzeileFokusse += 1
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    listenzeile.remove()
    vi.useRealTimers()
  })

  function profilOeffnen(): void {
    listenzeile.focus()
    listenzeileFokusse = 0
    act(() => root.render(<Ueberlagerung />))
  }

  function editorOeffnen(): HTMLElement {
    const profil = dialog('Profil') ?? document.querySelector<HTMLElement>('[role="dialog"]')
    if (profil === null) throw new Error('Profil nicht offen')
    act(() => knopfMitText(profil, 'Bearbeiten').click())
    const editor = dialog('Person bearbeiten')
    if (editor === null) throw new Error('Editor „Person bearbeiten" nicht offen')
    return editor
  }

  it('„Bearbeiten" öffnet den Editor als eigene Ansicht: Lesesicht weg, acht Reiter, „Person" aktiv', () => {
    profilOeffnen()
    const editor = editorOeffnen()
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    const namen = Array.from(editor.querySelectorAll('[role="tab"] .wz-reiterleiste__beschriftung')).map((knoten) => knoten.textContent)
    expect(namen).toEqual(['Person', 'Namen', 'Leben', 'Beziehungen', 'Belege & Medien', 'Gesundheit', 'Notizen', 'Verwaltung'])
    expect(aktiverReiter(editor)).toBe('Person')
    // Nur der aktive Reiter hat einen Inhaltsbereich, benannt nach seinem Reiter.
    const inhalte = editor.querySelectorAll('[role="tabpanel"]')
    expect(inhalte).toHaveLength(1)
    expect(inhalte[0]?.getAttribute('aria-labelledby')).toBe(reiter(editor, 'Person').id)
  })

  it('Kopf: Anzeigename als Überschrift und Kennung „P-0142"', () => {
    profilOeffnen()
    const editor = editorOeffnen()
    expect(editor.querySelector('h1')?.textContent).toBe('Anna Beispiel')
    expect(editor.textContent).toContain('P-0142')
  })

  it('Zähler am Reiter „Namen" = Anzahl der Namensformen', () => {
    profilOeffnen()
    const editor = editorOeffnen()
    expect(reiter(editor, 'Namen').textContent).toContain('2')
    expect(reiter(editor, 'Person').querySelector('.wz-zaehler')).toBeNull()
  })

  it('Umzug: Geschlecht im Reiter Person, Namen im Reiter Namen, Notiz im Reiter Notizen, Ereignisse im Reiter Leben', () => {
    profilOeffnen()
    const editor = editorOeffnen()
    const inhalt = (): Element | null => editor.querySelector('[role="tabpanel"]')
    expect(inhalt()?.textContent).toContain('Geschlecht')
    expect(inhalt()?.querySelector('textarea')).toBeNull()

    act(() => reiter(editor, 'Namen').click())
    expect(aktiverReiter(editor)).toBe('Namen')
    expect(inhalt()?.querySelector('input[value="Anne"]')).not.toBeNull()

    act(() => reiter(editor, 'Notizen').click())
    const notiz = inhalt()?.querySelector('textarea')
    expect(notiz?.value).toBe('Start')

    act(() => reiter(editor, 'Leben').click())
    expect(inhalt()?.textContent).toContain('Noch kein Ereignis erfasst.')

    act(() => reiter(editor, 'Verwaltung').click())
    expect(inhalt()?.textContent).toContain('kommt in einem späteren Schritt')
  })

  it('Reiterwechsel speichert: getippte Notiz wird beim Aushängen des Reiters geschrieben, ohne auf den Debounce zu warten', () => {
    vi.useFakeTimers()
    profilOeffnen()
    const editor = editorOeffnen()
    act(() => reiter(editor, 'Notizen').click())
    const notiz = editor.querySelector('[role="tabpanel"] textarea')
    if (!(notiz instanceof HTMLTextAreaElement)) throw new Error('Notizfeld fehlt')
    act(() => eintippen(notiz, 'Start und mehr'))
    expect(feldSetzen).not.toHaveBeenCalled()

    act(() => reiter(editor, 'Person').click())
    expect(feldSetzen).toHaveBeenCalledTimes(1)
    expect(feldSetzen).toHaveBeenCalledWith({ id: 'p-1', feld: 'notiz', wert: 'Start und mehr' })

    // Der Debounce findet danach nichts mehr vor — kein zweites Schreiben.
    act(() => vi.runAllTimers())
    expect(feldSetzen).toHaveBeenCalledTimes(1)
  })

  it('Reiterwahl wird nicht gemerkt: nach „Fertig" und erneutem „Bearbeiten" steht wieder „Person" oben', () => {
    profilOeffnen()
    let editor = editorOeffnen()
    act(() => reiter(editor, 'Notizen').click())
    act(() => knopfMitText(editor, 'Fertig').click())
    expect(dialog('Person bearbeiten')).toBeNull()
    editor = editorOeffnen()
    expect(aktiverReiter(editor)).toBe('Person')
  })

  it('Fokus: Öffnen setzt ihn auf den aktiven Reiter, „Fertig" gibt ihn an „Bearbeiten" zurück, die Listenzeile bekommt ihn erst beim Schließen', () => {
    profilOeffnen()
    const editor = editorOeffnen()
    expect(document.activeElement).toBe(reiter(editor, 'Person'))
    expect(listenzeileFokusse).toBe(0)

    act(() => knopfMitText(editor, 'Fertig').click())
    const profil = document.querySelector<HTMLElement>('[role="dialog"]')
    if (profil === null) throw new Error('Profil nicht zurück')
    expect(document.activeElement).toBe(knopfMitText(profil, 'Bearbeiten'))
    expect(listenzeileFokusse).toBe(0)

    act(() => knopfMitText(profil, 'Schließen').click())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(listenzeile)
    expect(listenzeileFokusse).toBe(1)
  })

  it('Escape im Editor führt zurück in die Lesesicht, nicht zur Liste', () => {
    profilOeffnen()
    const editor = editorOeffnen()
    act(() => {
      reiter(editor, 'Person').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(dialog('Person bearbeiten')).toBeNull()
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(listenzeileFokusse).toBe(0)
  })
})
