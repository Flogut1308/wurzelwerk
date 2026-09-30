// AP-1.30 PR 9c (Reiter „Person", Gruppe „Hauptname"; docs/80 §33 V-130-9c E1/E2/E4/E5/E9): reine
// Logik — welche Form der Hauptname ist, wann nicht geschrieben wird, wie der erste Name angelegt
// wird und welche Kurzbeschreibung bearbeitet wird. Rot zuerst (CLAUDE.md §5): vor PR 9c gibt es
// diese Funktionen nicht.
import { describe, expect, it } from 'vitest'
import { aussageWertVerletzung, istDatumsPraedikat } from '../../src/core/person/datums-wert'
import { KURZBESCHREIBUNG_PRAEDIKAT } from '../../src/core/person/praedikate'
import type { PersonDetailAussage, PersonDetailGrunddatenFeld, PersonDetailName } from '../../src/shared/schemata/person-detail'
import {
  NAMEN_EINTRAG_LEER,
  mitRufnameAusAuswahl,
  nameAendernEinAusEintrag,
  namenEintragAusPersonDetailName,
} from '../../src/renderer/ansichten/profil/profil-bearbeiten-logik'
import { PRAEDIKAT_SCHLUESSEL } from '../../src/renderer/ansichten/profil/profil-schluessel'
import {
  aussageAnlegenEinFuer,
  hauptnameAnlegenEin,
  hauptnameHatSichtbarenInhalt,
  hauptnameZustand,
  kurzbeschreibungAenderung,
  kurzbeschreibungAussage,
  kurzbeschreibungText,
} from '../../src/renderer/ansichten/profil/reiter-person-logik'

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

function feld(praedikat: string, aussagen: readonly PersonDetailAussage[]): PersonDetailGrunddatenFeld {
  const erste = aussagen[0]
  return { praedikat, wert: erste?.wert ?? null, konfidenz: erste?.konfidenz ?? null, belegzahl: 0, hat_widerspruch: false, hatKonkurrierende: false, aussagen }
}

describe('hauptnameZustand (E4)', () => {
  it('Hauptname ist die bevorzugte Form, nicht namen[0]; die übrigen zählen als weitere', () => {
    const zweite = name('n-2', { ist_bevorzugt: true, vornamen: 'Karl' })
    const zustand = hauptnameZustand([name('n-1'), zweite, name('n-3')])
    expect(zustand).toStrictEqual({ art: 'hauptname', name: zweite, weitere: 2 })
  })

  it('ohne Formen: ohne_namen', () => {
    expect(hauptnameZustand([])).toStrictEqual({ art: 'ohne_namen', weitere: 0 })
  })

  it('Formen ohne bevorzugte (Altbestand): kein geratener Hauptname', () => {
    expect(hauptnameZustand([name('n-1'), name('n-2')])).toStrictEqual({ art: 'ohne_hauptname', weitere: 2 })
  })
})

describe('hauptnameHatSichtbarenInhalt (E2)', () => {
  it('leer bei leerem oder nur Leerraum in Vorname(n) und Nachname, auch mit Rufname/Präfix', () => {
    expect(hauptnameHatSichtbarenInhalt(NAMEN_EINTRAG_LEER)).toBe(false)
    expect(hauptnameHatSichtbarenInhalt({ ...NAMEN_EINTRAG_LEER, vornamen: '  ', nachname: ' ', rufname: 'Karl', praefix: 'von' })).toBe(false)
  })

  it('ein Vorname oder ein Nachname genügt', () => {
    expect(hauptnameHatSichtbarenInhalt({ ...NAMEN_EINTRAG_LEER, vornamen: 'K' })).toBe(true)
    expect(hauptnameHatSichtbarenInhalt({ ...NAMEN_EINTRAG_LEER, nachname: 'G' })).toBe(true)
  })
})

describe('hauptnameAnlegenEin (E1/E2)', () => {
  it('legt über die Brücke an; ein gewählter Rufname markiert seinen Vornamen', () => {
    const eintrag = mitRufnameAusAuswahl({ ...NAMEN_EINTRAG_LEER, vornamen: 'Karl Friedrich', nachname: 'Gutnoff' }, '1')
    expect(hauptnameAnlegenEin('p-1', eintrag)).toMatchObject({ personId: 'p-1', typ: 'sonstiges', vornamen: 'Karl Friedrich', nachname: 'Gutnoff', rufnameText: 'Friedrich' })
  })

  it('ein Rufname, der keinem Vornamen (mehr) gleicht, geht nicht mit — er würde sonst als Vorname angehängt', () => {
    const eintrag = { ...NAMEN_EINTRAG_LEER, vornamen: 'Karl', nachname: 'Gutnoff', rufname: 'Fritz', rufnameIndex: 1 }
    const ein = hauptnameAnlegenEin('p-1', eintrag)
    expect(ein.rufnameText).toBeUndefined()
    expect(ein.vornamen).toBe('Karl')
  })
})

