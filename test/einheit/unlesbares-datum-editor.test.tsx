// @vitest-environment jsdom
//
// AP-1.30 U-130-9b-unlesbar (docs/80 §33 V-130-unlesbar, Entscheidung B): ein nicht auflösbares
// Datum im Reiter Person wird nicht gespeichert — aber auch nicht still verloren.
// (1) Solange ein Feld einen unlesbaren, ungespeicherten Text hält, zeigt der Speicherstatus
//     „Nicht gespeichert — Datum nicht lesbar".
// (2) „Fertig", Reiterwechsel (Klick, Tasten 1…8, Sprung) und Schließen (✕/Esc) fragen nach:
//     „Zurück zum Feld" / „Eingabe verwerfen" / (bei erkennbarem Jahr) „Als ‚etwa JJJJ‘ … speichern".
// (3) Dieselbe „etwa"-Aktion steht direkt unter dem Feld.
// Rot zuerst (CLAUDE.md §5): vor diesem PR schließt „Fertig" sofort, und der Status bleibt leer.
//
// jsdom + `react-dom/client` + `act` (Muster `reiter-person.test.tsx`); alle Befehls-Hooks sind durch
// einen Rekorder ersetzt, die Kontexttaste wird über das abgefangene Abo ausgelöst.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../src/renderer/i18n/einrichten'
import type { KontexttasteNutzlast } from '../../src/shared/ipc/vertrag'
import type { PersonDetailAus, PersonDetailAussage, PersonDetailLebensdatum } from '../../src/shared/schemata/person-detail'
import { AUTOSAVE_DEBOUNCE_MS } from '../../src/shared/autosave'

// React-19-Schalter für `act(...)` unter Vitest+jsdom (s. `profil-bearbeiten-debounce.test.tsx`).
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface Aufruf {
  readonly hook: string
  readonly ein: unknown
}

const aufrufe: Aufruf[] = []
const personDetail: { aktuell: PersonDetailAus | undefined } = { aktuell: undefined }
const kontexttaste: { bei: ((nutzlast: KontexttasteNutzlast) => void) | null } = { bei: null }

vi.mock('../../src/renderer/brücke/befehl-hooks', async (importOriginal) => {
  const original: Readonly<Record<string, unknown>> = await importOriginal()
  return {
    ...Object.fromEntries(
      Object.keys(original).map((name) => [
        name,
        () => ({
          mutate: (ein: unknown) => {
            aufrufe.push({ hook: name, ein })
          },
          mutateAsync: (ein: unknown) => {
            aufrufe.push({ hook: name, ein })
            return Promise.resolve({ id: `neu-${name}` })
          },
          isPending: false,
          error: null,
        }),
      ]),
    ),
    useKontexttasteAbo: (bei: (nutzlast: KontexttasteNutzlast) => void) => {
      kontexttaste.bei = bei
    },
  }
})

vi.mock('../../src/renderer/brücke/abfrage-hooks', async (importOriginal) => {
  const original: Readonly<Record<string, unknown>> = await importOriginal()
  return {
    ...Object.fromEntries(Object.keys(original).map((name) => [name, () => ({ data: undefined, isPending: false, isSuccess: false, isError: false })])),
    usePersonDetail: () => ({ data: personDetail.aktuell, isPending: false, isSuccess: personDetail.aktuell !== undefined, isError: false, error: null }),
  }
})

import { PersonBearbeitenAnsicht } from '../../src/renderer/ansichten/profil/person-bearbeiten-ansicht'

const FELD = 'person-bearbeiten-feld-geburtsdatum'
const STATUS_UNLESBAR = 'Nicht gespeichert — Datum nicht lesbar'
const ETWA_1788 = 'Als ‚etwa 1788‘ mit Originaltext speichern'

