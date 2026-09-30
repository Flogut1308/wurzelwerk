// @vitest-environment jsdom
//
// AP-1.30 PR 9d-2 (docs/80 §33 V-130-9d2): „Beleg verknüpfen", Chips, Zähler und Entfernen auch an
// Werten, die aus einem Ereignis kommen — Ziel ist die Existenz-Aussage des Ereignisses (ADR-026).
// Muster `reiter-person-beleg.test.tsx`: ALLE Befehls-Hooks sind durch einen Rekorder ersetzt — so
// ist „nur diese Befehle" eine Aussage über jeden Schreibweg.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../src/renderer/i18n/einrichten'
import type { AppFehler } from '../../src/shared/fehler/app-fehler'
import type {
  PersonDetailAus,
  PersonDetailAussage,
  PersonDetailBeleg,
  PersonDetailEreignisExistenz,
  PersonDetailGrunddatenFeld,
  PersonDetailLebensdatum,
} from '../../src/shared/schemata/person-detail'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface Aufruf {
  readonly hook: string
  readonly ein: unknown
}

const aufrufe: Aufruf[] = []
const antworten = new Map<string, () => Promise<unknown>>()
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
          return antworten.get(name)?.() ?? Promise.resolve(name === 'useAussageZitatAnlegen' || name === 'useAussageZitatAendern' ? null : { id: `neu-${name}` })
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
    useQuelleSuche: () => ({ data: { treffer: [{ id: 'q-1', titel: 'Taufregister Marienwerder', autor: null, typ: 'kirchenbuch' }] }, isPending: false }),
    useQuelleDetail: () => ({
      data: {
        kopf: { id: 'q-1', typ: 'kirchenbuch', titel: 'Taufregister Marienwerder' },
        zitate: [
          { id: 'z-1', seite: '42', eintragsnummer: null },
          { id: 'z-2', seite: '43', eintragsnummer: '17' },
          { id: 'z-3', seite: '44', eintragsnummer: null },
        ],
      },
      isPending: false,
    }),
  }
})

import { ReiterPerson } from '../../src/renderer/ansichten/profil/reiter-person'

const PRAEFIX = 'person-bearbeiten'

function beleg(zitatId: string, seite: string, feld: string | null): PersonDetailBeleg {
  return {
    zitat_id: zitatId,
    quelle: { id: 'q-1', typ: 'kirchenbuch', titel: 'Taufregister Marienwerder', archiv_name: null, signatur: null, unmittelbarkeit: null },
    zitat: { seite, eintragsnummer: null, zugriffsdatum_wert1: null, digitalisat_url: null },
    transkript: null,
    feld,
    textanker: null,
  }
}

function aussage(id: string, wert: string): PersonDetailAussage {
  return {
    aussage_id: id,
    wert,
    wert_text: null,
    wert_zahl: null,
    wert_ref_id: null,
    datum: { kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', wert1: wert, wert2: null, originaltext: null, sort_von: 1, sort_bis: 2, zweitkalender: null, zweitwert: null, doppeljahr: null },
    konfidenz: 2,
    ist_bevorzugt: false,
    begruendung: null,
    unsicherheit: null,
    gueltig_von: null,
    gueltig_bis: null,
    belege: [],
  }
}

function feld(praedikat: string, eintrag: PersonDetailAussage): PersonDetailGrunddatenFeld {
  return { praedikat, wert: eintrag.wert, konfidenz: eintrag.konfidenz, belegzahl: eintrag.belege.length, hat_widerspruch: false, hatKonkurrierende: false, aussagen: [eintrag] }
}

function leer(angabe: PersonDetailLebensdatum['angabe']): PersonDetailLebensdatum {
  return { angabe, herkunft: null, aussage_id: null, ereignis_id: null, datum: null, datum_originaltext: null, ort_id: null, ort_name: null }
}

const GEBURTSDATUM_EREIGNIS: PersonDetailLebensdatum = { ...leer('geburtsdatum'), herkunft: 'ereignis', ereignis_id: 'e-1', datum_originaltext: '3. März 1850' }
const GEBURTSORT_EREIGNIS: PersonDetailLebensdatum = { ...leer('geburtsort'), herkunft: 'ereignis', ereignis_id: 'e-1', ort_id: 'ort-1', ort_name: 'Danzig' }

function existenz(belege: readonly PersonDetailBeleg[] = []): PersonDetailEreignisExistenz {
  return { ereignis_id: 'e-1', aussage_id: 'x-1', belege }
}

/** Geburt NUR aus dem Ereignis e-1 (Datum und Ort), Existenz-Aussage x-1 mit Beleg z-1 am Datum. */
function detail(ueberschreibung: Partial<PersonDetailAus> = {}): PersonDetailAus {
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
    grunddaten: [],
    ereignisse: [],
    beziehungen: [],
    gesundheit: [],
    notiz: null,
    sterbeort: null,
    lebensdaten: [GEBURTSDATUM_EREIGNIS, GEBURTSORT_EREIGNIS, leer('todesdatum'), leer('todesort')],
    ereignis_existenz: [existenz([beleg('z-1', '42', 'datum')])],
    warnungen: [],
    offene_punkte: [],
    kernangaben: null,
    belege_anzahl: 1,
    ...ueberschreibung,
  }
}

