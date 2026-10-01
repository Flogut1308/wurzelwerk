// AP-1.30 PR 13a (docs/80 §33 V-130-13-*): reine Kernfunktionen für Lebensstationen und Zeitspur.
// Achse im Standardfall: Geburt 1900, Tod 1980, Jahrespräzision (81 Jahre). Intervalle entstehen über
// `parse`/`sortIntervall` des Datumskerns, damit sie so aussehen wie die echten Daten.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { parse } from '../../src/core/datum/parser'
import { sortIntervall } from '../../src/core/datum/sortierschluessel'
import { SENTINEL_JDN_MAX, SENTINEL_JDN_MIN, type Modifikator } from '../../src/core/datum/typen'
import { EXISTENZ_PRAEDIKAT } from '../../src/core/person/praedikate'
import {
  istStationsPraedikat,
  lebensachse,
  stationenOrdnen,
  zeitspur,
  type Lebensachse,
  type ZeitIntervall,
} from '../../src/core/person/stationen'

function iv(text: string): ZeitIntervall {
  const e = parse(text)
  if (!e.ok) {
    throw new Error(`Testdatum nicht parsbar: ${text}`)
  }
  return { sortVon: e.wert.sortVon, sortBis: e.wert.sortBis, modifikator: e.wert.modifikator }
}

function vonBis(jahrVon: number, jahrBis: number): ZeitIntervall {
  const s = sortIntervall({ kalender: 'gregorian', modifikator: 'von_bis', praezision: 'jahr', datum: { jahr: jahrVon }, zweitesDatum: { jahr: jahrBis } })
  return { ...s, modifikator: 'von_bis' }
}

function achseStandard(): Lebensachse {
  const a = lebensachse({ geburt: iv('1900'), tod: iv('1980'), stationen: [] })
  if (a === null) {
    throw new Error('Achse erwartet')
  }
  return a
}

describe('zeitspur', () => {
  const achse = (): Lebensachse => achseStandard()

  it('1: ein Tag ist ein Punkt in der Mitte', () => {
    const s = zeitspur(iv('01.06.1940'), achse())
    expect(s.anfang).toBe(s.ende)
    expect(s.anfang).toBeCloseTo(0.49, 1)
    expect(s.unscharf).toBe(false)
  })

  it('2: ein Jahr hat die Breite eines Achsenjahres', () => {
    const s = zeitspur(iv('1940'), achse())
    expect(s.ende - s.anfang).toBeCloseTo(1 / 81, 3)
  })

  it('3: von_bis liefert die Dauer', () => {
    const s = zeitspur(vonBis(1920, 1958), achse())
    expect(s.anfang).toBeCloseTo(20 / 81, 3)
    expect(s.ende).toBeCloseTo(59 / 81, 3)
  })

  it('4: zwischen ist unscharf', () => {
    const s = zeitspur(iv('zwischen 1920 und 1958'), achse())
    expect(s.unscharf).toBe(true)
    expect(s.anfang).toBeCloseTo(20 / 81, 3)
    expect(s.ende).toBeCloseTo(59 / 81, 3)
  })

  it('5: etwa ist unscharf, Spanne gleich der exakten', () => {
    const e = zeitspur(iv('etwa 1890'), achse())
    expect(e.unscharf).toBe(true)
    const gleichExakt = zeitspur({ ...iv('1890'), modifikator: 'exakt' }, achse())
    expect(e.anfang).toBe(gleichExakt.anfang)
    expect(e.ende).toBe(gleichExakt.ende)
  })

  it('6: vor 1930 ist offen am Anfang und beginnt bei 0', () => {
    const s = zeitspur(iv('vor 1930'), achse())
    expect(s.offenAnfang).toBe(true)
    expect(s.offenEnde).toBe(false)
    expect(s.anfang).toBe(0)
    expect(s.ende).toBeCloseTo(30 / 81, 2)
  })

  it('7: nach 1950 ist offen am Ende und reicht bis 1', () => {
    const s = zeitspur(iv('nach 1950'), achse())
    expect(s.offenEnde).toBe(true)
    expect(s.offenAnfang).toBe(false)
    expect(s.ende).toBe(1)
    expect(s.anfang).toBeCloseTo(51 / 81, 2)
  })

  it('8: ein Ereignis nach dem Tod ist ein Punkt am rechten Rand', () => {
    const s = zeitspur(iv('1981'), achse())
    expect(s.anfang).toBe(1)
    expect(s.ende).toBe(1)
    expect(s.endetNachAchse).toBe(true)
    expect(s.beginntVorAchse).toBe(false)
  })

  it('9: ein Zeitraum über den Anfang wird geklemmt und markiert', () => {
    const s = zeitspur(vonBis(1895, 1905), achse())
    expect(s.anfang).toBe(0)
    expect(s.beginntVorAchse).toBe(true)
    expect(s.endetNachAchse).toBe(false)
    expect(s.ende).toBeCloseTo(6 / 81, 2)
  })

  it('9b: ganz vor der Achse ist ein Punkt am linken Rand', () => {
    const s = zeitspur(iv('1850'), achse())
    expect(s.anfang).toBe(0)
    expect(s.ende).toBe(0)
    expect(s.beginntVorAchse).toBe(true)
  })
})