/** Exaktes Jahresdatum als gelesene Datumsgruppe. */
function datumGruppe(jahr: string): NonNullable<PersonDetailAussage['datum']> {
  return { kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', wert1: jahr, wert2: null, originaltext: null, sort_von: 1, sort_bis: 2, zweitkalender: null, zweitwert: null, doppeljahr: null }
}

function geburt(): PersonDetailAussage {
  return {
    aussage_id: 'g-1',
    wert: '1901',
    wert_text: null,
    wert_zahl: null,
    wert_ref_id: null,
    datum: {
      kalender: 'gregorian',
      modifikator: 'exakt',
      praezision: 'jahr',
      wert1: '1901',
      wert2: null,
      originaltext: null,
      sort_von: 1,
      sort_bis: 2,
      zweitkalender: null,
      zweitwert: null,
      doppeljahr: null,
    },
    konfidenz: 3,
    ist_bevorzugt: false,
    begruendung: null,
    unsicherheit: null,
    gueltig_von: null,
    gueltig_bis: null,
    belege: [],
  }
}

function leer(angabe: PersonDetailLebensdatum['angabe']): PersonDetailLebensdatum {
  return { angabe, herkunft: null, aussage_id: null, ereignis_id: null, datum: null, datum_originaltext: null, ort_id: null, ort_name: null }
}

function detail(mitGeburt: boolean): PersonDetailAus {
  const aussage = geburt()
  return {
    kopf: {
      person_id: 'p-1',
      anzeigename: 'Anna Beispiel',
      konfidenz_min: null,
      ist_platzhalter: false,
      privat: false,
      geschlecht: 'F',
      platzhalter_grund: null,
      kennung: 1,
      lebend_status: 'lebend',
    },
    namen: [],
    grunddaten: mitGeburt
      ? [{ praedikat: 'geburtsdatum', wert: aussage.wert, konfidenz: aussage.konfidenz, belegzahl: 0, hat_widerspruch: false, hatKonkurrierende: false, aussagen: [aussage] }]
      : [],
    ereignisse: [],
    beziehungen: [],
    geschwister: [],
    partnerschaften: [],
    kinder_ohne_partnerschaft: [],
    gesundheit: [],
    notiz: null,
    sterbeort: null,
    lebensdaten: [mitGeburt ? { ...leer('geburtsdatum'), herkunft: 'aussage', aussage_id: 'g-1' } : leer('geburtsdatum'), leer('geburtsort'), leer('todesdatum'), leer('todesort')],
    ereignis_existenz: [],
    warnungen: [],
    offene_punkte: [],
    kernangaben: null,
    belege_anzahl: 0,
  }
}

function eingabe(): HTMLInputElement {
  const knoten = document.getElementById(FELD)
  if (!(knoten instanceof HTMLInputElement)) throw new Error(`Eingabe fehlt: ${FELD}`)
  return knoten
}

function eintippen(feld: HTMLInputElement, wert: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (setter === undefined) throw new Error('kein nativer value-Setter')
  setter.call(feld, wert)
  feld.dispatchEvent(new Event('input', { bubbles: true }))
}

function knopf(wurzel: ParentNode, text: string): HTMLButtonElement {
  // Symbolknöpfe (✕) tragen ihren Namen als `aria-label`.
  const treffer = Array.from(wurzel.querySelectorAll('button')).find((kandidat) => kandidat.textContent === text || kandidat.getAttribute('aria-label') === text)
  if (treffer === undefined) throw new Error(`Knopf nicht gefunden: ${text}`)
  return treffer
}

function reiter(text: string): HTMLButtonElement {
  const treffer = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
    (kandidat) => kandidat.querySelector('.wz-reiterleiste__beschriftung')?.textContent === text,
  )
  if (treffer === undefined) throw new Error(`Reiter nicht gefunden: ${text}`)
  return treffer
}

function aktiverReiter(): string | null | undefined {
  return document.querySelector('[role="tab"][aria-selected="true"] .wz-reiterleiste__beschriftung')?.textContent
}

function nachfrage(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="alertdialog"]')
}

function statusTexte(): readonly string[] {
  return Array.from(document.querySelectorAll('[role="status"]')).map((knoten) => knoten.textContent ?? '')
}

function aufrufeVon(hook: string): readonly unknown[] {
  return aufrufe.filter((aufruf) => aufruf.hook === hook).map((aufruf) => aufruf.ein)
}

