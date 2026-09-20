// AP-1.13 PR-B (docs/71_Designsystem.md §3.3, docs/arbeitspakete.md AP-1.13): `Personenwaehler` —
// vollständig kontrolliertes Molekül (kein `useState`, wie jeder Baustein hier). `renderToStaticMarkup`
// (react-dom/server, wie `vorschlagskarte.test.tsx`/`symbol.test.tsx`) statt einer DOM-Testbibliothek
// — vitest läuft mit `environment: 'node'` (vitest.config.ts), s. dortiger Begründungskommentar.
// Tastaturnavigation und die `befehl:person.anlegen`-Nutzlast sind reine Funktionen in
// `personenwaehler-logik.ts` und werden dort direkt geprüft (kein Klick-/Tastenereignis nötig).
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Personenwaehler } from '../../src/renderer/bausteine/personenwaehler'
import {
  personenwaehlerNaechsterIndex,
  personenwaehlerNeuAnlegenEin,
  personenwaehlerPlatzhalterAnlegenEin,
  personenwaehlerZeileAktivieren,
  personenwaehlerZeilenAufbauen,
  type PersonenwaehlerZeile,
} from '../../src/renderer/bausteine/personenwaehler-logik'
import type { SucheTreffer } from '../../src/shared/schemata/person-liste'

function treffer(ueberschreibung: Partial<SucheTreffer> = {}): SucheTreffer {
  return {
    person_id: 'p-1',
    anzeigename: 'Anna Beispiel',
    geburt_jahr: 1890,
    tod_jahr: 1961,
    geburt_ort_name: 'Marienwerder',
    konfidenz_min: 3,
    hat_widerspruch: false,
    ist_platzhalter: false,
    beruf: null,
    belegzahl: 2,
    kinderzahl: 0,
    geburt_datum: null,
    tod_datum: null,
    quelle: 'volltext',
    ...ueberschreibung,
  }
}

