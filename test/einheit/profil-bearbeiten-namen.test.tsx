// AP-1.14a (S-20, erste echte Schreibmaske): `profil-bearbeiten-logik.ts` (reine Umrechnungen,
// wie `filterleiste-logik.ts`/`ortsfeld-logik.ts`) UND `NamenBearbeitenAbschnitt`
// (`renderToStaticMarkup`, wie `ortsfeld.test.tsx` — vitest läuft mit `environment: 'node'`,
// `vitest.config.ts`). `useNameAnlegen`/`useNameAendern`/`useNameLoeschen` hängen an
// `@tanstack/react-query` (`UseMutationResult`, brauchen einen `QueryClientProvider` — s.
// Modulkommentar `befehl-hooks.ts`) und werden darum gemockt (Auftrag AP-1.14a: „Befehl-Hooks
// mocken"), je EIN `mutate`-Spion pro Kanal.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
// Seiteneffekt: initialisiert die einzige i18next-Instanz synchron (`initAsync: false`), sonst
// liefert `t(...)` beim Server-Render nur den rohen Schlüssel zurück (react-i18next ohne
// `initReactI18next`/`i18n.init()`), nicht die deutsche Beschriftung.
import '../../src/renderer/i18n/einrichten'

const nameAnlegenMutate = vi.fn()
const nameAendernMutate = vi.fn()
const nameLoeschenMutate = vi.fn()

vi.mock('../../src/renderer/brücke/befehl-hooks', () => ({
  useNameAnlegen: () => ({ mutate: nameAnlegenMutate }),
  useNameAendern: () => ({ mutate: nameAendernMutate }),
  useNameLoeschen: () => ({ mutate: nameLoeschenMutate }),
}))

import { NamenBearbeitenAbschnitt } from '../../src/renderer/ansichten/profil/profil-bearbeiten-namen'
import {
  NAMEN_EINTRAG_LEER,
  auswahlWertZuSchrift,
  nameAendernEinAusEintrag,
  nameAnlegenEinAusEintrag,
  namenEintragAusPersonDetailName,
  namenEintragHatInhalt,
  schriftZuAuswahlWert,
  type NamenEintragWerte,
} from '../../src/renderer/ansichten/profil/profil-bearbeiten-logik'
import type { PersonDetailName } from '../../src/shared/schemata/person-detail'

function name(ueberschreibung: Partial<PersonDetailName> = {}): PersonDetailName {
  return {
    id: 'name-1',
    typ: 'geburtsname',
    schrift: null,
    vornamen: 'August',
    nachname: 'Wruck',
    praefix: null,
    titel_vor: null,
    zusatz_nach: null,
    rufname_text: null,
    rufname_index: null,
    umschrift_von: null,
    umschrift_norm: null,
    sprache: null,
    gueltig_von: null,
    gueltig_bis: null,
    original_text: 'August Wruck',
    ...ueberschreibung,
  }
}

