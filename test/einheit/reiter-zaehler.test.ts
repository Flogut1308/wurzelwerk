// AP-1.30 PR 7a („Zähler am Reiter, keine Prozentwerte; ein Punkt heißt: dort liegt ein offener
// Punkt. Gesundheitsreiter trägt einen Zähler wie alle anderen — kein Schloss"): reine Kernfunktion
// `reiterZaehler` — „ein Reiter zählt, was er auflistet". Je Reiter die Zähldefinition und die
// Randfälle (Kind mit zwei Elternkanten = eine Person, Platzhalter zählen mit, Geschwister nicht,
// Punkt je Reiter). Die Belegzahl selbst (verschiedene Zitate, ohne Gesundheitsbelege) liefert das
// Lesemodell — geprüft in `abfrage-person-detail-reiter-zaehler.test.ts`.
import { describe, expect, it } from 'vitest'
import { REITER } from '../../src/core/person/reiter'
import { reiterZaehler, type ReiterZaehlerEingabe } from '../../src/core/person/reiter-zaehler'
import { lebenAnsicht } from '../../src/renderer/ansichten/profil/reiter-leben-logik'
import {
  reiterZaehlerEingabeAus,
  type PersonDetailAus,
  type PersonDetailAussage,
  type PersonDetailAussageDatum,
  type PersonDetailEreignis,
  type PersonDetailGrunddatenFeld,
} from '../../src/shared/schemata/person-detail'

const LEER: ReiterZaehlerEingabe = {
  namenAnzahl: 0,
  stationenAnzahl: 0,
  beziehungen: [],
  zitatAnzahl: 0,
  medienAnzahl: 0,
  diagnosenAnzahl: 0,
  risikofaktorenAnzahl: 0,
  offenePunkteReiter: [],
}

function mit(ueberschreibung: Partial<ReiterZaehlerEingabe>): ReiterZaehlerEingabe {
  return { ...LEER, ...ueberschreibung }
}