describe('lebensachse', () => {
  it('10: Geburt bis Tod', () => {
    const a = lebensachse({ geburt: iv('1900'), tod: iv('1980'), stationen: [iv('1940')] })
    expect(a).not.toBeNull()
    expect(a?.grenzeVon).toBe('geburt')
    expect(a?.grenzeBis).toBe('tod')
    expect(a?.von).toBe(iv('1900').sortVon)
    expect(a?.bis).toBe(iv('1980').sortBis)
  })

  it('11: ohne Tod zählt das Maximum der Stationen', () => {
    const a = lebensachse({ geburt: iv('1900'), tod: null, stationen: [iv('1940'), iv('1960'), null] })
    expect(a?.grenzeBis).toBe('stationen')
    expect(a?.grenzeVon).toBe('geburt')
    expect(a?.bis).toBe(iv('1960').sortBis)
  })

  it('12: ohne Geburt zählt das Minimum der Stationen', () => {
    const a = lebensachse({ geburt: null, tod: iv('1980'), stationen: [iv('1940'), iv('1920')] })
    expect(a?.grenzeVon).toBe('stationen')
    expect(a?.grenzeBis).toBe('tod')
    expect(a?.von).toBe(iv('1920').sortVon)
  })

  it('13: Geburt "vor 1900" ankert am Ende des Intervalls', () => {
    const g = iv('vor 1900')
    const a = lebensachse({ geburt: g, tod: iv('1980'), stationen: [] })
    expect(a?.von).toBe(g.sortBis)
    expect(a?.von).toBeGreaterThan(SENTINEL_JDN_MIN)
  })

  it('14: Tod "nach 1950" ankert am Anfang des Intervalls', () => {
    const t = iv('nach 1950')
    const a = lebensachse({ geburt: iv('1900'), tod: t, stationen: [] })
    expect(a?.bis).toBe(t.sortVon)
    expect(a?.bis).toBeLessThan(SENTINEL_JDN_MAX)
  })

  it('15: ein einziger Zeitpunkt ergibt keine Achse', () => {
    expect(lebensachse({ geburt: null, tod: null, stationen: [iv('01.06.1940')] })).toBeNull()
    expect(lebensachse({ geburt: null, tod: null, stationen: [] })).toBeNull()
    expect(lebensachse({ geburt: iv('01.06.1940'), tod: null, stationen: [] })).toBeNull()
  })

  it('16: Tod vor Geburt ergibt keine Achse', () => {
    expect(lebensachse({ geburt: iv('1950'), tod: iv('1900'), stationen: [] })).toBeNull()
  })

  it('17: undatierte Stationen beeinflussen die Achse nicht und stehen in der Ordnung zuletzt', () => {
    const mit = lebensachse({ geburt: iv('1900'), tod: null, stationen: [iv('1950'), null, null] })
    const ohne = lebensachse({ geburt: iv('1900'), tod: null, stationen: [iv('1950')] })
    expect(mit).toEqual(ohne)
    const geordnet = stationenOrdnen([
      { id: 'a', quelle: 'ereignis' as const, intervall: null },
      { id: 'b', quelle: 'ereignis' as const, intervall: iv('1950') },
    ])
    expect(geordnet.map((s) => s.id)).toEqual(['b', 'a'])
  })
})

