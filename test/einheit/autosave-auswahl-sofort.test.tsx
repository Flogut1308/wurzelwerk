// @vitest-environment jsdom
//
// U-130-nachladen-sofortaendern (AP-1.30 / AP-0.15, `docs/80_Offene_Fragen.md` §33; Befund aus dem
// Review von PR #173): Auswahlfelder (Namenstyp, Schrift, Rufname, „Bevorzugt", Quellentyp,
// Konfidenz) schreiben sofort — bis zu diesem Fix aber AM HOOK VORBEI (`setEintrag` + direktes
// `mutate`). `useEntwurfMitVerzoegertemCommit` erfuhr davon nichts, `bekannt` blieb auf dem alten
// Stand. Zwei Folgen:
//
// 1. Auswahl ändern und vor dem Echo in einem Textfeld derselben Zeile tippen: das Echo gleicht
//    nicht `bekannt`, gilt also als fremd und wird über den Anschlag gelegt — der Anschlag ist
//    still verloren (dieselbe Klasse wie U-130-fix-ablauf07-nachladen, nur über den Auswahlweg).
// 2. Ohne rechtzeitiges Echo sieht der Timer einen ausstehenden Entwurf (`entwurf !== bekannt`)
//    und schreibt denselben Stand nach der Frist ein zweites Mal.
//
// Geprüft an allen Aufrufern mit diesem Muster (Reiter „Namen", Reiter „Person"/Hauptname,
// Ortsnamen, Quellen-Stammfelder, Zitat). Das Echo wird als Rerender mit dem nachgeladenen Stand
// nachgestellt (kontrollierter Zeitpunkt, gefälschte Uhr); Muster `reiter-person-hauptname.test.tsx`
// (alle Befehls-/Abfrage-Hooks durch einen Rekorder ersetzt).
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../src/renderer/i18n/einrichten'
import { AUTOSAVE_DEBOUNCE_MS } from '../../src/shared/autosave'
import type { OrtDetailAus, OrtDetailName } from '../../src/shared/schemata/ort-detail'
import type { PersonDetailAus, PersonDetailLebensdatum, PersonDetailName } from '../../src/shared/schemata/person-detail'
import type { QuelleDetailAus, QuelleDetailKopf, QuelleDetailZitat } from '../../src/shared/schemata/quelle-detail'

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
  )
})

vi.mock('../../src/renderer/brücke/abfrage-hooks', async (importOriginal) => {
  const original: Readonly<Record<string, unknown>> = await importOriginal()
  return Object.fromEntries(Object.keys(original).map((name) => [name, () => ({ data: abfrageDaten.get(name), isPending: false, isSuccess: false, isError: false })]))
})

/** Antworten der Abfrage-Hooks je Hook-Name (Archiv- und Personensuche der Quellen-Stammfelder). */
const abfrageDaten = new Map<string, unknown>()

import { OrteBearbeitenInhalt } from '../../src/renderer/ansichten/orte/ort-bearbeiten'
import { NamenBearbeitenAbschnitt } from '../../src/renderer/ansichten/profil/profil-bearbeiten-namen'
import { ReiterPerson } from '../../src/renderer/ansichten/profil/reiter-person'
import { QuelleBearbeitenInhalt } from '../../src/renderer/ansichten/quellen/quelle-bearbeiten'

// ---------------------------------------------------------------------------------------------
// Daten
// ---------------------------------------------------------------------------------------------

function name(ueberschreibung: Partial<PersonDetailName> = {}): PersonDetailName {
  return {
    id: 'n-1',
    ist_bevorzugt: true,
    typ: 'geburtsname',
    schrift: null,
    vornamen: 'Karl Friedrich',
    nachname: 'Gutnoff',
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
    original_text: 'Karl Friedrich Gutnoff',
    rolle: 'geburtsname',
    rollen_notiz: null,
    reihenfolge: null,
    konfidenz: null,
    sortier_index: null,
    teile: [],
    ...ueberschreibung,
  }
}