describe('Namensbrücke im Reiter Person: Vatersname und wortgetreuer original_text bleiben', () => {
  it('eine Vornamen-Änderung schickt Vatersname und wortgetreue Schreibung unverändert mit', () => {
    const gelesen = name('n-1', { ist_bevorzugt: true, vornamen: 'Iwan', nachname: 'Iwanow', vatersname: 'Petrowitsch', original_text: 'Iwan Petrowitsch Iwanow (lt. Kirchenbuch)' })
    const eintrag = namenEintragAusPersonDetailName(gelesen)
    const ein = nameAendernEinAusEintrag(gelesen.id, { ...eintrag, vornamen: 'Johann' }, 'vornamen')
    expect(ein).toMatchObject({ id: 'n-1', feld: 'vornamen', vornamen: 'Johann', vatersname: 'Petrowitsch', originalText: 'Iwan Petrowitsch Iwanow (lt. Kirchenbuch)', nachname: 'Iwanow' })
  })
})

describe('Kurzbeschreibung (E5/E9)', () => {
  it('Prädikat ist ein Textprädikat mit Beschriftung; Anlegen mit wertText ist vertragsgültig', () => {
    expect(KURZBESCHREIBUNG_PRAEDIKAT).toBe('kurzbeschreibung')
    expect(PRAEDIKAT_SCHLUESSEL[KURZBESCHREIBUNG_PRAEDIKAT]).toBe('praedikat_kurzbeschreibung')
    expect(istDatumsPraedikat(KURZBESCHREIBUNG_PRAEDIKAT)).toBe(false)
    const ein = aussageAnlegenEinFuer('p-1', KURZBESCHREIBUNG_PRAEDIKAT, { wertText: 'Schmied' }, 2)
    expect(ein).toStrictEqual({ subjektTyp: 'person', subjektId: 'p-1', praedikat: 'kurzbeschreibung', wertText: 'Schmied', konfidenz: 2 })
    expect(aussageWertVerletzung(ein.praedikat, { anzahlWerte: 1, hatDatum: false })).toBeNull()
  })

  it('ohne Aussage: null und leerer Text', () => {
    expect(kurzbeschreibungAussage([feld('beruf', [aussage('b-1')])])).toBeNull()
    expect(kurzbeschreibungText(null)).toBe('')
  })

  it('mehrere Aussagen (Altbestand): die bevorzugte, sonst die erste', () => {
    const bevorzugt = aussage('k-2', { ist_bevorzugt: true, wert: 'Bauer', wert_text: 'Bauer' })
    expect(kurzbeschreibungAussage([feld('kurzbeschreibung', [aussage('k-1'), bevorzugt])])).toBe(bevorzugt)
    const erste = aussage('k-1')
    expect(kurzbeschreibungAussage([feld('kurzbeschreibung', [erste, aussage('k-3')])])).toBe(erste)
  })

  it('Text: Textwert, sonst die Anzeige eines Altbestands-Werts', () => {
    expect(kurzbeschreibungText(aussage('k-1'))).toBe('Schmied')
    expect(kurzbeschreibungText(aussage('k-1', { wert: '42', wert_text: null, wert_zahl: 42 }))).toBe('42')
  })

  it('Änderung setzt den Text; Zahl/Verweis des Altbestands weichen, sonst nur wertText (koaleszierbar)', () => {
    expect(kurzbeschreibungAenderung(aussage('k-1'), 'Schmied in Marienwerder')).toStrictEqual({ wertText: 'Schmied in Marienwerder' })
    expect(kurzbeschreibungAenderung(aussage('k-1', { wert_text: null, wert_zahl: 42 }), 'Bauer')).toStrictEqual({ wertText: 'Bauer', wertZahl: null })
    expect(kurzbeschreibungAenderung(aussage('k-1', { wert_text: null, wert_ref_id: 'o-1' }), 'Bauer')).toStrictEqual({ wertText: 'Bauer', wertRefId: null })
  })
})