describe('stationenOrdnen', () => {
  type S = { readonly id: string; readonly quelle: 'ereignis' | 'aussage'; readonly intervall: ZeitIntervall | null }
  const mk = (id: string, quelle: S['quelle'], intervall: ZeitIntervall | null): S => ({ id, quelle, intervall })

  it('18: Anker, dann sortBis, dann Ereignis vor Aussage, dann id; bei vor zählt sortBis', () => {
    const jahr = iv('1940')
    const spanne = vonBis(1940, 1945)
    const geordnet = stationenOrdnen([
      mk('9', 'aussage', jahr),
      mk('3', 'ereignis', jahr),
      mk('2', 'ereignis', jahr),
      mk('s', 'ereignis', spanne),
      mk('v', 'ereignis', iv('vor 1930')),
      mk('u2', 'aussage', null),
      mk('u1', 'ereignis', null),
    ])
    // vor 1930 ankert am Ende 1929 und steht damit vor 1940, nicht an der Sentinel-Stelle.
    expect(geordnet.map((s) => s.id)).toEqual(['v', '2', '3', '9', 's', 'u1', 'u2'])
  })

  it('18b: vor 1930 liegt hinter 1920, vor 1940', () => {
    const geordnet = stationenOrdnen([
      mk('c', 'ereignis', iv('1940')),
      mk('b', 'ereignis', iv('vor 1930')),
      mk('a', 'ereignis', iv('1920')),
    ])
    expect(geordnet.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('Invarianten der Spur', () => {
  const modifikatoren: readonly Modifikator[] = ['exakt', 'etwa', 'vor', 'nach', 'zwischen', 'von_bis', 'geschaetzt', 'berechnet']
  const jdn = fc.oneof(
    fc.integer({ min: SENTINEL_JDN_MIN, max: SENTINEL_JDN_MAX }),
    fc.constantFrom(SENTINEL_JDN_MIN, SENTINEL_JDN_MAX),
  )
  const intervall = fc
    .tuple(jdn, jdn, fc.constantFrom(...modifikatoren))
    .map(([a, b, modifikator]): ZeitIntervall => ({ sortVon: Math.min(a, b), sortBis: Math.max(a, b), modifikator }))
  const achseGen = fc
    .tuple(jdn, jdn)
    .filter(([a, b]) => a !== b)
    .map(([a, b]): Lebensachse => ({ von: Math.min(a, b), bis: Math.max(a, b), grenzeVon: 'stationen', grenzeBis: 'stationen' }))

  it('19: 0 <= anfang <= ende <= 1, nie NaN oder Infinity', () => {
    fc.assert(
      fc.property(intervall, achseGen, (i, a) => {
        const s = zeitspur(i, a)
        expect(Number.isFinite(s.anfang)).toBe(true)
        expect(Number.isFinite(s.ende)).toBe(true)
        expect(s.anfang).toBeGreaterThanOrEqual(0)
        expect(s.anfang).toBeLessThanOrEqual(s.ende)
        expect(s.ende).toBeLessThanOrEqual(1)
      }),
      { seed: 1300, numRuns: 500 },
    )
  })

  it('19b: lebensachse mit Sentinels bleibt endlich und von < bis', () => {
    fc.assert(
      fc.property(fc.option(intervall, { nil: null }), fc.option(intervall, { nil: null }), fc.array(fc.option(intervall, { nil: null }), { maxLength: 5 }), (geburt, tod, stationen) => {
        const a = lebensachse({ geburt, tod, stationen })
        if (a !== null) {
          expect(Number.isFinite(a.von)).toBe(true)
          expect(Number.isFinite(a.bis)).toBe(true)
          expect(a.von).toBeLessThan(a.bis)
        }
      }),
      { seed: 1300, numRuns: 500 },
    )
  })

  it('20: Eingaben bleiben unverändert, Ergebnisse sind deterministisch', () => {
    const eingabe = [
      { id: 'b', quelle: 'aussage' as const, intervall: iv('1940') },
      { id: 'a', quelle: 'ereignis' as const, intervall: iv('1920') },
    ]
    const kopie = JSON.parse(JSON.stringify(eingabe)) as unknown // Testkopie zum Vergleich, kein Vertragstyp
    const erste = stationenOrdnen(eingabe)
    const zweite = stationenOrdnen(eingabe)
    expect(eingabe).toEqual(kopie)
    expect(erste).toEqual(zweite)
    expect(erste).not.toBe(eingabe)
    const a = achseStandard()
    const i = iv('etwa 1930')
    const vorher = JSON.stringify(i)
    expect(zeitspur(i, a)).toEqual(zeitspur(i, a))
    expect(JSON.stringify(i)).toBe(vorher)
  })
})

describe('istStationsPraedikat', () => {
  it('21: Berufe, Wohnorte, Konfession und freie Prädikate sind Stationen; Lebensdaten nicht', () => {
    for (const p of ['beruf', 'wohnort', 'konfession', 'mein_freies_praedikat']) {
      expect(istStationsPraedikat(p)).toBe(true)
    }
    for (const p of ['geburtsdatum', 'geburtsort', 'todesdatum', 'todesort', 'kurzbeschreibung', EXISTENZ_PRAEDIKAT]) {
      expect(istStationsPraedikat(p)).toBe(false)
    }
  })
})
