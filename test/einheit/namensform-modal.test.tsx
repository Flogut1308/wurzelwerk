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
import { i18n } from '../../src/renderer/i18n/einrichten'
import { AUTOSAVE_DEBOUNCE_MS } from '../../src/shared/autosave'
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

interface MutationsOptionen {
  readonly onSuccess?: () => void
  readonly onError?: (fehler: AppFehler) => void
}

/** Steuerbarer Pending-Zustand (Review #207): `halten` lässt `mutate` offen, bis der Test `abschliessen`
 * aufruft; solange meldet der Hook `isPending: true`. */
const pending: { halten: boolean; offen: MutationsOptionen | null } = { halten: false, offen: null }

vi.mock('../../src/renderer/brücke/befehl-hooks', async (importOriginal) => {
  const original: Readonly<Record<string, unknown>> = await importOriginal()
  return Object.fromEntries(
    Object.keys(original).map((name) => [
      name,
      () => ({
        mutate: (ein: unknown, optionen?: MutationsOptionen) => {
          aufrufe.push({ hook: name, ein })
          if (pending.halten) {
            pending.offen = optionen ?? {}
            return
          }
          const fehler = scheitertMit.get(name)
          if (fehler === undefined) optionen?.onSuccess?.()
          else optionen?.onError?.(fehler)
        },
        isPending: pending.offen !== null,
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
    pending.halten = false
    pending.offen = null
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
    vi.useRealTimers()
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

  /** Schließt die gehaltene Mutation ab (Erfolg oder Fehler); `isPending` fällt vorher auf false. */
  function abschliessen(fehler?: AppFehler): void {
    const offen = pending.offen
    if (offen === null) throw new Error('keine gehaltene Mutation')
    pending.halten = false
    pending.offen = null
    act(() => {
      if (fehler === undefined) offen.onSuccess?.()
      else offen.onError?.(fehler)
    })
  }

  it('Review #207 (Wettlauf): Änderung von außen während des Übernehmens, dann Fehlschlag → Rebase mit Hinweis, kein stilles Zurückschreiben', () => {
    zeige([KARL])
    eintippen(feld('n1'), 'Gutnoffx')
    pending.halten = true
    klicken(knopf('Übernehmen'))
    expect(aufrufe).toHaveLength(1)
    // Während der Befehl läuft, nimmt ein Undo die Form von außen zurück (Nachladen bringt „Gutnow").
    const vonAussen = { ...KARL, teile: [teil('v1', 'vorname', 'Karl', 0, true), teil('n1', 'nachname', 'Gutnow')] }
    zeige([vonAussen])
    abschliessen({ code: 'VALIDIERUNG_NAMENSTEIL_LEERRAUM', textSchluessel: 'VALIDIERUNG_NAMENSTEIL_LEERRAUM', vorgangsId: 'v' })
    // Nach dem Fehlschlag gilt die Änderung von außen: gespeicherter Stand mit Hinweis.
    expect(feld('n1').value).toBe('Gutnow')
    expect(hinweis()).toContain('Rückgängig')
    // Übernehmen schreibt das Undo nicht zurück (unverändert gegenüber dem neuen Stand → kein Aufruf).
    klicken(knopf('Übernehmen'))
    expect(aufrufe).toHaveLength(1)
    expect(geschlossen).toBe(1)
  })

  it('M15: das Echo des eigenen Übernehmens zählt nicht als Änderung von außen', () => {
    zeige([KARL])
    eintippen(feld('n1'), 'Gutnow')
    pending.halten = true
    klicken(knopf('Übernehmen'))
    // Das eigene Schreiben kommt als neuer Stand zurück, bevor die Antwort da ist.
    zeige([{ ...KARL, teile: [teil('v1', 'vorname', 'Karl', 0, true), teil('n1', 'nachname', 'Gutnow')] }])
    expect(hinweis()).toBeNull()
    expect(feld('n1').value).toBe('Gutnow')
    abschliessen()
    expect(geschlossen).toBe(1)
    expect(aufrufe).toHaveLength(1)
  })

  it('M15 nach Fehlschlag: ist der neue Stand gleich dem Entwurf, gibt es keinen Hinweis und keinen Rebase-Verlust', () => {
    zeige([KARL])
    eintippen(feld('n1'), 'Gutnoffx')
    pending.halten = true
    klicken(knopf('Übernehmen'))
    // Fremdes Nachladen mit gleichem Inhalt in neuer Referenz während des Übernehmens.
    zeige([{ ...KARL, teile: KARL.teile.map((eintrag) => ({ ...eintrag })) }])
    abschliessen({ code: 'VALIDIERUNG_NAMENSTEIL_LEERRAUM', textSchluessel: 'VALIDIERUNG_NAMENSTEIL_LEERRAUM', vorgangsId: 'v' })
    expect(hinweis()).toBeNull()
    expect(feld('n1').value).toBe('Gutnoffx')
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

  // -------------------------------------------------------------------------------------------------
  // AP-1.30 PR 11c-2 (A-02): Zusicherungen der flachen Maske `NamenBearbeitenAbschnitt`, die fachlich für
  // das Modal weiter gelten (Inventar docs/80 §33 V-130-11c-2). Je Test die Herkunft im Kommentar.
  // -------------------------------------------------------------------------------------------------

  /** Das `Formularfeld` (label) mit genau dieser Beschriftung im Modal. */
  function formularfeld(beschriftung: string): HTMLLabelElement {
    const treffer = Array.from(document.querySelectorAll<HTMLLabelElement>('label.wz-formularfeld')).find(
      (kandidat) => kandidat.querySelector('.wz-formularfeld__kopf')?.textContent === beschriftung,
    )
    if (treffer === undefined) throw new Error(`Formularfeld fehlt: ${beschriftung}`)
    return treffer
  }

  function auswahlIn(beschriftung: string): HTMLSelectElement {
    const knoten = formularfeld(beschriftung).querySelector('select')
    if (knoten === null) throw new Error(`Auswahl fehlt: ${beschriftung}`)
    return knoten
  }

  function waehlen(auswahl: HTMLSelectElement, wert: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    if (setter === undefined) throw new Error('kein nativer value-Setter')
    act(() => {
      setter.call(auswahl, wert)
      auswahl.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }

  const KARL_FRIEDRICH = form('f1', {
    ist_bevorzugt: true,
    teile: [teil('v1', 'vorname', 'Karl', 0), teil('v2', 'vorname', 'Friedrich', 1, true), teil('n1', 'nachname', 'Gutnoff')],
  })

  // Herkunft: profil-namen-zeile-rufname-fehler.test.tsx (hueter #184 P2) und profil-namen-rufname-verdopplung.test.tsx
  // (Fehler am Rufname-Feld). `namensform.uebernehmen` meldet einen Rufname-Fehler als KEIN_VORNAME; die
  // Verdopplung stammt aus der flachen Brücke, das Modal ordnet beide gleich zu.
  for (const code of ['VALIDIERUNG_RUFNAME_KEIN_VORNAME', 'VALIDIERUNG_RUFNAME_VERDOPPELT'] as const) {
    it(`11c-2: ${code} steht mit titel/was_tun am Rufname-Feld (aria-live), nicht an den Teilen und nicht allgemein`, () => {
      zeige([KARL_FRIEDRICH])
      expect(formularfeld('Rufname').querySelector('[aria-live="polite"]')?.textContent).toBe('')
      scheitertMit.set('useNamensformUebernehmen', { code, textSchluessel: `${code}.titel`, vorgangsId: 'v' })
      waehlen(auswahlIn('Rufname'), 'v1')
      klicken(knopf('Übernehmen'))
      expect(aufrufe).toHaveLength(1)
      const titel = i18n.t(`fehler:${code}.titel`)
      const wasTun = i18n.t(`fehler:${code}.was_tun`)
      expect(titel).not.toContain(code)
      const meta = formularfeld('Rufname').querySelector('[aria-live="polite"]')?.textContent ?? ''
      expect(meta).toContain(titel)
      expect(meta).toContain(wasTun)
      expect(feld('v1').closest('.wz-formularfeld')?.textContent).not.toContain(titel)
      expect(document.querySelector('.wz-namensform-modal__fehler')).toBeNull()
      expect(geschlossen).toBe(0)
    })
  }

  // Herkunft: profil-namen-rufname-verdopplung.test.tsx „ein anderer Fehler von name.anlegen erscheint an den
  // Vornamen, nicht am Rufnamen". Im Modal gehören die übrigen Fehler an das Modal selbst (V-130-11c-1).
  it('11c-2: ein anderer Fehler des Befehls steht allgemein im Modal (role=alert), nicht am Rufname-Feld', () => {
    scheitertMit.set('useNamensformUebernehmen', { code: 'NICHT_GEFUNDEN_PERSON', textSchluessel: 'NICHT_GEFUNDEN_PERSON.titel', vorgangsId: 'v' })
    zeige([KARL_FRIEDRICH])
    eintippen(feld('n1'), 'Gutnow')
    klicken(knopf('Übernehmen'))
    const titel = i18n.t('fehler:NICHT_GEFUNDEN_PERSON.titel')
    const wasTun = i18n.t('fehler:NICHT_GEFUNDEN_PERSON.was_tun')
    const allgemein = document.querySelector('[role="alert"].wz-namensform-modal__fehler')?.textContent ?? ''
    expect(allgemein).toContain(titel)
    expect(allgemein).toContain(wasTun)
    expect(formularfeld('Rufname').textContent).not.toContain(titel)
    expect(feld('v1').closest('.wz-formularfeld')?.textContent).not.toContain(titel)
  })

  // Herkunft: profil-namen-rufname-verdopplung.test.tsx „leert die Eingaben erst nach erfolgreichem Anlegen,
  // nicht schon beim Absenden" (U-130-rufname-doppelt). Im Modal: scheitert Übernehmen, bleibt es offen und
  // der Entwurf zum Korrigieren stehen.
  it('11c-2: scheitert das Übernehmen einer neuen Form, bleiben Modal und Eingaben stehen', () => {
    scheitertMit.set('useNamensformUebernehmen', { code: 'NICHT_GEFUNDEN_PERSON', textSchluessel: 'NICHT_GEFUNDEN_PERSON.titel', vorgangsId: 'v' })
    zeige([], null)
    eintippen(feld('leer-vorname'), 'Friedrich')
    eintippen(feld('leer-nachname'), 'Gutnoff')
    waehlen(auswahlIn('Rufname'), 'leer-vorname')
    klicken(knopf('Übernehmen'))
    expect(aufrufe).toEqual([
      {
        hook: 'useNamensformUebernehmen',
        ein: expect.objectContaining({
          formId: null,
          teile: [
            { art: 'vorname', wert: 'Friedrich', istRufname: true },
            { art: 'nachname', wert: 'Gutnoff', istRufname: false },
          ],
        }),
      },
    ])
    expect(geschlossen).toBe(0)
    expect(feld('leer-vorname').value).toBe('Friedrich')
    expect(feld('leer-nachname').value).toBe('Gutnoff')
    expect(auswahlIn('Rufname').value).toBe('leer-vorname')
  })

  // Herkunft: profil-bearbeiten-namen.test.tsx „leeres Formular: Hinzufügen ist gesperrt" und
  // „nur Leerzeichen zählt NICHT als Inhalt" (kein leerer Name anlegbar).
  it('11c-2: eine neue Form ohne Inhalt (auch nur Leerraum) lässt sich nicht übernehmen', () => {
    zeige([], null)
    expect(knopf('Übernehmen').disabled).toBe(true)
    eintippen(feld('leer-vorname'), '   ')
    expect(knopf('Übernehmen').disabled).toBe(true)
    klicken(knopf('Übernehmen'))
    expect(aufrufe).toEqual([])
    expect(geschlossen).toBe(0)
    eintippen(feld('leer-nachname'), 'Gutnoff')
    expect(knopf('Übernehmen').disabled).toBe(false)
  })

  // Herkunft: profil-namen-rufname-auswahl.test.tsx „bestehende Zeile: Rufname ist eine Auswahl aus den
  // Vornamen, der markierte ist gewählt".
  it('11c-2: der Rufname ist eine Auswahl aus den Vornamen + „nicht angegeben", der markierte ist gewählt', () => {
    zeige([KARL_FRIEDRICH])
    const rufname = auswahlIn('Rufname')
    expect(Array.from(rufname.options).map((option) => option.textContent)).toEqual(['nicht angegeben', 'Karl', 'Friedrich'])
    expect(rufname.value).toBe('v2')
  })

  // Herkunft: autosave-auswahl-sofort.test.tsx, describe „Reiter Namen" (Namenstyp bzw. Rufname wählen, sofort
  // tippen, Echo kommt: der Anschlag bleibt; ohne Echo genau EIN Schreibvorgang). Im Modal gibt es keine
  // Zwischenstände: Auswahl und Anschlag schreiben nichts, auch nach der Debounce-Frist nicht; ein Nachladen mit
  // gleichem Inhalt verdrängt weder Auswahl noch Anschlag; Übernehmen schreibt beides in genau einem Aufruf.
  it('11c-2: Auswahl und Anschlag schreiben keinen Zwischenstand, ein Nachladen verdrängt sie nicht, Übernehmen genau einmal', () => {
    vi.useFakeTimers()
    zeige([KARL_FRIEDRICH])
    waehlen(auswahlIn('Namenstyp'), 'ehename')
    waehlen(auswahlIn('Rufname'), 'v1')
    eintippen(feld('n1'), 'Gutnoffx')
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 3)
    })
    expect(aufrufe).toEqual([])
    // Fremdes Nachladen (neue Referenz, gleicher Inhalt), wie nach einem unabhängigen Schreibvorgang.
    zeige([{ ...KARL_FRIEDRICH, teile: KARL_FRIEDRICH.teile.map((eintrag) => ({ ...eintrag })) }])
    expect(auswahlIn('Namenstyp').value).toBe('ehename')
    expect(auswahlIn('Rufname').value).toBe('v1')
    expect(feld('n1').value).toBe('Gutnoffx')
    expect(hinweis()).toBeNull()
    klicken(knopf('Übernehmen'))
    expect(aufrufe).toEqual([
      {
        hook: 'useNamensformUebernehmen',
        ein: {
          personId: 'p1',
          formId: 'f1',
          kopf: { rolle: 'ehename' },
          teile: [
            { id: 'v1', art: 'vorname', wert: 'Karl', istRufname: true },
            { id: 'v2', art: 'vorname', wert: 'Friedrich', istRufname: false },
            { id: 'n1', art: 'nachname', wert: 'Gutnoffx', istRufname: false },
          ],
        },
      },
    ])
    expect(geschlossen).toBe(1)
  })
})