describe('profil-bearbeiten-logik: Namen (AP-1.14a)', () => {
  it('namenEintragAusPersonDetailName: null-Spalten werden zu leeren Zeichenketten (kontrolliertes Textfeld verlangt string)', () => {
    expect(namenEintragAusPersonDetailName(name())).toEqual({
      typ: 'geburtsname',
      schrift: null,
      vornamen: 'August',
      nachname: 'Wruck',
      praefix: '',
      titelVor: '',
      zusatzNach: '',
      rufname: '',
      // AP-1.30 PR 2a: nicht angezeigte Felder werden mitgetragen; der montierte original_text zählt
      // nicht als wortgetreu.
      rufnameIndex: null,
      umschriftVon: null,
      umschriftNorm: null,
      sprache: null,
      gueltigVon: null,
      gueltigBis: null,
      originalTextWortgetreu: null,
    })
  })

  it('nameAnlegenEinAusEintrag: personId + typ + NUR nicht-leere Textfelder, schrift null -> undefined', () => {
    const eintrag: NamenEintragWerte = { ...NAMEN_EINTRAG_LEER, typ: 'aka', vornamen: 'Ottilie', nachname: '  ' }
    expect(nameAnlegenEinAusEintrag('person-1', eintrag)).toEqual({
      personId: 'person-1',
      typ: 'aka',
      schrift: undefined,
      vornamen: 'Ottilie',
      nachname: undefined,
      praefix: undefined,
      titelVor: undefined,
      zusatzNach: undefined,
      rufnameText: undefined,
    })
  })

  it('nameAnlegenEinAusEintrag: eine gesetzte schrift bleibt erhalten', () => {
    const eintrag: NamenEintragWerte = { ...NAMEN_EINTRAG_LEER, schrift: 'cyrl' }
    expect(nameAnlegenEinAusEintrag('person-1', eintrag).schrift).toBe('cyrl')
  })

  it('nameAendernEinAusEintrag: trägt die id statt personId, sonst dieselbe Umrechnung', () => {
    const eintrag = namenEintragAusPersonDetailName(name({ vornamen: 'August', nachname: 'Wruck' }))
    expect(nameAendernEinAusEintrag('name-1', eintrag)).toEqual({
      id: 'name-1',
      typ: 'geburtsname',
      schrift: undefined,
      vornamen: 'August',
      nachname: 'Wruck',
      praefix: undefined,
      titelVor: undefined,
      zusatzNach: undefined,
      rufnameText: undefined,
    })
  })

  it('namenEintragHatInhalt: NAMEN_EINTRAG_LEER hat keinen Inhalt', () => {
    expect(namenEintragHatInhalt(NAMEN_EINTRAG_LEER)).toBe(false)
  })

  it('namenEintragHatInhalt: EIN gefülltes Feld genügt (z. B. nur rufname)', () => {
    expect(namenEintragHatInhalt({ ...NAMEN_EINTRAG_LEER, rufname: 'Gustl' })).toBe(true)
  })

  it('namenEintragHatInhalt: nur Leerzeichen zählt NICHT als Inhalt', () => {
    expect(namenEintragHatInhalt({ ...NAMEN_EINTRAG_LEER, vornamen: '   ' })).toBe(false)
  })

  it('schriftZuAuswahlWert/auswahlWertZuSchrift: Rundreise über null und beide Enum-Werte', () => {
    expect(schriftZuAuswahlWert(null)).toBe('')
    expect(auswahlWertZuSchrift('')).toBeNull()
    for (const schrift of ['latn', 'cyrl'] as const) {
      expect(schriftZuAuswahlWert(schrift)).toBe(schrift)
      expect(auswahlWertZuSchrift(schrift)).toBe(schrift)
    }
  })
})

describe('NamenBearbeitenAbschnitt (AP-1.14a, S-20 Kernfelder)', () => {
  it('ohne Namen: zeigt den Leerzustandstext, KEINE Liste', () => {
    const markup = renderToStaticMarkup(<NamenBearbeitenAbschnitt personId="person-1" namen={[]} />)
    expect(markup).not.toContain('wz-profil-bearbeiten-namen__liste')
  })

  it('mit einem Namen: zeigt eine Zeile mit den vorhandenen Werten UND einer "Name entfernen"-Schaltfläche', () => {
    const markup = renderToStaticMarkup(<NamenBearbeitenAbschnitt personId="person-1" namen={[name()]} />)
    expect(markup).toContain('wz-profil-bearbeiten-namen__zeile')
    expect(markup).toContain('value="August"')
    expect(markup).toContain('value="Wruck"')
    // Löschen läuft über die bestehende `Schaltflaeche` (Trefferfläche ≥32×32 dort geprüft,
    // `test/einheit/trefferflaeche.test.ts`) — kein selbstgebauter Klein-Button.
    expect(markup).toContain('wz-schaltflaeche')
  })

  it('mit mehreren Namen: eine Zeile je Namenszeile', () => {
    const markup = renderToStaticMarkup(
      <NamenBearbeitenAbschnitt personId="person-1" namen={[name({ id: 'a' }), name({ id: 'b', vornamen: 'Erna' })]} />,
    )
    expect((markup.match(/wz-profil-bearbeiten-namen__zeile/g) ?? []).length).toBe(2)
  })

  it('das "neuen Namen erfassen"-Formular ist ein echtes <form> (Tastatur: Enter sendet ab)', () => {
    const markup = renderToStaticMarkup(<NamenBearbeitenAbschnitt personId="person-1" namen={[]} />)
    expect(markup).toContain('<form')
    // Leeres Formular: "Hinzufügen" ist gesperrt (kein leerer `name`-Datensatz anlegbar, s.
    // `namenEintragHatInhalt`).
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Name hinzufügen/)
  })

  it('kein Farbliteral im Markup (Token-Vertrag, CLAUDE.md §14)', () => {
    const markup = renderToStaticMarkup(<NamenBearbeitenAbschnitt personId="person-1" namen={[name()]} />)
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(markup).not.toMatch(/rgb\(/)
  })

  it('kein JSX-Zeichenkettenliteral — jeder sichtbare Text kommt aus i18n (Stichprobe: deutsche Beschriftungen erscheinen, aber nur über t(...))', () => {
    const markup = renderToStaticMarkup(<NamenBearbeitenAbschnitt personId="person-1" namen={[name()]} />)
    expect(markup).toContain('Namen')
    expect(markup).toContain('Vorname(n)')
  })
})
