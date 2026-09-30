// @vitest-environment jsdom
//
// AP-1.30 PR 9d (Beleg-Wähler im Reiter Person, Abnahme „Geburt und Tod je mit … Sicherheit, Beleg";
// B-01/B-02/S-08; docs/80 §33 V-130-9d E1–E11). Rot zuerst (CLAUDE.md §5): vor PR 9d gibt es weder
// Beleg-Zeile noch Wähler.
//
// Muster `reiter-person.test.tsx`: ALLE Befehls-Hooks sind durch einen Rekorder ersetzt — „kein
// `zitat.loeschen`" ist so eine Aussage über jeden Schreibweg, nicht nur über die erwarteten.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../src/renderer/i18n/einrichten'
import type { AppFehler } from '../../src/shared/fehler/app-fehler'
import type { PersonDetailAus, PersonDetailAussage, PersonDetailBeleg, PersonDetailGrunddatenFeld, PersonDetailLebensdatum } from '../../src/shared/schemata/person-detail'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface Aufruf {
  readonly hook: string
  readonly ein: unknown
}

const aufrufe: Aufruf[] = []
/** Antworten von `mutateAsync` je Hook (steuerbar, z. B. ein noch offenes Verknüpfen). */
const antworten = new Map<string, () => Promise<unknown>>()
/** Fehlerzustand je Hook (`error` der Mutation) — wie bei `useMutation` bleibt er stehen, bis dieselbe
 * Mutation erneut läuft. */
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
          return antworten.get(name)?.() ?? Promise.resolve(name === 'useAussageZitatAnlegen' ? null : { id: `neu-${name}` })
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
        ],
      },
      isPending: false,
    }),
  }
})

import { ReiterPerson } from '../../src/renderer/ansichten/profil/reiter-person'

const PRAEFIX = 'person-bearbeiten'

function beleg(zitatId: string, seite: string): PersonDetailBeleg {
  return {
    zitat_id: zitatId,
    quelle: { id: 'q-1', typ: 'kirchenbuch', titel: 'Taufregister Marienwerder', archiv_name: null, signatur: null, unmittelbarkeit: null },
    zitat: { seite, eintragsnummer: null, zugriffsdatum_wert1: null, digitalisat_url: null },
    transkript: null,
    feld: null,
    textanker: null,
  }
}

function aussage(id: string, wert: string, belege: readonly PersonDetailBeleg[] = [], wertRefId: string | null = null): PersonDetailAussage {
  return {
    aussage_id: id,
    wert,
    wert_text: null,
    wert_zahl: null,
    wert_ref_id: wertRefId,
    datum:
      wertRefId === null
        ? { kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', wert1: wert, wert2: null, originaltext: null, sort_von: 1, sort_bis: 2, zweitkalender: null, zweitwert: null, doppeljahr: null }
        : null,
    konfidenz: 2,
    ist_bevorzugt: false,
    begruendung: null,
    unsicherheit: null,
    gueltig_von: null,
    gueltig_bis: null,
    belege,
  }
}

function feld(praedikat: string, eintrag: PersonDetailAussage): PersonDetailGrunddatenFeld {
  return { praedikat, wert: eintrag.wert, konfidenz: eintrag.konfidenz, belegzahl: eintrag.belege.length, hat_widerspruch: false, hatKonkurrierende: false, aussagen: [eintrag] }
}

function leer(angabe: PersonDetailLebensdatum['angabe']): PersonDetailLebensdatum {
  return { angabe, herkunft: null, aussage_id: null, ereignis_id: null, datum: null, datum_originaltext: null, ort_id: null, ort_name: null }
}

function ausAussage(angabe: PersonDetailLebensdatum['angabe'], aussageId: string): PersonDetailLebensdatum {
  return { ...leer(angabe), herkunft: 'aussage', aussage_id: aussageId }
}

/** Geburtsdatum 1901 (g-1, Beleg z-1), Geburtsort Danzig (o-1), Tod ohne Werte. */
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
      lebend_status: 'verstorben',
    },
    namen: [],
    grunddaten: [feld('geburtsdatum', aussage('g-1', '1901', [beleg('z-1', '42')])), feld('geburtsort', aussage('o-1', 'Danzig', [], 'ort-1'))],
    ereignisse: [],
    beziehungen: [],
    gesundheit: [],
    notiz: null,
    sterbeort: null,
    lebensdaten: [ausAussage('geburtsdatum', 'g-1'), ausAussage('geburtsort', 'o-1'), leer('todesdatum'), leer('todesort')],
    warnungen: [],
    offene_punkte: [],
    kernangaben: null,
    belege_anzahl: 1,
    ...ueberschreibung,
  }
}

