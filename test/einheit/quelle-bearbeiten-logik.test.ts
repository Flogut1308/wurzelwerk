// AP-1.17 PR-C1 — rot zuerst (CLAUDE.md §5, eiserne Regel): vor der Implementierung geschrieben.
// Reine Umrechnungen aus `quelle-bearbeiten-logik.ts` (Muster `ort-bearbeiten.test.tsx`), OHNE
// React/DOM/Netzwerk — kein Mock nötig.
import { describe, expect, it } from 'vitest'
import {
  QUELLE_KOPF_ENTWURF_LEER,
  ZITAT_ENTWURF_LEER,
  datumTextIstGueltig,
  gespraechsdatumAusEntwurf,
  jahrTextIstGueltig,
  quelleAendernEinAusEntwurf,
  quelleKopfEntwurfAusDetail,
  quelleNeuAnlegenEin,
  zitatAendernEinAusEntwurf,
  zitatAnlegenEinAusEntwurf,
  zitatEntwurfAusZeile,
  zitatEntwurfHatInhalt,
  type QuelleKopfEntwurfWerte,
  type ZitatEntwurfWerte,
} from '../../src/renderer/ansichten/quellen/quelle-bearbeiten-logik'
import type { QuelleDetailKopf, QuelleDetailZitat } from '../../src/shared/schemata/quelle-detail'

function quelleKopf(ueberschreibung: Partial<QuelleDetailKopf> = {}): QuelleDetailKopf {
  return {
    id: 'quelle-1',
    typ: 'kirchenbuch',
    titel: null,
    autor: null,
    verlag: null,
    jahr: null,
    art: null,
    informationsart: null,
    archiv_id: null,
    archiv_name: null,
    signatur: null,
    notiz: null,
    informant_person_id: null,
    informant_anzeigename: null,
    gespraechsdatum_kalender: null,
    gespraechsdatum_modifikator: null,
    gespraechsdatum_praezision: null,
    gespraechsdatum_wert1: null,
    gespraechsdatum_wert2: null,
    gespraechsdatum_originaltext: null,
    gespraechsdatum_zweitkalender: null,
    gespraechsdatum_zweitwert: null,
    gespraechsdatum_doppeljahr: null,
    form: null,
    unmittelbarkeit: null,
    audio_medium_id: null,
    ...ueberschreibung,
  }
}

function zitatZeile(ueberschreibung: Partial<QuelleDetailZitat> = {}): QuelleDetailZitat {
  return {
    id: 'zitat-1',
    seite: null,
    eintragsnummer: null,
    band: null,
    jahr: null,
    zugriffsdatum_kalender: null,
    zugriffsdatum_modifikator: null,
    zugriffsdatum_praezision: null,
    zugriffsdatum_wert1: null,
    zugriffsdatum_wert2: null,
    zugriffsdatum_originaltext: null,
    zugriffsdatum_zweitkalender: null,
    zugriffsdatum_zweitwert: null,
    zugriffsdatum_doppeljahr: null,
    zeitmarke_sekunden: null,
    digitalisat_url: null,
    transkript: null,
    uebersetzung: null,
    konfidenz: null,
    medium_id: null,
    ...ueberschreibung,
  }
}

describe('quelle-bearbeiten-logik: Jahr/Datum-Gültigkeit (AP-1.17 PR-C1)', () => {
  it('jahrTextIstGueltig: leer ist gültig (kein Jahr angegeben, erlaubt)', () => {
    expect(jahrTextIstGueltig('')).toBe(true)
    expect(jahrTextIstGueltig('   ')).toBe(true)
  })

  it('jahrTextIstGueltig: eine Ganzzahl ist gültig, ein Fließkomma/Text nicht', () => {
    expect(jahrTextIstGueltig('1890')).toBe(true)
    expect(jahrTextIstGueltig('-500')).toBe(true)
    expect(jahrTextIstGueltig('1890,5')).toBe(false)
    expect(jahrTextIstGueltig('achtzehnhundert')).toBe(false)
  })

  it('datumTextIstGueltig: leerer/auflösbarer Text gültig, unauflösbarer Text nicht', () => {
    expect(datumTextIstGueltig('')).toBe(true)
    expect(datumTextIstGueltig('1950')).toBe(true)
    expect(datumTextIstGueltig('völliger Unsinn')).toBe(false)
  })

  it('gespraechsdatumAusEntwurf: leerer Text -> undefined', () => {
    expect(gespraechsdatumAusEntwurf('', 'gregorian')).toBeUndefined()
  })

  it('gespraechsdatumAusEntwurf: auflösbarer Text -> Datumswert mit dem gewählten Kalender', () => {
    const ergebnis = gespraechsdatumAusEntwurf('12.09.2026', 'gregorian')
    expect(ergebnis?.kalender).toBe('gregorian')
    expect(ergebnis?.modifikator).toBe('exakt')
    expect(ergebnis?.wert1).toBe('2026-09-12')
  })
})