describe('Unlesbares Datum im Reiter Person (U-130-9b-unlesbar)', () => {
  let container: HTMLDivElement
  let root: Root
  const aufFertig = vi.fn()
  const aufSchliessen = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    aufrufe.length = 0
    kontexttaste.bei = null
    aufFertig.mockClear()
    aufSchliessen.mockClear()
    personDetail.aktuell = detail(true)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(<PersonBearbeitenAnsicht personId="p-1" aufFertig={aufFertig} aufSchliessen={aufSchliessen} />))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  /** Unlesbaren Text tippen, Frist und Blur abwarten — der Autosave hat es versucht und nichts geschrieben. */
  function unlesbarTippen(text: string): void {
    const feld = eingabe()
    act(() => feld.focus())
    act(() => eintippen(feld, text))
    act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS))
    act(() => feld.blur())
    expect(aufrufe).toHaveLength(0)
  }

  it('Status zeigt „Nicht gespeichert — Datum nicht lesbar", solange der unlesbare Text im Feld steht', () => {
    expect(statusTexte().join('')).not.toContain(STATUS_UNLESBAR)
    unlesbarTippen('31.02.1788')
    expect(statusTexte()).toContain(STATUS_UNLESBAR)
    // Wieder lesbar: der Status meldet den Unlesbar-Zustand nicht mehr.
    act(() => eintippen(eingabe(), '1902'))
    expect(statusTexte().join('')).not.toContain(STATUS_UNLESBAR)
  })

  it('ein lesbares Datum fragt nicht nach: „Fertig" schließt sofort', () => {
    act(() => eintippen(eingabe(), '1902'))
    act(() => knopf(document, 'Fertig').click())
    expect(nachfrage()).toBeNull()
    expect(aufFertig).toHaveBeenCalledTimes(1)
  })

  it('„Fertig" mit unlesbarem Text: Nachfrage statt Schließen; „Zurück zum Feld" setzt den Fokus ins Feld', () => {
    unlesbarTippen('31.02.1788')
    act(() => knopf(document, 'Fertig').click())
    const dialog = nachfrage()
    expect(dialog).not.toBeNull()
    expect(aufFertig).not.toHaveBeenCalled()
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(dialog?.textContent).toContain('31.02.1788')
    if (dialog === null) throw new Error('Nachfrage fehlt')
    act(() => knopf(dialog, 'Zurück zum Feld').click())
    expect(nachfrage()).toBeNull()
    expect(document.activeElement).toBe(eingabe())
    expect(eingabe().value).toBe('31.02.1788')
    expect(aufFertig).not.toHaveBeenCalled()
    expect(aufrufe).toHaveLength(0)
  })

  it('„Eingabe verwerfen" stellt den gespeicherten Wert her und führt „Fertig" aus — ohne Befehl', () => {
    unlesbarTippen('31.02.1788')
    act(() => knopf(document, 'Fertig').click())
    const dialog = nachfrage()
    if (dialog === null) throw new Error('Nachfrage fehlt')
    act(() => knopf(dialog, 'Eingabe verwerfen').click())
    expect(nachfrage()).toBeNull()
    expect(eingabe().value).toBe('1901')
    expect(aufFertig).toHaveBeenCalledTimes(1)
    act(() => vi.runOnlyPendingTimers())
    expect(aufrufe).toHaveLength(0)
  })

  it('„Als ‚etwa 1788‘ … speichern" im Dialog sendet aussage.aendern mit gültigem Datumswert und führt „Fertig" aus', () => {
    unlesbarTippen('31.02.1788')
    act(() => knopf(document, 'Fertig').click())
    const dialog = nachfrage()
    if (dialog === null) throw new Error('Nachfrage fehlt')
    act(() => knopf(dialog, ETWA_1788).click())
    expect(aufrufeVon('useAussageAendern')).toEqual([
      { id: 'g-1', datum: { kalender: 'gregorian', modifikator: 'etwa', praezision: 'jahr', wert1: '1788', original_text: '31.02.1788' }, konfidenz: 3 },
    ])
    expect(aufFertig).toHaveBeenCalledTimes(1)
  })

  it('leeres Feld: „etwa"-Aktion legt die Aussage an (aussage.anlegen)', () => {
    act(() => root.unmount())
    personDetail.aktuell = detail(false)
    root = createRoot(container)
    act(() => root.render(<PersonBearbeitenAnsicht personId="p-1" aufFertig={aufFertig} aufSchliessen={aufSchliessen} />))
    unlesbarTippen('1788-13-01')
    act(() => knopf(document, 'Fertig').click())
    const dialog = nachfrage()
    if (dialog === null) throw new Error('Nachfrage fehlt')
    act(() => knopf(dialog, ETWA_1788).click())
    expect(aufrufeVon('useAussageAnlegen')).toEqual([
      {
        subjektTyp: 'person',
        subjektId: 'p-1',
        praedikat: 'geburtsdatum',
        datum: { kalender: 'gregorian', modifikator: 'etwa', praezision: 'jahr', wert1: '1788', original_text: '1788-13-01' },
        konfidenz: 2,
      },
    ])
    expect(aufFertig).toHaveBeenCalledTimes(1)
  })

  it('die „etwa"-Aktion steht auch direkt unter dem Feld; danach meldet der Status nichts Unlesbares mehr', () => {
    unlesbarTippen('31.02.1788')
    const angabe = eingabe().closest('.wz-reiter-person__angabe')
    if (angabe === null) throw new Error('Angabe fehlt')
    act(() => knopf(angabe, ETWA_1788).click())
    expect(aufrufeVon('useAussageAendern')).toHaveLength(1)
    expect(statusTexte().join('')).not.toContain(STATUS_UNLESBAR)
    act(() => knopf(document, 'Fertig').click())
    expect(nachfrage()).toBeNull()
    expect(aufFertig).toHaveBeenCalledTimes(1)
  })

  it('nach dem Nachladen: der gespeicherte Wortlaut steht im Feld, gedeutet als „etwa 1788" (nicht „nicht auflösbar")', () => {
    unlesbarTippen('31.02.1788')
    const angabe = eingabe().closest('.wz-reiter-person__angabe')
    if (angabe === null) throw new Error('Angabe fehlt')
    act(() => knopf(angabe, ETWA_1788).click())
    const bisher = detail(true)
    const gespeichert = geburt()
    const etwa: PersonDetailAussage = {
      ...gespeichert,
      wert: '1788',
      datum: {
        kalender: 'gregorian',
        modifikator: 'etwa',
        praezision: 'jahr',
        wert1: '1788',
        wert2: null,
        originaltext: '31.02.1788',
        sort_von: 10,
        sort_bis: 20,
        zweitkalender: null,
        zweitwert: null,
        doppeljahr: null,
      },
    }
    personDetail.aktuell = {
      ...bisher,
      grunddaten: [{ praedikat: 'geburtsdatum', wert: '1788', konfidenz: 3, belegzahl: 0, hat_widerspruch: false, hatKonkurrierende: false, aussagen: [etwa] }],
    }
    act(() => root.render(<PersonBearbeitenAnsicht personId="p-1" aufFertig={aufFertig} aufSchliessen={aufSchliessen} />))
    expect(eingabe().value).toBe('31.02.1788')
    const text = angabe.textContent ?? ''
    expect(text).toContain('Verstanden als: etwa 1788')
    expect(text).not.toContain('nicht auflösbar')
    expect(eingabe().getAttribute('aria-invalid')).not.toBe('true')
    expect(statusTexte().join('')).not.toContain(STATUS_UNLESBAR)
  })

  it('ohne erkennbares Jahr keine „etwa"-Aktion (weder im Dialog noch am Feld)', () => {
    unlesbarTippen('kurz nach dem Krieg')
    expect(document.body.textContent).not.toContain('mit Originaltext speichern')
    act(() => knopf(document, 'Fertig').click())
    expect(nachfrage()?.textContent).not.toContain('mit Originaltext speichern')
  })

  it('Reiterwechsel per Klick fragt nach; „Eingabe verwerfen" wechselt danach', () => {
    unlesbarTippen('31.02.1788')
    act(() => reiter('Namen').click())
    expect(nachfrage()).not.toBeNull()
    expect(aktiverReiter()).toBe('Person')
    const dialog = nachfrage()
    if (dialog === null) throw new Error('Nachfrage fehlt')
    act(() => knopf(dialog, 'Eingabe verwerfen').click())
    expect(aktiverReiter()).toBe('Namen')
    expect(aufrufe).toHaveLength(0)
  })

  it('Reiterwechsel per Taste (1…8) fragt nach', () => {
    unlesbarTippen('31.02.1788')
    const bei = kontexttaste.bei
    if (bei === null) throw new Error('Kontexttaste nicht abonniert')
    act(() => bei({ aktion: 'reiterWaehlen', reiterIndex: 1 }))
    expect(nachfrage()).not.toBeNull()
    expect(aktiverReiter()).toBe('Person')
  })

  it('Schließen (✕) und Escape fragen nach', () => {
    unlesbarTippen('31.02.1788')
    act(() => knopf(document, 'Schließen').click())
    expect(nachfrage()).not.toBeNull()
    expect(aufSchliessen).not.toHaveBeenCalled()
    const dialog = nachfrage()
    if (dialog === null) throw new Error('Nachfrage fehlt')
    // Escape im Dialog = „Zurück zum Feld" (die sichere Wahl), schließt nicht den Editor.
    act(() => dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(nachfrage()).toBeNull()
    expect(aufFertig).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(eingabe())

    act(() => eingabe().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(nachfrage()).not.toBeNull()
    expect(aufFertig).not.toHaveBeenCalled()
    const zweiter = nachfrage()
    if (zweiter === null) throw new Error('Nachfrage fehlt')
    act(() => knopf(zweiter, 'Eingabe verwerfen').click())
    expect(aufFertig).toHaveBeenCalledTimes(1)
  })
})

