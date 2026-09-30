// @vitest-environment jsdom
//
// AP-1.30 PR 11c-1 (A-02, C-26; docs/80 §33 V-130-11-E1, E4, E9): das Modal „Namensform bearbeiten". Rot
// zuerst (CLAUDE.md §5): vor PR 11c-1 gibt es `namensform-modal.tsx` nicht.
//
// Schwerpunkt ist das Risiko aus dem Plan: ⌘Z ist global (Menü im Hauptprozess) und wirkt auch bei offenem
// Modal. Ändert sich die bearbeitete Form von außen, verwirft das Modal den Entwurf und zeigt den
// gespeicherten Stand mit Hinweis („Undo gewinnt", wie `useEntwurfMitVerzoegertemCommit`) — sonst schriebe
// „Übernehmen" das Undo still wieder zurück. Solange eine Rücknahme gemeldet, aber noch nicht geladen ist
// (`nachladen-stand.ts`), ist „Übernehmen" gesperrt. Dazu: genau ein Aufruf von
// `befehl:namensform.uebernehmen` mit der Zielliste, Abbrechen mit Nachfrage nur bei geändertem Entwurf,
// Escape wie Abbrechen, E4-Fehler des Befehls am Feld.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../src/renderer/i18n/einrichten'
import type { AppFehler } from '../../src/shared/fehler/app-fehler'
import type { PersonDetailName, PersonDetailNamensteil } from '../../src/shared/schemata/person-detail'
import { NachladenKontext, nachladenMelderErzeugen, type NachladenMelder } from '../../src/renderer/brücke/nachladen-stand'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface Aufruf {
  readonly hook: string
  readonly ein: unknown
}

const aufrufe: Aufruf[] = []
/** Fehler, mit dem der nächste `mutate` scheitert (über `onError`), je Hook. */
const scheitertMit = new Map<string, AppFehler>()

vi.mock('../../src/renderer/brücke/befehl-hooks', async (importOriginal) => {
  const original: Readonly<Record<string, unknown>> = await importOriginal()
  return Object.fromEntries(
    Object.keys(original).map((name) => [
      name,
      () => ({
        mutate: (ein: unknown, optionen?: { readonly onSuccess?: () => void; readonly onError?: (fehler: AppFehler) => void }) => {
          aufrufe.push({ hook: name, ein })
          const fehler = scheitertMit.get(name)
          if (fehler === undefined) optionen?.onSuccess?.()
          else optionen?.onError?.(fehler)
        },
        isPending: false,
        isSuccess: false,
        error: null,
      }),
    ]),
  )
})

import { NamensformModal } from '../../src/renderer/ansichten/profil/namensform-modal'

function teil(id: string, art: PersonDetailNamensteil['art'], wert: string, sortierIndex = 0, istRufname = false): PersonDetailNamensteil {
  return { id, art, wert, ist_rufname: istRufname, sortier_index: sortierIndex, feminine_variante: null }
}

