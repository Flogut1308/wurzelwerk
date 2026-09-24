// AP-1.14a (S-20, erste echte Schreibmaske): `profil-bearbeiten-logik.ts` (reine Umrechnungen für
// Geschlecht/Notiz/Platzhalter-Kennzeichen+Grund) UND `GrunddatenBearbeitenAbschnitt`
// (`renderToStaticMarkup`, wie `profil-bearbeiten-namen.test.tsx`). `usePersonFeldSetzen` hängt an
// `@tanstack/react-query` und wird darum gemockt (Auftrag AP-1.14a: „Befehl-Hooks mocken").
//
// Lebensdaten (Geburts-/Todesdatum mit Konfidenz+Beleg) sind bewusst NICHT Teil von AP-1.14a —
// offene Datenmodellfrage zwischen `aussage.anlegen` (kollidiert mit dem import-reservierten
// Ableitungspfad, ADR-026) und `ereignis.anlegen` (greift AP-1.15 vor), s.
// `docs/80_Offene_Fragen.md` §26. Der `test.todo` unten hält diese Lücke sichtbar, statt sie
// stillschweigend auszulassen (CLAUDE.md §5 „additive Tests").
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import '../../src/renderer/i18n/einrichten'

const feldSetzenMutate = vi.fn()

vi.mock('../../src/renderer/brücke/befehl-hooks', () => ({
  usePersonFeldSetzen: () => ({ mutate: feldSetzenMutate }),
}))

import { GrunddatenBearbeitenAbschnitt } from '../../src/renderer/ansichten/profil/profil-bearbeiten-grunddaten'
import {
  boolZuKontrollkaestchenZustand,
  kontrollkaestchenZustandZuBool,
  personFeldGeschlechtEin,
  personFeldIstPlatzhalterEin,
  personFeldNotizEin,
  personFeldPlatzhalterGrundEin,
} from '../../src/renderer/ansichten/profil/profil-bearbeiten-logik'
import type { PersonDetailKopf } from '../../src/shared/schemata/person-detail'

function kopf(ueberschreibung: Partial<PersonDetailKopf> = {}): PersonDetailKopf {
  return {
    person_id: 'person-1',
    anzeigename: 'August Wruck',
    konfidenz_min: null,
    ist_platzhalter: false,
    privat: false,
    geschlecht: null,
    platzhalter_grund: null,
    kennung: null,
    lebend_status: null,
    ...ueberschreibung,
  }
}

describe('profil-bearbeiten-logik: Grunddaten (AP-1.14a)', () => {
  it('personFeldGeschlechtEin: diskriminierte Union mit feld "geschlecht"', () => {
    expect(personFeldGeschlechtEin('person-1', 'F')).toEqual({ id: 'person-1', feld: 'geschlecht', wert: 'F' })
  })

  it('personFeldNotizEin: diskriminierte Union mit feld "notiz"', () => {
    expect(personFeldNotizEin('person-1', 'Text')).toEqual({ id: 'person-1', feld: 'notiz', wert: 'Text' })
  })

  it('personFeldIstPlatzhalterEin: boolean -> 0|1', () => {
    expect(personFeldIstPlatzhalterEin('person-1', true)).toEqual({ id: 'person-1', feld: 'ist_platzhalter', wert: 1 })
    expect(personFeldIstPlatzhalterEin('person-1', false)).toEqual({ id: 'person-1', feld: 'ist_platzhalter', wert: 0 })
  })

  it('personFeldPlatzhalterGrundEin: diskriminierte Union mit feld "platzhalter_grund"', () => {
    expect(personFeldPlatzhalterGrundEin('person-1', 'unehelich')).toEqual({ id: 'person-1', feld: 'platzhalter_grund', wert: 'unehelich' })
  })

  it('boolZuKontrollkaestchenZustand/kontrollkaestchenZustandZuBool: Rundreise', () => {
    expect(boolZuKontrollkaestchenZustand(true)).toBe('ein')
    expect(boolZuKontrollkaestchenZustand(false)).toBe('aus')
    expect(kontrollkaestchenZustandZuBool('ein')).toBe(true)
    expect(kontrollkaestchenZustandZuBool('aus')).toBe(false)
  })
})

describe('GrunddatenBearbeitenAbschnitt (AP-1.14a, S-20 Kernfelder)', () => {
  it('zeigt Geschlecht-Auswahl und Notiz, OHNE Platzhalter-Grund, wenn das Kennzeichen NICHT gesetzt ist', () => {
    const markup = renderToStaticMarkup(<GrunddatenBearbeitenAbschnitt personId="person-1" kopf={kopf()} notiz="Eine Notiz" />)
    expect(markup).toContain('Geschlecht')
    expect(markup).toContain('Eine Notiz')
    // "Nicht identifiziert" ist NUR eine Platzhalter-Grund-Option — eindeutiger als "Grund"
    // (steckt bereits in "Grunddaten", der Abschnittsüberschrift).
    expect(markup).not.toContain('Nicht identifiziert')
  })

  it('zeigt den Platzhalter-Grund NUR, wenn ist_platzhalter gesetzt ist', () => {
    const markup = renderToStaticMarkup(
      <GrunddatenBearbeitenAbschnitt personId="person-1" kopf={kopf({ ist_platzhalter: true, platzhalter_grund: 'unbekannt' })} notiz={null} />,
    )
    expect(markup).toContain('Grund')
    expect(markup).toContain('Unbekannt')
  })

  it('das Platzhalter-Kennzeichen ist ein Kontrollkästchen (Trefferfläche/Zustand aus der Zustandsbibliothek, kein selbstgebautes Steuerelement)', () => {
    const markup = renderToStaticMarkup(<GrunddatenBearbeitenAbschnitt personId="person-1" kopf={kopf({ ist_platzhalter: true })} notiz={null} />)
    expect(markup).toContain('wz-kontrollkaestchen')
    expect(markup).toContain('role="checkbox"')
    expect(markup).toContain('aria-checked="true"')
  })

  it('ohne ist_platzhalter: Kontrollkästchen zeigt aria-checked="false"', () => {
    const markup = renderToStaticMarkup(<GrunddatenBearbeitenAbschnitt personId="person-1" kopf={kopf({ ist_platzhalter: false })} notiz={null} />)
    expect(markup).toContain('aria-checked="false"')
  })

  it('kein Farbliteral im Markup (Token-Vertrag, CLAUDE.md §14)', () => {
    const markup = renderToStaticMarkup(
      <GrunddatenBearbeitenAbschnitt personId="person-1" kopf={kopf({ ist_platzhalter: true, platzhalter_grund: 'unbekannt' })} notiz="x" />,
    )
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(markup).not.toMatch(/rgb\(/)
  })

  // CLAUDE.md §5 „additive Tests": AP-1.14b baut Lebensdaten (Konfidenz+Beleg) NACH, dieser
  // Platzhalter macht die bewusst offene Lücke sichtbar statt sie stillschweigend auszulassen.
  it.todo('Lebensdaten (Geburts-/Todesdatum mit Konfidenz+Beleg) — AP-1.14b, s. docs/80_Offene_Fragen.md §26')
})
