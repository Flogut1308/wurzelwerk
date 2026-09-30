// @vitest-environment jsdom
//
// AP-1.30 PR 9c (Reiter „Person", Gruppe „Hauptname"; docs/80 §33 V-130-9c E1–E10). Rot zuerst
// (CLAUDE.md §5): vor PR 9c hat der Reiter keine Gruppe „Hauptname".
//
// Muster `reiter-person.test.tsx`: jsdom + `act`, ALLE Befehls-Hooks durch einen Rekorder ersetzt —
// „kein Befehl gesendet" ist so eine Aussage über jeden Schreibweg.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '../../src/renderer/i18n/einrichten'
import type { PersonDetailAus, PersonDetailAussage, PersonDetailGrunddatenFeld, PersonDetailLebensdatum, PersonDetailName } from '../../src/shared/schemata/person-detail'
import { AUTOSAVE_DEBOUNCE_MS } from '../../src/shared/autosave'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface Aufruf {
  readonly hook: string
  readonly ein: unknown
}

const aufrufe: Aufruf[] = []
const antworten = new Map<string, () => Promise<unknown>>()
/** PR 11c-2: `error` eines Hooks (sonst `null`). */
const fehlerVon = new Map<string, unknown>()

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
        error: fehlerVon.get(name) ?? null,
      }),
    ]),
  )
})

vi.mock('../../src/renderer/brücke/abfrage-hooks', async (importOriginal) => {
  const original: Readonly<Record<string, unknown>> = await importOriginal()
  return Object.fromEntries(Object.keys(original).map((name) => [name, () => ({ data: undefined, isPending: false, isSuccess: false, isError: false })]))
})

import { ReiterPerson } from '../../src/renderer/ansichten/profil/reiter-person'

const PRAEFIX = 'person-bearbeiten'

