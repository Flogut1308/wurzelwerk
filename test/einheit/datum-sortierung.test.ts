// AP-1.1 PR-A, test/einheit/datum-sortierung.test.ts (CLAUDE.md §5 eiserne Regel: erst der Test).
// sortIntervall() rechnet Präzision + Modifikator in ein JDN-Intervall um. Deckt die bindenden
// Umsetzungsentscheidungen ab: 'vor'/'nach' sind exklusiv und offen zur Sentinel-Konstante,
// 'jahrzehnt' spannt zehn Jahre, eine gemischte unscharfe Liste sortiert korrekt nach sortVon.
import { describe, expect, it } from 'vitest'
import { sortIntervall } from '../../src/core/datum/sortierschluessel'
import { SENTINEL_JDN_MAX, SENTINEL_JDN_MIN } from '../../src/core/datum/typen'

describe('sortIntervall (src/core/datum/sortierschluessel.ts, AP-1.1)', () => {
  it('exakter Tag: sortVon = sortBis (der Tag selbst)', () => {
    const ergebnis = sortIntervall({
      kalender: 'gregorian',
      modifikator: 'exakt',
      praezision: 'tag',
      datum: { jahr: 1901, monat: 3, tag: 14 },
    })
    expect(ergebnis.sortVon).toBe(ergebnis.sortBis)
  })

  it('Jahrespräzision: Spanne ist genau ein (nicht geschaltetes) Kalenderjahr', () => {
    const ergebnis = sortIntervall({
      kalender: 'gregorian',
      modifikator: 'exakt',
      praezision: 'jahr',
      datum: { jahr: 1901 },
    })
    expect(ergebnis.sortBis - ergebnis.sortVon).toBe(364)
  })

  it("'jahrzehnt' spannt zehn Jahre: Anfang = Jahresanfang, Ende = Jahresende (Jahr+9)", () => {
    const jahrzehnt = sortIntervall({
      kalender: 'gregorian',
      modifikator: 'exakt',
      praezision: 'jahrzehnt',
      datum: { jahr: 1750 },
    })
    const ersterTagDerDekade = sortIntervall({
      kalender: 'gregorian',
      modifikator: 'exakt',
      praezision: 'jahr',
      datum: { jahr: 1750 },
    })
    const letztesJahrDerDekade = sortIntervall({
      kalender: 'gregorian',
      modifikator: 'exakt',
      praezision: 'jahr',
      datum: { jahr: 1759 },
    })
    expect(jahrzehnt.sortVon).toBe(ersterTagDerDekade.sortVon)
    expect(jahrzehnt.sortBis).toBe(letztesJahrDerDekade.sortBis)
  })

  it("'vor 1750' ist exklusiv: sortBis ist der letzte Tag 1749, sortVon die untere Sentinel-Konstante", () => {
    const vor = sortIntervall({ kalender: 'gregorian', modifikator: 'vor', praezision: 'jahr', datum: { jahr: 1750 } })
    const jahr1749 = sortIntervall({ kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', datum: { jahr: 1749 } })
    expect(vor.sortBis).toBe(jahr1749.sortBis)
    expect(vor.sortVon).toBe(SENTINEL_JDN_MIN)
    expect(vor.sortVon).toBeLessThanOrEqual(vor.sortBis)
  })

  it("'nach 1812' ist exklusiv: sortVon ist der erste Tag 1813, sortBis die obere Sentinel-Konstante", () => {
    const nach = sortIntervall({ kalender: 'gregorian', modifikator: 'nach', praezision: 'jahr', datum: { jahr: 1812 } })
    const jahr1813 = sortIntervall({ kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', datum: { jahr: 1813 } })
    expect(nach.sortVon).toBe(jahr1813.sortVon)
    expect(nach.sortBis).toBe(SENTINEL_JDN_MAX)
    expect(nach.sortVon).toBeLessThanOrEqual(nach.sortBis)
  })

  it("'zwischen 1750 und 1760': sortVon = Jahresanfang 1750, sortBis = Jahresende 1760", () => {
    const zwischen = sortIntervall({
      kalender: 'gregorian',
      modifikator: 'zwischen',
      praezision: 'jahr',
      datum: { jahr: 1750 },
      zweitesDatum: { jahr: 1760 },
    })
    const anfang1750 = sortIntervall({ kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', datum: { jahr: 1750 } })
    const ende1760 = sortIntervall({ kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', datum: { jahr: 1760 } })
    expect(zwischen.sortVon).toBe(anfang1750.sortVon)
    expect(zwischen.sortBis).toBe(ende1760.sortBis)
  })

  it('"um 1890" (Modifikator etwa) spannt nur das Jahr 1890 — keine künstliche ±-Spanne', () => {
    const um = sortIntervall({ kalender: 'gregorian', modifikator: 'etwa', praezision: 'jahr', datum: { jahr: 1890 } })
    const jahr1890 = sortIntervall({ kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', datum: { jahr: 1890 } })
    expect(um).toEqual(jahr1890)
  })

  it('gemischte unscharfe Liste sortiert nach sortVon in die erwartete Reihenfolge', () => {
    const eintraege = [
      {
        name: 'nach-1812',
        ...sortIntervall({ kalender: 'gregorian', modifikator: 'nach', praezision: 'jahr', datum: { jahr: 1812 } }),
      },
      {
        name: 'vor-1750',
        ...sortIntervall({ kalender: 'gregorian', modifikator: 'vor', praezision: 'jahr', datum: { jahr: 1750 } }),
      },
      {
        name: 'exakt-1780',
        ...sortIntervall({ kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', datum: { jahr: 1780 } }),
      },
      {
        name: 'zwischen-1750-1760',
        ...sortIntervall({
          kalender: 'gregorian',
          modifikator: 'zwischen',
          praezision: 'jahr',
          datum: { jahr: 1750 },
          zweitesDatum: { jahr: 1760 },
        }),
      },
      {
        name: 'um-1800',
        ...sortIntervall({ kalender: 'gregorian', modifikator: 'etwa', praezision: 'jahr', datum: { jahr: 1800 } }),
      },
      {
        name: 'exakter-tag-1755-05-01',
        ...sortIntervall({
          kalender: 'gregorian',
          modifikator: 'exakt',
          praezision: 'tag',
          datum: { jahr: 1755, monat: 5, tag: 1 },
        }),
      },
    ]

    const sortiert = [...eintraege].sort((a, b) => a.sortVon - b.sortVon).map((eintrag) => eintrag.name)

    expect(sortiert).toEqual([
      'vor-1750',
      'zwischen-1750-1760',
      'exakter-tag-1755-05-01',
      'exakt-1780',
      'um-1800',
      'nach-1812',
    ])
  })

  it('garantiert sortVon <= sortBis für jede Präzisionsstufe', () => {
    const praezisionen = ['tag', 'monat', 'jahr', 'jahrzehnt'] as const
    for (const praezision of praezisionen) {
      const ergebnis = sortIntervall({
        kalender: 'gregorian',
        modifikator: 'exakt',
        praezision,
        datum: { jahr: 1850, monat: 6, tag: 15 },
      })
      expect(ergebnis.sortVon).toBeLessThanOrEqual(ergebnis.sortBis)
    }
  })

  it('julianischer Kalender wird bei der Intervallberechnung durchgereicht (kein stiller Wechsel zu gregorianisch)', () => {
    const gregorianisch = sortIntervall({ kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', datum: { jahr: 1700 } })
    const julianisch = sortIntervall({ kalender: 'julian', modifikator: 'exakt', praezision: 'jahr', datum: { jahr: 1700 } })
    expect(julianisch).not.toEqual(gregorianisch)
  })

  it("'nach 9999' bleibt gültig: sortVon wird an SENTINEL_JDN_MAX geklammert, sortVon <= sortBis", () => {
    const nach = sortIntervall({ kalender: 'gregorian', modifikator: 'nach', praezision: 'jahr', datum: { jahr: 9999 } })
    expect(nach.sortVon).toBeLessThanOrEqual(nach.sortBis)
    expect(nach.sortVon).toBe(SENTINEL_JDN_MAX)
  })

  it("defensiv: 'vor' am unteren Sentinel-Rand bleibt gültig, sortBis >= SENTINEL_JDN_MIN", () => {
    const vor = sortIntervall({ kalender: 'gregorian', modifikator: 'vor', praezision: 'jahr', datum: { jahr: -4712 } })
    expect(vor.sortBis).toBeGreaterThanOrEqual(SENTINEL_JDN_MIN)
    expect(vor.sortVon).toBeLessThanOrEqual(vor.sortBis)
  })
})
