// @vitest-environment jsdom
//
// AP-1.30 PR 9b (Reiter „Person", Abnahme AP-1.30 „Tod-Gruppe erscheint nur bei ‚verstorben' — Werte
// bleiben gespeichert", „Abgeleitete Werte sichtbar, gesperrt, beschriftet", „Sicherheit steht neben
// dem Wert"; docs/80 §33 V-130-9-entscheidungen D3/D5/D7/D10/K, V-E5-erhalt). Rot zuerst (CLAUDE.md
// §5): vor PR 9b gibt es `ReiterPerson` nicht.
//
// jsdom + `react-dom/client` + `act` (Muster `person-bearbeiten-ansicht.test.tsx`). ALLE Befehls-Hooks
// sind durch einen Rekorder ersetzt: jeder `mutate`/`mutateAsync` landet mit Hook-Namen in `aufrufe` —
// so ist „kein Befehl gesendet" eine Aussage über jeden Schreibweg, nicht nur über die erwarteten.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../src/renderer/i18n/einrichten'
import type { AppFehler } from '../../src/shared/fehler/app-fehler'
import type {
  PersonDetailAus,
  PersonDetailAussage,
  PersonDetailGrunddatenFeld,
  PersonDetailKopf,
  PersonDetailLebensdatum,
  PersonDetailWarnung,
} from '../../src/shared/schemata/person-detail'
import { AUTOSAVE_DEBOUNCE_MS } from '../../src/shared/autosave'

// React-19-Schalter für `act(...)` unter Vitest+jsdom (s. `profil-bearbeiten-debounce.test.tsx`).
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface Aufruf {
  readonly hook: string
  readonly ein: unknown
}

const aufrufe: Aufruf[] = []
/** Antworten von `mutateAsync` je Hook (steuerbar, z. B. ein noch offenes Anlegen). */
const antworten = new Map<string, () => Promise<unknown>>()
/** Fehlerzustand je Hook (`error` der Mutation). */
const fehler = new Map<string, AppFehler>()

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
          return antworten.get(name)?.() ?? Promise.resolve({ id: `neu-${name}` })
        },
        isPending: false,
        error: fehler.get(name) ?? null,
      }),
    ]),
  )
})

vi.mock('../../src/renderer/brücke/abfrage-hooks', async (importOriginal) => {
  const original: Readonly<Record<string, unknown>> = await importOriginal()
  return {
    ...Object.fromEntries(Object.keys(original).map((name) => [name, () => ({ data: undefined, isPending: false, isSuccess: false, isError: false })])),
    useOrtSuche: () => ({
      data: { treffer: [{ id: 'o-2', anzeigename: 'Danzig', politischeKette: [] }] },
      isPending: false,
      isSuccess: true,
      isError: false,
    }),
  }
})

import { ReiterPerson } from '../../src/renderer/ansichten/profil/reiter-person'

const PRAEFIX = 'person-bearbeiten'

function kopf(ueberschreibung: Partial<PersonDetailKopf> = {}): PersonDetailKopf {
  return {
    person_id: 'p-1',
    anzeigename: 'Anna Beispiel',
    konfidenz_min: null,
    ist_platzhalter: false,
    privat: false,
    geschlecht: 'F',
    platzhalter_grund: null,
    kennung: 1,
    lebend_status: 'verstorben',
    ...ueberschreibung,
  }
}

function aussage(id: string, ueberschreibung: Partial<PersonDetailAussage> = {}): PersonDetailAussage {
  return {
    aussage_id: id,
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
    ...ueberschreibung,
  }
}

function feld(praedikat: string, eintrag: PersonDetailAussage, belegzahl = 0): PersonDetailGrunddatenFeld {
  return { praedikat, wert: eintrag.wert, konfidenz: eintrag.konfidenz, belegzahl, hat_widerspruch: false, hatKonkurrierende: false, aussagen: [eintrag] }
}

function leer(angabe: PersonDetailLebensdatum['angabe']): PersonDetailLebensdatum {
  return { angabe, herkunft: null, aussage_id: null, ereignis_id: null, datum: null, datum_originaltext: null, ort_id: null, ort_name: null }
}

function ausAussage(angabe: PersonDetailLebensdatum['angabe'], aussageId: string): PersonDetailLebensdatum {
  return { ...leer(angabe), herkunft: 'aussage', aussage_id: aussageId }
}

