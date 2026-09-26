// A-02, AP-1.30 (Fix Rufname-Anhängen): Der Rufname einer bestehenden Namenszeile wird aus ihren
// Vornamen GEWÄHLT (docs/20_Domaenenwissen.md §24), nicht getippt — ein getippter Rufname ging mit
// jedem Autosave-Zwischenstand als zusätzlicher Vorname in die Datenbank
// (`profil-namen-rufname-zwischenstaende.test.ts`). Muster wie `profil-bearbeiten-namen.test.tsx`
// (`renderToStaticMarkup`, Befehl-Hooks gemockt).
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import '../../src/renderer/i18n/einrichten'

vi.mock('../../src/renderer/brücke/befehl-hooks', () => ({
  useNameAnlegen: () => ({ mutate: vi.fn() }),
  useNameAendern: () => ({ mutate: vi.fn() }),
  useNameLoeschen: () => ({ mutate: vi.fn() }),
}))

import { NamenBearbeitenAbschnitt } from '../../src/renderer/ansichten/profil/profil-bearbeiten-namen'
import {
  NAMEN_EINTRAG_LEER,
  mitRufnameAusAuswahl,
  nameAendernEinAusEintrag,
  nameAnlegenEinAusEintrag,
  rufnameAuswahlVornamen,
  rufnameAuswahlWert,
  type NamenEintragWerte,
} from '../../src/renderer/ansichten/profil/profil-bearbeiten-logik'
import type { PersonDetailName } from '../../src/shared/schemata/person-detail'

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

  it('bestehende Zeile: Rufname ist eine Auswahl aus den Vornamen, der markierte ist gewählt', () => {
    const name: PersonDetailName = {
      id: 'name-1',
      typ: 'geburtsname',
      schrift: null,
      vornamen: 'Karl Friedrich',
      nachname: 'Gutnoff',
      praefix: null,
      titel_vor: null,
      zusatz_nach: null,
      vatersname: null,
      rufname_text: 'Friedrich',
      rufname_index: 1,
      umschrift_von: null,
      umschrift_norm: null,
      sprache: null,
      gueltig_von: null,
      gueltig_bis: null,
      original_text: 'Karl Friedrich Gutnoff',
    }
    const markup = renderToStaticMarkup(<NamenBearbeitenAbschnitt personId="person-1" namen={[name]} />)
    const zeile = markup.slice(markup.indexOf('wz-profil-bearbeiten-namen__zeile'), markup.indexOf('wz-profil-bearbeiten-namen__neu'))
    const rufnameFeld = zeile.slice(zeile.indexOf('Rufname'))
    expect(rufnameFeld).toMatch(/^Rufname<\/span><\/span><span class="wz-formularfeld__feld"><select/u)
    expect(rufnameFeld).toContain('<option value="">nicht angegeben</option><option value="0">Karl</option><option value="1" selected="">Friedrich</option>')
  })
})
