// AP-1.30 PR 9b (Reiter „Person", docs/80 §33 V-130-9-entscheidungen D3/D5/D7/D10/K, V-E5-erhalt):
// reine Logik des Reiters — Tod-Gruppe je Lebensstatus, Feldzustand je Lebensdatum (Aussage führt,
// sonst gesperrter Ereigniswert, sonst leer), Zuordnung der Feldwarnungen, Bau der Befehle.
// Rot zuerst (CLAUDE.md §5): gegen den Stand vor PR 9b gibt es `reiter-person-logik.ts` nicht.
import { describe, expect, it } from 'vitest'
import {
  KONFIDENZ_VORGABE,
  aussageAnlegenEinFuer,
  aussageAusAngelegt,
  aussageDatumAnzeige,
  aussageKalender,
  datumAenderung,
  datumswertAusText,
  lebendStatusAuswahl,
  lebendStatusOptionen,
  lebensdatumFeld,
  ohneKoaleszenz,
  ortAenderung,
  ortAnzeigeText,
  personFeldLebendStatusEin,
  todGruppeGrundSchluessel,
  todGruppeZustand,
  uebernahmeAusEreignis,
  warnungenZuordnen,
} from '../../src/renderer/ansichten/profil/reiter-person-logik'
import { aussageAendernEinAus } from '../../src/renderer/ansichten/profil/profil-aussage-logik'
import { aussageAendernEinSchema, aussageAnlegenEinSchema } from '../../src/shared/schemata/befehle'
import type {
  PersonDetailAussage,
  PersonDetailAussageDatum,
  PersonDetailGrunddatenFeld,
  PersonDetailLebensdatum,
  PersonDetailWarnung,
} from '../../src/shared/schemata/person-detail'

function datumsgruppe(ueberschreibung: Partial<PersonDetailAussageDatum> = {}): PersonDetailAussageDatum {
  return {
    kalender: 'gregorian',
    modifikator: 'exakt',
    praezision: 'jahr',
    wert1: '1901',
    wert2: null,
    originaltext: null,
    sort_von: 2415386,
    sort_bis: 2415750,
    zweitkalender: null,
    zweitwert: null,
    doppeljahr: null,
    ...ueberschreibung,
  }
}

function aussage(ueberschreibung: Partial<PersonDetailAussage> = {}): PersonDetailAussage {
  return {
    aussage_id: 'a-1',
    wert: '1901',
    wert_text: null,
    wert_zahl: null,
    wert_ref_id: null,
    datum: datumsgruppe(),
    konfidenz: 3,
    ist_bevorzugt: false,
    begruendung: null,
    unsicherheit: null,
    gueltig_von: null,
    gueltig_bis: null,
    belege: [],
    ...ueberschreibung,
  }
}

function feld(praedikat: string, aussagen: readonly PersonDetailAussage[], belegzahl = 0): PersonDetailGrunddatenFeld {
  return { praedikat, wert: aussagen[0]?.wert ?? null, konfidenz: aussagen[0]?.konfidenz ?? null, belegzahl, hat_widerspruch: false, hatKonkurrierende: false, aussagen }
}

function lebensdatum(ueberschreibung: Partial<PersonDetailLebensdatum> & Pick<PersonDetailLebensdatum, 'angabe'>): PersonDetailLebensdatum {
  return { herkunft: null, aussage_id: null, ereignis_id: null, datum: null, datum_originaltext: null, ort_id: null, ort_name: null, ...ueberschreibung }
}

describe('Lebensstatus (Eckdaten)', () => {
  it('null wird als „nicht erfasst" gewählt angezeigt, sonst der Wert selbst', () => {
    expect(lebendStatusAuswahl(null)).toBe('nicht_erfasst')
    expect(lebendStatusAuswahl('lebend')).toBe('lebend')
    expect(lebendStatusAuswahl('vermutet_verstorben')).toBe('vermutet_verstorben')
  })

  it('„nicht erfasst" ist nur Option, solange nichts erfasst ist (person.feldSetzen kennt kein null)', () => {
    expect(lebendStatusOptionen(null)).toEqual(['lebend', 'verstorben', 'vermutet_verstorben', 'nicht_erfasst'])
    expect(lebendStatusOptionen('verstorben')).toEqual(['lebend', 'verstorben', 'vermutet_verstorben'])
  })

  it('Befehl: person.feldSetzen lebend_status; „nicht erfasst" schreibt nichts', () => {
    expect(personFeldLebendStatusEin('p-1', 'lebend')).toEqual({ id: 'p-1', feld: 'lebend_status', wert: 'lebend' })
    expect(personFeldLebendStatusEin('p-1', 'nicht_erfasst')).toBeNull()
  })
})

