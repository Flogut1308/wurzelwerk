// @vitest-environment jsdom
//
// AP-1.30 PR 12c (A-07, C-26; docs/80 §33 V-130-12-schreibwege, -notiz-erhalten, -trennen, -hinzufuegen):
// der Reiter „Beziehungen". Rot zuerst (CLAUDE.md §5): vor PR 12c gibt es `reiter-beziehungen.tsx` nicht.
//
// Geprüft: der Typwechsel schickt die Kanten-Notiz IMMER mit und kein `feld` (sonst löschte
// `elternschaft.aendern`, das die ganze Zeile ersetzt, die Notiz still; jeder Wechsel bleibt ein
// Undo-Schritt); „Trennen" öffnet erst das Bestätigungs-Modal, Abbrechen schreibt nichts, Bestätigen ruft
// `elternschaft.loeschen` bzw. `partnerschaft.loeschen`; Geschwister haben keine Knöpfe und sind als
// abgeleitet beschriftet; ein offener Elternplatz ist sichtbar; „+ Beziehung" ist gesperrt.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../src/renderer/i18n/einrichten'
import type { PersonDetailBeziehung, PersonDetailGeschwister, PersonDetailKopf } from '../../src/shared/schemata/person-detail'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface Aufruf {
  readonly hook: string
  readonly ein: unknown
}

const aufrufe: Aufruf[] = []

vi.mock('../../src/renderer/brücke/befehl-hooks', async (importOriginal) => {
  const original: Readonly<Record<string, unknown>> = await importOriginal()
  return Object.fromEntries(
    Object.keys(original).map((name) => [
      name,
      () => ({
        mutate: (ein: unknown, optionen?: { readonly onSuccess?: () => void }) => {
          aufrufe.push({ hook: name, ein })
          optionen?.onSuccess?.()
        },
        isPending: false,
        isSuccess: false,
        error: null,
      }),
    ]),
  )
})

import { ReiterBeziehungen } from '../../src/renderer/ansichten/profil/reiter-beziehungen'
import type { BeziehungenEingabe } from '../../src/renderer/ansichten/profil/reiter-beziehungen-logik'

const KOPF: PersonDetailKopf = {
  person_id: 'p',
  anzeigename: 'Paul Gutnoff',
  konfidenz_min: null,
  ist_platzhalter: false,
  privat: false,
  geschlecht: 'M',
  platzhalter_grund: null,
  kennung: 1,
  lebend_status: null,
}

function beziehung(ueberschreibung: Partial<PersonDetailBeziehung> & Pick<PersonDetailBeziehung, 'person_id' | 'richtung'>): PersonDetailBeziehung {
  return {
    anzeigename: ueberschreibung.person_id,
    kantentyp: ueberschreibung.richtung === 'partner' ? 'ehe_zivil' : 'biologisch',
    ist_platzhalter: false,
    kante_id: `k-${ueberschreibung.person_id}`,
    kante_notiz: null,
    geschlecht: null,
    ...ueberschreibung,
  }
}

const VATER = beziehung({ person_id: 'v', anzeigename: 'Friedrich Gutnoff', richtung: 'elternteil', geschlecht: 'M', kante_id: 'e-v', kante_notiz: 'laut Taufbuch' })
const PARTNER = beziehung({ person_id: 'q', anzeigename: 'Emma Wruck', richtung: 'partner', kante_id: 'pk-q', geschlecht: 'F' })
const KIND1 = beziehung({ person_id: 'k1', anzeigename: 'Heinrich Gutnoff', richtung: 'kind', kante_id: 'e-k1' })
const KIND2 = beziehung({ person_id: 'k2', anzeigename: 'Anna Gutnoff', richtung: 'kind', kante_id: 'e-k2' })
const HALB: PersonDetailGeschwister = { person_id: 'h', anzeigename: 'Martha Gutnoff', ist_platzhalter: false, geschlecht: 'F', art: 'halb', gemeinsame_eltern_ids: ['v'] }

const VOLL: BeziehungenEingabe = {
  beziehungen: [VATER, PARTNER, KIND1, KIND2],
  geschwister: [HALB],
  partnerschaften: [{ id: 'pk-q', typ: 'ehe_zivil', partner_ids: ['q'], kind_ids: ['k1'] }],
  kinder_ohne_partnerschaft: ['k2'],
}