describe('reiterZaehler (AP-1.30 PR 7a)', () => {
  it('RZ1 liefert genau die acht Reiter', () => {
    expect(Object.keys(reiterZaehler(LEER)).sort()).toEqual([...REITER].sort())
  })

  // V-130-13-zaehler ersetzt den Zwischenstand V-130-7-zaehler: „Leben“ trägt seit PR 13d einen Zähler
  // (Stationszeilen) und ist deshalb nicht mehr in dieser Liste; die übrigen drei bleiben ohne Zähler.
  it('RZ2 Person, Notizen, Verwaltung tragen keinen Zähler — auch nicht 0', () => {
    const z = reiterZaehler(mit({ namenAnzahl: 3, stationenAnzahl: 4, zitatAnzahl: 2, diagnosenAnzahl: 1 }))
    for (const reiter of ['person', 'notizen', 'verwaltung'] as const) {
      expect(z[reiter].anzahl).toBeUndefined()
      expect('anzahl' in z[reiter]).toBe(false)
    }
  })

  it('RZ3 Namen: Anzahl der Namensformen, 0 ist ein Zähler', () => {
    expect(reiterZaehler(mit({ namenAnzahl: 3 })).namen.anzahl).toBe(3)
    expect(reiterZaehler(LEER).namen.anzahl).toBe(0)
  })

  it('RZ4 Beziehungen: verschiedene Personen über Eltern, Partner und Kinder', () => {
    const z = reiterZaehler(
      mit({
        beziehungen: [
          { personId: 'vater', richtung: 'elternteil' },
          { personId: 'mutter', richtung: 'elternteil' },
          { personId: 'partnerin', richtung: 'partner' },
          { personId: 'kind', richtung: 'kind' },
        ],
      }),
    )
    expect(z.beziehungen.anzahl).toBe(4)
  })

  it('RZ5 Beziehungen: ein Kind mit zwei Elternkanten (biologisch + adoptiv) ist eine Person', () => {
    const z = reiterZaehler(
      mit({
        beziehungen: [
          { personId: 'kind', richtung: 'kind' },
          { personId: 'kind', richtung: 'kind' },
        ],
      }),
    )
    expect(z.beziehungen.anzahl).toBe(1)
  })

  it('RZ6 Beziehungen: dieselbe Person in zwei Partnerschaften bzw. als Partner und Elternteil zählt einmal', () => {
    const z = reiterZaehler(
      mit({
        beziehungen: [
          { personId: 'p', richtung: 'partner' },
          { personId: 'p', richtung: 'partner' },
          { personId: 'p', richtung: 'elternteil' },
        ],
      }),
    )
    expect(z.beziehungen.anzahl).toBe(1)
  })

  it('RZ7 Beziehungen: Platzhalter zählen mit (sie sind Einträge der Liste)', () => {
    const z = reiterZaehler(mit({ beziehungen: [{ personId: 'platzhalter-mutter', richtung: 'elternteil' }] }))
    expect(z.beziehungen.anzahl).toBe(1)
  })

  it('RZ8 Beziehungen: Geschwister (abgeleitet) zählen nicht', () => {
    const z = reiterZaehler(
      mit({
        beziehungen: [
          { personId: 'vater', richtung: 'elternteil' },
          { personId: 'bruder', richtung: 'geschwister' },
          { personId: 'schwester', richtung: 'geschwister' },
        ],
      }),
    )
    expect(z.beziehungen.anzahl).toBe(1)
  })

  it('RZ9 Belege & Medien: Zitate + Medien (Medien = 0 bis AP-1.31)', () => {
    expect(reiterZaehler(mit({ zitatAnzahl: 4 })).belege_medien.anzahl).toBe(4)
    expect(reiterZaehler(mit({ zitatAnzahl: 4, medienAnzahl: 2 })).belege_medien.anzahl).toBe(6)
    expect(reiterZaehler(LEER).belege_medien.anzahl).toBe(0)
  })

  it('RZ10 Gesundheit: Diagnosen + Risikofaktoren, ein Zähler wie alle anderen (kein Schloss)', () => {
    expect(reiterZaehler(mit({ diagnosenAnzahl: 2, risikofaktorenAnzahl: 1 })).gesundheit.anzahl).toBe(3)
    expect(reiterZaehler(LEER).gesundheit.anzahl).toBe(0)
  })

  it('RZ11 Gesundheitsbestand verändert den Belege-Zähler nicht', () => {
    const ohne = reiterZaehler(mit({ zitatAnzahl: 2 }))
    const mitGesundheit = reiterZaehler(mit({ zitatAnzahl: 2, diagnosenAnzahl: 5, risikofaktorenAnzahl: 5 }))
    expect(mitGesundheit.belege_medien.anzahl).toBe(ohne.belege_medien.anzahl)
  })

  it('RZ12 Punkt: genau die Reiter, an denen ein offener Punkt liegt — mehrere Punkte, ein Punkt', () => {
    const z = reiterZaehler(mit({ offenePunkteReiter: ['beziehungen', 'person', 'beziehungen'] }))
    for (const reiter of REITER) {
      expect(z[reiter].offenerPunkt).toBe(reiter === 'person' || reiter === 'beziehungen')
    }
  })

  it('RZ13 Punkt auch an einem Reiter ohne Zähler (Notizen)', () => {
    const z = reiterZaehler(mit({ offenePunkteReiter: ['notizen'] }))
    expect(z.notizen).toEqual({ offenerPunkt: true })
  })

  it('RZ14 ohne offene Punkte trägt kein Reiter einen Punkt', () => {
    const z = reiterZaehler(LEER)
    for (const reiter of REITER) expect(z[reiter].offenerPunkt).toBe(false)
  })

  it('RZ15 verändert die Eingabe nicht und ist deterministisch', () => {
    const beziehungen = [
      { personId: 'a', richtung: 'kind' as const },
      { personId: 'a', richtung: 'kind' as const },
    ]
    const offenePunkteReiter = ['person' as const]
    const eingabe = mit({ beziehungen, offenePunkteReiter })
    const kopie = structuredClone(eingabe)
    expect(reiterZaehler(eingabe)).toEqual(reiterZaehler(eingabe))
    expect(eingabe).toEqual(kopie)
  })

  it('RZ16 Leben: Zahl der Stationszeilen, 0 ist ein Zähler (V-130-13-zaehler)', () => {
    expect(reiterZaehler(mit({ stationenAnzahl: 5 })).leben.anzahl).toBe(5)
    expect(reiterZaehler(LEER).leben.anzahl).toBe(0)
  })
})

