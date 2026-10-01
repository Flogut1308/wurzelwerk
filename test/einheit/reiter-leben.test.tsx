// @vitest-environment jsdom
//
// AP-1.30 PR 13c (docs/80 §33 V-130-13-schreibwege, -sprungziele, -sicherheit, U-130-13-station-anlegen):
// der Reiter „Leben". Rot zuerst (CLAUDE.md §5). Nimmt die Zeilen-Zusicherungen der bisherigen Ereignisliste
// (Leertext, Zeile je Beteiligung, „Beteiligung entfernen"/„Ereignis löschen" mit den richtigen ids) mit.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../src/renderer/i18n/einrichten'
import { nachJdn } from '../../src/core/datum/kalender'
import type { PersonDetailAussage, PersonDetailAussageDatum, PersonDetailEreignis, PersonDetailGrunddatenFeld, PersonDetailLebensdatum } from '../../src/shared/schemata/person-detail'

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
        mutateAsync: () => Promise.reject(new Error('nicht erwartet')),
        isPending: false,
        isSuccess: false,
        error: null,
      }),
    ]),
  )
})

vi.mock('../../src/renderer/brücke/abfrage-hooks', () => ({
  useSuche: () => ({ data: undefined, isPending: false }),
  useOrtSuche: () => ({ data: undefined, isPending: false }),
}))

import { ReiterLeben } from '../../src/renderer/ansichten/profil/reiter-leben'
import type { LebenEingabe } from '../../src/renderer/ansichten/profil/reiter-leben-logik'

function gruppe(modifikator: PersonDetailAussageDatum['modifikator'], von: number, bis: number = von): PersonDetailAussageDatum {
  return {
    kalender: 'gregorian',
    modifikator,
    praezision: 'jahr',
    wert1: String(von),
    wert2: bis === von ? null : String(bis),
    originaltext: null,
    sort_von: nachJdn(von, 1, 1, 'gregorian'),
    sort_bis: nachJdn(bis, 12, 31, 'gregorian'),
    zweitkalender: null,
    zweitwert: null,
    doppeljahr: null,
  }
}

function ereignis(id: string, ueberschreibung: Partial<PersonDetailEreignis> = {}): PersonDetailEreignis {
  return {
    ereignis_id: `e-${id}`,
    beteiligung_id: `b-${id}`,
    typ: 'taufe',
    rolle: 'hauptperson',
    datum_wert1: null,
    datum_sort_von: null,
    datum: null,
    konfidenz: null,
    ort_name: null,
    beschreibung: null,
    ...ueberschreibung,
  }
}

function aussage(id: string, wert: string, ueberschreibung: Partial<PersonDetailAussage> = {}): PersonDetailAussage {
  return {
    aussage_id: id,
    wert,
    wert_text: null,
    wert_zahl: null,
    wert_ref_id: null,
    datum: null,
    konfidenz: null,
    ist_bevorzugt: false,
    begruendung: null,
    unsicherheit: null,
    gueltig_von: null,
    gueltig_bis: null,
    belege: [],
    ...ueberschreibung,
  }
}

function feld(praedikat: string, aussagen: readonly PersonDetailAussage[], ueberschreibung: Partial<PersonDetailGrunddatenFeld> = {}): PersonDetailGrunddatenFeld {
  return { praedikat, wert: aussagen[0]?.wert ?? null, konfidenz: null, belegzahl: 0, hat_widerspruch: false, hatKonkurrierende: false, aussagen, ...ueberschreibung }
}

function leerLebensdatum(angabe: PersonDetailLebensdatum['angabe']): PersonDetailLebensdatum {
  return { angabe, herkunft: null, aussage_id: null, ereignis_id: null, datum: null, datum_originaltext: null, ort_id: null, ort_name: null }
}

const OHNE_ACHSE: Pick<LebenEingabe, 'lebensdaten'> = { lebensdaten: (['geburtsdatum', 'geburtsort', 'todesdatum', 'todesort'] as const).map(leerLebensdatum) }