function knopf(name: string): HTMLButtonElement {
  const treffer = Array.from(document.querySelectorAll('button')).find((kandidat) => (kandidat.getAttribute('aria-label') ?? kandidat.textContent) === name)
  if (treffer === undefined) throw new Error(`Knopf fehlt: ${name}`)
  return treffer
}

function auswahl(name: string): HTMLSelectElement {
  const treffer = Array.from(document.querySelectorAll('select')).find((kandidat) => kandidat.getAttribute('aria-label') === name)
  if (treffer === undefined) throw new Error(`Auswahlfeld fehlt: ${name}`)
  return treffer
}

function klicken(element: HTMLElement): void {
  act(() => {
    element.click()
  })
}

function waehlen(feld: HTMLSelectElement, wert: string): void {
  act(() => {
    // React hört auf das native `change`; der Wert muss über den Prototyp-Setter gesetzt werden.
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    setter?.call(feld, wert)
    feld.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function dialog(): HTMLElement | null {
  return document.querySelector('[role="dialog"]')
}

describe('ReiterBeziehungen', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    aufrufe.length = 0
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

  function zeige(eingabe: BeziehungenEingabe): void {
    act(() => {
      root.render(<ReiterBeziehungen kopf={KOPF} daten={eingabe} idPraefix="person-bearbeiten" />)
    })
  }

  it('Typwechsel schickt die Kanten-Notiz mit und kein feld (V-130-12-notiz-erhalten)', () => {
    zeige(VOLL)
    waehlen(auswahl('Art der Verbindung zu Friedrich Gutnoff'), 'adoptiv')
    expect(aufrufe).toHaveLength(1)
    expect(aufrufe[0]?.hook).toBe('useElternschaftAendern')
    expect(aufrufe[0]?.ein).toEqual({ id: 'e-v', typ: 'adoptiv', notiz: 'laut Taufbuch' })
    expect(aufrufe[0]?.ein).not.toHaveProperty('feld')
  })

  it('Typwechsel einer Kante ohne Notiz schickt keine Notiz und kein feld', () => {
    zeige(VOLL)
    waehlen(auswahl('Art der Verbindung zu Heinrich Gutnoff'), 'stief')
    expect(aufrufe[0]?.ein).toEqual({ id: 'e-k1', typ: 'stief' })
    expect(aufrufe[0]?.ein).not.toHaveProperty('feld')
  })

  it('Trennen öffnet das Bestätigungs-Modal; Abbrechen schreibt nichts', () => {
    zeige(VOLL)
    expect(dialog()).toBeNull()
    klicken(knopf('Trennen: Friedrich Gutnoff'))
    expect(aufrufe).toHaveLength(0)
    expect(dialog()?.textContent).toContain('Nur die Verbindung zwischen Paul Gutnoff und Friedrich Gutnoff wird getrennt')
    expect(dialog()?.textContent).toContain('bleiben erhalten')
    klicken(knopf('Abbrechen'))
    expect(dialog()).toBeNull()
    expect(aufrufe).toHaveLength(0)
  })

  it('Escape im Modal schließt ohne Schreiben', () => {
    zeige(VOLL)
    klicken(knopf('Trennen: Anna Gutnoff'))
    const offen = dialog()
    act(() => {
      offen?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(dialog()).toBeNull()
    expect(aufrufe).toHaveLength(0)
  })

  it('Bestätigen trennt die Elternkante über elternschaft.loeschen und schließt das Modal', () => {
    zeige(VOLL)
    klicken(knopf('Trennen: Anna Gutnoff'))
    klicken(knopf('Verbindung trennen'))
    expect(aufrufe).toEqual([{ hook: 'useElternschaftLoeschen', ein: { id: 'e-k2' } }])
    expect(dialog()).toBeNull()
  })

  it('Partnerschaft trennen: partnerschaft.loeschen mit der Partnerschafts-ID', () => {
    zeige(VOLL)
    klicken(knopf('Trennen: Emma Wruck'))
    klicken(knopf('Verbindung trennen'))
    expect(aufrufe).toEqual([{ hook: 'usePartnerschaftLoeschen', ein: { id: 'pk-q' } }])
  })

  it('Partnerschaft ohne erfassten Partner: Karte „Partner nicht erfasst", trennbar, Text ohne zweiten Namen', () => {
    zeige({ beziehungen: [], geschwister: [], partnerschaften: [{ id: 'pk-x', typ: 'unbekannt', partner_ids: [], kind_ids: [] }], kinder_ohne_partnerschaft: [] })
    expect(container.textContent).toContain('Partner nicht erfasst')
    klicken(knopf('Trennen: Partner nicht erfasst'))
    expect(dialog()?.textContent).toContain('Nur die Partnerschaft von Paul Gutnoff wird getrennt')
    klicken(knopf('Verbindung trennen'))
    expect(aufrufe).toEqual([{ hook: 'usePartnerschaftLoeschen', ein: { id: 'pk-x' } }])
  })

  it('Gruppen: Eltern mit offenem Platz, Kinder unter der Verbindung, Kind ohne Partnerschaft mit Hinweis', () => {
    zeige(VOLL)
    const text = container.textContent ?? ''
    expect(text).toContain('Vater')
    expect(text).toContain('Mutter')
    expect(text).toContain('nicht zugeordnet')
    expect(text).toContain('Kind aus dieser Verbindung · 1')
    expect(text).toContain('Anna Gutnoff ist als Kind erfasst, gehört aber zu keiner Partnerschaft.')
    expect(text).toContain('Kinder ohne Partnerschaft')
  })

  it('Geschwister: keine Knöpfe oder Felder, Art als Text, beschriftet als abgeleitet', () => {
    zeige(VOLL)
    const liste = container.querySelector('ul.wz-reiter-beziehungen__geschwister')
    expect(liste).not.toBeNull()
    expect(liste?.querySelectorAll('button, select, input, a, [tabindex]')).toHaveLength(0)
    expect(liste?.textContent).toContain('Martha Gutnoff')
    expect(liste?.textContent).toContain('Halbgeschwister')
    const beschreibungId = liste?.getAttribute('aria-describedby')
    expect(beschreibungId).toBeTruthy()
    expect(document.getElementById(beschreibungId ?? '')?.textContent).toBe('aus Beziehung abgeleitet')
  })

  it('offener Elternplatz: Hinweis „weitere Geschwister … sobald die Mutter zugeordnet ist"', () => {
    zeige(VOLL)
    expect(container.textContent).toContain('weitere Geschwister erscheinen, sobald die Mutter zugeordnet ist')
  })

  it('Platzhalter-Kind: Text „Platzhalter" statt Name, ohne Hinweis „gehört aber zu keiner Partnerschaft"', () => {
    zeige({
      beziehungen: [beziehung({ person_id: 'pk', anzeigename: '', richtung: 'kind', ist_platzhalter: true, kante_id: 'e-pk' })],
      geschwister: [],
      partnerschaften: [],
      kinder_ohne_partnerschaft: ['pk'],
    })
    expect(container.textContent).toContain('Platzhalter')
    expect(container.textContent).not.toContain('gehört aber zu keiner Partnerschaft')
  })

  it('„+ Beziehung" ist gesperrt und nennt den Grund', () => {
    zeige(VOLL)
    expect(knopf('+ Beziehung').disabled).toBe(true)
    expect(container.textContent).toContain('kommt mit „Person anlegen“')
  })

  it('Sprungziele für offene Punkte: eltern und kinder, nicht per Tab erreichbar', () => {
    zeige(VOLL)
    expect(document.getElementById('person-bearbeiten-feld-eltern')?.getAttribute('tabindex')).toBe('-1')
    expect(document.getElementById('person-bearbeiten-feld-kinder')?.getAttribute('tabindex')).toBe('-1')
  })

  it('Sprungziel kinder existiert auch ohne Kinder ohne Partnerschaft (Abschnitt Partnerschaften)', () => {
    zeige({ beziehungen: [], geschwister: [], partnerschaften: [], kinder_ohne_partnerschaft: [] })
    expect(document.getElementById('person-bearbeiten-feld-kinder')?.getAttribute('tabindex')).toBe('-1')
  })
})