function leer(angabe: PersonDetailLebensdatum['angabe']): PersonDetailLebensdatum {
  return { angabe, herkunft: null, aussage_id: null, ereignis_id: null, datum: null, datum_originaltext: null, ort_id: null, ort_name: null }
}

function personDetail(namen: readonly PersonDetailName[]): PersonDetailAus {
  return {
    kopf: {
      person_id: 'p-1',
      anzeigename: 'Karl Friedrich Gutnoff',
      konfidenz_min: null,
      ist_platzhalter: false,
      privat: false,
      geschlecht: 'M',
      platzhalter_grund: null,
      kennung: 1,
      lebend_status: 'lebend',
    },
    namen,
    grunddaten: [],
    ereignisse: [],
    beziehungen: [],
    gesundheit: [],
    notiz: null,
    sterbeort: null,
    lebensdaten: [leer('geburtsdatum'), leer('geburtsort'), leer('todesdatum'), leer('todesort')],
    ereignis_existenz: [],
    warnungen: [],
    offene_punkte: [],
    kernangaben: null,
    belege_anzahl: 0,
  }
}

function ortsname(ueberschreibung: Partial<OrtDetailName> = {}): OrtDetailName {
  return { id: 'on-1', name: 'Marienwerder', sprache: null, gueltig_von: null, gueltig_bis: null, ist_bevorzugt: false, original_text: null, ...ueberschreibung }
}

function ortDetail(namen: readonly OrtDetailName[]): OrtDetailAus {
  return {
    kopf: { id: 'o-1', typ: null, koordinaten_lat: null, koordinaten_lon: null, existiert_von: null, existiert_bis: null, notiz: null },
    namen,
    zugehoerigkeiten: [],
    externeIds: [],
  }
}

function quelleKopf(ueberschreibung: Partial<QuelleDetailKopf> = {}): QuelleDetailKopf {
  return {
    id: 'quelle-1',
    typ: 'kirchenbuch',
    titel: 'Taufbuch',
    autor: null,
    verlag: null,
    jahr: null,
    art: null,
    informationsart: null,
    archiv_id: null,
    archiv_name: null,
    signatur: null,
    notiz: null,
    informant_person_id: null,
    informant_anzeigename: null,
    gespraechsdatum_kalender: null,
    gespraechsdatum_modifikator: null,
    gespraechsdatum_praezision: null,
    gespraechsdatum_wert1: null,
    gespraechsdatum_wert2: null,
    gespraechsdatum_originaltext: null,
    gespraechsdatum_zweitkalender: null,
    gespraechsdatum_zweitwert: null,
    gespraechsdatum_doppeljahr: null,
    form: null,
    unmittelbarkeit: null,
    audio_medium_id: null,
    ...ueberschreibung,
  }
}

function zitat(ueberschreibung: Partial<QuelleDetailZitat> = {}): QuelleDetailZitat {
  return {
    id: 'zitat-1',
    seite: '12',
    eintragsnummer: null,
    band: null,
    jahr: null,
    zugriffsdatum_kalender: null,
    zugriffsdatum_modifikator: null,
    zugriffsdatum_praezision: null,
    zugriffsdatum_wert1: null,
    zugriffsdatum_wert2: null,
    zugriffsdatum_originaltext: null,
    zugriffsdatum_zweitkalender: null,
    zugriffsdatum_zweitwert: null,
    zugriffsdatum_doppeljahr: null,
    zeitmarke_sekunden: null,
    digitalisat_url: null,
    transkript: null,
    uebersetzung: null,
    konfidenz: null,
    medium_id: null,
    ...ueberschreibung,
  }
}

function quelleDetail(kopf: QuelleDetailKopf, zitate: readonly QuelleDetailZitat[] = []): QuelleDetailAus {
  return { kopf, zitate }
}

// ---------------------------------------------------------------------------------------------
// DOM-Helfer
// ---------------------------------------------------------------------------------------------

function bereich(selektor: string): Element {
  const knoten = document.querySelector(selektor)
  if (knoten === null) throw new Error(`Bereich fehlt: ${selektor}`)
  return knoten
}