// „Ein Reiter zählt, was er auflistet“: Zähler und Liste dürfen nicht auseinanderlaufen können.
describe('Leben = Stationszeilen (V-130-13-zaehler)', () => {
  const datum = (jahr: number): PersonDetailAussageDatum => ({
    modifikator: 'genau',
    wert1: String(jahr),
    wert2: null,
    sort_von: jahr * 365,
    sort_bis: jahr * 365,
  } as unknown as PersonDetailAussageDatum) // Testdaten: nur die gelesenen Felder zählen

  const aussage = (id: string, mitDatum: boolean): PersonDetailAussage =>
    ({ aussage_id: id, wert: 'x', konfidenz: null, datum: mitDatum ? datum(1920) : null, gueltig_von: null, gueltig_bis: null, belege: [] }) as unknown as PersonDetailAussage // Testdaten
  const feld = (praedikat: string, ...aussagen: PersonDetailAussage[]): PersonDetailGrunddatenFeld =>
    ({ praedikat, aussagen, hat_widerspruch: false }) as unknown as PersonDetailGrunddatenFeld // Testdaten
  const ereignis = (id: string, rolle: string, mitDatum: boolean): PersonDetailEreignis =>
    ({ beteiligung_id: id, rolle, datum: mitDatum ? datum(1900) : null, datum_wert1: null, konfidenz: null }) as unknown as PersonDetailEreignis // Testdaten

  const eingabe = {
    ereignisse: [ereignis('b1', 'verstorbener', true), ereignis('b2', 'pate', false), ereignis('b3', 'trauzeuge', true)],
    grunddaten: [
      feld('beruf', aussage('a1', true), aussage('a2', false)),
      feld('konfession', aussage('a3', false)),
      feld('geburtsdatum', aussage('a4', true)),
      feld('todesdatum', aussage('a5', true)),
      feld('geburtsort', aussage('a6', false)),
      feld('todesort', aussage('a7', false)),
      feld('kurzbeschreibung', aussage('a8', false)),
      feld('existenz', aussage('a9', false)),
      feld('wohnort'),
    ],
    lebensdaten: [],
  } as unknown as Pick<PersonDetailAus, 'ereignisse' | 'grunddaten' | 'lebensdaten'> // Testdaten

  const voll = (e: Pick<PersonDetailAus, 'ereignisse' | 'grunddaten' | 'lebensdaten'>): PersonDetailAus =>
    ({ ...e, namen: [], beziehungen: [], gesundheit: [], offene_punkte: [], belege_anzahl: 0 }) as unknown as PersonDetailAus // Testdaten: nur die gelesenen Felder

  it('RZ17 Zähler gleich Zahl der Stationszeilen — undatierte, Pate-Rolle und Stations-Aussagen zählen, Lebensdaten/Kurzbeschreibung/Existenz nicht', () => {
    const zeilen = lebenAnsicht(eingabe).stationen.length
    expect(zeilen).toBe(6) // 3 Beteiligungen + beruf (2) + konfession (1)
    const z = reiterZaehler(reiterZaehlerEingabeAus(voll(eingabe)))
    expect(z.leben.anzahl).toBe(zeilen)
  })

  it('RZ18 ohne Ereignisse und Stations-Aussagen: 0, wie die Liste', () => {
    const leer = { ereignisse: [], grunddaten: [feld('geburtsdatum', aussage('x', true))], lebensdaten: [] } as unknown as Pick<PersonDetailAus, 'ereignisse' | 'grunddaten' | 'lebensdaten'> // Testdaten
    expect(lebenAnsicht(leer).stationen.length).toBe(0)
    expect(reiterZaehler(reiterZaehlerEingabeAus(voll(leer))).leben.anzahl).toBe(0)
  })
})
