// @vitest-environment jsdom
//
// AP-1.30 PR 11c-1 (A-02, A-19, C-26; docs/80 §33 V-130-11-E6, E7, E8, E10): der Reiter „Namen" mit einer
// Karte je Namensform. Rot zuerst (CLAUDE.md §5): vor PR 11c-1 gibt es `reiter-namen.tsx` nicht.
//
// Geprüft: Kartenfolge E10 und Teile in Anzeigefolge (ossetisch „Гуытнаты", dann „Карл"); die Karten sind
// reine Anzeige (kein Eingabefeld, E8); die Aktionen im Kopf rufen `hauptname.wechseln` (alt → neu) und
// `name.loeschen`; eine Umschrift ist eine eigene Karte „Umschrift von …" ohne „Bearbeiten" (E6), ohne
// Ursprung mit Hinweis (E7); „+ Namensform" öffnet das Modal leer; verschwindet die Form eines offenen
// Modals (Undo ihres Anlegens), schließt das Modal mit Hinweis.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../src/renderer/i18n/einrichten'
import type { PersonDetailName, PersonDetailNamensteil } from '../../src/shared/schemata/person-detail'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface Aufruf {
  readonly hook: string
  readonly ein: unknown
}

const aufrufe: Aufruf[] = []
/** Hooks, deren `mutate` sofort über `onError` scheitert (PR 11c-1b H3). */
const scheitert = new Set<string>()
/** Review #208 P6: ist `halten` gesetzt, bleibt `mutate` offen; `offen` sammelt die `onError`-Rückrufe. */
const gehalten: { halten: boolean; offen: ((fehler: unknown) => void)[] } = { halten: false, offen: [] }

vi.mock('../../src/renderer/brücke/befehl-hooks', async (importOriginal) => {
  const original: Readonly<Record<string, unknown>> = await importOriginal()
  return Object.fromEntries(
    Object.keys(original).map((name) => [
      name,
      () => ({
        mutate: (ein: unknown, optionen?: { readonly onError?: (fehler: unknown) => void; readonly onSuccess?: () => void }) => {
          aufrufe.push({ hook: name, ein })
          if (gehalten.halten) {
            if (optionen?.onError !== undefined) gehalten.offen.push(optionen.onError)
            return
          }
          if (scheitert.has(name)) optionen?.onError?.({ code: 'NICHT_GEFUNDEN_NAME', textSchluessel: 'NICHT_GEFUNDEN_NAME', vorgangsId: 'v' })
          // PR 11c-2: ein erfolgreiches Übernehmen schließt das Modal (onSuccess).
          else optionen?.onSuccess?.()
        },
        isPending: false,
        isSuccess: false,
        error: null,
      }),
    ]),
  )
})

import { ReiterNamen } from '../../src/renderer/ansichten/profil/reiter-namen'

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

const HAUPT = form('f1', {
  ist_bevorzugt: true,
  sprache: 'de',
  schrift: 'latn',
  rollen_notiz: 'amtlich ab 1946',
  teile: [teil('t1', 'vorname', 'Karl', 0, true), teil('t2', 'vorname', 'Friedrich', 1), teil('t3', 'nachname', 'Gutnoff')],
})
const OSSETISCH = form('f3', {
  sprache: 'os',
  schrift: 'cyrl',
  rolle: 'sonstiges',
  reihenfolge: 'nachname_zuerst',
  teile: [teil('t6', 'vorname', 'Карл'), teil('t7', 'nachname', 'Гуытнаты')],
})
const RUSSISCH = form('f2', { sprache: 'ru', schrift: 'cyrl', rolle: 'sonstiges', teile: [teil('t4', 'vorname', 'Карл'), teil('t5', 'nachname', 'Гутнов')] })
const UMSCHRIFT = form('f4', { rolle: null, umschrift_von: 'f3', umschrift_norm: 'iso9', schrift: 'latn', teile: [teil('t8', 'vorname', 'Karl'), teil('t9', 'nachname', 'Guytnaty')] })

function karten(): readonly HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('article.wz-namensform-karte'))
}

function titel(karte: HTMLElement): string | null | undefined {
  return karte.querySelector('.wz-namensform-karte__titel')?.textContent
}

function karteMit(text: string): HTMLElement {
  const treffer = karten().find((karte) => titel(karte) === text)
  if (treffer === undefined) throw new Error(`Karte fehlt: ${text}`)
  return treffer
}

function knopfIn(wurzel: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(wurzel.querySelectorAll('button')).find((kandidat) => kandidat.textContent === text)
}

function klicken(element: HTMLElement | undefined): void {
  if (element === undefined) throw new Error('Element fehlt')
  act(() => {
    element.click()
  })
}

