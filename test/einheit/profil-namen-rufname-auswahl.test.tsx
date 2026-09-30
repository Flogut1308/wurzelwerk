// A-02, AP-1.30 (Fix Rufname-Anhängen): Der Rufname einer bestehenden Namensform wird aus ihren
// Vornamen GEWÄHLT (docs/20_Domaenenwissen.md §24), nicht getippt — ein getippter Rufname ging mit
// jedem Autosave-Zwischenstand als zusätzlicher Vorname in die Datenbank
// (`profil-namen-rufname-zwischenstaende.test.ts`). Die Logik der flachen Brücke nutzt heute der Reiter
// Person (`reiter-person-hauptname.tsx`); die Anzeige der Auswahl prüfen `reiter-person-hauptname.test.tsx`
// und für das Modal `namensform-modal.test.tsx` (AP-1.30 PR 11c-2, docs/80 §33 V-130-11c-2).
import { describe, expect, it } from 'vitest'
import {
  NAMEN_EINTRAG_LEER,
  mitRufnameAusAuswahl,
  nameAendernEinAusEintrag,
  nameAnlegenEinAusEintrag,
  rufnameAuswahlVornamen,
  rufnameAuswahlWert,
  type NamenEintragWerte,
} from '../../src/renderer/ansichten/profil/profil-bearbeiten-logik'

const KARL_FRIEDRICH: NamenEintragWerte = { ...NAMEN_EINTRAG_LEER, typ: 'geburtsname', vornamen: 'Karl Friedrich', nachname: 'Gutnoff' }

describe('Rufname-Auswahl (A-02, AP-1.30)', () => {
  it('bietet je Vorname seine Position an', () => {
    expect(rufnameAuswahlVornamen({ ...KARL_FRIEDRICH, vornamen: '  Karl   Friedrich ' })).toEqual([
      { wert: '0', vorname: 'Karl' },
      { wert: '1', vorname: 'Friedrich' },
    ])
  })

  it('Auswahlwert: Position des markierten Vornamens, sonst leer', () => {
    expect(rufnameAuswahlWert(KARL_FRIEDRICH)).toBe('')
    expect(rufnameAuswahlWert({ ...KARL_FRIEDRICH, rufname: 'Friedrich', rufnameIndex: 1 })).toBe('1')
    expect(rufnameAuswahlWert({ ...KARL_FRIEDRICH, rufname: 'Friedrich', rufnameIndex: null })).toBe('1')
    expect(rufnameAuswahlWert({ ...KARL_FRIEDRICH, rufname: 'Fritz', rufnameIndex: null })).toBe('')
  })

  it('gleichlautende Vornamen: die gewählte Position wird markiert, nicht die erste', () => {
    const johann = { ...KARL_FRIEDRICH, vornamen: 'Johann Georg Johann' }
    const gewaehlt = mitRufnameAusAuswahl(johann, '2')
    expect(gewaehlt).toMatchObject({ rufname: 'Johann', rufnameIndex: 2 })
    expect(rufnameAuswahlWert(gewaehlt)).toBe('2')
    expect(nameAendernEinAusEintrag('name-1', gewaehlt)).toMatchObject({ rufnameText: 'Johann', rufnameIndex: 2 })
  })

  it('Auswahl „nicht angegeben" nimmt die Markierung zurück', () => {
    const vorher = mitRufnameAusAuswahl(KARL_FRIEDRICH, '1')
    expect(mitRufnameAusAuswahl(vorher, '')).toMatchObject({ rufname: '', rufnameIndex: null })
    expect(nameAendernEinAusEintrag('name-1', mitRufnameAusAuswahl(vorher, ''))).toMatchObject({ rufnameText: undefined, rufnameIndex: undefined })
  })

  it('Ändern schickt keinen Rufnamen, der keinem Vornamen gleicht; Anlegen hängt ihn weiter an', () => {
    const fremd = { ...KARL_FRIEDRICH, rufname: 'Fritz' }
    expect(nameAendernEinAusEintrag('name-1', fremd).rufnameText).toBeUndefined()
    expect(nameAnlegenEinAusEintrag('person-1', fremd).rufnameText).toBe('Fritz')
  })

  it('Review H3: der gesendete Rufname ist der getrimmte Vorname, nicht die rohe Eingabe', () => {
    const eintrag = { ...KARL_FRIEDRICH, vornamen: ' Karl  Friedrich ', rufname: ' Friedrich ', rufnameIndex: null }
    expect(nameAendernEinAusEintrag('name-1', eintrag).rufnameText).toBe('Friedrich')
  })

  // Review H1: ein mehrwortiger Rufname steht als EIN Bestandteil hinter den Vornamen (zerlegeName
  // Regel 3, Migration 0006 (c)); die Auswahl bietet ihn als EINE Option an.
  it('mehrwortiger Rufname am Ende der Vornamen ist eine Option und gewählt', () => {
    const eintrag = { ...KARL_FRIEDRICH, vornamen: 'Karl Hans Peter', rufname: 'Hans Peter', rufnameIndex: 1 }
    expect(rufnameAuswahlVornamen(eintrag)).toEqual([
      { wert: '0', vorname: 'Karl' },
      { wert: '1', vorname: 'Hans Peter' },
    ])
    expect(rufnameAuswahlWert(eintrag)).toBe('1')
    expect(mitRufnameAusAuswahl({ ...eintrag, rufname: '', rufnameIndex: null }, '1')).toMatchObject({ rufname: 'Hans', rufnameIndex: 1 })
    expect(mitRufnameAusAuswahl(eintrag, '1')).toMatchObject({ rufname: 'Hans Peter', rufnameIndex: 1 })
    expect(nameAendernEinAusEintrag('name-1', eintrag)).toMatchObject({ vornamen: 'Karl', rufnameText: 'Hans Peter' })
  })

  // Nachreview H-C: zerlegeName speichert den angehängten Rufnamen roh — „Hans  Peter“ mit doppeltem
  // Leerraum ist speicherbar und darf seine Markierung nicht verlieren.
  it('mehrwortiger Rufname mit doppeltem Leerraum behält seine Markierung', () => {
    const eintrag = { ...KARL_FRIEDRICH, vornamen: 'Karl Hans  Peter', rufname: 'Hans  Peter', rufnameIndex: 1 }
    expect(rufnameAuswahlWert(eintrag)).toBe('1')
    expect(nameAendernEinAusEintrag('name-1', eintrag)).toMatchObject({ vornamen: 'Karl', rufnameText: 'Hans Peter' })
  })
})