/** Das Eingabeelement des `Formularfeld`s mit genau dieser Beschriftung innerhalb von `wurzel`. */
function feldIn(wurzel: Element, beschriftung: string): Element {
  const label = Array.from(wurzel.querySelectorAll('label.wz-formularfeld')).find((kandidat) => kandidat.querySelector('.wz-formularfeld__kopf')?.textContent === beschriftung)
  const feld = label?.querySelector('input, select, textarea') ?? null
  if (feld === null) throw new Error(`Feld fehlt: ${beschriftung}`)
  return feld
}

function eintippen(feld: Element, wert: string): void {
  if (!(feld instanceof HTMLInputElement)) throw new Error('kein Textfeld')
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (setter === undefined) throw new Error('kein nativer value-Setter')
  setter.call(feld, wert)
  feld.dispatchEvent(new Event('input', { bubbles: true }))
}

function waehlen(feld: Element, wert: string): void {
  if (!(feld instanceof HTMLSelectElement)) throw new Error('kein Auswahlfeld')
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  if (setter === undefined) throw new Error('kein nativer value-Setter')
  setter.call(feld, wert)
  feld.dispatchEvent(new Event('change', { bubbles: true }))
}

function wert(feld: Element): string {
  if (feld instanceof HTMLInputElement || feld instanceof HTMLSelectElement) return feld.value
  throw new Error('kein Eingabefeld')
}

function aufrufeVon(hook: string): readonly unknown[] {
  return aufrufe.filter((aufruf) => aufruf.hook === hook).map((aufruf) => aufruf.ein)
}

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------