function knoepfe(wurzel: ParentNode): readonly HTMLButtonElement[] {
  return Array.from(wurzel.querySelectorAll('button'))
}

function knopf(wurzel: ParentNode, text: string): HTMLButtonElement {
  const treffer = knoepfe(wurzel).find((kandidat) => kandidat.textContent === text)
  if (treffer === undefined) throw new Error(`Knopf nicht gefunden: ${text}`)
  return treffer
}

function knopfMit(wurzel: ParentNode, text: string): HTMLButtonElement {
  const treffer = knoepfe(wurzel).find((kandidat) => kandidat.textContent?.includes(text) === true)
  if (treffer === undefined) throw new Error(`Knopf nicht gefunden: ${text}`)
  return treffer
}

function gruppe(wurzel: ParentNode, titel: string): HTMLElement {
  const ueberschrift = Array.from(wurzel.querySelectorAll('h2')).find((kandidat) => kandidat.textContent === titel)
  const abschnitt = ueberschrift?.closest('section')
  if (abschnitt === null || abschnitt === undefined) throw new Error(`Gruppe fehlt: ${titel}`)
  return abschnitt
}

function eingabe(id: string): HTMLInputElement {
  const knoten = document.getElementById(id)
  if (!(knoten instanceof HTMLInputElement)) throw new Error(`Eingabe fehlt: ${id}`)
  return knoten
}

function eintippen(ziel: HTMLInputElement, wert: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (setter === undefined) throw new Error('kein nativer value-Setter')
  setter.call(ziel, wert)
  ziel.dispatchEvent(new Event('input', { bubbles: true }))
}

function schublade(): HTMLElement {
  const dialog = document.querySelector('[role="dialog"]')
  if (!(dialog instanceof HTMLElement)) throw new Error('Schublade fehlt')
  return dialog
}

async function kettenende(): Promise<void> {
  await act(async () => {
    for (let runde = 0; runde < 5; runde += 1) await Promise.resolve()
  })
}