/** Anna: Geburt 1901 (Aussage g-1, 2 Belege), Tod 1970 (Aussage t-1), keine Orte. */
function detail(ueberschreibung: Partial<PersonDetailAus> = {}): PersonDetailAus {
  const tod = aussage('t-1', {
    wert: '1970',
    datum: { kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', wert1: '1970', wert2: null, originaltext: null, sort_von: 1, sort_bis: 2, zweitkalender: null, zweitwert: null, doppeljahr: null },
  })
  return {
    kopf: kopf(),
    namen: [],
    grunddaten: [feld('geburtsdatum', aussage('g-1'), 2), feld('todesdatum', tod)],
    ereignisse: [],
    beziehungen: [],
    gesundheit: [],
    notiz: null,
    sterbeort: null,
    lebensdaten: [ausAussage('geburtsdatum', 'g-1'), leer('geburtsort'), ausAussage('todesdatum', 't-1'), leer('todesort')],
    warnungen: [],
    offene_punkte: [],
    kernangaben: null,
    belege_anzahl: 2,
    ...ueberschreibung,
  }
}

function eingabe(id: string): HTMLInputElement {
  const knoten = document.getElementById(id)
  if (!(knoten instanceof HTMLInputElement)) throw new Error(`Eingabe fehlt: ${id}`)
  return knoten
}

function eintippen(feld: HTMLInputElement, wert: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (setter === undefined) throw new Error('kein nativer value-Setter')
  setter.call(feld, wert)
  feld.dispatchEvent(new Event('input', { bubbles: true }))
}

function waehlen(auswahl: HTMLSelectElement, wert: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  if (setter === undefined) throw new Error('kein nativer value-Setter')
  setter.call(auswahl, wert)
  auswahl.dispatchEvent(new Event('change', { bubbles: true }))
}

function knopf(wurzel: ParentNode, text: string): HTMLButtonElement {
  const treffer = Array.from(wurzel.querySelectorAll('button')).find((kandidat) => kandidat.textContent === text)
  if (treffer === undefined) throw new Error(`Knopf nicht gefunden: ${text}`)
  return treffer
}

function lebensstatusAuswahl(wurzel: ParentNode): HTMLSelectElement {
  const treffer = Array.from(wurzel.querySelectorAll('select')).find((kandidat) => Array.from(kandidat.options).some((option) => option.value === 'vermutet_verstorben'))
  if (treffer === undefined) throw new Error('Lebensstatus-Auswahl fehlt')
  return treffer
}

function gruppe(wurzel: ParentNode, titel: string): HTMLElement | null {
  const ueberschrift = Array.from(wurzel.querySelectorAll('h2')).find((kandidat) => kandidat.textContent === titel)
  return ueberschrift?.closest('section') ?? null
}

function aufrufeVon(hook: string): readonly unknown[] {
  return aufrufe.filter((aufruf) => aufruf.hook === hook).map((aufruf) => aufruf.ein)
}

describe('ReiterPerson (AP-1.30 PR 9b)', () => {
  let container: HTMLDivElement
  let root: Root
  const aufSprung = vi.fn()

  beforeEach(() => {
    aufrufe.length = 0
    antworten.clear()
    fehler.clear()
    aufSprung.mockClear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  function zeigen(daten: PersonDetailAus): void {
    act(() => root.render(<ReiterPerson personId="p-1" daten={daten} idPraefix={PRAEFIX} aufSprung={aufSprung} />))
  }

  it('Gruppen Eckdaten, Geburt, Tod; Felder tragen editorFeldId; Werte formatiert', () => {
    zeigen(detail())
    expect(gruppe(container, 'Eckdaten')).not.toBeNull()
    expect(gruppe(container, 'Geburt')).not.toBeNull()
    expect(gruppe(container, 'Tod')).not.toBeNull()
    expect(eingabe(`${PRAEFIX}-feld-geburtsdatum`).value).toBe('1901')
    expect(eingabe(`${PRAEFIX}-feld-todesdatum`).value).toBe('1970')
    expect(document.getElementById(`${PRAEFIX}-feld-geburtsort`)).not.toBeNull()
    // Hauptname/Rufname/Kurzbeschreibung kommen erst mit PR 9c.
    expect(gruppe(container, 'Hauptname')).toBeNull()
  })

  it('Sicherheit steht neben dem Wert, Belegzähler zeigt die Belege des Felds', () => {
    zeigen(detail())
    const geburt = gruppe(container, 'Geburt')
    if (geburt === null) throw new Error('Geburt fehlt')
    const sicherheit = geburt.querySelector('[role="radiogroup"]')
    expect(sicherheit?.querySelector('[aria-checked="true"]')).not.toBeNull()
    expect(geburt.querySelector('.wz-beleg-abzeichen')?.textContent).toBe('2')
  })

  describe('Tod-Gruppe (D5): Werte bleiben gespeichert', () => {
    it('auf „lebend" gestellt: nur person.feldSetzen, danach Gruppe weg, zurück auf verstorben: alte Werte sichtbar', () => {
      zeigen(detail())
      act(() => waehlen(lebensstatusAuswahl(container), 'lebend'))
      expect(aufrufe).toEqual([{ hook: 'usePersonFeldSetzen', ein: { id: 'p-1', feld: 'lebend_status', wert: 'lebend' } }])

      zeigen(detail({ kopf: kopf({ lebend_status: 'lebend' }) }))
      expect(gruppe(container, 'Tod')).toBeNull()
      expect(document.getElementById(`${PRAEFIX}-feld-todesdatum`)).toBeNull()
      // Kein Lösch- oder Änderungsbefehl, nur der eine Statuswechsel.
      expect(aufrufe).toHaveLength(1)

      zeigen(detail())
      expect(eingabe(`${PRAEFIX}-feld-todesdatum`).value).toBe('1970')
      expect(aufrufe).toHaveLength(1)
    })

    it('vermutet verstorben: offen; nicht erfasst: eingeklappt und aufklappbar', () => {
      zeigen(detail({ kopf: kopf({ lebend_status: 'vermutet_verstorben' }) }))
      expect(eingabe(`${PRAEFIX}-feld-todesdatum`).value).toBe('1970')

      zeigen(detail({ kopf: kopf({ lebend_status: null }) }))
      const tod = gruppe(container, 'Tod')
      if (tod === null) throw new Error('Tod-Gruppe (eingeklappt) fehlt')
      expect(document.getElementById(`${PRAEFIX}-feld-todesdatum`)).toBeNull()
      act(() => knopf(tod, 'Tod-Angaben einblenden').click())
      expect(eingabe(`${PRAEFIX}-feld-todesdatum`).value).toBe('1970')
      expect(aufrufe).toHaveLength(0)
    })

    it('„nicht erfasst" ist gewählt, solange nichts erfasst ist', () => {
      zeigen(detail({ kopf: kopf({ lebend_status: null }) }))
      expect(lebensstatusAuswahl(container).value).toBe('nicht_erfasst')
    })
  })

  describe('Feldwarnungen (D7, E6)', () => {
    const warnung: PersonDetailWarnung = { code: 'tod_vor_geburt', reiter: 'person', feld: 'todesdatum' }

    it('als Text unter dem Feld, in der Tod-Gruppe; das Feld trägt den Widerspruchszustand', () => {
      zeigen(detail({ warnungen: [warnung] }))
      const tod = gruppe(container, 'Tod')
      expect(tod?.textContent).toContain('Tod vor Geburt')
      expect(gruppe(container, 'Eckdaten')?.textContent).not.toContain('Tod vor Geburt')
      expect(gruppe(container, 'Geburt')?.textContent).not.toContain('Tod vor Geburt')
      expect(eingabe(`${PRAEFIX}-feld-todesdatum`).closest('.wz-reiter-person__angabe--widerspruch')).not.toBeNull()
      expect(eingabe(`${PRAEFIX}-feld-geburtsdatum`).closest('.wz-reiter-person__angabe--widerspruch')).toBeNull()
    })

    it('Tod-Gruppe ausgeblendet: Warnung am Lebensstatus mit „Tod-Angaben einblenden"', () => {
      zeigen(detail({ kopf: kopf({ lebend_status: 'lebend' }), warnungen: [warnung] }))
      const eckdaten = gruppe(container, 'Eckdaten')
      if (eckdaten === null) throw new Error('Eckdaten fehlen')
      expect(eckdaten.textContent).toContain('Tod vor Geburt')
      act(() => knopf(eckdaten, 'Tod-Angaben einblenden').click())
      expect(gruppe(container, 'Tod')?.textContent).toContain('Tod vor Geburt')
      expect(gruppe(container, 'Eckdaten')?.textContent).not.toContain('Tod vor Geburt')
      expect(aufrufe).toHaveLength(0)
    })

    // Design-Review E6: die Warnung steht DIREKT unter dem Eingabekörper (vor Deutungszeile und
    // Kalenderknopf) und beschreibt das Feld per aria-describedby — nicht unter der ganzen Angabe.
    function beschreibung(feld: HTMLInputElement): HTMLElement {
      const beschreibungId = feld.getAttribute('aria-describedby')
      if (beschreibungId === null) throw new Error('aria-describedby fehlt')
      const ziel = document.getElementById(beschreibungId)
      if (ziel === null) throw new Error(`Beschreibung ${beschreibungId} fehlt`)
      return ziel
    }

    it('Datum: Warnung folgt direkt auf das Eingabefeld und ist per aria-describedby verknüpft', () => {
      zeigen(detail({ warnungen: [warnung] }))
      const feld = eingabe(`${PRAEFIX}-feld-todesdatum`)
      expect(feld.nextElementSibling).toBe(beschreibung(feld))
      expect(beschreibung(feld).textContent).toBe('Tod vor Geburt')
      expect(eingabe(`${PRAEFIX}-feld-geburtsdatum`).hasAttribute('aria-describedby')).toBe(false)
    })

    it('Ort: Warnung folgt direkt auf das Suchfeld und ist per aria-describedby verknüpft', () => {
      zeigen(detail({ warnungen: [{ code: 'ereignis_vor_ortsexistenz', reiter: 'person', feld: 'geburtsort' }] }))
      const feld = eingabe(`${PRAEFIX}-feld-geburtsort`)
      expect(feld.nextElementSibling).toBe(beschreibung(feld))
      expect(beschreibung(feld).textContent).toBe('Ereignis liegt außerhalb der Existenz des Ortes')
    })

    it('Wert aus Ereignis: Warnung folgt direkt auf den gesperrten Wert und ist per aria-describedby verknüpft', () => {
      zeigen(
        detail({
          grunddaten: [],
          lebensdaten: [
            leer('geburtsdatum'),
            leer('geburtsort'),
            {
              ...leer('todesdatum'),
              herkunft: 'ereignis',
              ereignis_id: 'e-2',
              datum: { kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', wert1: '1850', wert2: null, originaltext: null, sortVon: 1, sortBis: 2 },
            },
            leer('todesort'),
          ],
          warnungen: [warnung],
        }),
      )
      const feld = eingabe(`${PRAEFIX}-feld-todesdatum`)
      expect(feld.readOnly).toBe(true)
      expect(feld.nextElementSibling).toBe(beschreibung(feld))
      expect(beschreibung(feld).textContent).toBe('Tod vor Geburt')
    })
  })

  describe('Datum (D10, Autosave)', () => {
    it('Datum ändern: nach der Debounce-Frist aussage.aendern mit feld „datum", ohne datumBeibehalten', () => {
      vi.useFakeTimers()
      zeigen(detail())
      const geburt = eingabe(`${PRAEFIX}-feld-geburtsdatum`)
      act(() => eintippen(geburt, '1902'))
      expect(container.textContent).toContain('Verstanden als: 1902')
      expect(aufrufe).toHaveLength(0)
      act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS))
      expect(aufrufeVon('useAussageAendern')).toEqual([
        { id: 'g-1', datum: { kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', wert1: '1902' }, konfidenz: 3, feld: 'datum' },
      ])
    })

    it('Blur schreibt sofort, ohne auf die Frist zu warten', () => {
      vi.useFakeTimers()
      zeigen(detail())
      const geburt = eingabe(`${PRAEFIX}-feld-geburtsdatum`)
      act(() => geburt.focus())
      act(() => eintippen(geburt, '1903'))
      act(() => geburt.blur())
      expect(aufrufeVon('useAussageAendern')).toHaveLength(1)
      act(() => vi.runOnlyPendingTimers())
      expect(aufrufeVon('useAussageAendern')).toHaveLength(1)
    })

    it('nicht auflösbar oder leer: nichts wird geschrieben', () => {
      vi.useFakeTimers()
      zeigen(detail())
      const geburt = eingabe(`${PRAEFIX}-feld-geburtsdatum`)
      act(() => eintippen(geburt, '190'))
      act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS))
      act(() => eintippen(geburt, ''))
      act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS))
      expect(aufrufe).toHaveLength(0)
    })

    it('K: leeres Feld — erstes Schreiben legt an, eine Folgeänderung vor dem Nachladen ändert DIESE Aussage (keine zweite Anlage)', async () => {
      vi.useFakeTimers()
      let anlegenAuf: (wert: { readonly id: string }) => void = () => undefined
      antworten.set('useAussageAnlegen', () => new Promise((aufloesen) => (anlegenAuf = aufloesen)))
      zeigen(detail({ kopf: kopf({ lebend_status: 'verstorben' }), grunddaten: [], lebensdaten: [leer('geburtsdatum'), leer('geburtsort'), leer('todesdatum'), leer('todesort')] }))
      const geburt = eingabe(`${PRAEFIX}-feld-geburtsdatum`)
      act(() => eintippen(geburt, '1901'))
      act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS))
      expect(aufrufeVon('useAussageAnlegen')).toEqual([
        { subjektTyp: 'person', subjektId: 'p-1', praedikat: 'geburtsdatum', datum: { kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', wert1: '1901' }, konfidenz: 2 },
      ])
      act(() => eintippen(geburt, '1902'))
      act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS))
      expect(aufrufeVon('useAussageAnlegen')).toHaveLength(1)
      expect(aufrufeVon('useAussageAendern')).toHaveLength(0)
      await act(async () => {
        anlegenAuf({ id: 'a-neu' })
        await Promise.resolve()
      })
      expect(aufrufeVon('useAussageAnlegen')).toHaveLength(1)
      expect(aufrufeVon('useAussageAendern')).toEqual([
        { id: 'a-neu', datum: { kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', wert1: '1902' }, konfidenz: 2, feld: 'datum' },
      ])
    })
  })

  describe('Sicherheit', () => {
    it('schreibt konfidenz per aussage.aendern ohne Koaleszenz, das Datum bleibt', () => {
      zeigen(detail())
      const geburt = gruppe(container, 'Geburt')
      const stufe4 = geburt?.querySelectorAll('[role="radiogroup"] [role="radio"]')[3]
      if (!(stufe4 instanceof HTMLButtonElement)) throw new Error('Stufe 4 fehlt')
      act(() => stufe4.click())
      const ein = aufrufeVon('useAussageAendern')
      expect(ein).toEqual([{ id: 'g-1', datumBeibehalten: true, konfidenz: 4 }])
    })

    it('leeres Feld: Sicherheit gesperrt (erst ein Wert legt die Angabe an)', () => {
      zeigen(detail({ grunddaten: [], lebensdaten: [leer('geburtsdatum'), leer('geburtsort'), leer('todesdatum'), leer('todesort')] }))
      const geburt = gruppe(container, 'Geburt')
      const stufen = Array.from(geburt?.querySelectorAll<HTMLButtonElement>('[role="radiogroup"] [role="radio"]') ?? [])
      expect(stufen.length).toBeGreaterThan(0)
      expect(stufen.every((stufe) => stufe.disabled)).toBe(true)
    })
  })

  describe('Werte aus Ereignis (D3)', () => {
    function ausEreignis(): PersonDetailAus {
      return detail({
        grunddaten: [],
        lebensdaten: [
          {
            ...leer('geburtsdatum'),
            herkunft: 'ereignis',
            ereignis_id: 'e-1',
            datum: { kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', wert1: '1899', wert2: null, originaltext: null, sortVon: 1, sortBis: 2 },
          },
          leer('geburtsort'),
          leer('todesdatum'),
          leer('todesort'),
        ],
      })
    }

    it('gesperrt angezeigt und beschriftet, keine Eingabe', () => {
      zeigen(ausEreignis())
      const geburt = gruppe(container, 'Geburt')
      expect(geburt?.textContent).toContain('aus dem Ereignis Geburt')
      const wert = eingabe(`${PRAEFIX}-feld-geburtsdatum`)
      expect(wert.value).toBe('1899')
      expect(wert.readOnly).toBe(true)
      // Keine Sicherheit/kein Belegzähler des Ereignisses (das Lesemodell liefert sie nicht).
      expect(wert.closest('.wz-reiter-person__angabe')?.querySelector('[role="radiogroup"]')).toBeNull()
    })

    it('„als Angabe übernehmen" legt eine Aussage mit dem Ereigniswert an', () => {
      zeigen(ausEreignis())
      const geburt = gruppe(container, 'Geburt')
      if (geburt === null) throw new Error('Geburt fehlt')
      act(() => knopf(geburt, 'als Angabe übernehmen').click())
      expect(aufrufe).toEqual([
        {
          hook: 'useAussageAnlegen',
          ein: { subjektTyp: 'person', subjektId: 'p-1', praedikat: 'geburtsdatum', datum: { kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', wert1: '1899' }, konfidenz: 2 },
        },
      ])
    })

    it('„Ereignis bearbeiten" springt in den Reiter Leben', () => {
      zeigen(ausEreignis())
      const geburt = gruppe(container, 'Geburt')
      if (geburt === null) throw new Error('Geburt fehlt')
      act(() => knopf(geburt, 'Ereignis bearbeiten').click())
      expect(aufSprung).toHaveBeenCalledWith('leben', 'ereignisse')
      expect(aufrufe).toHaveLength(0)
    })
  })

  describe('Ort (Ortsverweis, E5)', () => {
    function mitOrt(ortAussage: PersonDetailAussage): PersonDetailAus {
      return detail({
        grunddaten: [feld('geburtsdatum', aussage('g-1')), feld('geburtsort', ortAussage)],
        lebensdaten: [ausAussage('geburtsdatum', 'g-1'), ausAussage('geburtsort', ortAussage.aussage_id), leer('todesdatum'), leer('todesort')],
      })
    }

    it('Ortswahl: aussage.aendern mit wertRefId und datumBeibehalten (E5-Vorgabe), Einzelschritt ohne Koaleszenz', () => {
      zeigen(mitOrt(aussage('o-a', { wert: 'Marienwerder', wert_ref_id: 'o-1' })))
      const ort = eingabe(`${PRAEFIX}-feld-geburtsort`)
      expect(ort.value).toBe('Marienwerder')
      act(() => eintippen(ort, 'Danz'))
      const treffer = Array.from(container.querySelectorAll('[role="option"]')).find((option) => option.textContent?.includes('Danzig'))
      if (treffer === undefined) throw new Error('Treffer fehlt')
      act(() => {
        treffer.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      })
      expect(aufrufeVon('useAussageAendern')).toEqual([{ id: 'o-a', wertRefId: 'o-2', datumBeibehalten: true, konfidenz: 3 }])
    })

    it('Altbestand mit Datum: Hinweis mit dem Datum und „Datum entfernen" (ohne datumBeibehalten, Einzelschritt)', () => {
      zeigen(mitOrt(aussage('o-a', { wert: 'Marienwerder', wert_ref_id: 'o-1' })))
      const geburt = gruppe(container, 'Geburt')
      if (geburt === null) throw new Error('Geburt fehlt')
      expect(geburt.textContent).toContain('1901')
      act(() => knopf(geburt, 'Datum entfernen').click())
      const ein = aufrufeVon('useAussageAendern')
      expect(ein).toEqual([{ id: 'o-a', wertRefId: 'o-1', konfidenz: 3 }])
      expect(ein[0]).not.toHaveProperty('datumBeibehalten')
      expect(ein[0]).not.toHaveProperty('feld')
    })

    it('ohne Datum: kein Hinweis, keine Aktion', () => {
      zeigen(mitOrt(aussage('o-a', { wert: 'Marienwerder', wert_ref_id: 'o-1', datum: null })))
      const geburt = gruppe(container, 'Geburt')
      expect(Array.from(geburt?.querySelectorAll('button') ?? []).some((b) => b.textContent === 'Datum entfernen')).toBe(false)
    })

    it('Fehler des Befehls (VALIDIERUNG_ORTSWERT) steht am Feld, kein Absturz', () => {
      fehler.set('useAussageAendern', { code: 'VALIDIERUNG_ORTSWERT', textSchluessel: 'VALIDIERUNG_ORTSWERT', vorgangsId: 'v-1' })
      zeigen(mitOrt(aussage('o-a', { wert: '7', wert_zahl: 7, datum: null })))
      const geburt = gruppe(container, 'Geburt')
      expect(geburt?.textContent).toContain('Hier gehört ein Ort hin')
    })
  })
})