describe('personenwaehler-logik (docs/71 §3.3, AP-1.13 PR-B)', () => {
  it('personenwaehlerZeilenAufbauen: Treffer zuerst, dann IMMER "neu anlegen" vor "Platzhalter anlegen" — auch ohne Treffer', () => {
    const ohneTreffer = personenwaehlerZeilenAufbauen([])
    expect(ohneTreffer).toEqual([{ art: 'neuAnlegen' }, { art: 'platzhalterAnlegen' }])

    const einTreffer = treffer()
    const mitTreffer = personenwaehlerZeilenAufbauen([einTreffer])
    expect(mitTreffer).toEqual([{ art: 'treffer', treffer: einTreffer }, { art: 'neuAnlegen' }, { art: 'platzhalterAnlegen' }])
  })

  it('personenwaehlerNaechsterIndex: "runter" läuft nach dem letzten Eintrag zum ersten um', () => {
    expect(personenwaehlerNaechsterIndex(null, 'runter', 3)).toBe(0)
    expect(personenwaehlerNaechsterIndex(0, 'runter', 3)).toBe(1)
    expect(personenwaehlerNaechsterIndex(2, 'runter', 3)).toBe(0)
  })

  it('personenwaehlerNaechsterIndex: "hoch" läuft vor dem ersten Eintrag zum letzten um', () => {
    expect(personenwaehlerNaechsterIndex(null, 'hoch', 3)).toBe(2)
    expect(personenwaehlerNaechsterIndex(0, 'hoch', 3)).toBe(2)
    expect(personenwaehlerNaechsterIndex(2, 'hoch', 3)).toBe(1)
  })

  it('personenwaehlerNaechsterIndex: ohne Zeilen (anzahl 0) bleibt "null"', () => {
    expect(personenwaehlerNaechsterIndex(null, 'runter', 0)).toBeNull()
  })

  it('personenwaehlerZeileAktivieren("treffer"): ruft NUR aufAusgewaehlt mit der person_id', () => {
    const aufAusgewaehlt = vi.fn()
    const aufNeuAnlegen = vi.fn()
    const aufPlatzhalterAnlegen = vi.fn()
    const zeile: PersonenwaehlerZeile = { art: 'treffer', treffer: treffer({ person_id: 'p-7' }) }
    personenwaehlerZeileAktivieren(zeile, { aufAusgewaehlt, aufNeuAnlegen, aufPlatzhalterAnlegen })
    expect(aufAusgewaehlt).toHaveBeenCalledExactlyOnceWith('p-7')
    expect(aufNeuAnlegen).not.toHaveBeenCalled()
    expect(aufPlatzhalterAnlegen).not.toHaveBeenCalled()
  })

  it('personenwaehlerZeileAktivieren("neuAnlegen"): ruft NUR aufNeuAnlegen', () => {
    const aufAusgewaehlt = vi.fn()
    const aufNeuAnlegen = vi.fn()
    const aufPlatzhalterAnlegen = vi.fn()
    personenwaehlerZeileAktivieren({ art: 'neuAnlegen' }, { aufAusgewaehlt, aufNeuAnlegen, aufPlatzhalterAnlegen })
    expect(aufNeuAnlegen).toHaveBeenCalledOnce()
    expect(aufAusgewaehlt).not.toHaveBeenCalled()
    expect(aufPlatzhalterAnlegen).not.toHaveBeenCalled()
  })

  it('personenwaehlerZeileAktivieren("platzhalterAnlegen"): ruft NUR aufPlatzhalterAnlegen', () => {
    const aufAusgewaehlt = vi.fn()
    const aufNeuAnlegen = vi.fn()
    const aufPlatzhalterAnlegen = vi.fn()
    personenwaehlerZeileAktivieren({ art: 'platzhalterAnlegen' }, { aufAusgewaehlt, aufNeuAnlegen, aufPlatzhalterAnlegen })
    expect(aufPlatzhalterAnlegen).toHaveBeenCalledOnce()
    expect(aufAusgewaehlt).not.toHaveBeenCalled()
    expect(aufNeuAnlegen).not.toHaveBeenCalled()
  })

  it('personenwaehlerNeuAnlegenEin(): person.anlegen OHNE ist_platzhalter (0), kein platzhalter_grund', () => {
    const ein = personenwaehlerNeuAnlegenEin()
    expect(ein.ist_platzhalter).toBe(0)
    expect(ein.platzhalter_grund).toBeUndefined()
  })

  it('personenwaehlerPlatzhalterAnlegenEin(): person.anlegen MIT ist_platzhalter:1 + platzhalter_grund (A-17)', () => {
    const ein = personenwaehlerPlatzhalterAnlegenEin()
    expect(ein.ist_platzhalter).toBe(1)
    expect(ein.platzhalter_grund).toBe('nicht_identifiziert')
  })

  it('"Platzhalter anlegen" ruft in Kombination mit personenwaehlerZeileAktivieren tatsächlich befehl:person.anlegen-taugliche Nutzlast auf', () => {
    // Simuliert die Verdrahtung eines Aufrufers: `aufPlatzhalterAnlegen` ruft
    // `usePersonAnlegen().mutate(personenwaehlerPlatzhalterAnlegenEin())` (befehl-hooks.ts) — hier
    // durch einen Spion ersetzt, der die tatsächliche `befehl:person.anlegen`-Nutzlast entgegennimmt.
    const mutate = vi.fn()
    const aufPlatzhalterAnlegen = () => mutate(personenwaehlerPlatzhalterAnlegenEin())
    personenwaehlerZeileAktivieren({ art: 'platzhalterAnlegen' }, { aufAusgewaehlt: vi.fn(), aufNeuAnlegen: vi.fn(), aufPlatzhalterAnlegen })
    expect(mutate).toHaveBeenCalledExactlyOnceWith({ privat: 0, ist_platzhalter: 1, platzhalter_grund: 'nicht_identifiziert' })
  })
})

