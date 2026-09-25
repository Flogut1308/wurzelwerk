// AP-1.30 PR 1 (V-D9-anzeige, docs/80 §32): Zeilenbildung der Grunddaten in der Profil-Lesesicht.
// Der Ereigniswert steht in der Zeile des Prädikats, NUR wenn keine führende Aussage existiert
// (Vorgabe a); Todesangaben aus Ereignissen nur bei „verstorben" (d); ein Ereignis nur mit
// Originaltext zeigt den Originaltext, gekennzeichnet (e); die Herkunft wird als Schlüssel
// „aus dem Ereignis Geburt/Tod" geliefert (f). Rein, ohne DOM/i18n.
import { describe, expect, it } from 'vitest'
import { grunddatenZeilen, type GrunddatenZeile } from '../../src/renderer/ansichten/profil/profil-lebensdaten-logik'
import type { PersonDetailGrunddatenFeld, PersonDetailLebensdatum } from '../../src/shared/schemata/person-detail'

function feld(praedikat: string, wert: string | null): PersonDetailGrunddatenFeld {
  return { praedikat, wert, konfidenz: 3, belegzahl: 0, hat_widerspruch: false, hatKonkurrierende: false, aussagen: [] }
}

function leer(angabe: PersonDetailLebensdatum['angabe']): PersonDetailLebensdatum {
  return { angabe, herkunft: null, aussage_id: null, ereignis_id: null, datum: null, datum_originaltext: null, ort_id: null, ort_name: null }
}

function lebensdaten(...eintraege: readonly PersonDetailLebensdatum[]): readonly PersonDetailLebensdatum[] {
  return (['geburtsdatum', 'geburtsort', 'todesdatum', 'todesort'] as const).map((angabe) => eintraege.find((e) => e.angabe === angabe) ?? leer(angabe))
}