// U-130-11c2-rufname-verlust (docs/80 §33, V-130-11e-1): Schreibt der Nutzer den markierten Vornamen um,
// gleicht der mitgetragene Rufname schon im ersten Zwischenstand keinem Vornamen mehr. Die Stelle folgt
// dann der Ausrichtung an den zuletzt gelesenen/gewählten Vornamen (`rufnameBasis`): Wörter davor
// unverändert → Index bleibt; sonst Wörter dahinter unverändert → vom Ende gezählt; sonst Textsuche.
describe('Rufname-Stelle über Zwischenstände (U-130-11c2-rufname-verlust)', () => {
  const GELESEN: NamenEintragWerte = { ...KARL_FRIEDRICH, rufname: 'Friedrich', rufnameIndex: 1, rufnameBasis: ['Karl', 'Friedrich'] }
  const JOHANN: NamenEintragWerte = { ...KARL_FRIEDRICH, vornamen: 'Johann Georg Johann', rufname: 'Johann', rufnameIndex: 2, rufnameBasis: ['Johann', 'Georg', 'Johann'] }

  it('Lesen und Auswahl halten die Vornamen-Einheiten als Basis fest', () => {
    expect(mitRufnameAusAuswahl(KARL_FRIEDRICH, '1').rufnameBasis).toEqual(['Karl', 'Friedrich'])
    expect(mitRufnameAusAuswahl({ ...KARL_FRIEDRICH, vornamen: ' Karl  Hans Peter', rufname: 'Hans Peter', rufnameIndex: 1 }, '1').rufnameBasis).toEqual(['Karl', 'Hans Peter'])
    expect(mitRufnameAusAuswahl(KARL_FRIEDRICH, '').rufnameBasis).toEqual(['Karl', 'Friedrich'])
  })

  it('„Karl Friedric": die Wörter davor sind unverändert, die Markierung bleibt an Position 1 und wandert mit', () => {
    const eintrag = { ...GELESEN, vornamen: 'Karl Friedric' }
    expect(rufnameAuswahlWert(eintrag)).toBe('1')
    expect(nameAendernEinAusEintrag('name-1', eintrag)).toMatchObject({ vornamen: 'Karl Friedric', rufnameText: 'Friedric', rufnameIndex: 1 })
    expect(nameAendernEinAusEintrag('name-1', { ...GELESEN, vornamen: 'Karl Fritz' })).toMatchObject({ vornamen: 'Karl Fritz', rufnameText: 'Fritz', rufnameIndex: 1 })
  })

  it('vorne eingefügt: die Wörter dahinter sind unverändert, die Stelle zählt vom Ende', () => {
    expect(rufnameAuswahlWert({ ...GELESEN, vornamen: 'H Karl Friedrich' })).toBe('2')
    // Die Textsuche fände das erste „Friedrich" (Position 0).
    expect(rufnameAuswahlWert({ ...GELESEN, vornamen: 'Friedrich Karl Friedrich' })).toBe('2')
    expect(rufnameAuswahlWert({ ...JOHANN, vornamen: 'H Johann Georg Johann' })).toBe('3')
  })

  it('„Johann Georg Jo…": das markierte letzte „Johann" bleibt an Position 2, auch wieder vollständig', () => {
    expect(nameAendernEinAusEintrag('name-1', { ...JOHANN, vornamen: 'Johann Georg Jo' })).toMatchObject({ rufnameText: 'Jo', rufnameIndex: 2 })
    expect(rufnameAuswahlWert({ ...JOHANN, vornamen: 'Johann Georg Johann', rufname: 'Jo', rufnameBasis: ['Johann', 'Georg', 'Jo'] })).toBe('2')
  })

  it('das markierte Wort gelöscht: die Markierung entfällt, sie springt auf kein anderes Wort', () => {
    expect(rufnameAuswahlWert({ ...GELESEN, vornamen: 'Karl' })).toBe('')
    expect(nameAendernEinAusEintrag('name-1', { ...GELESEN, vornamen: 'Karl' })).toMatchObject({ vornamen: 'Karl', rufnameText: undefined, rufnameIndex: undefined })
    const vorne = { ...GELESEN, vornamen: ' Friedrich', rufname: 'l', rufnameIndex: 0, rufnameBasis: ['l', 'Friedrich'] }
    expect(rufnameAuswahlWert(vorne)).toBe('')
  })

  it('ein neu gesetzter Rufname-Text wird gesucht, der alte Index richtet ihn nicht aus', () => {
    expect(rufnameAuswahlWert({ ...GELESEN, rufname: 'Karl' })).toBe('0')
    expect(rufnameAuswahlWert({ ...GELESEN, vornamen: 'Karl Friedric', rufname: 'Karl' })).toBe('0')
    expect(rufnameAuswahlWert({ ...GELESEN, vornamen: 'Karl Friedric', rufname: 'Fritz' })).toBe('')
  })

  it('ohne Basis (Neu-Formular) gilt weiter nur die Textsuche', () => {
    expect(rufnameAuswahlWert({ ...GELESEN, vornamen: 'Karl Friedric', rufnameBasis: null })).toBe('')
  })

  it('nichts wird angehängt: der gesendete Rufname ist immer ein vorhandener Vorname', () => {
    for (const vornamen of ['Karl Friedric', 'Karl F', 'Karl', 'H Karl Friedrich', 'Hans Peter']) {
      const ein = nameAendernEinAusEintrag('name-1', { ...GELESEN, vornamen })
      if (ein.rufnameText !== undefined) expect(vornamen.split(' ')).toContain(ein.rufnameText)
    }
  })
})