function name(id: string, ueberschreibung: Partial<PersonDetailName> = {}): PersonDetailName {
  return {
    id,
    ist_bevorzugt: false,
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

function aussage(id: string, ueberschreibung: Partial<PersonDetailAussage> = {}): PersonDetailAussage {
  return {
    aussage_id: id,
    wert: 'Schmied',
    wert_text: 'Schmied',
    wert_zahl: null,
    wert_ref_id: null,
    datum: null,
    konfidenz: 2,
    ist_bevorzugt: false,
    begruendung: null,
    unsicherheit: null,
    gueltig_von: null,
    gueltig_bis: null,
    belege: [],
    ...ueberschreibung,
  }
}

function kurzbeschreibungen(...aussagen: PersonDetailAussage[]): PersonDetailGrunddatenFeld {
  const erste = aussagen[0]
  return { praedikat: 'kurzbeschreibung', wert: erste?.wert ?? null, konfidenz: erste?.konfidenz ?? null, belegzahl: 0, hat_widerspruch: false, hatKonkurrierende: false, aussagen }
}

function leer(angabe: PersonDetailLebensdatum['angabe']): PersonDetailLebensdatum {
  return { angabe, herkunft: null, aussage_id: null, ereignis_id: null, datum: null, datum_originaltext: null, ort_id: null, ort_name: null }
}

/** Nebenform zuerst, Hauptname (ist_bevorzugt) an zweiter Stelle: E4 — nicht `namen[0]`. */
const NEBENFORM = name('n-1', { typ: 'aka', vornamen: 'Карл', nachname: 'Гутнов', original_text: 'Карл Гутнов' })
const HAUPTNAME = name('n-2', {
  ist_bevorzugt: true,
  vatersname: 'Petrowitsch',
  sprache: 'de',
  // Wortgetreu (nicht die Montage der Teile) — muss jede Änderung überstehen.
  original_text: 'Carl Friedr. Gutnoff (lt. Taufbuch)',
})

function detail(ueberschreibung: Partial<PersonDetailAus> = {}): PersonDetailAus {
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
    namen: [NEBENFORM, HAUPTNAME],
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
    ...ueberschreibung,
  }
}

function eingabe(id: string): HTMLInputElement {
  const knoten = document.getElementById(id)
  if (!(knoten instanceof HTMLInputElement)) throw new Error(`Eingabe fehlt: ${id}`)
  return knoten
}

function auswahl(id: string): HTMLSelectElement {
  const knoten = document.getElementById(id)
  if (!(knoten instanceof HTMLSelectElement)) throw new Error(`Auswahl fehlt: ${id}`)
  return knoten
}

function eintippen(feld: HTMLInputElement, wert: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (setter === undefined) throw new Error('kein nativer value-Setter')
  setter.call(feld, wert)
  feld.dispatchEvent(new Event('input', { bubbles: true }))
}

function waehlen(feld: HTMLSelectElement, wert: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  if (setter === undefined) throw new Error('kein nativer value-Setter')
  setter.call(feld, wert)
  feld.dispatchEvent(new Event('change', { bubbles: true }))
}

function gruppe(wurzel: ParentNode, titel: string): HTMLElement | null {
  const ueberschrift = Array.from(wurzel.querySelectorAll('h2')).find((kandidat) => kandidat.textContent === titel)
  return ueberschrift?.closest('section') ?? null
}

function knopf(wurzel: ParentNode, text: string): HTMLButtonElement {
  const treffer = Array.from(wurzel.querySelectorAll('button')).find((kandidat) => kandidat.textContent === text)
  if (treffer === undefined) throw new Error(`Knopf nicht gefunden: ${text}`)
  return treffer
}

function aufrufeVon(hook: string): readonly unknown[] {
  return aufrufe.filter((aufruf) => aufruf.hook === hook).map((aufruf) => aufruf.ein)
}

const VORNAMEN = `${PRAEFIX}-hauptname-vornamen`
const NACHNAME = `${PRAEFIX}-hauptname-nachname`
const RUFNAME = `${PRAEFIX}-hauptname-rufname`
const KURZ = `${PRAEFIX}-feld-kurzbeschreibung`

describe('ReiterPerson — Gruppe „Hauptname" (AP-1.30 PR 9c)', () => {
  let container: HTMLDivElement
  let root: Root
  const aufReiterWechsel = vi.fn()

  beforeEach(() => {
    aufrufe.length = 0
    antworten.clear()
    fehlerVon.clear()
    aufReiterWechsel.mockClear()
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
    act(() => root.render(<ReiterPerson personId="p-1" daten={daten} idPraefix={PRAEFIX} aufSprung={() => undefined} aufReiterWechsel={aufReiterWechsel} />))
  }

  describe('Anzeige (E4, E6, E1)', () => {
    it('erste Gruppe; zeigt die bevorzugte Form, nicht namen[0]; kein Geburtsname-Feld', () => {
      zeigen(detail())
      const hauptname = gruppe(container, 'Hauptname')
      if (hauptname === null) throw new Error('Gruppe Hauptname fehlt')
      expect(container.querySelector('section')).toBe(hauptname)
      expect(eingabe(VORNAMEN).value).toBe('Karl Friedrich')
      expect(eingabe(NACHNAME).value).toBe('Gutnoff')
      expect(hauptname.textContent).not.toContain('Geburtsname')
      // Beschriftungen per <label> (WCAG): der Zugänglichkeitsname des Felds enthält sie.
      expect(eingabe(VORNAMEN).closest('label')?.textContent).toContain('Vorname(n)')
      expect(eingabe(NACHNAME).closest('label')?.textContent).toContain('Nachname')
      expect(eingabe(KURZ).closest('label')?.textContent).toContain('Kurzbeschreibung')
      expect(aufrufe).toHaveLength(0)
    })

    it('Rufname ist eine Auswahl aus den Vornamen + „nicht angegeben" (E1)', () => {
      zeigen(detail({ namen: [name('n-2', { ist_bevorzugt: true, rufname_text: 'Friedrich', rufname_index: 1 })] }))
      const rufname = auswahl(RUFNAME)
      expect(Array.from(rufname.options).map((option) => option.textContent)).toStrictEqual(['nicht angegeben', 'Karl', 'Friedrich'])
      expect(rufname.value).toBe('1')
    })

    it('Verweis „n weitere Namensformen · Reiter Namen" wechselt den Reiter (E6)', () => {
      zeigen(detail())
      const hauptname = gruppe(container, 'Hauptname')
      if (hauptname === null) throw new Error('Gruppe Hauptname fehlt')
      act(() => knopf(hauptname, '1 weitere Namensform · Reiter „Namen“').click())
      expect(aufReiterWechsel).toHaveBeenCalledWith('namen')

      zeigen(detail({ namen: [NEBENFORM, HAUPTNAME, name('n-3')] }))
      expect(knopf(hauptname, '2 weitere Namensformen · Reiter „Namen“')).toBeDefined()
      zeigen(detail({ namen: [HAUPTNAME] }))
      expect(knopf(hauptname, 'Namensformen · Reiter „Namen“')).toBeDefined()
      expect(aufrufe).toHaveLength(0)
    })

    it('Formen ohne bevorzugte (Altbestand): kein Eingabefeld, kein Anlegen, Hinweis auf den Reiter Namen', () => {
      zeigen(detail({ namen: [NEBENFORM, name('n-3')] }))
      expect(document.getElementById(VORNAMEN)).toBeNull()
      expect(gruppe(container, 'Hauptname')?.textContent).toContain('Keine Namensform ist als Hauptname markiert')
      // Die Kurzbeschreibung bleibt bearbeitbar.
      expect(eingabe(KURZ).value).toBe('')
    })
  })

  describe('Schreiben über die Namensbrücke (E3, Autosave)', () => {
    it('Vorname ändern: nach der Frist name.aendern an der bevorzugten Form, feld „vornamen", verdeckte Felder bleiben', () => {
      vi.useFakeTimers()
      zeigen(detail())
      act(() => eintippen(eingabe(VORNAMEN), 'Karl Fritz'))
      expect(aufrufe).toHaveLength(0)
      act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS))
      expect(aufrufeVon('useNameAendern')).toEqual([
        expect.objectContaining({
          id: 'n-2',
          feld: 'vornamen',
          vornamen: 'Karl Fritz',
          nachname: 'Gutnoff',
          vatersname: 'Petrowitsch',
          sprache: 'de',
          originalText: 'Carl Friedr. Gutnoff (lt. Taufbuch)',
        }),
      ])
      expect(aufrufe).toHaveLength(1)
    })

    it('Nachname ändern: feld „nachname"; Blur schreibt sofort und nicht doppelt', () => {
      vi.useFakeTimers()
      zeigen(detail())
      const nachname = eingabe(NACHNAME)
      act(() => nachname.focus())
      act(() => eintippen(nachname, 'Gutnow'))
      act(() => nachname.blur())
      expect(aufrufeVon('useNameAendern')).toEqual([expect.objectContaining({ id: 'n-2', feld: 'nachname', nachname: 'Gutnow' })])
      act(() => vi.runOnlyPendingTimers())
      expect(aufrufe).toHaveLength(1)
    })

    // AP-1.30 PR 11c-2 (A-02), Herkunft profil-namen-zeile-rufname-fehler.test.tsx (hueter #184 P2): auch der
    // Reiter Person schreibt über `name.aendern` und kann die Rufname-Verdopplung auslösen (Altform
    // „Hans Peter Hans Peter" mit vorn ergänztem „Karl"). Der Fehler steht mit Titel und Handlungsanweisung in
    // der aria-live-Metazeile der Gruppe (am ersten Feld, Vorname(n)), nicht nur als Speicherstatus.
    it('11c-2: VALIDIERUNG_RUFNAME_VERDOPPELT von name.aendern steht mit titel/was_tun am Feld, ohne Fehler nichts', () => {
      zeigen(detail())
      expect(eingabe(VORNAMEN).closest('label')?.querySelector('[aria-live="polite"]')?.textContent).toBe('')
      const code = 'VALIDIERUNG_RUFNAME_VERDOPPELT'
      fehlerVon.set('useNameAendern', { code, textSchluessel: `${code}.titel`, vorgangsId: 'v-1' })
      zeigen(detail())
      const titel = i18n.t(`fehler:${code}.titel`)
      const wasTun = i18n.t(`fehler:${code}.was_tun`)
      expect(titel).not.toContain(code)
      const meta = eingabe(VORNAMEN).closest('label')?.querySelector('[aria-live="polite"]')?.textContent ?? ''
      expect(meta).toContain(titel)
      expect(meta).toContain(wasTun)
    })

    // AP-1.30 PR 11c-2 (A-02), Herkunft profil-bearbeiten-namen-rerender.test.tsx (Bugfix AP-1.15 PR-A): die
    // Gruppe Hauptname hängt am selben Debounce-Hook wie die frühere flache Maske (Referenzvergleich, darum
    // `useMemo`). Ein Nachladen mit neuer, inhaltsgleicher Form löst keine Render-Schleife und kein Schreiben aus.
    it('11c-2: neue, inhaltsgleiche Namensform (Nachladen): keine Render-Schleife, kein Schreiben, Werte bleiben', () => {
      vi.useFakeTimers()
      zeigen(detail({ namen: [{ ...NEBENFORM }, { ...HAUPTNAME }] }))
      expect(() => zeigen(detail({ namen: [{ ...NEBENFORM }, { ...HAUPTNAME }] }))).not.toThrow()
      expect(() => zeigen(detail({ namen: [{ ...NEBENFORM }, { ...HAUPTNAME }] }))).not.toThrow()
      act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 3))
      expect(eingabe(VORNAMEN).value).toBe('Karl Friedrich')
      expect(eingabe(NACHNAME).value).toBe('Gutnoff')
      expect(aufrufe).toHaveLength(0)
    })

    it('Rufname wählen: sofort name.aendern mit feld „rufnameText"', () => {
      zeigen(detail())
      act(() => waehlen(auswahl(RUFNAME), '0'))
      expect(aufrufeVon('useNameAendern')[0]).toEqual(expect.objectContaining({ id: 'n-2', feld: 'rufnameText', rufnameText: 'Karl', rufnameIndex: 0 }))
    })

    it('E2: Vorname(n) und Nachname geleert — nichts geschrieben, beim Verlassen steht der gespeicherte Name wieder da', () => {
      vi.useFakeTimers()
      zeigen(detail())
      const vornamen = eingabe(VORNAMEN)
      const nachname = eingabe(NACHNAME)
      act(() => nachname.focus())
      act(() => eintippen(nachname, ''))
      act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS))
      // Nur der Nachname leer: das ist ein gültiger Name (nur Vornamen) und wird geschrieben.
      expect(aufrufeVon('useNameAendern')).toEqual([expect.objectContaining({ nachname: undefined, vornamen: 'Karl Friedrich' })])
      act(() => vornamen.focus())
      act(() => eintippen(vornamen, '  '))
      act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS))
      act(() => vornamen.blur())
      expect(aufrufe).toHaveLength(1)
      expect(eingabe(VORNAMEN).value).toBe('Karl Friedrich')
      expect(eingabe(NACHNAME).value).toBe('Gutnoff')
    })

    it('E10: tippen und sofort den Reiter verlassen (Aushängen) — der Entwurf wird geschrieben', () => {
      vi.useFakeTimers()
      zeigen(detail())
      act(() => eintippen(eingabe(VORNAMEN), 'Karl Friedrich Wilhelm'))
      expect(aufrufe).toHaveLength(0)
      act(() => root.unmount())
      expect(aufrufeVon('useNameAendern')).toEqual([expect.objectContaining({ id: 'n-2', vornamen: 'Karl Friedrich Wilhelm' })])
      // afterEach hängt erneut aus — eine frische Wurzel, damit das nicht scheitert.
      root = createRoot(container)
    })

    it('ohne Namen: erstes nicht-leeres Tippen legt per name.anlegen an, eine Folgeänderung ändert DIESE Form', async () => {
      vi.useFakeTimers()
      let anlegenAuf: (wert: { readonly id: string }) => void = () => undefined
      antworten.set('useNameAnlegen', () => new Promise((aufloesen) => (anlegenAuf = aufloesen)))
      zeigen(detail({ namen: [] }))
      expect(eingabe(VORNAMEN).value).toBe('')
      act(() => eintippen(eingabe(VORNAMEN), ' '))
      act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS))
      expect(aufrufe).toHaveLength(0)
      act(() => eintippen(eingabe(NACHNAME), 'Gutnoff'))
      act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS))
      expect(aufrufeVon('useNameAnlegen')).toEqual([expect.objectContaining({ personId: 'p-1', nachname: 'Gutnoff', vornamen: undefined })])
      act(() => eintippen(eingabe(VORNAMEN), 'Karl'))
      act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS))
      expect(aufrufeVon('useNameAnlegen')).toHaveLength(1)
      expect(aufrufeVon('useNameAendern')).toHaveLength(0)
      await act(async () => {
        anlegenAuf({ id: 'n-neu' })
        await Promise.resolve()
      })
      expect(aufrufeVon('useNameAnlegen')).toHaveLength(1)
      expect(aufrufeVon('useNameAendern')).toEqual([expect.objectContaining({ id: 'n-neu', vornamen: 'Karl', nachname: 'Gutnoff', feld: 'vornamen' })])
    })
  })

  describe('Kurzbeschreibung (E5, E9)', () => {
    it('kein Sicherheits- und kein Belegwähler', () => {
      zeigen(detail({ grunddaten: [kurzbeschreibungen(aussage('k-1'))] }))
      const angabe = eingabe(KURZ).closest('.wz-reiter-person__angabe')
      expect(angabe?.querySelector('[role="radiogroup"]')).toBeNull()
      expect(angabe?.querySelector('.wz-beleg-abzeichen')).toBeNull()
      expect(eingabe(KURZ).value).toBe('Schmied')
    })

    it('leeres Feld: erstes Tippen legt mit Vorgabe-Sicherheit an, dann aussage.aendern mit feld „wertText" an DIESER Aussage', async () => {
      vi.useFakeTimers()
      zeigen(detail())
      act(() => eintippen(eingabe(KURZ), 'Schmied'))
      act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS))
      expect(aufrufeVon('useAussageAnlegen')).toEqual([{ subjektTyp: 'person', subjektId: 'p-1', praedikat: 'kurzbeschreibung', wertText: 'Schmied', konfidenz: 2 }])
      await act(async () => {
        await Promise.resolve()
      })
      act(() => eintippen(eingabe(KURZ), 'Schmied in Marienwerder'))
      act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS))
      expect(aufrufeVon('useAussageAnlegen')).toHaveLength(1)
      expect(aufrufeVon('useAussageAendern')).toEqual([
        { id: 'neu-useAussageAnlegen', wertText: 'Schmied in Marienwerder', datumBeibehalten: true, konfidenz: 2, feld: 'wertText' },
      ])
    })

    it('mehrere Aussagen (Altbestand): die bevorzugte wird bearbeitet (E9)', () => {
      vi.useFakeTimers()
      zeigen(detail({ grunddaten: [kurzbeschreibungen(aussage('k-1'), aussage('k-2', { ist_bevorzugt: true, wert: 'Bauer', wert_text: 'Bauer' }))] }))
      expect(eingabe(KURZ).value).toBe('Bauer')
      act(() => eintippen(eingabe(KURZ), 'Bauer und Schmied'))
      act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS))
      expect(aufrufeVon('useAussageAendern')).toEqual([expect.objectContaining({ id: 'k-2', wertText: 'Bauer und Schmied', feld: 'wertText' })])
    })

    it('leer verlassen: aussage.loeschen als Einzelschritt; leer getippt wird zwischendurch nichts geschrieben', () => {
      vi.useFakeTimers()
      zeigen(detail({ grunddaten: [kurzbeschreibungen(aussage('k-1'))] }))
      const feld = eingabe(KURZ)
      act(() => feld.focus())
      act(() => eintippen(feld, ''))
      act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS))
      expect(aufrufe).toHaveLength(0)
      act(() => feld.blur())
      expect(aufrufe).toEqual([{ hook: 'useAussageLoeschen', ein: { id: 'k-1' } }])
    })

    it('eben angelegt und vor dem Nachladen leer verlassen: die angelegte Aussage wird gelöscht; neues Tippen legt neu an', async () => {
      vi.useFakeTimers()
      zeigen(detail())
      const feld = eingabe(KURZ)
      act(() => feld.focus())
      act(() => eintippen(feld, 'Schmied'))
      act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS))
      await act(async () => {
        await Promise.resolve()
      })
      act(() => eintippen(feld, ''))
      act(() => feld.blur())
      expect(aufrufeVon('useAussageLoeschen')).toEqual([{ id: 'neu-useAussageAnlegen' }])
      act(() => feld.focus())
      act(() => eintippen(feld, 'Bauer'))
      act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS))
      expect(aufrufeVon('useAussageAnlegen')).toHaveLength(2)
      expect(aufrufeVon('useAussageAendern')).toHaveLength(0)
    })

    it('hueter #170 H1: gelesene Aussage leer verlassen, vor dem Nachladen neu tippen — kein aussage.aendern auf die gelöschte, sondern anlegen', () => {
      vi.useFakeTimers()
      zeigen(detail({ grunddaten: [kurzbeschreibungen(aussage('k-1'))] }))
      const feld = eingabe(KURZ)
      act(() => feld.focus())
      act(() => eintippen(feld, ''))
      act(() => feld.blur())
      expect(aufrufeVon('useAussageLoeschen')).toEqual([{ id: 'k-1' }])
      // Das Lesemodell liefert k-1 noch (Nachladen steht aus).
      act(() => feld.focus())
      act(() => eintippen(feld, 'Bauer'))
      act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS))
      expect(aufrufeVon('useAussageAendern')).toHaveLength(0)
      expect(aufrufeVon('useAussageAnlegen')).toEqual([{ subjektTyp: 'person', subjektId: 'p-1', praedikat: 'kurzbeschreibung', wertText: 'Bauer', konfidenz: 2 }])
    })

    it('hueter #170 H2: leer verlassen, während das Anlegen noch läuft — nach dem Anlegen wird die angelegte Aussage gelöscht', async () => {
      vi.useFakeTimers()
      let anlegenAuf: (wert: { readonly id: string }) => void = () => undefined
      antworten.set('useAussageAnlegen', () => new Promise((aufloesen) => (anlegenAuf = aufloesen)))
      zeigen(detail())
      const feld = eingabe(KURZ)
      act(() => feld.focus())
      act(() => eintippen(feld, 'Schmied'))
      act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS))
      expect(aufrufeVon('useAussageAnlegen')).toHaveLength(1)
      act(() => eintippen(feld, ''))
      act(() => feld.blur())
      expect(aufrufeVon('useAussageLoeschen')).toHaveLength(0)
      await act(async () => {
        anlegenAuf({ id: 'k-neu' })
        await Promise.resolve()
      })
      expect(aufrufeVon('useAussageLoeschen')).toEqual([{ id: 'k-neu' }])
      expect(aufrufeVon('useAussageAendern')).toHaveLength(0)
    })

    // hueter #170 H3 (docs/80 §33 U-130-9c-undo-vor-nachladen): kommt ein Undo des Löschens, BEVOR das
    // Lesemodell die Löschung gezeigt hat, bleibt die Aussage als gelöscht gesperrt — das nächste Tippen
    // legt eine ZWEITE Kurzbeschreibung an statt die zurückgeholte zu ändern. `it.fails` hält die Lücke
    // fest: wird sie behoben, wird dieser Test rot und ist in einen normalen Test umzuwandeln.
    it.fails('H3 (offen): Undo vor dem Nachladen — Folgetippen ändert die zurückgeholte Aussage', () => {
      vi.useFakeTimers()
      zeigen(detail({ grunddaten: [kurzbeschreibungen(aussage('k-1'))] }))
      const feld = eingabe(KURZ)
      act(() => feld.focus())
      act(() => eintippen(feld, ''))
      act(() => feld.blur())
      // Undo: der nächste gelesene Stand zeigt k-1 wieder (gleicher Inhalt, frisches Objekt).
      zeigen(detail({ grunddaten: [kurzbeschreibungen(aussage('k-1'))] }))
      act(() => feld.focus())
      act(() => eintippen(feld, 'Bauer'))
      act(() => vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS))
      expect(aufrufeVon('useAussageAnlegen')).toHaveLength(0)
      expect(aufrufeVon('useAussageAendern')).toEqual([expect.objectContaining({ id: 'k-1', wertText: 'Bauer' })])
    })

    it('eine gespeicherte, leere Altbestands-Aussage wird durch bloßes Fokussieren nicht gelöscht', () => {
      zeigen(detail({ grunddaten: [kurzbeschreibungen(aussage('k-1', { wert: null, wert_text: null }))] }))
      const feld = eingabe(KURZ)
      act(() => feld.focus())
      act(() => feld.blur())
      expect(aufrufe).toHaveLength(0)
    })
  })
})