function knopf(wurzel: ParentNode, text: string): HTMLButtonElement {
  const treffer = Array.from(wurzel.querySelectorAll('button')).find((kandidat) => kandidat.textContent === text)
  if (treffer === undefined) throw new Error(`Knopf nicht gefunden: ${text}`)
  return treffer
}

function knopfMit(wurzel: ParentNode, text: string): HTMLButtonElement {
  const treffer = Array.from(wurzel.querySelectorAll('button')).find((kandidat) => kandidat.textContent?.includes(text) === true)
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

function aufrufeVon(hook: string): readonly unknown[] {
  return aufrufe.filter((aufruf) => aufruf.hook === hook).map((aufruf) => aufruf.ein)
}

/** Wartet, bis die `mutateAsync`-Kette (Promise-Mikroaufgaben) abgelaufen ist. */
async function kettenende(): Promise<void> {
  await act(async () => {
    for (let runde = 0; runde < 5; runde += 1) await Promise.resolve()
  })
}

describe('ReiterPerson — Beleg-Zeile und Beleg-Wähler (AP-1.30 PR 9d)', () => {
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
    vi.useRealTimers()
  })

  function zeigen(daten: PersonDetailAus): void {
    act(() => root.render(<ReiterPerson personId="p-1" daten={daten} idPraefix={PRAEFIX} aufSprung={() => undefined} aufReiterWechsel={() => undefined} />))
  }

  it('Geburt: Chip mit Quellentyp und Titel/Seite der Ziel-Aussage, „Beleg verknüpfen" bereit', () => {
    zeigen(detail())
    const geburt = gruppe(container, 'Geburt')
    const chip = geburt.querySelector('.wz-beleg-zeile__chip')
    expect(chip?.textContent).toContain('Kirchenbuch')
    expect(chip?.textContent).toContain('Taufregister Marienwerder, S. 42')
    // Zwei Ziele, der Beleg hängt nur am Datum — der Chip sagt das.
    expect(chip?.textContent).toContain('Geburtsdatum')
    expect(knopf(geburt, 'Beleg verknüpfen').disabled).toBe(false)
  })

  it('ohne Wert gesperrt mit Hinweis (E4); Wert aus dem Ereignis: Hinweis statt Knopf (E3)', () => {
    zeigen(detail())
    const tod = gruppe(container, 'Tod')
    expect(knopf(tod, 'Beleg verknüpfen').disabled).toBe(true)
    expect(tod.textContent).toContain('Erst Datum oder Ort erfassen')

    zeigen(
      detail({
        grunddaten: [],
        lebensdaten: [{ ...leer('geburtsdatum'), herkunft: 'ereignis', ereignis_id: 'e-1', datum: null, datum_originaltext: 'um 1900' }, leer('geburtsort'), leer('todesdatum'), leer('todesort')],
      }),
    )
    const geburt = gruppe(container, 'Geburt')
    expect(Array.from(geburt.querySelectorAll('button')).some((kandidat) => kandidat.textContent === 'Beleg verknüpfen')).toBe(false)
    expect(geburt.textContent).toContain('Belege gehören an das Ereignis')
  })

  it('Quelle suchen → Zitat wählen schreibt sofort je angekreuztem Ziel einen aussage_zitat.anlegen (E1/E2/E9)', async () => {
    zeigen(detail())
    act(() => knopf(gruppe(container, 'Geburt'), 'Beleg verknüpfen').click())
    const wurzel = schublade()
    expect(wurzel.getAttribute('aria-label')).toBe('Belege: Geburt')
    // Kein Treffer ohne Text (E7), dann Suche.
    expect(wurzel.textContent).not.toContain('Taufregister Marienwerder Kirchenbuch')
    act(() => eintippen(eingabe('wz-beleg-waehler-suche'), 'Tauf'))
    act(() => knopfMit(wurzel, 'Taufregister Marienwerder').click())

    // z-1 hängt schon am Datum, aber noch nicht am Ort → wählbar; z-2 an keinem.
    act(() => knopf(wurzel, 'Seite 43 · Eintrag Nr. 17').click())
    await kettenende()
    expect(aufrufeVon('useAussageZitatAnlegen')).toEqual([
      { aussageId: 'g-1', zitatId: 'z-2' },
      { aussageId: 'o-1', zitatId: 'z-2' },
    ])
    // Bis der neue Lesestand kommt, gilt das Paar als verknüpft: kein zweites Senden.
    expect(Array.from(wurzel.querySelectorAll('button')).some((kandidat) => kandidat.textContent === 'Seite 43 · Eintrag Nr. 17')).toBe(false)

    // Ort abwählen: z-1 fehlt dann nur noch dem abgewählten Ziel → ausgeblendet.
    const ortKaestchen = wurzel.querySelector('[role="checkbox"][aria-label="Geburtsort"]')
    if (!(ortKaestchen instanceof HTMLButtonElement)) throw new Error('Kästchen Geburtsort fehlt')
    act(() => ortKaestchen.click())
    expect(Array.from(wurzel.querySelectorAll('button')).some((kandidat) => kandidat.textContent === 'Seite 42')).toBe(false)

    expect(aufrufeVon('useZitatLoeschen')).toEqual([])
    expect(aufrufeVon('useAussageAendern')).toEqual([])
  })

  it('während geschrieben wird, ist der Wähler gesperrt (kein Doppelklick)', async () => {
    let freigeben: (wert: null) => void = () => undefined
    antworten.set('useAussageZitatAnlegen', () => new Promise<null>((erledigt) => (freigeben = erledigt)))
    zeigen(detail({ grunddaten: [feld('geburtsdatum', aussage('g-1', '1901'))], lebensdaten: [ausAussage('geburtsdatum', 'g-1'), leer('geburtsort'), leer('todesdatum'), leer('todesort')] }))
    act(() => knopf(gruppe(container, 'Geburt'), 'Beleg verknüpfen').click())
    const wurzel = schublade()
    act(() => eintippen(eingabe('wz-beleg-waehler-suche'), 'Tauf'))
    act(() => knopfMit(wurzel, 'Taufregister Marienwerder').click())
    const zitat = knopf(wurzel, 'Seite 42')
    act(() => zitat.click())
    await kettenende()
    expect(knopf(wurzel, 'Seite 43 · Eintrag Nr. 17').disabled).toBe(true)
    act(() => knopf(wurzel, 'Seite 43 · Eintrag Nr. 17').click())
    expect(aufrufeVon('useAussageZitatAnlegen')).toEqual([{ aussageId: 'g-1', zitatId: 'z-1' }])
    await act(async () => {
      freigeben(null)
      await Promise.resolve()
    })
    await kettenende()
    expect(knopf(wurzel, 'Seite 43 · Eintrag Nr. 17').disabled).toBe(false)
  })

  it('neues Zitat: zitat.anlegen mit Seite, dann die Verknüpfung — zwei Schritte (E2/E7)', async () => {
    zeigen(detail({ grunddaten: [feld('geburtsdatum', aussage('g-1', '1901'))], lebensdaten: [ausAussage('geburtsdatum', 'g-1'), leer('geburtsort'), leer('todesdatum'), leer('todesort')] }))
    act(() => knopf(gruppe(container, 'Geburt'), 'Beleg verknüpfen').click())
    const wurzel = schublade()
    // Ein Ziel: kein Kästchen, nur die Angabe.
    expect(wurzel.querySelector('[role="checkbox"]')).toBeNull()
    act(() => eintippen(eingabe('wz-beleg-waehler-suche'), 'Tauf'))
    act(() => knopfMit(wurzel, 'Taufregister Marienwerder').click())
    act(() => eintippen(eingabe('wz-beleg-waehler-seite'), ' 44 '))
    act(() => knopf(wurzel, 'Zitat anlegen und verknüpfen').click())
    await kettenende()
    expect(aufrufe.map((aufruf) => aufruf.hook)).toEqual(['useZitatAnlegen', 'useAussageZitatAnlegen'])
    expect(aufrufeVon('useZitatAnlegen')).toEqual([{ quelleId: 'q-1', seite: '44' }])
    expect(aufrufeVon('useAussageZitatAnlegen')).toEqual([{ aussageId: 'g-1', zitatId: 'neu-useZitatAnlegen' }])
    expect(eingabe('wz-beleg-waehler-seite').value).toBe('')
  })

  it('„Verknüpfung entfernen" schickt nur aussage_zitat.loeschen, das Zitat bleibt (E10)', () => {
    zeigen(detail())
    act(() => knopfMit(gruppe(container, 'Geburt'), 'Taufregister Marienwerder, S. 42').click())
    act(() => knopf(schublade(), 'Verknüpfung entfernen').click())
    expect(aufrufe).toEqual([{ hook: 'useAussageZitatLoeschen', ein: { aussageId: 'g-1', zitatId: 'z-1' } }])
  })

  it('der Belegzähler öffnet dieselbe Schublade für die eine Angabe, mit Wähler im Kopf (E11)', () => {
    zeigen(detail())
    const zaehler = gruppe(container, 'Geburt').querySelector('.wz-beleg-abzeichen')
    if (!(zaehler instanceof HTMLButtonElement)) throw new Error('Belegzähler fehlt')
    act(() => zaehler.click())
    expect(schublade().getAttribute('aria-label')).toBe('Belege: Geburtsdatum')
    expect(schublade().querySelector('#wz-beleg-waehler-suche')).not.toBeNull()
    expect(schublade().querySelector('[role="checkbox"]')).toBeNull()
    // „Quelle anlegen" steht genau einmal (im Wähler), nicht zusätzlich am Fuß der Liste.
    expect(Array.from(schublade().querySelectorAll('button')).filter((kandidat) => kandidat.textContent === 'Quelle anlegen')).toHaveLength(1)
  })

  it('ein laufender Datums-Debounce ist geschrieben, bevor verknüpft wird (Blur-Commit beim Öffnen)', () => {
    vi.useFakeTimers()
    zeigen(detail())
    const datum = eingabe(`${PRAEFIX}-feld-geburtsdatum`)
    act(() => datum.focus())
    act(() => eintippen(datum, '1902'))
    expect(aufrufeVon('useAussageAendern')).toEqual([])
    // Kein Timer läuft ab: die Schublade holt den Fokus, das Datumsfeld wird verlassen.
    act(() => knopf(gruppe(container, 'Geburt'), 'Beleg verknüpfen').click())
    expect(document.activeElement).toBe(schublade())
    expect(aufrufeVon('useAussageAendern')).toHaveLength(1)
  })

  // hueter #176 H1: ein alter Fehler einer ANDEREN Mutation (hier `zitat.anlegen`) blieb im Wähler
  // stehen und verdeckte die Erfolgsmeldung einer späteren, gelungenen Verknüpfung.
  it('nach einem gescheiterten „neues Zitat" zeigt eine spätere Verknüpfung „Beleg verknüpft." statt des alten Fehlers (H1)', async () => {
    zeigen(detail({ grunddaten: [feld('geburtsdatum', aussage('g-1', '1901'))], lebensdaten: [ausAussage('geburtsdatum', 'g-1'), leer('geburtsort'), leer('todesdatum'), leer('todesort')] }))
    act(() => knopf(gruppe(container, 'Geburt'), 'Beleg verknüpfen').click())
    const wurzel = schublade()
    act(() => eintippen(eingabe('wz-beleg-waehler-suche'), 'Tauf'))
    act(() => knopfMit(wurzel, 'Taufregister Marienwerder').click())
    const zitatFehler: AppFehler = { code: 'NICHT_GEFUNDEN_QUELLE', textSchluessel: 'NICHT_GEFUNDEN_QUELLE', vorgangsId: 'v-1' }
    antworten.set('useZitatAnlegen', () => Promise.reject(zitatFehler))
    fehler.set('useZitatAnlegen', zitatFehler)
    act(() => knopf(wurzel, 'Zitat anlegen und verknüpfen').click())
    await kettenende()
    // Späterer Erfolg über ein bestehendes Zitat; der Fehler von `zitat.anlegen` steht weiter im Hook.
    act(() => knopf(wurzel, 'Seite 42').click())
    await kettenende()
    expect(aufrufeVon('useAussageZitatAnlegen')).toEqual([{ aussageId: 'g-1', zitatId: 'z-1' }])
    expect(wurzel.textContent).toContain('Beleg verknüpft.')
    expect(wurzel.textContent).not.toContain('Quelle nicht gefunden')
  })
})