function eingabe(rest: Partial<LebenEingabe>): LebenEingabe {
  return { ereignisse: [], grunddaten: [], ...OHNE_ACHSE, ...rest }
}

/** Walters Leben: Achse 1900–1980 über eine Geburts-Aussage und ein Tod-Ereignis. */
function mitAchse(rest: Partial<LebenEingabe>): LebenEingabe {
  const geburt: PersonDetailLebensdatum = { ...leerLebensdatum('geburtsdatum'), herkunft: 'aussage', aussage_id: 'a-geburt' }
  const tod: PersonDetailLebensdatum = {
    ...leerLebensdatum('todesdatum'),
    herkunft: 'ereignis',
    ereignis_id: 'e-tod',
    datum: { kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', wert1: '1980', wert2: null, originaltext: null, sortVon: nachJdn(1980, 1, 1, 'gregorian'), sortBis: nachJdn(1980, 12, 31, 'gregorian') },
  }
  return {
    ereignisse: rest.ereignisse ?? [],
    grunddaten: [...(rest.grunddaten ?? []), feld('geburtsdatum', [aussage('a-geburt', '1900', { datum: gruppe('exakt', 1900) })])],
    lebensdaten: [geburt, leerLebensdatum('geburtsort'), tod, leerLebensdatum('todesort')],
  }
}

function knopf(name: string): HTMLButtonElement {
  const treffer = Array.from(document.querySelectorAll('button')).find((kandidat) => (kandidat.getAttribute('aria-label') ?? kandidat.textContent) === name)
  if (treffer === undefined) throw new Error(`Knopf fehlt: ${name}`)
  return treffer
}

function knopfMitPraefix(praefix: string): HTMLButtonElement {
  const treffer = Array.from(document.querySelectorAll('button')).find((kandidat) => (kandidat.getAttribute('aria-label') ?? '').startsWith(praefix))
  if (treffer === undefined) throw new Error(`Knopf fehlt: ${praefix}`)
  return treffer
}

describe('ReiterLeben', () => {
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

  function zeige(daten: LebenEingabe): void {
    act(() => {
      root.render(<ReiterLeben personId="person-1" daten={daten} idPraefix="person-bearbeiten" />)
    })
  }

  it('ohne Stationen: Leertext, keine Liste; das Formular steht trotzdem da', () => {
    zeige(eingabe({}))
    expect(container.textContent).toContain('Noch keine Lebensstationen erfasst.')
    expect(container.querySelector('ul.wz-reiter-leben__liste')).toBeNull()
    expect(container.querySelector('form')).not.toBeNull()
    expect(container.textContent).toContain('Neues Ereignis erfassen')
  })

  it('Überschrift „Lebensstationen" und Zahl der Stationen im Kopf', () => {
    zeige(eingabe({ ereignisse: [ereignis('a'), ereignis('b', { typ: 'geburt' })] }))
    expect(container.querySelector('h2')?.textContent).toBe('Lebensstationen')
    expect(container.textContent).toContain('2 · nach Jahr')
  })

  it('eine Station je Beteiligung, mit Typ und sichtbarer Rolle (auch Pate/Patin)', () => {
    zeige(eingabe({ ereignisse: [ereignis('a', { rolle: 'pate' }), ereignis('b', { typ: 'geburt' })] }))
    expect(container.querySelectorAll('li.wz-reiter-leben__station')).toHaveLength(2)
    expect(container.textContent).toContain('Pate/Patin')
    expect(container.textContent).toContain('Taufe')
  })

  it('„Beteiligung entfernen" und „Ereignis löschen" je Ereignis-Station rufen die Befehle mit den richtigen ids; der Name der Station steht im aria-label', () => {
    zeige(eingabe({ ereignisse: [ereignis('a'), ereignis('b', { typ: 'geburt' })] }))
    expect(container.querySelectorAll('button[aria-label^="Beteiligung entfernen"]')).toHaveLength(2)
    expect(knopfMitPraefix('Beteiligung entfernen').getAttribute('aria-label')).toContain('Taufe')
    act(() => {
      knopfMitPraefix('Beteiligung entfernen').click()
    })
    expect(aufrufe).toEqual([{ hook: 'useBeteiligungLoeschen', ein: { id: 'b-a' } }])
    act(() => {
      knopfMitPraefix('Ereignis löschen').click()
    })
    expect(aufrufe[1]).toEqual({ hook: 'useEreignisLoeschen', ein: { id: 'e-a' } })
  })

  it('nach dem Entfernen steht der Fokus auf dem Abschnitt (die Zeile ist weg)', () => {
    zeige(eingabe({ ereignisse: [ereignis('a')] }))
    act(() => {
      knopfMitPraefix('Beteiligung entfernen').click()
    })
    expect(document.activeElement?.id).toBe('person-bearbeiten-feld-ereignisse')
  })

  it('Aussage-Stationen haben keine Lösch-Aktionen (kein Schreibweg, V-130-13-schreibwege)', () => {
    zeige(eingabe({ grunddaten: [feld('beruf', [aussage('a1', 'Schmied')])] }))
    expect(container.textContent).toContain('Schmied')
    expect(container.textContent).toContain('Beruf')
    expect(container.querySelectorAll('li.wz-reiter-leben__station button')).toHaveLength(0)
  })

  it('Zeitraum als Text; undatiert: „ohne Zeitangabe" und keine Spur', () => {
    zeige(mitAchse({ ereignisse: [ereignis('datiert', { datum: gruppe('exakt', 1940) }), ereignis('undatiert', { typ: 'umzug' })] }))
    expect(container.textContent).toContain('1940')
    expect(container.textContent).toContain('ohne Zeitangabe')
    const stationen = Array.from(container.querySelectorAll('li.wz-reiter-leben__station'))
    expect(stationen[0]?.querySelector('.wz-reiter-leben__spur')).not.toBeNull()
    expect(stationen[1]?.querySelector('.wz-reiter-leben__spur')).toBeNull()
  })

  it('die Zeitspur ist reine Anzeige: aria-hidden, und die Achse steht als Text', () => {
    zeige(mitAchse({ ereignisse: [ereignis('x', { datum: gruppe('exakt', 1940) })] }))
    const spur = container.querySelector('.wz-reiter-leben__spur')
    expect(spur?.getAttribute('aria-hidden')).toBe('true')
    expect(container.textContent).toContain('1900 – 1980')
  })

  it('ohne Achse: Hinweis statt Spur', () => {
    // Ein einziger Tag: Anfang und Ende der Achse fallen zusammen, es gibt keine Achse.
    const einTag: PersonDetailAussageDatum = { ...gruppe('exakt', 1940), praezision: 'tag', sort_bis: nachJdn(1940, 1, 1, 'gregorian') }
    zeige(eingabe({ ereignisse: [ereignis('x', { datum: einTag })] }))
    expect(container.querySelector('.wz-reiter-leben__spur')).toBeNull()
    expect(container.querySelector('.wz-reiter-leben__achse-hinweis')).not.toBeNull()
  })

  it('offene und unscharfe Spur auch als Text; außerhalb der Achse „vor der Geburt"/„nach dem Tod"', () => {
    zeige(
      mitAchse({
        ereignisse: [ereignis('a', { datum: gruppe('etwa', 1940) }), ereignis('b', { typ: 'beerdigung', datum: gruppe('exakt', 1981) }), ereignis('c', { datum: gruppe('exakt', 1890) })],
      }),
    )
    expect(container.textContent).toContain('ungefähr')
    expect(container.textContent).toContain('nach dem Tod')
    expect(container.textContent).toContain('vor der Geburt')
  })

  it('nur gueltig_*: „Zeitraum erfasst, noch nicht darstellbar"', () => {
    zeige(mitAchse({ grunddaten: [feld('wohnort', [aussage('a1', 'Lüneburg', { gueltig_von: 2400000, gueltig_bis: 2410000 })])] }))
    expect(container.textContent).toContain('Zeitraum erfasst, noch nicht darstellbar')
    expect(container.querySelector('.wz-reiter-leben__spur')).toBeNull()
  })

  it('Widerspruchszeichen an einer Aussage-Station mit konkurrierenden Angaben', () => {
    zeige(eingabe({ grunddaten: [feld('beruf', [aussage('a1', 'Schmied')], { hatKonkurrierende: true, hat_widerspruch: true })] }))
    expect(container.querySelector('.wz-widerspruchzeichen--ungeloest')).not.toBeNull()
    zeige(eingabe({ grunddaten: [feld('beruf', [aussage('a1', 'Schmied')])] }))
    expect(container.querySelector('.wz-widerspruchzeichen')).toBeNull()
  })

  it('Sicherheit je Station sichtbar, ohne Wert keine Anzeige (nur Anzeige, kein Auswahlfeld)', () => {
    zeige(eingabe({ ereignisse: [ereignis('a', { konfidenz: 3 }), ereignis('b')], grunddaten: [feld('beruf', [aussage('a1', 'Schmied', { konfidenz: 2 })])] }))
    // Nur in den Stationszeilen zählen: das Formular darunter hat einen eigenen Konfidenzwähler.
    const punkte = container.querySelectorAll('li.wz-reiter-leben__station .wz-konfidenzpunkt')
    expect(punkte).toHaveLength(2)
    expect(container.querySelector('li.wz-reiter-leben__station .wz-konfidenzpunkt--3')).not.toBeNull()
    expect(container.querySelector('li.wz-reiter-leben__station .wz-konfidenzpunkt--2')).not.toBeNull()
    expect(container.querySelectorAll('li.wz-reiter-leben__station input, li.wz-reiter-leben__station select')).toHaveLength(0)
  })

  it('Sprungziele: ereignisse = Abschnitt, angaben = Aussage-Station mit Widerspruch, sonst erste, sonst Abschnitt', () => {
    zeige(
      eingabe({
        ereignisse: [ereignis('a')],
        grunddaten: [feld('beruf', [aussage('a1', 'Schmied')]), feld('wohnort', [aussage('a2', 'Lüneburg')], { hatKonkurrierende: true, hat_widerspruch: true })],
      }),
    )
    const ereignisse = document.getElementById('person-bearbeiten-feld-ereignisse')
    expect(ereignisse?.tagName).toBe('SECTION')
    expect(ereignisse?.tabIndex).toBe(-1)
    const angaben = document.getElementById('person-bearbeiten-feld-angaben')
    expect(angaben?.tagName).toBe('LI')
    expect(angaben?.textContent).toContain('Lüneburg')

    zeige(eingabe({ grunddaten: [feld('beruf', [aussage('a1', 'Schmied')])] }))
    expect(document.getElementById('person-bearbeiten-feld-angaben')?.textContent).toContain('Schmied')

    zeige(eingabe({ ereignisse: [ereignis('a')] }))
    const fallback = document.getElementById('person-bearbeiten-feld-angaben')
    expect(fallback).not.toBeNull()
    expect(fallback?.tabIndex).toBe(-1)
    expect(fallback?.tagName).not.toBe('LI')
  })

  it('„+ Angabe mit Zeitraum" ist gesperrt, der Grund steht sichtbar daneben und ist verknüpft', () => {
    zeige(eingabe({}))
    const hinzufuegen = knopf('+ Angabe mit Zeitraum')
    expect(hinzufuegen.disabled).toBe(true)
    const grundId = hinzufuegen.getAttribute('aria-describedby')
    expect(grundId).not.toBeNull()
    expect(document.getElementById(grundId ?? '')?.textContent?.length).toBeGreaterThan(0)
  })

  it('kein Farbliteral im Markup (Token-Vertrag, CLAUDE.md §14)', () => {
    zeige(mitAchse({ ereignisse: [ereignis('a', { datum: gruppe('exakt', 1940), konfidenz: 4 })] }))
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(container.innerHTML).not.toMatch(/rgb\(/)
  })
})