describe('Autosave: sofort schreibende Auswahl läuft über den Entwurfs-Hook (U-130-nachladen-sofortaendern)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    aufrufe.length = 0
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  function zeigen(knoten: React.ReactNode): void {
    act(() => root.render(knoten))
  }

  function warte(ms: number): void {
    act(() => {
      vi.advanceTimersByTime(ms)
    })
  }

  describe('Reiter „Namen" (NamenFelder)', () => {
    const zeile = (): Element => bereich('.wz-profil-bearbeiten-namen__zeile')
    const zeigeNamen = (n: PersonDetailName): void => zeigen(<NamenBearbeitenAbschnitt personId="p-1" namen={[n]} />)

    it('Namenstyp wählen, sofort im Nachnamen tippen, Echo kommt: der Anschlag bleibt und wird geschrieben', () => {
      zeigeNamen(name())
      act(() => waehlen(feldIn(zeile(), 'Namenstyp'), 'ehename'))
      expect(aufrufeVon('useNameAendern')).toEqual([expect.objectContaining({ id: 'n-1', typ: 'ehename', nachname: 'Gutnoff' })])
      act(() => eintippen(feldIn(zeile(), 'Nachname'), 'Gutnoffx'))
      zeigeNamen(name({ typ: 'ehename' })) // Echo des Auswahl-Schreibens
      expect(wert(feldIn(zeile(), 'Nachname'))).toBe('Gutnoffx')
      warte(AUTOSAVE_DEBOUNCE_MS)
      expect(aufrufeVon('useNameAendern')).toEqual([
        expect.objectContaining({ typ: 'ehename', nachname: 'Gutnoff' }),
        expect.objectContaining({ typ: 'ehename', nachname: 'Gutnoffx', feld: 'nachname' }),
      ])
    })

    it('Rufname wählen ohne Echo innerhalb der Frist: genau EIN name.aendern', () => {
      zeigeNamen(name())
      act(() => waehlen(feldIn(zeile(), 'Rufname'), '1'))
      warte(AUTOSAVE_DEBOUNCE_MS * 3)
      expect(aufrufeVon('useNameAendern')).toEqual([expect.objectContaining({ rufnameText: 'Friedrich', rufnameIndex: 1 })])
    })

    it('Rufname wählen, sofort im Nachnamen tippen, Echo kommt: der Anschlag bleibt und wird geschrieben', () => {
      zeigeNamen(name())
      act(() => waehlen(feldIn(zeile(), 'Rufname'), '1'))
      act(() => eintippen(feldIn(zeile(), 'Nachname'), 'Gutnow'))
      zeigeNamen(name({ rufname_text: 'Friedrich', rufname_index: 1 }))
      expect(wert(feldIn(zeile(), 'Nachname'))).toBe('Gutnow')
      warte(AUTOSAVE_DEBOUNCE_MS)
      expect(aufrufeVon('useNameAendern')).toHaveLength(2)
      expect(aufrufeVon('useNameAendern')[1]).toEqual(expect.objectContaining({ rufnameText: 'Friedrich', nachname: 'Gutnow' }))
    })
  })

  describe('Reiter „Person" (Hauptname)', () => {
    const RUFNAME = 'pb-hauptname-rufname'
    const NACHNAME = 'pb-hauptname-nachname'
    const zeigePerson = (n: PersonDetailName): void =>
      zeigen(<ReiterPerson personId="p-1" daten={personDetail([n])} idPraefix="pb" aufSprung={() => undefined} aufReiterWechsel={() => undefined} />)
    const element = (id: string): Element => bereich(`#${id}`)

    it('Rufname wählen ohne Echo innerhalb der Frist: genau EIN name.aendern', () => {
      zeigePerson(name())
      act(() => waehlen(element(RUFNAME), '0'))
      warte(AUTOSAVE_DEBOUNCE_MS * 3)
      expect(aufrufeVon('useNameAendern')).toEqual([expect.objectContaining({ id: 'n-1', rufnameText: 'Karl', rufnameIndex: 0 })])
    })

    it('Rufname wählen, sofort im Nachnamen tippen, Echo kommt: der Anschlag bleibt und wird geschrieben', () => {
      zeigePerson(name())
      act(() => waehlen(element(RUFNAME), '0'))
      act(() => eintippen(element(NACHNAME), 'Gutnow'))
      zeigePerson(name({ rufname_text: 'Karl', rufname_index: 0 }))
      expect(wert(element(NACHNAME))).toBe('Gutnow')
      warte(AUTOSAVE_DEBOUNCE_MS)
      expect(aufrufeVon('useNameAendern')).toHaveLength(2)
      expect(aufrufeVon('useNameAendern')[1]).toEqual(expect.objectContaining({ rufnameText: 'Karl', nachname: 'Gutnow', feld: 'nachname' }))
    })
  })

  describe('Ortsnamen (OrtsnameFelder)', () => {
    const zeile = (): Element => bereich('.wz-ort-bearbeiten__zeile')
    const zeigeOrt = (n: OrtDetailName): void => zeigen(<OrteBearbeitenInhalt ortId="o-1" daten={ortDetail([n])} />)

    it('„Bevorzugt" wählen ohne Echo innerhalb der Frist: genau EIN ortsname.aendern', () => {
      zeigeOrt(ortsname())
      act(() => waehlen(feldIn(zeile(), 'Bevorzugt'), 'ja'))
      warte(AUTOSAVE_DEBOUNCE_MS * 3)
      expect(aufrufeVon('useOrtsnameAendern')).toHaveLength(1)
    })

    it('„Bevorzugt" wählen, sofort im Namen tippen, Echo kommt: der Anschlag bleibt und wird geschrieben', () => {
      zeigeOrt(ortsname())
      act(() => waehlen(feldIn(zeile(), 'Bevorzugt'), 'ja'))
      act(() => eintippen(feldIn(zeile(), 'Name'), 'Marienwerderx'))
      zeigeOrt(ortsname({ ist_bevorzugt: true }))
      expect(wert(feldIn(zeile(), 'Name'))).toBe('Marienwerderx')
      warte(AUTOSAVE_DEBOUNCE_MS)
      expect(aufrufeVon('useOrtsnameAendern')).toHaveLength(2)
      expect(aufrufeVon('useOrtsnameAendern')[1]).toEqual(expect.objectContaining({ name: 'Marienwerderx' }))
    })
  })

  describe('Quellen (Stammfelder und Zitat)', () => {
    const kopf = (): Element => bereich('[aria-labelledby="wz-quelle-bearbeiten-kopf-titel"]')
    const zeigeQuelle = (k: QuelleDetailKopf, zitate: readonly QuelleDetailZitat[] = []): void =>
      zeigen(<QuelleBearbeitenInhalt quelleId="quelle-1" daten={quelleDetail(k, zitate)} />)

    it('Quellentyp wählen ohne Echo innerhalb der Frist: genau EIN quelle.aendern', () => {
      zeigeQuelle(quelleKopf())
      act(() => waehlen(feldIn(kopf(), 'Typ'), 'standesamt'))
      warte(AUTOSAVE_DEBOUNCE_MS * 3)
      expect(aufrufeVon('useQuelleAendern')).toHaveLength(1)
    })

    it('Quellentyp wählen, sofort im Titel tippen, Echo kommt: der Anschlag bleibt und wird geschrieben', () => {
      zeigeQuelle(quelleKopf())
      act(() => waehlen(feldIn(kopf(), 'Typ'), 'standesamt'))
      act(() => eintippen(feldIn(kopf(), 'Titel'), 'Taufbuchx'))
      zeigeQuelle(quelleKopf({ typ: 'standesamt' }))
      expect(wert(feldIn(kopf(), 'Titel'))).toBe('Taufbuchx')
      warte(AUTOSAVE_DEBOUNCE_MS)
      expect(aufrufeVon('useQuelleAendern')).toHaveLength(2)
      expect(aufrufeVon('useQuelleAendern')[1]).toEqual(expect.objectContaining({ typ: 'standesamt', titel: 'Taufbuchx' }))
    })

    it('Zitat-Konfidenz wählen ohne Echo innerhalb der Frist: genau EIN zitat.aendern', () => {
      zeigeQuelle(quelleKopf(), [zitat()])
      const stufe = document.querySelector('[role="radiogroup"][aria-label="Konfidenz"] [role="radio"]')
      if (!(stufe instanceof HTMLButtonElement)) throw new Error('Konfidenzstufe fehlt')
      act(() => stufe.click())
      warte(AUTOSAVE_DEBOUNCE_MS * 3)
      expect(aufrufeVon('useZitatAendern')).toHaveLength(1)
    })
  })

  // hueter PR #175 H2: je Sofort-Auswahl der Stammfelder ein eigener Fall. Mutanten, die hier rot
  // werden müssen: Rückfall auf `setEntwurf` + `quelleAendern.mutate` (zwei Schreibvorgänge, Echo
  // verdrängt den Anschlag) und reines `setEntwurf` (kein sofortiges Schreiben).
  describe('Quellen-Stammfelder: jede Sofort-Auswahl einzeln', () => {
    const kopf = (): Element => bereich('[aria-labelledby="wz-quelle-bearbeiten-kopf-titel"]')
    const zeigeQuelle = (k: QuelleDetailKopf): void => zeigen(<QuelleBearbeitenInhalt quelleId="quelle-1" daten={quelleDetail(k)} />)

    function optionIn(wurzel: Element, beschriftung: string, text: string): HTMLElement {
      const label = Array.from(wurzel.querySelectorAll('label.wz-formularfeld')).find((kandidat) => kandidat.querySelector('.wz-formularfeld__kopf')?.textContent === beschriftung)
      const option = Array.from(label?.querySelectorAll('[role="option"]') ?? []).find((kandidat) => kandidat.textContent?.startsWith(text) === true)
      if (!(option instanceof HTMLElement)) throw new Error(`Option fehlt: ${beschriftung} / ${text}`)
      return option
    }

    function mausWahl(option: HTMLElement): void {
      option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    }

    const MUENDLICH = { typ: 'muendlich', informant_person_id: null, informant_anzeigename: 'Anna' } as const

    const faelle: readonly {
      readonly name: string
      readonly vorher: QuelleDetailKopf
      readonly waehlen: () => void
      readonly erwartet: Readonly<Record<string, unknown>>
      readonly echo: QuelleDetailKopf
    }[] = [
      {
        name: 'Archiv (archivAusgewaehlt)',
        vorher: quelleKopf({ archiv_name: 'Staats' }),
        waehlen: () => mausWahl(optionIn(kopf(), 'Archiv', 'Staatsarchiv')),
        erwartet: { archivId: 'a-1' },
        echo: quelleKopf({ archiv_id: 'a-1', archiv_name: 'Staatsarchiv' }),
      },
      {
        name: 'Informant (informantAusgewaehlt)',
        vorher: quelleKopf(MUENDLICH),
        waehlen: () => mausWahl(optionIn(kopf(), 'Informant', 'Anna Muster')),
        erwartet: { informantPersonId: 'p-9' },
        echo: quelleKopf({ ...MUENDLICH, informant_person_id: 'p-9', informant_anzeigename: 'Anna Muster' }),
      },
      {
        name: 'Art',
        vorher: quelleKopf(),
        waehlen: () => waehlen(feldIn(kopf(), 'Art'), 'derivat'),
        erwartet: { art: 'derivat' },
        echo: quelleKopf({ art: 'derivat' }),
      },
      {
        name: 'Informationsart',
        vorher: quelleKopf(),
        waehlen: () => waehlen(feldIn(kopf(), 'Informationsart'), 'sekundaer'),
        erwartet: { informationsart: 'sekundaer' },
        echo: quelleKopf({ informationsart: 'sekundaer' }),
      },
      {
        name: 'Form',
        vorher: quelleKopf(MUENDLICH),
        waehlen: () => waehlen(feldIn(kopf(), 'Form'), 'brief'),
        erwartet: { form: 'brief' },
        echo: quelleKopf({ ...MUENDLICH, form: 'brief' }),
      },
      {
        name: 'Unmittelbarkeit',
        vorher: quelleKopf(MUENDLICH),
        waehlen: () => waehlen(feldIn(kopf(), 'Unmittelbarkeit'), 'vom_hoerensagen'),
        erwartet: { unmittelbarkeit: 'vom_hoerensagen' },
        echo: quelleKopf({ ...MUENDLICH, unmittelbarkeit: 'vom_hoerensagen' }),
      },
    ]

    beforeEach(() => {
      abfrageDaten.clear()
      abfrageDaten.set('useArchivSuche', { treffer: [{ id: 'a-1', name: 'Staatsarchiv' }] })
      abfrageDaten.set('useSuche', {
        treffer: [
          {
            person_id: 'p-9',
            anzeigename: 'Anna Muster',
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
            quelle: 'volltext',
          },
        ],
        gesamt: 1,
      })
    })

    for (const fall of faelle) {
      it(`${fall.name}: schreibt sofort genau einmal, auch ohne Echo in der Frist`, () => {
        zeigeQuelle(fall.vorher)
        act(() => fall.waehlen())
        expect(aufrufeVon('useQuelleAendern')).toEqual([expect.objectContaining(fall.erwartet)])
        warte(AUTOSAVE_DEBOUNCE_MS * 3)
        expect(aufrufeVon('useQuelleAendern')).toHaveLength(1)
      })

      it(`${fall.name}: Echo der Auswahl wird verworfen, der Anschlag danach bleibt und wird geschrieben`, () => {
        zeigeQuelle(fall.vorher)
        act(() => fall.waehlen())
        act(() => eintippen(feldIn(kopf(), 'Titel'), 'Taufbuchx'))
        zeigeQuelle(fall.echo)
        expect(wert(feldIn(kopf(), 'Titel'))).toBe('Taufbuchx')
        warte(AUTOSAVE_DEBOUNCE_MS)
        expect(aufrufeVon('useQuelleAendern')).toHaveLength(2)
        expect(aufrufeVon('useQuelleAendern')[1]).toEqual(expect.objectContaining({ ...fall.erwartet, titel: 'Taufbuchx' }))
      })
    }
  })
})