describe('ReiterPerson — Beleg verknüpfen an Werten aus dem Ereignis (AP-1.30 PR 9d-2)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    aufrufe.length = 0
    antworten.clear()
    fehler.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function zeigen(daten: PersonDetailAus): void {
    act(() => root.render(<ReiterPerson personId="p-1" daten={daten} idPraefix={PRAEFIX} aufSprung={() => undefined} aufReiterWechsel={() => undefined} />))
  }

  function waehlerMitQuelle(): HTMLElement {
    act(() => knopf(gruppe(container, 'Geburt'), 'Beleg verknüpfen').click())
    const wurzel = schublade()
    act(() => eintippen(eingabe('wz-beleg-waehler-suche'), 'Tauf'))
    act(() => knopfMit(wurzel, 'Taufregister Marienwerder').click())
    return wurzel
  }

  it('Chip, Knopf und Zähler: der Beleg am Datum der Existenz-Aussage zählt am Datum, nicht am Ort', () => {
    zeigen(detail())
    const geburt = gruppe(container, 'Geburt')
    expect(knopf(geburt, 'Beleg verknüpfen').disabled).toBe(false)
    expect(geburt.textContent).not.toContain('Belege gehören an das Ereignis')
    const chip = geburt.querySelector('.wz-beleg-zeile__chip')
    expect(chip?.textContent).toContain('Taufregister Marienwerder, S. 42')
    expect(chip?.textContent).toContain('Geburtsdatum')
    const zaehler = Array.from(geburt.querySelectorAll('.wz-beleg-abzeichen')).map((knoten) => knoten.getAttribute('aria-label'))
    expect(zaehler).toEqual(['1 Belege', '0 Belege'])
  })

  it('ohne Existenz-Aussage bleibt es beim Hinweis, ohne Zähler (E3)', () => {
    zeigen(detail({ ereignis_existenz: [] }))
    const geburt = gruppe(container, 'Geburt')
    expect(knoepfe(geburt).some((kandidat) => kandidat.textContent === 'Beleg verknüpfen')).toBe(false)
    expect(geburt.textContent).toContain('Belege gehören an das Ereignis')
    expect(geburt.querySelector('.wz-beleg-abzeichen')).toBeNull()
  })

  it('Wähler: Hinweis „am Ereignis verknüpft"; neues Zitat für Datum und Ort = EIN anlegen ohne feld (F2)', async () => {
    zeigen(detail())
    const wurzel = waehlerMitQuelle()
    expect(wurzel.textContent).toContain('Geburtsdatum stammt aus dem Ereignis – der Beleg wird am Ereignis verknüpft.')
    expect(wurzel.textContent).toContain('Geburtsort stammt aus dem Ereignis – der Beleg wird am Ereignis verknüpft.')
    act(() => knopf(wurzel, 'Seite 43 · Eintrag Nr. 17').click())
    await kettenende()
    expect(aufrufe).toEqual([{ hook: 'useAussageZitatAnlegen', ein: { aussageId: 'x-1', zitatId: 'z-2' } }])
    expect(wurzel.textContent).toContain('Beleg verknüpft.')
  })

  it('F3: ein Zitat, das schon am Datum hängt, wird für den Ort auf NULL erweitert (aussage_zitat.aendern), nicht neu angelegt', async () => {
    zeigen(detail())
    const wurzel = waehlerMitQuelle()
    act(() => knopf(wurzel, 'Seite 42').click())
    await kettenende()
    expect(aufrufe).toEqual([{ hook: 'useAussageZitatAendern', ein: { aussageId: 'x-1', zitatId: 'z-1', feld: null, textanker: null } }])
    // Danach deckt es beide Angaben: nicht mehr wählbar (unterwegs).
    expect(knoepfe(wurzel).some((kandidat) => kandidat.textContent === 'Seite 42')).toBe(false)
  })

  it('F1: nur das Datum angekreuzt → anlegen mit feld datum', async () => {
    zeigen(detail())
    const wurzel = waehlerMitQuelle()
    const ortKaestchen = wurzel.querySelector('[role="checkbox"][aria-label="Geburtsort"]')
    if (!(ortKaestchen instanceof HTMLButtonElement)) throw new Error('Kästchen Geburtsort fehlt')
    act(() => ortKaestchen.click())
    act(() => knopf(wurzel, 'Seite 44').click())
    await kettenende()
    expect(aufrufe).toEqual([{ hook: 'useAussageZitatAnlegen', ein: { aussageId: 'x-1', zitatId: 'z-3', feld: 'datum' } }])
  })

  it('gemischt: Datum aus einer Aussage, Ort aus dem Ereignis → anlegen ohne feld bzw. mit feld ort', async () => {
    zeigen(
      detail({
        grunddaten: [feld('geburtsdatum', aussage('g-1', '1850'))],
        lebensdaten: [{ ...leer('geburtsdatum'), herkunft: 'aussage', aussage_id: 'g-1' }, GEBURTSORT_EREIGNIS, leer('todesdatum'), leer('todesort')],
        ereignis_existenz: [existenz()],
      }),
    )
    const wurzel = waehlerMitQuelle()
    expect(wurzel.textContent).not.toContain('Geburtsdatum stammt aus dem Ereignis')
    expect(wurzel.textContent).toContain('Geburtsort stammt aus dem Ereignis')
    act(() => knopf(wurzel, 'Seite 44').click())
    await kettenende()
    expect(aufrufe).toEqual([
      { hook: 'useAussageZitatAnlegen', ein: { aussageId: 'g-1', zitatId: 'z-3' } },
      { hook: 'useAussageZitatAnlegen', ein: { aussageId: 'x-1', zitatId: 'z-3', feld: 'ort' } },
    ])
  })

  it('scheitert die Erweiterung, steht ihr Fehler im Wähler', async () => {
    const erweiterFehler: AppFehler = { code: 'NICHT_GEFUNDEN_AUSSAGE_ZITAT', textSchluessel: 'NICHT_GEFUNDEN_AUSSAGE_ZITAT', vorgangsId: 'v-1' }
    antworten.set('useAussageZitatAendern', () => Promise.reject(erweiterFehler))
    fehler.set('useAussageZitatAendern', erweiterFehler)
    zeigen(detail())
    const wurzel = waehlerMitQuelle()
    act(() => knopf(wurzel, 'Seite 42').click())
    await kettenende()
    const live = wurzel.querySelector('.wz-beleg-waehler__status')?.textContent ?? ''
    expect(live).not.toBe('')
    expect(live).not.toContain('Beleg verknüpft.')
  })

  it('der Zähler am Ereigniswert öffnet die Schublade der Angabe: Ereigniswert, Beleg, „Verknüpfung entfernen" an der Existenz-Aussage', () => {
    zeigen(detail({ ereignis_existenz: [existenz([beleg('z-1', '42', 'datum'), beleg('z-3', '44', 'beschreibung')])] }))
    const zaehler = gruppe(container, 'Geburt').querySelector('.wz-beleg-abzeichen')
    if (!(zaehler instanceof HTMLButtonElement)) throw new Error('Belegzähler fehlt')
    act(() => zaehler.click())
    const wurzel = schublade()
    expect(wurzel.getAttribute('aria-label')).toBe('Belege: Geburtsdatum')
    expect(wurzel.textContent).toContain('3. März 1850 (Originaltext) · aus dem Ereignis Geburt')
    expect(wurzel.textContent).toContain('Seite 42')
    // Ein Beleg mit feld „beschreibung" belegt das Datum nicht und steht nicht in der Liste.
    expect(wurzel.textContent).not.toContain('Seite 44')
    expect(knoepfe(wurzel).filter((kandidat) => kandidat.textContent === 'Verknüpfung entfernen')).toHaveLength(1)
    act(() => knopf(wurzel, 'Verknüpfung entfernen').click())
    expect(aufrufe).toEqual([{ hook: 'useAussageZitatLoeschen', ein: { aussageId: 'x-1', zitatId: 'z-1' } }])
    expect(knoepfe(wurzel).some((kandidat) => kandidat.textContent === 'Verknüpfung entfernen')).toBe(false)
  })
})