describe('quelle-bearbeiten-logik: Quelle-Stammfelder (AP-1.17 PR-C1)', () => {
  it('quelleKopfEntwurfAusDetail: übernimmt alle Felder, null -> leerer String, Enum-Felder null -> "" ', () => {
    const entwurf = quelleKopfEntwurfAusDetail(quelleKopf({ typ: 'grabstein', titel: 'Grabstein Wruck', jahr: 1961 }))
    expect(entwurf.typ).toBe('grabstein')
    expect(entwurf.titel).toBe('Grabstein Wruck')
    expect(entwurf.jahrText).toBe('1961')
    expect(entwurf.art).toBe('')
    expect(entwurf.informationsart).toBe('')
    expect(entwurf.form).toBe('')
    expect(entwurf.unmittelbarkeit).toBe('')
  })

  it('quelleKopfEntwurfAusDetail: gespraechsdatum-Text bevorzugt originaltext, fällt sonst auf wert1 zurück', () => {
    const mitOriginaltext = quelleKopfEntwurfAusDetail(quelleKopf({ gespraechsdatum_originaltext: 'etwa 1990', gespraechsdatum_wert1: '1990' }))
    expect(mitOriginaltext.gespraechsdatumText).toBe('etwa 1990')

    const ohneOriginaltext = quelleKopfEntwurfAusDetail(quelleKopf({ gespraechsdatum_wert1: '1990' }))
    expect(ohneOriginaltext.gespraechsdatumText).toBe('1990')
  })

  it('quelleAendernEinAusEntwurf: typ ist Pflicht, leere Textfelder -> undefined, "" bei Enum-Feldern -> undefined', () => {
    const entwurf: QuelleKopfEntwurfWerte = { ...QUELLE_KOPF_ENTWURF_LEER, typ: 'kirchenbuch' }
    expect(quelleAendernEinAusEntwurf('quelle-1', entwurf)).toEqual({
      id: 'quelle-1',
      typ: 'kirchenbuch',
      titel: undefined,
      autor: undefined,
      verlag: undefined,
      jahr: undefined,
      art: undefined,
      informationsart: undefined,
      archivId: undefined,
      signatur: undefined,
      notiz: undefined,
      informantPersonId: undefined,
      gespraechsdatum: undefined,
      form: undefined,
      unmittelbarkeit: undefined,
    })
  })

  it('quelleAendernEinAusEntwurf: befüllte Felder (Jahr, Enum-Auswahl, Archiv) landen unverändert im Ergebnis', () => {
    const entwurf: QuelleKopfEntwurfWerte = {
      ...QUELLE_KOPF_ENTWURF_LEER,
      typ: 'grabstein',
      titel: 'Grabstein Wruck',
      jahrText: '1961',
      art: 'original',
      informationsart: 'primaer',
      archivId: 'archiv-1',
      signatur: 'Feld 4',
    }
    const ergebnis = quelleAendernEinAusEntwurf('quelle-1', entwurf)
    expect(ergebnis.titel).toBe('Grabstein Wruck')
    expect(ergebnis.jahr).toBe(1961)
    expect(ergebnis.art).toBe('original')
    expect(ergebnis.informationsart).toBe('primaer')
    expect(ergebnis.archivId).toBe('archiv-1')
    expect(ergebnis.signatur).toBe('Feld 4')
  })

  it('quelleAendernEinAusEntwurf: mündlich-Block (informantPersonId/gespraechsdatum/form/unmittelbarkeit)', () => {
    const entwurf: QuelleKopfEntwurfWerte = {
      ...QUELLE_KOPF_ENTWURF_LEER,
      typ: 'muendlich',
      informantPersonId: 'person-1',
      gespraechsdatumText: '2026',
      gespraechsdatumKalender: 'gregorian',
      form: 'telefonat',
      unmittelbarkeit: 'selbst_erlebt',
    }
    const ergebnis = quelleAendernEinAusEntwurf('quelle-1', entwurf)
    expect(ergebnis.informantPersonId).toBe('person-1')
    expect(ergebnis.gespraechsdatum).toEqual({ kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', wert1: '2026', wert2: undefined, original_text: undefined, doppeljahr: undefined })
    expect(ergebnis.form).toBe('telefonat')
    expect(ergebnis.unmittelbarkeit).toBe('selbst_erlebt')
  })

  it('quelleNeuAnlegenEin: NUR typ "sonstiges" (minimal anlegen, Rest wird in der geöffneten Ansicht ergänzt)', () => {
    expect(quelleNeuAnlegenEin()).toEqual({ typ: 'sonstiges' })
  })
})

describe('quelle-bearbeiten-logik: Zitate (AP-1.17 PR-C1)', () => {
  it('zitatEntwurfHatInhalt: komplett leer -> nicht absendbar', () => {
    expect(zitatEntwurfHatInhalt(ZITAT_ENTWURF_LEER)).toBe(false)
  })

  it('zitatEntwurfHatInhalt: mindestens ein sichtbares Feld gefüllt -> absendbar', () => {
    const entwurf: ZitatEntwurfWerte = { ...ZITAT_ENTWURF_LEER, seite: '42' }
    expect(zitatEntwurfHatInhalt(entwurf)).toBe(true)
  })

  it('zitatAnlegenEinAusEntwurf: sichtbare Felder + konfidenz landen in der Nutzlast', () => {
    const entwurf: ZitatEntwurfWerte = { ...ZITAT_ENTWURF_LEER, seite: '42', eintragsnummer: '7', transkript: 'Getauft wurde…', digitalisatUrl: 'https://beispiel.invalid/bild.jpg', konfidenz: 3 }
    expect(zitatAnlegenEinAusEntwurf('quelle-1', entwurf)).toEqual({
      quelleId: 'quelle-1',
      seite: '42',
      eintragsnummer: '7',
      band: undefined,
      jahr: undefined,
      zugriffsdatum: undefined,
      zeitmarkeSekunden: undefined,
      digitalisatUrl: 'https://beispiel.invalid/bild.jpg',
      transkript: 'Getauft wurde…',
      uebersetzung: undefined,
      konfidenz: 3,
      mediumId: undefined,
    })
  })

  it('zitatEntwurfAusZeile + zitatAendernEinAusEntwurf: verborgene Felder (band/zugriffsdatum/uebersetzung/mediumId) werden UNVERÄNDERT durchgereicht (kein stiller Datenverlust)', () => {
    const zeile = zitatZeile({
      seite: '42',
      band: 'Band 3',
      jahr: 1900,
      zugriffsdatum_modifikator: 'exakt',
      zugriffsdatum_praezision: 'tag',
      zugriffsdatum_wert1: '2019-06-01',
      uebersetzung: 'englische Übersetzung',
      medium_id: 'medium-1',
    })
    const entwurf = zitatEntwurfAusZeile(zeile)
    // Das sichtbare Feld "seite" wurde geändert — die verborgenen Felder bleiben trotzdem erhalten.
    const geaendert: ZitatEntwurfWerte = { ...entwurf, seite: '43' }
    const ergebnis = zitatAendernEinAusEntwurf('zitat-1', 'quelle-1', geaendert)
    expect(ergebnis.seite).toBe('43')
    expect(ergebnis.band).toBe('Band 3')
    expect(ergebnis.jahr).toBe(1900)
    expect(ergebnis.uebersetzung).toBe('englische Übersetzung')
    expect(ergebnis.mediumId).toBe('medium-1')
    expect(ergebnis.zugriffsdatum).toEqual({
      kalender: undefined,
      modifikator: 'exakt',
      praezision: 'tag',
      wert1: '2019-06-01',
      wert2: undefined,
      original_text: undefined,
      zweitkalender: undefined,
      zweitwert: undefined,
      doppeljahr: undefined,
    })
  })

  it('zitatEntwurfAusZeile: konfidenz außerhalb 1..4 (Datenbankinkonsistenz) -> null statt eines ungültigen Werts', () => {
    // `konfidenz` ist eine rohe `number | null` aus der Datenbank (KEIN Zod-geprüfter Wert an
    // dieser Stelle) — defensiv geprüft statt blind `as KonfidenzStufe` zu casten (CLAUDE.md §4).
    const entwurf = zitatEntwurfAusZeile(zitatZeile({ konfidenz: 9 }))
    expect(entwurf.konfidenz).toBeNull()
  })
})