const JAHR_1900 = { kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', wert1: '1900', wert2: null, originaltext: null, sortVon: 1, sortBis: 2 } as const

function praedikate(zeilen: readonly GrunddatenZeile[]): readonly string[] {
  return zeilen.map((zeile) => zeile.praedikat)
}

describe('grunddatenZeilen (V-D9-anzeige)', () => {
  it('PL1: eine führende Aussage bleibt unverändert, kein Ereigniswert zusätzlich', () => {
    const zeilen = grunddatenZeilen({
      grunddaten: [feld('geburtsdatum', '1901')],
      lebensdaten: lebensdaten({ ...leer('geburtsdatum'), herkunft: 'aussage', aussage_id: 'a1' }),
      lebendStatus: 'verstorben',
    })
    expect(zeilen).toHaveLength(1)
    expect(zeilen[0]).toMatchObject({ art: 'aussage', praedikat: 'geburtsdatum', wert: '1901' })
  })

  it('PL2: ohne Aussage steht der Ereigniswert in der Zeile des Prädikats, mit Herkunft Geburt', () => {
    const zeilen = grunddatenZeilen({
      grunddaten: [feld('beruf', 'Bergmann')],
      lebensdaten: lebensdaten(
        { ...leer('geburtsdatum'), herkunft: 'ereignis', ereignis_id: 'e1', datum: JAHR_1900 },
        { ...leer('geburtsort'), herkunft: 'ereignis', ereignis_id: 'e1', ort_id: 'o1', ort_name: 'Adorf' },
      ),
      lebendStatus: 'lebend',
    })
    expect(praedikate(zeilen)).toEqual(['beruf', 'geburtsdatum', 'geburtsort'])
    expect(zeilen[1]).toEqual({ art: 'ereignis', praedikat: 'geburtsdatum', herkunftSchluessel: 'herkunft_ereignis_geburt', wert: { art: 'datum', ergebnis: { schluessel: 'datum:jahr', werte: { jahr: '1900' } } } })
    expect(zeilen[2]).toEqual({ art: 'ereignis', praedikat: 'geburtsort', herkunftSchluessel: 'herkunft_ereignis_geburt', wert: { art: 'text', text: 'Adorf' } })
  })

  it('PL3 (d): Todesangaben aus Ereignissen nur bei „verstorben"', () => {
    const tod = lebensdaten(
      { ...leer('todesdatum'), herkunft: 'ereignis', ereignis_id: 'e2', datum: JAHR_1900 },
      { ...leer('todesort'), herkunft: 'ereignis', ereignis_id: 'e2', ort_id: 'o2', ort_name: 'Bdorf' },
    )
    expect(grunddatenZeilen({ grunddaten: [], lebensdaten: tod, lebendStatus: 'lebend' })).toEqual([])
    expect(grunddatenZeilen({ grunddaten: [], lebensdaten: tod, lebendStatus: 'vermutet_verstorben' })).toEqual([])
    expect(grunddatenZeilen({ grunddaten: [], lebensdaten: tod, lebendStatus: null })).toEqual([])
    const verstorben = grunddatenZeilen({ grunddaten: [], lebensdaten: tod, lebendStatus: 'verstorben' })
    expect(praedikate(verstorben)).toEqual(['todesdatum', 'todesort'])
    expect(verstorben.every((zeile) => zeile.art === 'ereignis' && zeile.herkunftSchluessel === 'herkunft_ereignis_tod')).toBe(true)
  })

  it('PL4 (e): ein Ereignis nur mit Originaltext zeigt den Originaltext, gekennzeichnet', () => {
    const zeilen = grunddatenZeilen({
      grunddaten: [],
      lebensdaten: lebensdaten({ ...leer('geburtsdatum'), herkunft: 'ereignis', ereignis_id: 'e1', datum_originaltext: 'um Martini 1812' }),
      lebendStatus: null,
    })
    expect(zeilen).toEqual([{ art: 'ereignis', praedikat: 'geburtsdatum', herkunftSchluessel: 'herkunft_ereignis_geburt', wert: { art: 'originaltext', text: 'um Martini 1812' } }])
  })

  it('PL5: ein Ereignis-Ort ohne Namen zeigt „unbekannt"', () => {
    const zeilen = grunddatenZeilen({
      grunddaten: [],
      lebensdaten: lebensdaten({ ...leer('geburtsort'), herkunft: 'ereignis', ereignis_id: 'e1', ort_id: 'o1' }),
      lebendStatus: null,
    })
    expect(zeilen[0]).toMatchObject({ art: 'ereignis', wert: { art: 'unbekannt' } })
  })

  it('PL6 (V-5-altbestand): eine Orts-Aussage ohne Ort führt nicht — Ereigniswert statt Zahl, ohne Ereignis kein Wert', () => {
    const mitEreignis = grunddatenZeilen({
      grunddaten: [feld('geburtsort', '5')],
      lebensdaten: lebensdaten({ ...leer('geburtsort'), herkunft: 'ereignis', ereignis_id: 'e1', ort_id: 'o1', ort_name: 'Adorf' }),
      lebendStatus: null,
    })
    expect(mitEreignis).toEqual([{ art: 'ereignis', praedikat: 'geburtsort', herkunftSchluessel: 'herkunft_ereignis_geburt', wert: { art: 'text', text: 'Adorf' } }])
    const ohneEreignis = grunddatenZeilen({ grunddaten: [feld('geburtsort', '5')], lebensdaten: lebensdaten(), lebendStatus: null })
    expect(ohneEreignis).toHaveLength(1)
    expect(ohneEreignis[0]).toMatchObject({ art: 'aussage', praedikat: 'geburtsort', wert: null })
  })

  it('PL7: existenz bleibt ausgeblendet, andere Prädikate unverändert in Prädikatreihenfolge', () => {
    const zeilen = grunddatenZeilen({
      grunddaten: [feld('beruf', 'Bergmann'), feld('existenz', null), feld('wohnort', 'Cdorf')],
      lebensdaten: lebensdaten({ ...leer('geburtsdatum'), herkunft: 'ereignis', ereignis_id: 'e1', datum: JAHR_1900 }),
      lebendStatus: null,
    })
    expect(praedikate(zeilen)).toEqual(['beruf', 'geburtsdatum', 'wohnort'])
    expect(zeilen[2]).toMatchObject({ art: 'aussage', wert: 'Cdorf' })
  })
})
