// AP-1.14a (S-20): die flache Namensbrücke in `profil-bearbeiten-logik.ts` (reine Umrechnungen, wie
// `filterleiste-logik.ts`/`ortsfeld-logik.ts`). Sie schreibt heute den Hauptnamen im Reiter Person
// (`reiter-person-hauptname.tsx`, `reiter-person-logik.ts`). Bis AP-1.30 PR 11c-2 stand hier auch der
// Komponententest der flachen Maske `NamenBearbeitenAbschnitt`; die Maske ist gelöscht, ihre
// Zusicherungen stehen an Karten und Modal (`reiter-namen.test.tsx`, `namensform-modal.test.tsx`;
// Inventar docs/80 §33 V-130-11c-2).
import { describe, expect, it } from 'vitest'
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
    ist_bevorzugt: true,
    typ: 'geburtsname',
    schrift: null,
    vornamen: 'August',
    nachname: 'Wruck',
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
    original_text: 'August Wruck',
    rolle: 'geburtsname',
    rollen_notiz: null,
    reihenfolge: null,
    konfidenz: null,
    sortier_index: null,
    teile: [],
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
      // AP-1.30 PR 3: der Vatersname wird mitgetragen (null -> '').
      vatersname: '',
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