// hueter #167 H1/H3: Wege, auf denen das Feld INNERHALB des Reiters Person aushängt (Tod-Gruppe
// ausblenden, Lebensstatus auf „lebend"), und Zusicherungen zur Nachfrage selbst (Sprung aus der
// rechten Spalte, Anfangsfokus, Tab-Fokusfalle).
describe('Unlesbares Datum: Tod-Gruppe, Sprung und Fokus (hueter #167)', () => {
  const TOD = 'person-bearbeiten-feld-todesdatum'
  let container: HTMLDivElement
  let root: Root
  const aufFertig = vi.fn()
  const aufSchliessen = vi.fn()

  function mitKopf(daten: PersonDetailAus, lebendStatus: PersonDetailAus['kopf']['lebend_status']): PersonDetailAus {
    return { ...daten, kopf: { ...daten.kopf, lebend_status: lebendStatus } }
  }

  function zeigen(daten: PersonDetailAus): void {
    personDetail.aktuell = daten
    act(() => root.render(<PersonBearbeitenAnsicht personId="p-1" aufFertig={aufFertig} aufSchliessen={aufSchliessen} />))
  }

  function feld(id: string): HTMLInputElement | null {
    const knoten = document.getElementById(id)
    return knoten instanceof HTMLInputElement ? knoten : null
  }

  function tippen(id: string, text: string): void {
    const ziel = feld(id)
    if (ziel === null) throw new Error(`Eingabe fehlt: ${id}`)
    act(() => ziel.focus())
    act(() => eintippen(ziel, text))
    act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS))
    act(() => ziel.blur())
  }

  function todGruppe(): HTMLElement {
    const titel = Array.from(document.querySelectorAll('h2')).find((kandidat) => kandidat.textContent === 'Tod')
    const gruppe = titel?.closest('section')
    if (gruppe === null || gruppe === undefined) throw new Error('Tod-Gruppe fehlt')
    return gruppe
  }

  beforeEach(() => {
    vi.useFakeTimers()
    aufrufe.length = 0
    aufFertig.mockClear()
    aufSchliessen.mockClear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('H1: „Tod-Angaben ausblenden" mit unlesbarem Todesdatum fragt nach, statt das Feld still auszuhängen', () => {
    zeigen(mitKopf(detail(true), null))
    act(() => knopf(todGruppe(), 'Tod-Angaben einblenden').click())
    tippen(TOD, '31.02.1788')
    act(() => knopf(todGruppe(), 'Tod-Angaben ausblenden').click())
    expect(nachfrage()).not.toBeNull()
    expect(feld(TOD)?.value).toBe('31.02.1788')
    const dialog = nachfrage()
    if (dialog === null) throw new Error('Nachfrage fehlt')
    act(() => knopf(dialog, 'Eingabe verwerfen').click())
    expect(feld(TOD)).toBeNull()
    expect(aufrufe).toHaveLength(0)
  })

  it('H1: Lebensstatus wechselt auf „lebend" — das unlesbare Todesdatum bleibt stehen und gemeldet', () => {
    zeigen(mitKopf(detail(true), 'verstorben'))
    tippen(TOD, '31.02.1788')
    zeigen(mitKopf(detail(true), 'lebend'))
    expect(feld(TOD)?.value).toBe('31.02.1788')
    expect(statusTexte()).toContain(STATUS_UNLESBAR)
    act(() => knopf(document, 'Fertig').click())
    expect(nachfrage()).not.toBeNull()
    expect(aufFertig).not.toHaveBeenCalled()
  })

  it('H3a: Sprung aus der rechten Spalte in einen anderen Reiter fragt nach', () => {
    zeigen({
      ...mitKopf(detail(true), 'lebend'),
      offene_punkte: [{ regel_id: 'kein_portraet', reiter: 'belege_medien', feld: 'portraet', meldungsschluessel: 'offener_punkt_kein_portraet', bezug_id: null }],
    })
    tippen(FELD, '31.02.1788')
    const punkt = document.querySelector<HTMLButtonElement>('.wz-editor-rechte-spalte__punkt')
    if (punkt === null) throw new Error('Offener Punkt fehlt')
    act(() => punkt.click())
    expect(nachfrage()).not.toBeNull()
    expect(aktiverReiter()).toBe('Person')
  })

  it('H3d: beim Öffnen steht der Fokus auf „Zurück zum Feld"', () => {
    zeigen(detail(true))
    tippen(FELD, '31.02.1788')
    act(() => knopf(document, 'Fertig').click())
    expect(document.activeElement?.textContent).toBe('Zurück zum Feld')
  })

  it('H3c: Tab und Umschalt+Tab bleiben in der Nachfrage', () => {
    zeigen(detail(true))
    tippen(FELD, '31.02.1788')
    act(() => knopf(document, 'Fertig').click())
    const dialog = nachfrage()
    if (dialog === null) throw new Error('Nachfrage fehlt')
    const knoepfe = Array.from(dialog.querySelectorAll('button'))
    const erster = knoepfe[0]
    const letzter = knoepfe[knoepfe.length - 1]
    if (erster === undefined || letzter === undefined) throw new Error('Knöpfe fehlen')
    act(() => letzter.focus())
    act(() => letzter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })))
    expect(document.activeElement).toBe(erster)
    act(() => erster.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })))
    expect(document.activeElement).toBe(letzter)
  })
})