describe('ReiterNamen', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    aufrufe.length = 0
    scheitert.clear()
    gehalten.halten = false
    gehalten.offen = []
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  function zeige(namen: readonly PersonDetailName[]): void {
    act(() => {
      root.render(<ReiterNamen personId="p1" namen={namen} istPlatzhalter={false} />)
    })
  }

  it('Kartenfolge E10, Teile in Anzeigefolge, Kopf „Namensformen · n"', () => {
    zeige([UMSCHRIFT, OSSETISCH, RUSSISCH, HAUPT])
    expect(karten().map(titel)).toEqual(['Karl Friedrich Gutnoff', 'Гуытнаты Карл', 'Карл Гутнов', 'Karl Guytnaty'])
    const werte = Array.from(karteMit('Гуытнаты Карл').querySelectorAll('dd')).map((dd) => dd.firstChild?.textContent)
    expect(werte).toEqual(['Гуытнаты', 'Карл'])
    expect(document.body.textContent).toContain('4 · nach Sprache')
    // Rufname markiert, Rolle mit Notiz, „Sortiert unter" aus dem Kern.
    const haupt = karteMit('Karl Friedrich Gutnoff')
    expect(haupt.querySelector('.wz-namensform-karte__wert--rufname')?.textContent).toContain('Karl')
    expect(haupt.textContent).toContain('amtlich ab 1946')
    expect(haupt.textContent).toContain('Gutnoff, Karl Friedrich')
  })

  it('Karten sind reine Anzeige (E8): kein Eingabefeld außerhalb des Modals', () => {
    zeige([HAUPT, RUSSISCH])
    expect(document.querySelectorAll('input, textarea, select')).toHaveLength(0)
  })

  it('„Als Hauptname" ruft hauptname.wechseln mit alt → neu; die Hauptform bietet es nicht an', () => {
    zeige([HAUPT, RUSSISCH])
    expect(knopfIn(karteMit('Karl Friedrich Gutnoff'), 'Als Hauptname')).toBeUndefined()
    klicken(knopfIn(karteMit('Карл Гутнов'), 'Als Hauptname'))
    expect(aufrufe).toEqual([{ hook: 'useHauptnameWechseln', ein: { personId: 'p1', alt: 'f1', neu: 'f2' } }])
  })

  // Review #207 H5: nach „Entfernen" hängt die Karte samt fokussiertem Knopf aus; der Fokus fiele auf `body`.
  it('nach „Entfernen" liegt der Fokus auf der nächsten Karte, bei der letzten auf der vorigen, sonst auf „+ Namensform"', () => {
    zeige([HAUPT, OSSETISCH, RUSSISCH])
    const fokusName = (): string | null | undefined => document.activeElement?.closest('article')?.querySelector('.wz-namensform-karte__titel')?.textContent
    // Mittlere Karte (Folge: Karl Friedrich Gutnoff, Гуытнаты Карл, Карл Гутнов) → die nächste.
    const mitte = knopfIn(karteMit('Гуытнаты Карл'), 'Entfernen')
    mitte?.focus()
    klicken(mitte)
    zeige([HAUPT, RUSSISCH])
    expect(fokusName()).toBe('Карл Гутнов')
    expect(document.activeElement?.textContent).toBe('Bearbeiten')
    // Letzte Karte → die vorige.
    klicken(knopfIn(karteMit('Карл Гутнов'), 'Entfernen'))
    zeige([HAUPT])
    expect(fokusName()).toBe('Karl Friedrich Gutnoff')
    // Einzige Karte → „+ Namensform".
    klicken(knopfIn(karteMit('Karl Friedrich Gutnoff'), 'Entfernen'))
    zeige([])
    expect(document.activeElement?.textContent).toBe('+ Namensform')
  })

  // PR 11c-1b H3: scheitert `name.loeschen`, darf der Fokus-Merker nicht stehen bleiben — sonst risse ein
  // späteres Verschwinden derselben Form (z. B. Undo ihres Anlegens) den Fokus unvermittelt an sich.
  it('H3: scheitert Entfernen, wird der Fokus-Merker verworfen', () => {
    scheitert.add('useNameLoeschen')
    zeige([HAUPT, OSSETISCH, RUSSISCH])
    klicken(knopfIn(karteMit('Гуытнаты Карл'), 'Entfernen'))
    const neu = knopfIn(document, '+ Namensform')
    neu?.focus()
    // Später verschwindet die Form auf anderem Weg: der Fokus bleibt, wo der Nutzer ihn hingesetzt hat.
    zeige([HAUPT, RUSSISCH])
    expect(document.activeElement).toBe(neu)
  })

  // Review #208 P6: Karte A ist noch im Löschen, der Nutzer entfernt Karte B; scheitert danach A, bleibt der
  // Merker von B stehen — B verschwindet, und der Fokus geht auf den Nachbarn von B.
  it('P6: scheitert ein älteres Entfernen, bleibt der Merker des jüngeren', () => {
    gehalten.halten = true
    zeige([HAUPT, OSSETISCH, RUSSISCH])
    klicken(knopfIn(karteMit('Karl Friedrich Gutnoff'), 'Entfernen'))
    klicken(knopfIn(karteMit('Гуытнаты Карл'), 'Entfernen'))
    const [fehlerA] = gehalten.offen
    if (fehlerA === undefined) throw new Error('kein gehaltenes Entfernen')
    act(() => fehlerA({ code: 'NICHT_GEFUNDEN_NAME', textSchluessel: 'NICHT_GEFUNDEN_NAME', vorgangsId: 'v' }))
    zeige([HAUPT, RUSSISCH])
    expect(document.activeElement?.closest('article')?.querySelector('.wz-namensform-karte__titel')?.textContent).toBe('Карл Гутнов')
  })

  it('„Entfernen" ruft name.loeschen (E7: auch die letzte Form)', () => {
    zeige([HAUPT])
    klicken(knopfIn(karteMit('Karl Friedrich Gutnoff'), 'Entfernen'))
    expect(aufrufe).toEqual([{ hook: 'useNameLoeschen', ein: { id: 'f1' } }])
  })

  it('Umschrift: eigene Karte „Umschrift von …" mit Bearbeiten und Entfernen, ohne Hauptname; ohne Ursprung mit Hinweis', () => {
    zeige([HAUPT, OSSETISCH, UMSCHRIFT])
    const karte = karteMit('Karl Guytnaty')
    expect(karte.textContent).toContain('Umschrift von Гуытнаты Карл')
    expect(karte.textContent).toContain('automatisch · ISO 9')
    expect(knopfIn(karte, 'Bearbeiten')).toBeDefined()
    expect(knopfIn(karte, 'Als Hauptname')).toBeUndefined()
    expect(knopfIn(karte, 'Entfernen')).toBeDefined()

    // Dasselbe Modal: Teile bearbeitbar, der Bezug nur angezeigt, keine Rollenwahl, kein Hauptname-Schalter.
    klicken(knopfIn(karte, 'Bearbeiten'))
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('Umschrift von Гуытнаты Карл')
    expect(document.querySelector<HTMLInputElement>('#namensform-teil-t9')?.value).toBe('Guytnaty')
    const auswahlen = Array.from(dialog?.querySelectorAll('select') ?? [])
    expect(auswahlen.some((auswahl) => Array.from(auswahl.options).some((option) => option.value === 'geburtsname'))).toBe(false)
    expect(dialog?.querySelector('[role="checkbox"]')).toBeNull()
    klicken(knopfIn(document, 'Abbrechen'))

    zeige([HAUPT, { ...UMSCHRIFT, umschrift_von: null }])
    expect(karteMit('Karl Guytnaty').textContent).toContain('die Ursprungsform ist entfernt')
  })

  it('„+ Namensform" öffnet das Modal leer; „Bearbeiten" mit der Form', () => {
    zeige([HAUPT])
    klicken(knopfIn(document, '+ Namensform'))
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Neue Namensform')
    klicken(knopfIn(document, 'Abbrechen'))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    klicken(knopfIn(karteMit('Karl Friedrich Gutnoff'), 'Bearbeiten'))
    expect(document.querySelector<HTMLInputElement>('#namensform-teil-t3')?.value).toBe('Gutnoff')
  })

  it('verschwindet die Form eines offenen Modals (Undo), schließt das Modal mit Hinweis', () => {
    zeige([HAUPT, RUSSISCH])
    klicken(knopfIn(karteMit('Карл Гутнов'), 'Bearbeiten'))
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    zeige([HAUPT])
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.querySelector('[role="status"]')?.textContent).toContain('gibt es nicht mehr')
  })

  // -------------------------------------------------------------------------------------------------
  // AP-1.30 PR 11c-2 (A-02): Zusicherungen der flachen Maske `NamenBearbeitenAbschnitt`, die fachlich für
  // den Reiter weiter gelten (Inventar docs/80 §33 V-130-11c-2). Je Test die Herkunft im Kommentar.
  // -------------------------------------------------------------------------------------------------

  // Herkunft: profil-bearbeiten-namen.test.tsx „ohne Namen: zeigt den Leerzustandstext, KEINE Liste".
  it('11c-2: ohne Namensform zeigt der Reiter den Leerzustand und keine Liste', () => {
    zeige([])
    expect(document.body.textContent).toContain('Noch keine Namensform erfasst.')
    expect(document.querySelector('.wz-reiter-namen__liste')).toBeNull()
    expect(karten()).toHaveLength(0)
  })

  // Herkunft: profil-bearbeiten-namen.test.tsx „… Name entfernen-Schaltfläche": Löschen läuft über den Baustein
  // `Schaltflaeche` (Trefferfläche ≥ 32×32 dort geprüft, `trefferflaeche.test.ts`), kein selbstgebauter Knopf.
  it('11c-2: die Kartenaktionen sind der Baustein Schaltflaeche (Trefferfläche), „Entfernen" in der Variante gefährlich', () => {
    zeige([HAUPT, RUSSISCH])
    for (const karte of karten()) {
      const knoepfe = Array.from(karte.querySelectorAll('button'))
      expect(knoepfe.length).toBeGreaterThan(0)
      for (const knopf of knoepfe) expect(knopf.classList.contains('wz-schaltflaeche')).toBe(true)
      expect(knopfIn(karte, 'Entfernen')?.classList.contains('wz-schaltflaeche--gefaehrlich')).toBe(true)
    }
  })

  // Herkunft: profil-bearbeiten-namen-rerender.test.tsx (Bugfix AP-1.15 PR-A): ein Rerender mit einer neuen,
  // inhaltsgleichen namen-Liste (Nachladen nach einem unabhängigen Schreibvorgang) löst keine Render-Schleife
  // aus und keinen Phantom-Schreibvorgang — hier mit offenem Modal, das die Form von außen vergleicht.
  it('11c-2: neue, inhaltsgleiche namen-Liste bei offenem Modal: keine Render-Schleife, kein Schreiben, Werte bleiben', () => {
    const frisch = (): readonly PersonDetailName[] => [{ ...HAUPT, teile: HAUPT.teile.map((eintrag) => ({ ...eintrag })) }]
    zeige(frisch())
    klicken(knopfIn(karteMit('Karl Friedrich Gutnoff'), 'Bearbeiten'))
    expect(() => zeige(frisch())).not.toThrow()
    expect(() => zeige(frisch())).not.toThrow()
    expect(document.querySelector<HTMLInputElement>('#namensform-teil-t3')?.value).toBe('Gutnoff')
    expect(document.querySelector<HTMLInputElement>('#namensform-teil-t1')?.value).toBe('Karl')
    expect(document.querySelector('.wz-namensform-modal__hinweis')).toBeNull()
    expect(aufrufe).toEqual([])
  })

  // Herkunft: profil-bearbeiten-namen.test.tsx „kein Farbliteral im Markup (Token-Vertrag)" und „jeder sichtbare
  // Text kommt aus i18n (Stichprobe)" — für Karten und Modal.
  it('11c-2: Karten und Modal ohne Farbliteral; Beschriftungen kommen aus i18n', () => {
    zeige([HAUPT, UMSCHRIFT])
    klicken(knopfIn(karteMit('Karl Friedrich Gutnoff'), 'Bearbeiten'))
    const markup = document.body.innerHTML
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(markup).not.toMatch(/rgb\(/)
    expect(document.querySelector('.wz-reiter-namen__kopf h2')?.textContent).toBe('Namensformen')
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Vorname 1')
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Rufname')
  })

  // Herkunft: profil-namen-rufname-verdopplung.test.tsx „nach erfolgreichem Anlegen ist das Formular wieder leer".
  // Im Reiter: erfolgreiches Übernehmen schließt das Modal; „+ Namensform" beginnt danach leer.
  it('11c-2: nach erfolgreichem Übernehmen einer neuen Form ist das Modal zu, das nächste beginnt leer', () => {
    zeige([HAUPT])
    klicken(knopfIn(document, '+ Namensform'))
    const vorname = document.querySelector<HTMLInputElement>('#namensform-teil-leer-vorname')
    if (vorname === null) throw new Error('Vornamefeld fehlt')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (setter === undefined) throw new Error('kein nativer value-Setter')
    act(() => {
      setter.call(vorname, 'Fritz')
      vorname.dispatchEvent(new Event('input', { bubbles: true }))
    })
    klicken(knopfIn(document, 'Übernehmen'))
    expect(aufrufe).toEqual([expect.objectContaining({ hook: 'useNamensformUebernehmen' })])
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    klicken(knopfIn(document, '+ Namensform'))
    expect(document.querySelector<HTMLInputElement>('#namensform-teil-leer-vorname')?.value).toBe('')
  })
})