describe('Tod-Gruppe (D5)', () => {
  it('offen bei verstorben und vermutet verstorben, eingeklappt bei nicht erfasst, ausgeblendet bei lebend', () => {
    expect(todGruppeZustand('verstorben', null)).toBe('offen')
    expect(todGruppeZustand('vermutet_verstorben', null)).toBe('offen')
    expect(todGruppeZustand(null, null)).toBe('eingeklappt')
    expect(todGruppeZustand('lebend', null)).toBe('ausgeblendet')
  })

  it('Beschriftung nennt den Grund; ausgeblendet ohne Beschriftung', () => {
    expect(todGruppeGrundSchluessel('verstorben', 'offen')).toBe('tod_gruppe_grund_verstorben')
    expect(todGruppeGrundSchluessel('vermutet_verstorben', 'offen')).toBe('tod_gruppe_grund_vermutet_verstorben')
    expect(todGruppeGrundSchluessel(null, 'eingeklappt')).toBe('tod_gruppe_grund_nicht_erfasst')
    expect(todGruppeGrundSchluessel(null, 'offen')).toBe('tod_gruppe_grund_von_hand')
    expect(todGruppeGrundSchluessel('lebend', 'offen')).toBe('tod_gruppe_grund_von_hand')
    expect(todGruppeGrundSchluessel('lebend', 'ausgeblendet')).toBeNull()
  })

  it('von Hand eingeblendet gilt nur für den Status, bei dem geöffnet wurde', () => {
    expect(todGruppeZustand(null, 'nicht_erfasst')).toBe('offen')
    expect(todGruppeZustand('lebend', 'lebend')).toBe('offen')
    // Nach einem Statuswechsel gilt wieder die Regel.
    expect(todGruppeZustand('lebend', 'nicht_erfasst')).toBe('ausgeblendet')
    expect(todGruppeZustand(null, 'lebend')).toBe('eingeklappt')
  })
})