// Nachreview #167: N1 — die nur wegen eines unlesbaren Todesdatums offene Tod-Gruppe darf nicht
// mitten im Tippen zuschnappen (sonst schreibt der Aushänge-Flush des Debounce einen halben Wert);
// N2 — sie nennt ihren Grund; N3 — Zusicherungen für überlebende Mutanten (Feldfilter,
// Geburtsdatum hält nichts offen, eine Nachfrage-Instanz je Feld).
describe('Unlesbares Datum: Halten der Tod-Gruppe und Feldbezug (Nachreview #167)', () => {
  const TOD = 'person-bearbeiten-feld-todesdatum'
  let container: HTMLDivElement
  let root: Root
  const aufFertig = vi.fn()
  const aufSchliessen = vi.fn()

  function mitStatus(lebendStatus: PersonDetailAus['kopf']['lebend_status']): PersonDetailAus {
    const daten = detail(true)
    return { ...daten, kopf: { ...daten.kopf, lebend_status: lebendStatus } }
  }

  function zeigen(daten: PersonDetailAus): void {
    personDetail.aktuell = daten
    act(() => root.render(<PersonBearbeitenAnsicht personId="p-1" aufFertig={aufFertig} aufSchliessen={aufSchliessen} />))
  }

  function feld(id: string): HTMLInputElement | null {
    const knoten = document.getElementById(id)
    return knoten instanceof HTMLInputElement ? knoten : null
  }

  function fokussiertTippen(id: string, text: string): void {
    const ziel = feld(id)
    if (ziel === null) throw new Error(`Eingabe fehlt: ${id}`)
    if (document.activeElement !== ziel) act(() => ziel.focus())
    act(() => eintippen(ziel, text))
  }

  function verlassen(id: string): void {
    const ziel = feld(id)
    if (ziel === null) throw new Error(`Eingabe fehlt: ${id}`)
    act(() => ziel.blur())
  }

  function todGruppe(): HTMLElement | null {
    const titel = Array.from(document.querySelectorAll('h2')).find((kandidat) => kandidat.textContent === 'Tod')
    return titel?.closest('section') ?? null
  }

  /** Status verstorben, unlesbares Todesdatum (im Fokus), dann Status „lebend" (nachgeladen). */
  function unlesbarUndLebend(): void {
    zeigen(mitStatus('verstorben'))
    fokussiertTippen(TOD, '31.02.1788')
    zeigen(mitStatus('lebend'))
    expect(feld(TOD)?.value).toBe('31.02.1788')
  }

  beforeEach(() => {
    // Falsche Zeit ohne Vorlauf: kein Debounce-Commit läuft zwischendurch — geprüft wird allein das
    // Aushängen (dessen Flush schreibt sofort).
    vi.useFakeTimers()
    aufrufe.length = 0
    aufFertig.mockClear()
    aufSchliessen.mockClear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it.each(['21.02.1788', '31.03.1788', '31.02.17888'])('N1: Korrektur zu „%s" (lesbar) im Fokus — Gruppe bleibt, nichts wird geschrieben, Fokus bleibt', (lesbar) => {
    unlesbarUndLebend()
    fokussiertTippen(TOD, lesbar)
    expect(feld(TOD)?.value).toBe(lesbar)
    expect(document.activeElement).toBe(feld(TOD))
    expect(aufrufeVon('useAussageAnlegen')).toHaveLength(0)
  })

  it('N1: Leeren im Fokus hält die Gruppe; erst das Verlassen blendet aus, ohne zu schreiben', () => {
    unlesbarUndLebend()
    fokussiertTippen(TOD, '')
    expect(feld(TOD)).not.toBeNull()
    verlassen(TOD)
    expect(feld(TOD)).toBeNull()
    expect(aufrufe).toHaveLength(0)
  })

  it('N1: eine lesbare Korrektur wird beim Verlassen geschrieben, danach blendet die Gruppe aus', () => {
    unlesbarUndLebend()
    fokussiertTippen(TOD, '28.02.1788')
    verlassen(TOD)
    expect(aufrufeVon('useAussageAnlegen')).toEqual([
      { subjektTyp: 'person', subjektId: 'p-1', praedikat: 'todesdatum', datum: { kalender: 'gregorian', modifikator: 'exakt', praezision: 'tag', wert1: '1788-02-28' }, konfidenz: 2 },
    ])
    expect(feld(TOD)).toBeNull()
  })

  it('N2: die gehaltene Gruppe nennt ihren eigenen Grund (ungespeicherter Text)', () => {
    unlesbarUndLebend()
    expect(todGruppe()?.textContent).toContain('noch nicht gespeichert')
  })

  it('N3/M3: „Tod-Angaben ausblenden" fragt nicht nach einem unlesbaren Geburtsdatum', () => {
    zeigen(mitStatus(null))
    const gruppe = todGruppe()
    if (gruppe === null) throw new Error('Tod-Gruppe fehlt')
    act(() => knopf(gruppe, 'Tod-Angaben einblenden').click())
    fokussiertTippen(FELD, '31.02.1788')
    verlassen(FELD)
    const offen = todGruppe()
    if (offen === null) throw new Error('Tod-Gruppe fehlt')
    act(() => knopf(offen, 'Tod-Angaben ausblenden').click())
    expect(nachfrage()).toBeNull()
    expect(feld(TOD)).toBeNull()
  })

  it('N3/M6: ein unlesbares Geburtsdatum hält die Tod-Gruppe nicht offen', () => {
    zeigen(mitStatus('lebend'))
    fokussiertTippen(FELD, '31.02.1788')
    verlassen(FELD)
    expect(todGruppe()).toBeNull()
  })

  it('N3/M7: je Feld eine neue Nachfrage — der Fokus steht wieder auf „Zurück zum Feld"', () => {
    zeigen(mitStatus('verstorben'))
    fokussiertTippen(FELD, '31.02.1788')
    verlassen(FELD)
    fokussiertTippen(TOD, '31.04.1789')
    verlassen(TOD)
    act(() => knopf(document, 'Fertig').click())
    const erste = nachfrage()
    if (erste === null) throw new Error('Nachfrage fehlt')
    expect(erste.textContent).toContain('Geburtsdatum')
    // Fokus wie im Browser auf den geklickten Knopf — `.click()` in jsdom verschiebt ihn nicht, sonst
    // bliebe er auch ohne neue Instanz auf „Zurück zum Feld" (Nachreview #167, Mutant M7).
    const verwerfen = knopf(erste, 'Eingabe verwerfen')
    act(() => {
      verwerfen.focus()
      verwerfen.click()
    })
    const zweite = nachfrage()
    if (zweite === null) throw new Error('zweite Nachfrage fehlt')
    expect(zweite.textContent).toContain('Todesdatum')
    expect(document.activeElement?.textContent).toBe('Zurück zum Feld')
    expect(aufFertig).not.toHaveBeenCalled()
  })

  it('Nachreview #167: kein verwaistes Halten — ein von außen gesetzter Wert (Undo/Nachladen) nach dem Verlassen löst die Gruppe', () => {
    zeigen(mitStatus(null))
    const gruppe = todGruppe()
    if (gruppe === null) throw new Error('Tod-Gruppe fehlt')
    act(() => knopf(gruppe, 'Tod-Angaben einblenden').click())
    fokussiertTippen(TOD, '31.02.1788')
    verlassen(TOD)
    // Von außen: das Todesdatum ist jetzt „1790" (z. B. Undo eines früheren Schritts).
    const basis = mitStatus(null)
    const tod: PersonDetailAussage = { ...geburt(), aussage_id: 't-1', wert: '1790', datum: datumGruppe('1790') }
    zeigen({
      ...basis,
      grunddaten: [...basis.grunddaten, { praedikat: 'todesdatum', wert: '1790', konfidenz: 3, belegzahl: 0, hat_widerspruch: false, hatKonkurrierende: false, aussagen: [tod] }],
      lebensdaten: basis.lebensdaten.map((eintrag) => (eintrag.angabe === 'todesdatum' ? { ...eintrag, herkunft: 'aussage', aussage_id: 't-1' } : eintrag)),
    })
    expect(feld(TOD)?.value).toBe('1790')
    expect(todGruppe()?.textContent).not.toContain('noch nicht gespeichert')
    const offen = todGruppe()
    if (offen === null) throw new Error('Tod-Gruppe fehlt')
    act(() => knopf(offen, 'Tod-Angaben ausblenden').click())
    expect(nachfrage()).toBeNull()
    expect(feld(TOD)).toBeNull()
  })

  it('Nachreview #167: nach „etwa"-Speichern (Fokus auf dem Knopf) bei Status „lebend" blendet die Gruppe aus', () => {
    unlesbarUndLebend()
    const angabe = feld(TOD)?.closest('.wz-reiter-person__angabe')
    if (angabe === null || angabe === undefined) throw new Error('Angabe fehlt')
    const etwa = knopf(angabe, ETWA_1788)
    act(() => {
      etwa.focus()
      etwa.click()
    })
    expect(aufrufeVon('useAussageAnlegen')).toHaveLength(1)
    expect(feld(TOD)).toBeNull()
  })

  /** Status „lebend" mit einem Todesdatum „1790" von außen (Undo, Nachladen). */
  function lebendMitTod1790(): PersonDetailAus {
    const basis = mitStatus('lebend')
    const tod: PersonDetailAussage = { ...geburt(), aussage_id: 't-1', wert: '1790', datum: datumGruppe('1790') }
    return {
      ...basis,
      grunddaten: [...basis.grunddaten, { praedikat: 'todesdatum', wert: '1790', konfidenz: 3, belegzahl: 0, hat_widerspruch: false, hatKonkurrierende: false, aussagen: [tod] }],
      lebensdaten: basis.lebensdaten.map((eintrag) => (eintrag.angabe === 'todesdatum' ? { ...eintrag, herkunft: 'aussage', aussage_id: 't-1' } : eintrag)),
    }
  }

  it('Nachreview #167 H-A: erneut fokussiert, die erste Änderung macht den Text lesbar — Gruppe hält bis zum Verlassen, dann genau ein Schreiben', () => {
    // Das Halten muss auch greifen, wenn der Text VOR der Änderung unlesbar war (nicht nur danach).
    unlesbarUndLebend()
    verlassen(TOD)
    expect(feld(TOD)?.value).toBe('31.02.1788')
    fokussiertTippen(TOD, '21.02.1788')
    fokussiertTippen(TOD, '28.02.1788')
    expect(feld(TOD)?.value).toBe('28.02.1788')
    expect(document.activeElement).toBe(feld(TOD))
    expect(aufrufeVon('useAussageAnlegen')).toHaveLength(0)
    verlassen(TOD)
    expect(aufrufeVon('useAussageAnlegen')).toEqual([
      { subjektTyp: 'person', subjektId: 'p-1', praedikat: 'todesdatum', datum: { kalender: 'gregorian', modifikator: 'exakt', praezision: 'tag', wert1: '1788-02-28' }, konfidenz: 2 },
    ])
    expect(feld(TOD)).toBeNull()
  })

  it('Nachreview #167 H-B: Undo im Fokus — lesbar → unlesbar getippt, dann „1790" von außen: übernommen, beim Verlassen blendet die Gruppe aus, ohne Schreiben und Nachfrage', () => {
    // Das Halten muss auch greifen, wenn erst die Änderung den Text unlesbar macht (nicht nur davor).
    zeigen(mitStatus('verstorben'))
    fokussiertTippen(TOD, '1789')
    fokussiertTippen(TOD, '31.02.1788')
    zeigen(lebendMitTod1790())
    expect(feld(TOD)?.value).toBe('1790')
    expect(document.activeElement).toBe(feld(TOD))
    verlassen(TOD)
    expect(feld(TOD)).toBeNull()
    expect(nachfrage()).toBeNull()
    expect(aufrufe).toHaveLength(0)
  })
})