function form(id: string, ueberschreibung: Partial<PersonDetailName> = {}): PersonDetailName {
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

const KARL = form('f1', { ist_bevorzugt: true, teile: [teil('v1', 'vorname', 'Karl', 0, true), teil('n1', 'nachname', 'Gutnoff')] })

function feld(schluessel: string): HTMLInputElement {
  const knoten = document.getElementById(`namensform-teil-${schluessel}`)
  if (!(knoten instanceof HTMLInputElement)) throw new Error(`Feld fehlt: ${schluessel}`)
  return knoten
}

function eintippen(eingabe: HTMLInputElement, wert: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (setter === undefined) throw new Error('kein nativer value-Setter')
  act(() => {
    setter.call(eingabe, wert)
    eingabe.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function knopf(text: string): HTMLButtonElement {
  const treffer = Array.from(document.querySelectorAll('button')).find((kandidat) => kandidat.textContent === text)
  if (treffer === undefined) throw new Error(`Knopf nicht gefunden: ${text}`)
  return treffer
}

function klicken(element: HTMLElement): void {
  act(() => {
    element.click()
  })
}

function hinweis(): string | null {
  return document.querySelector('.wz-namensform-modal__hinweis')?.textContent ?? null
}

describe('NamensformModal', () => {
  let container: HTMLDivElement
  let root: Root
  let melder: NachladenMelder
  let geplant: (() => void)[]
  let geschlossen: number

  beforeEach(() => {
    aufrufe.length = 0
    scheitertMit.clear()
    geschlossen = 0
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    geplant = []
    melder = nachladenMelderErzeugen((aufgabe) => {
      geplant.push(aufgabe)
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  function zeige(namen: readonly PersonDetailName[], formId: string | null = 'f1'): void {
    act(() => {
      root.render(
        <NachladenKontext.Provider value={melder}>
          <NamensformModal personId="p1" formId={formId} namen={namen} aufSchliessen={() => (geschlossen += 1)} />
        </NachladenKontext.Provider>,
      )
    })
  }

  it('Undo bei offenem Modal: die Form ändert sich von außen → Entwurf verworfen, gespeicherter Stand mit Hinweis', () => {
    zeige([KARL])
    eintippen(feld('n1'), 'Gutnoffx')
    expect(feld('n1').value).toBe('Gutnoffx')
    expect(hinweis()).toBeNull()

    // Das Menü-Undo setzt die Form im Hauptprozess zurück; das Nachladen liefert den neuen Stand.
    zeige([{ ...KARL, teile: [teil('v1', 'vorname', 'Karl', 0, true), teil('n1', 'nachname', 'Gutnow')] }])
    expect(feld('n1').value).toBe('Gutnow')
    expect(hinweis()).toContain('Rückgängig')

    // Übernehmen schreibt jetzt den neuen Stand, nicht den verworfenen Entwurf: unverändert → kein Aufruf.
    klicken(knopf('Übernehmen'))
    expect(aufrufe).toEqual([])
    expect(geschlossen).toBe(1)
  })

  it('gleicher Inhalt in neuer Referenz (fremdes Nachladen): der Entwurf bleibt, kein Hinweis', () => {
    zeige([KARL])
    eintippen(feld('n1'), 'Gutnoffx')
    zeige([{ ...KARL, teile: KARL.teile.map((eintrag) => ({ ...eintrag })) }, form('f2')])
    expect(feld('n1').value).toBe('Gutnoffx')
    expect(hinweis()).toBeNull()
  })

  it('Rücknahme gemeldet, aber noch nicht geladen: Übernehmen ist gesperrt; danach wieder frei', () => {
    zeige([KARL])
    eintippen(feld('n1'), 'Gutnoffx')
    let fertig: () => void = () => {}
    act(() => {
      fertig = melder.invalidierungBegonnen(true)
    })
    expect(knopf('Übernehmen').disabled).toBe(true)
    klicken(knopf('Übernehmen'))
    expect(aufrufe).toEqual([])
    act(() => {
      fertig()
      for (const aufgabe of geplant.splice(0)) aufgabe()
    })
    expect(knopf('Übernehmen').disabled).toBe(false)
  })

  it('Übernehmen: genau ein Aufruf von namensform.uebernehmen mit der Zielliste, dann schließen', () => {
    zeige([KARL])
    for (const zeichen of ['G', 'Gu', 'Gut', 'Gutn', 'Gutno', 'Gutnow']) eintippen(feld('n1'), zeichen)
    klicken(knopf('Übernehmen'))
    expect(aufrufe).toEqual([
      {
        hook: 'useNamensformUebernehmen',
        ein: {
          personId: 'p1',
          formId: 'f1',
          kopf: {},
          teile: [
            { id: 'v1', art: 'vorname', wert: 'Karl', istRufname: true },
            { id: 'n1', art: 'nachname', wert: 'Gutnow', istRufname: false },
          ],
        },
      },
    ])
    expect(geschlossen).toBe(1)
  })

  it('Abbrechen ohne Änderung schließt sofort; mit Änderung erst nach der Nachfrage (Escape wie Abbrechen)', () => {
    zeige([KARL])
    klicken(knopf('Abbrechen'))
    expect(geschlossen).toBe(1)

    eintippen(feld('n1'), 'Gutnoffx')
    act(() => {
      feld('n1').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(geschlossen).toBe(1)
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull()
    klicken(knopf('Weiter bearbeiten'))
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    expect(feld('n1').value).toBe('Gutnoffx')

    klicken(knopf('Abbrechen'))
    klicken(knopf('Verwerfen'))
    expect(geschlossen).toBe(2)
    expect(aufrufe).toEqual([])
  })

  it('leer gemachter Teil zeigt „leer — wird verworfen"', () => {
    zeige([KARL])
    eintippen(feld('n1'), '')
    expect(feld('n1').closest('.wz-formularfeld')?.textContent).toContain('leer — wird verworfen')
  })

  it('E4: der Fehler des Befehls steht mit titel/was_tun am Feld des neuen Vornamens mit Leerraum', () => {
    scheitertMit.set('useNamensformUebernehmen', { code: 'VALIDIERUNG_NAMENSTEIL_LEERRAUM', textSchluessel: 'VALIDIERUNG_NAMENSTEIL_LEERRAUM', vorgangsId: 'v' })
    zeige([KARL])
    klicken(knopf('+ Vorname'))
    const neu = Array.from(document.querySelectorAll<HTMLInputElement>('input[id^="namensform-teil-neu-"]'))[0]
    if (neu === undefined) throw new Error('neues Vornamefeld fehlt')
    eintippen(neu, 'Hans Peter')
    klicken(knopf('Übernehmen'))
    expect(aufrufe).toHaveLength(1)
    expect(geschlossen).toBe(0)
    const text = neu.closest('.wz-formularfeld')?.textContent ?? ''
    expect(text).toContain('Leerzeichen')
    // Der unveränderte Nachname trägt den Fehler nicht.
    expect(feld('n1').closest('.wz-formularfeld')?.textContent).not.toContain('Leerzeichen')
  })
})