describe('Feldzustand je Lebensdatum', () => {
  it('Aussage führt: die führende Aussage (aussage_id aus lebensdaten), bearbeitbar', () => {
    const erste = aussage({ aussage_id: 'a-1' })
    const zweite = aussage({ aussage_id: 'a-2', ist_bevorzugt: true, wert: '1902' })
    const zustand = lebensdatumFeld('geburtsdatum', [feld('geburtsdatum', [erste, zweite], 2)], [lebensdatum({ angabe: 'geburtsdatum', herkunft: 'aussage', aussage_id: 'a-2' })])
    expect(zustand.art).toBe('aussage')
    if (zustand.art !== 'aussage') return
    expect(zustand.aussage.aussage_id).toBe('a-2')
    expect(zustand.feld.belegzahl).toBe(2)
  })

  it('Ereignis führt: gesperrt mit Herkunft und Ereignis-Id, Wert über den Formatierer', () => {
    const zustand = lebensdatumFeld(
      'todesdatum',
      [],
      [
        lebensdatum({
          angabe: 'todesdatum',
          herkunft: 'ereignis',
          ereignis_id: 'e-1',
          datum: { kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', wert1: '1970', wert2: null, originaltext: null, sortVon: 1, sortBis: 2 },
        }),
      ],
    )
    expect(zustand.art).toBe('ereignis')
    if (zustand.art !== 'ereignis') return
    expect(zustand.ereignisId).toBe('e-1')
    expect(zustand.herkunftSchluessel).toBe('herkunft_ereignis_tod')
    expect(zustand.wert).toEqual({ art: 'datum', ergebnis: { schluessel: 'datum:jahr', werte: { jahr: '1970' } } })
  })

  it('weder noch: leer', () => {
    expect(lebensdatumFeld('geburtsort', [], [lebensdatum({ angabe: 'geburtsort' })])).toEqual({ art: 'leer', angabe: 'geburtsort' })
  })

  it('Altbestand ohne tragenden Wert (Orts-Aussage nur mit Zahl): die Aussage bleibt bearbeitbar, die Zahl ist kein Ort', () => {
    const alt = aussage({ aussage_id: 'a-9', wert: '7', wert_zahl: 7, datum: null })
    const zustand = lebensdatumFeld('geburtsort', [feld('geburtsort', [alt])], [lebensdatum({ angabe: 'geburtsort' })])
    expect(zustand.art).toBe('aussage')
    if (zustand.art !== 'aussage') return
    expect(zustand.aussage.aussage_id).toBe('a-9')
    expect(ortAnzeigeText(zustand.aussage)).toBe('')
  })
})

describe('Feldwarnungen (D7, E6)', () => {
  const tod: PersonDetailWarnung = { code: 'tod_vor_geburt', reiter: 'person', feld: 'todesdatum' }
  const ortDatum: PersonDetailWarnung = { code: 'ort_mit_datum', reiter: 'person', feld: 'geburtsort' }
  const fremd: PersonDetailWarnung = { code: 'mutter_alter', reiter: 'beziehungen', feld: 'kinder' }

  it('am Feld der Warnung, nur Reiter „person"', () => {
    const zuordnung = warnungenZuordnen([tod, ortDatum, fremd], true)
    expect(zuordnung.todesdatum).toEqual(['tod_vor_geburt'])
    expect(zuordnung.geburtsort).toEqual(['ort_mit_datum'])
    expect(zuordnung.lebend_status).toEqual([])
    expect(zuordnung.geburtsdatum).toEqual([])
    expect(zuordnung.reiter).toEqual([])
  })

  it('Tod-Gruppe nicht sichtbar: Tod-Warnungen am Lebensstatus, Geburt bleibt am Feld', () => {
    const zuordnung = warnungenZuordnen([tod, ortDatum, { code: 'ort_mit_datum', reiter: 'person', feld: 'todesort' }], false)
    expect(zuordnung.todesdatum).toEqual([])
    expect(zuordnung.todesort).toEqual([])
    expect(zuordnung.lebend_status).toEqual(['tod_vor_geburt', 'ort_mit_datum'])
    expect(zuordnung.geburtsort).toEqual(['ort_mit_datum'])
  })

  it('eine Warnung an einem Feld, das der Reiter nicht zeigt, geht nicht verloren', () => {
    expect(warnungenZuordnen([{ code: 'zyklus', reiter: 'person', feld: 'eltern' }], true).reiter).toEqual(['zyklus'])
  })

  it('Mehrfachfunde bleiben erhalten', () => {
    expect(warnungenZuordnen([tod, tod], true).todesdatum).toEqual(['tod_vor_geburt', 'tod_vor_geburt'])
  })
})

describe('Datum (D10: Freitext mit Deutung)', () => {
  it('Anzeige der gespeicherten Datumsgruppe über den Formatierer, Originaltext gewinnt', () => {
    expect(aussageDatumAnzeige(aussage())).toEqual({ art: 'formatiert', ergebnis: { schluessel: 'datum:jahr', werte: { jahr: '1901' } } })
    expect(aussageDatumAnzeige(aussage({ datum: datumsgruppe({ originaltext: 'Mariä Lichtmess 1901' }) }))).toEqual({
      art: 'formatiert',
      ergebnis: { schluessel: 'datum:originaltext', werte: { text: 'Mariä Lichtmess 1901' } },
    })
  })

  it('Altbestand ohne Datumsgruppe zeigt den Text; ohne alles leer', () => {
    expect(aussageDatumAnzeige(aussage({ datum: null, wert_text: '1900', wert: '1900' }))).toEqual({ art: 'text', text: '1900' })
    expect(aussageDatumAnzeige(aussage({ datum: null, wert: null }))).toEqual({ art: 'leer' })
  })

  it('Kalender aus der Datumsgruppe, sonst gregorianisch', () => {
    expect(aussageKalender(aussage({ datum: datumsgruppe({ kalender: 'julian' }) }))).toBe('julian')
    expect(aussageKalender(aussage({ datum: datumsgruppe({ kalender: 'unbekannt' }) }))).toBe('gregorian')
    expect(aussageKalender(aussage({ datum: null }))).toBe('gregorian')
  })

  it('Freitext → Vertrags-Datumswert; nicht auflösbar oder leer → null (nichts wird geschrieben)', () => {
    expect(datumswertAusText('1902', 'gregorian')).toEqual({ kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', wert1: '1902' })
    expect(datumswertAusText('190', 'gregorian')).toBeNull()
    expect(datumswertAusText('  ', 'gregorian')).toBeNull()
  })

  it('unscharfes Datum trägt den getippten Text als Originaltext (der Vertrag verlangt ihn ab „etwa")', () => {
    const wert = datumswertAusText('um 1890', 'gregorian')
    expect(wert).toEqual({ kalender: 'gregorian', modifikator: 'etwa', praezision: 'jahr', wert1: '1890', original_text: 'um 1890' })
    expect(aussageAendernEinSchema.safeParse({ id: 'a-1', datum: wert, konfidenz: 2 }).success).toBe(true)
  })

  it('Datumsänderung: genau ein Feld → Koaleszenzfeld „datum", kein datumBeibehalten', () => {
    const datum = datumswertAusText('1902', 'gregorian')
    if (datum === null) throw new Error('Datum erwartet')
    const ein = aussageAendernEinAus(aussage(), datumAenderung(aussage(), datum))
    expect(ein).toMatchObject({ id: 'a-1', datum, konfidenz: 3, feld: 'datum' })
    expect(ein).not.toHaveProperty('datumBeibehalten')
    expect(aussageAendernEinSchema.safeParse(ein).success).toBe(true)
  })

  it('Altbestand mit wertText + Datum: der Text wird mit entfernt (eine Wahrheit, D1)', () => {
    const alt = aussage({ wert_text: '1900' })
    const datum = datumswertAusText('1902', 'gregorian')
    if (datum === null) throw new Error('Datum erwartet')
    const ein = aussageAendernEinAus(alt, datumAenderung(alt, datum))
    expect(ein?.wertText).toBeUndefined()
    expect(ein?.datum).toEqual(datum)
  })
})

describe('Ort (Ortsverweis, E5)', () => {
  it('Ortswahl: wertRefId, datumBeibehalten (Vorgabe E5), Koaleszenzfeld wertRefId', () => {
    const ortAussage = aussage({ wert: 'Marienwerder', wert_ref_id: 'o-1', datum: datumsgruppe() })
    const ein = aussageAendernEinAus(ortAussage, ortAenderung(ortAussage, 'o-2'))
    expect(ein).toMatchObject({ id: 'a-1', wertRefId: 'o-2', datumBeibehalten: true, feld: 'wertRefId' })
    expect(ein).not.toHaveProperty('datum')
  })

  it('freier Ortstext oder Zahl werden durch den Verweis ersetzt (genau ein Wert)', () => {
    const alt = aussage({ wert: 'Marienwerder', wert_text: 'Marienwerder', wert_zahl: null, datum: null })
    const ein = aussageAendernEinAus(alt, ortAenderung(alt, 'o-2'))
    expect(ein?.wertText).toBeUndefined()
    expect(ein?.wertRefId).toBe('o-2')
    expect(aussageAendernEinSchema.safeParse(ein).success).toBe(true)
    const zahl = aussage({ wert: '7', wert_zahl: 7, datum: null })
    expect(aussageAendernEinAus(zahl, ortAenderung(zahl, 'o-2'))?.wertZahl).toBeUndefined()
  })

  it('Anzeigetext: Ortsname oder freier Text', () => {
    expect(ortAnzeigeText(aussage({ wert: 'Marienwerder', wert_ref_id: 'o-1' }))).toBe('Marienwerder')
    expect(ortAnzeigeText(aussage({ wert: 'Danzig', wert_text: 'Danzig' }))).toBe('Danzig')
  })
})

describe('Sicherheit und Anlegen (K)', () => {
  it('Sicherheit schreibt ohne Koaleszenz (kein feld)', () => {
    const ein = aussageAendernEinAus(aussage(), { konfidenz: 4 })
    if (ein === null) throw new Error('Befehl erwartet')
    const ohne = ohneKoaleszenz(ein)
    expect(ohne).not.toHaveProperty('feld')
    expect(ohne).toMatchObject({ konfidenz: 4, datumBeibehalten: true })
  })

  it('Anlegen einer Personen-Aussage mit Vorgabe-Sicherheit; das Schema nimmt Datum allein an', () => {
    const datum = datumswertAusText('1901', 'gregorian')
    if (datum === null) throw new Error('Datum erwartet')
    const ein = aussageAnlegenEinFuer('p-1', 'geburtsdatum', { datum }, KONFIDENZ_VORGABE)
    expect(ein).toEqual({ subjektTyp: 'person', subjektId: 'p-1', praedikat: 'geburtsdatum', datum, konfidenz: KONFIDENZ_VORGABE })
    expect(aussageAnlegenEinSchema.safeParse(ein).success).toBe(true)
  })

  it('die eben angelegte Aussage dient als Lesestand für Folgeänderungen, bevor das Lesemodell nachlädt', () => {
    const datum = datumswertAusText('1901', 'gregorian')
    if (datum === null) throw new Error('Datum erwartet')
    const angelegt = aussageAusAngelegt('a-neu', aussageAnlegenEinFuer('p-1', 'geburtsdatum', { datum }, 2))
    const zweites = datumswertAusText('1902', 'gregorian')
    if (zweites === null) throw new Error('Datum erwartet')
    expect(aussageAendernEinAus(angelegt, datumAenderung(angelegt, zweites))).toMatchObject({ id: 'a-neu', datum: zweites, konfidenz: 2, feld: 'datum' })
  })

  it('„als Angabe übernehmen" (D3): Datum des Ereignisses bzw. Ortsverweis als neue Aussage', () => {
    const datum = uebernahmeAusEreignis(
      'p-1',
      lebensdatum({
        angabe: 'geburtsdatum',
        herkunft: 'ereignis',
        ereignis_id: 'e-1',
        datum: { kalender: 'gregorian', modifikator: 'etwa', praezision: 'jahr', wert1: '1890', wert2: null, originaltext: 'um 1890', sortVon: 1, sortBis: 2 },
      }),
    )
    expect(datum).toEqual({
      subjektTyp: 'person',
      subjektId: 'p-1',
      praedikat: 'geburtsdatum',
      datum: { kalender: 'gregorian', modifikator: 'etwa', praezision: 'jahr', wert1: '1890', original_text: 'um 1890' },
      konfidenz: KONFIDENZ_VORGABE,
    })
    expect(aussageAnlegenEinSchema.safeParse(datum).success).toBe(true)

    const ort = uebernahmeAusEreignis('p-1', lebensdatum({ angabe: 'todesort', herkunft: 'ereignis', ereignis_id: 'e-2', ort_id: 'o-1', ort_name: 'Danzig' }))
    expect(ort).toEqual({ subjektTyp: 'person', subjektId: 'p-1', praedikat: 'todesort', wertRefId: 'o-1', konfidenz: KONFIDENZ_VORGABE })
  })

  it('Ereignis nur mit Originaltext: als Text übernommen; ohne übernehmbaren Wert: null', () => {
    expect(uebernahmeAusEreignis('p-1', lebensdatum({ angabe: 'todesdatum', herkunft: 'ereignis', ereignis_id: 'e-1', datum_originaltext: 'Mariä Lichtmess' }))).toMatchObject({
      wertText: 'Mariä Lichtmess',
    })
    expect(uebernahmeAusEreignis('p-1', lebensdatum({ angabe: 'todesort', herkunft: 'ereignis', ereignis_id: 'e-1' }))).toBeNull()
  })
})