describe('Personenwaehler (docs/71 §3.3, AP-1.13 PR-B)', () => {
  const OHNE_AKTION = { aufAenderung: () => {}, aufAusgewaehlt: () => {}, aufNeuAnlegen: () => {}, aufPlatzhalterAnlegen: () => {} }

  it('zustand "leer": zeigt kein Listbox (noch nicht gesucht)', () => {
    const markup = renderToStaticMarkup(<Personenwaehler text="" zustand="leer" treffer={[]} hervorgehobenerIndex={null} {...OHNE_AKTION} />)
    expect(markup).not.toContain('role="listbox"')
  })

  it('zustand "laedt": zeigt ein Listbox, aber KEINE Treffer-/Schlusszeilen als role="option"', () => {
    const markup = renderToStaticMarkup(<Personenwaehler text="Wr" zustand="laedt" treffer={[]} hervorgehobenerIndex={null} {...OHNE_AKTION} />)
    expect(markup).toContain('role="listbox"')
    expect(markup).not.toContain('role="option"')
  })

  it('zustand "bereit" mit Treffern: zeigt je Treffer Name, Lebensdaten-Jahre, Geburtsort UND Konfidenz, PLUS zwei feste Schlusszeilen', () => {
    const einTreffer = treffer({ person_id: 'p-42', anzeigename: 'Anna Beispiel', geburt_jahr: 1890, tod_jahr: 1961, geburt_ort_name: 'Marienwerder', konfidenz_min: 3 })
    const markup = renderToStaticMarkup(
      <Personenwaehler text="Anna" zustand="bereit" treffer={[einTreffer]} hervorgehobenerIndex={null} {...OHNE_AKTION} />,
    )
    expect(markup).toContain('Anna Beispiel')
    expect(markup).toContain('1890')
    expect(markup).toContain('1961')
    expect(markup).toContain('Marienwerder')
    expect(markup).toContain('wz-konfidenzpunkt--3')
    // Treffer + "neu anlegen" + "Platzhalter anlegen" = 3 role="option"
    expect((markup.match(/role="option"/g) ?? []).length).toBe(3)
  })

  it('zustand "bereit" ohne Treffer (kein Treffer): zeigt trotzdem die zwei festen Schlusszeilen', () => {
    const markup = renderToStaticMarkup(<Personenwaehler text="Xyz" zustand="bereit" treffer={[]} hervorgehobenerIndex={null} {...OHNE_AKTION} />)
    expect((markup.match(/role="option"/g) ?? []).length).toBe(2)
  })

  it('"Platzhalter anlegen" ist immer die letzte, "neu anlegen" die vorletzte Zeile', () => {
    const markup = renderToStaticMarkup(<Personenwaehler text="Xyz" zustand="bereit" treffer={[]} hervorgehobenerIndex={null} {...OHNE_AKTION} />)
    const neuIndex = markup.indexOf('wz-personenwaehler__zeile--neuAnlegen')
    const platzhalterIndex = markup.indexOf('wz-personenwaehler__zeile--platzhalterAnlegen')
    expect(neuIndex).toBeGreaterThan(-1)
    expect(platzhalterIndex).toBeGreaterThan(neuIndex)
  })

  it('hervorgehobenerIndex markiert GENAU eine Zeile als aria-selected="true"', () => {
    const zwei = [treffer({ person_id: 'p-1' }), treffer({ person_id: 'p-2' })]
    const markup = renderToStaticMarkup(<Personenwaehler text="a" zustand="bereit" treffer={zwei} hervorgehobenerIndex={1} {...OHNE_AKTION} />)
    expect((markup.match(/aria-selected="true"/g) ?? []).length).toBe(1)
  })

  it('ohne hervorgehobenerIndex (null) ist keine Zeile aria-selected="true"', () => {
    const zwei = [treffer({ person_id: 'p-1' }), treffer({ person_id: 'p-2' })]
    const markup = renderToStaticMarkup(<Personenwaehler text="a" zustand="bereit" treffer={zwei} hervorgehobenerIndex={null} {...OHNE_AKTION} />)
    expect(markup).not.toContain('aria-selected="true"')
  })

  it('gesperrt sperrt das Eingabefeld', () => {
    const markup = renderToStaticMarkup(<Personenwaehler text="" zustand="leer" treffer={[]} hervorgehobenerIndex={null} {...OHNE_AKTION} gesperrt />)
    expect(markup).toContain('disabled=""')
  })

  it('Platzhalterpersonen unter den Treffern zeigen NIE anzeigename (A-17)', () => {
    const platzhalter = treffer({ person_id: 'p-9', anzeigename: 'GEHEIM', ist_platzhalter: true })
    const markup = renderToStaticMarkup(<Personenwaehler text="a" zustand="bereit" treffer={[platzhalter]} hervorgehobenerIndex={null} {...OHNE_AKTION} />)
    expect(markup).not.toContain('GEHEIM')
  })
})
