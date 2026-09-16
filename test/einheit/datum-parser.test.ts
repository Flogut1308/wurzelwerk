// AP-1.1 PR-A, test/einheit/datum-parser.test.ts (CLAUDE.md §5 eiserne Regel: erst der Test).
// Tabelle aus Positiv- und Negativfällen für parse() (src/core/datum/parser.ts) — wirft NIE,
// liefert immer ein ParseErgebnis. Ergänzt um eine Konsistenzprüfung, die die core-lokalen
// Literale aus src/core/datum/typen.ts gegen die Zod-Enums aus src/shared/schemata/gemeinsam.ts
// abgleicht (diese eine Prüfung darf core+shared importieren — sie ist Prüfmaterial, keine
// Produktionsgrenzverletzung: src/core selbst importiert nirgends aus src/shared).
import { describe, expect, it } from 'vitest'
import { parse } from '../../src/core/datum/parser'
import { SENTINEL_JDN_MAX, SENTINEL_JDN_MIN } from '../../src/core/datum/typen'
import type { Datumswert, Kalender, Modifikator, ParseGrund, Praezision } from '../../src/core/datum/typen'
import { DatumModifikatorEnum, DatumPraezisionEnum, KalenderEnum } from '../../src/shared/schemata/gemeinsam'

type FallOk = {
  readonly text: string
  readonly ok: true
  readonly erwartet: Omit<Datumswert, 'sortVon' | 'sortBis'>
}
type FallFehler = { readonly text: string; readonly ok: false; readonly grund: ParseGrund }
type Fall = FallOk | FallFehler

function tag(text: string, wert1: string): FallOk {
  return { text, ok: true, erwartet: { kalender: 'gregorian', modifikator: 'exakt', praezision: 'tag', wert1 } }
}

function monat(text: string, wert1: string): FallOk {
  return { text, ok: true, erwartet: { kalender: 'gregorian', modifikator: 'exakt', praezision: 'monat', wert1 } }
}

function jahr(text: string, wert1: string): FallOk {
  return { text, ok: true, erwartet: { kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', wert1 } }
}

function fehler(text: string, grund: ParseGrund): FallFehler {
  return { text, ok: false, grund }
}

const FAELLE: readonly Fall[] = [
  // A. Monatsname + Jahr (alle zwölf deutschen Monatsnamen).
  monat('Januar 1900', '1900-01'),
  monat('Februar 1901', '1901-02'),
  monat('März 1902', '1902-03'),
  monat('April 1903', '1903-04'),
  monat('Mai 1904', '1904-05'),
  monat('Juni 1905', '1905-06'),
  monat('Juli 1906', '1906-07'),
  monat('August 1907', '1907-08'),
  monat('September 1908', '1908-09'),
  monat('Oktober 1909', '1909-10'),
  monat('November 1910', '1910-11'),
  monat('Dezember 1911', '1911-12'),

  // B. D.M.YYYY, ein- und zweistellig.
  tag('14.3.1901', '1901-03-14'),
  tag('04.03.1901', '1901-03-04'),
  tag('1.1.1900', '1900-01-01'),
  tag('31.12.1999', '1999-12-31'),

  // C. Schalttage.
  tag('29.2.2000', '2000-02-29'),
  fehler('29.2.1900', 'ungueltiger_tag'),
  tag('29.2.1904', '1904-02-29'),
  fehler('29.2.2001', 'ungueltiger_tag'),

  // D. Ungültige Monatslängen.
  fehler('31.4.1900', 'ungueltiger_tag'),
  fehler('31.6.1900', 'ungueltiger_tag'),
  fehler('31.9.1900', 'ungueltiger_tag'),
  fehler('31.11.1900', 'ungueltiger_tag'),

  // E. Bloße Jahreszahl.
  jahr('1901', '1901'),
  jahr('1750', '1750'),
  jahr('2024', '2024'),

  // F. um/etwa.
  { text: 'um 1890', ok: true, erwartet: { kalender: 'gregorian', modifikator: 'etwa', praezision: 'jahr', wert1: '1890' } },
  { text: 'etwa 1890', ok: true, erwartet: { kalender: 'gregorian', modifikator: 'etwa', praezision: 'jahr', wert1: '1890' } },

  // G. vor.
  { text: 'vor 1750', ok: true, erwartet: { kalender: 'gregorian', modifikator: 'vor', praezision: 'jahr', wert1: '1750' } },
  { text: 'vor 1900', ok: true, erwartet: { kalender: 'gregorian', modifikator: 'vor', praezision: 'jahr', wert1: '1900' } },

  // H. nach.
  { text: 'nach 1812', ok: true, erwartet: { kalender: 'gregorian', modifikator: 'nach', praezision: 'jahr', wert1: '1812' } },
  { text: 'nach 2000', ok: true, erwartet: { kalender: 'gregorian', modifikator: 'nach', praezision: 'jahr', wert1: '2000' } },

  // I. zwischen.
  {
    text: 'zwischen 1750 und 1760',
    ok: true,
    erwartet: { kalender: 'gregorian', modifikator: 'zwischen', praezision: 'jahr', wert1: '1750', wert2: '1760' },
  },
  {
    text: 'zwischen 1600 und 1650',
    ok: true,
    erwartet: { kalender: 'gregorian', modifikator: 'zwischen', praezision: 'jahr', wert1: '1600', wert2: '1650' },
  },

  // J. Doppeljahr (Old/New-Style-Schreibweise, keine echte Doppeldatierung — kein zweitwert).
  {
    text: '1750/51',
    ok: true,
    erwartet: {
      kalender: 'gregorian',
      modifikator: 'exakt',
      praezision: 'jahr',
      wert1: '1750',
      doppeljahr: '1750/51',
      originaltext: '1750/51',
    },
  },
  {
    text: '1799/00',
    ok: true,
    erwartet: {
      kalender: 'gregorian',
      modifikator: 'exakt',
      praezision: 'jahr',
      wert1: '1799',
      doppeljahr: '1799/00',
      originaltext: '1799/00',
    },
  },

  // K. Enthält eine vierstellige Jahreszahl, sonst unbekannte Form -> Jahr übernehmen, NICHT auflösen.
  {
    text: 'Dom. III post Trinitatis 1750',
    ok: true,
    erwartet: {
      kalender: 'gregorian',
      modifikator: 'exakt',
      praezision: 'jahr',
      wert1: '1750',
      originaltext: 'Dom. III post Trinitatis 1750',
    },
  },
  {
    text: 'irgendwas 1888 Text',
    ok: true,
    erwartet: {
      kalender: 'gregorian',
      modifikator: 'exakt',
      praezision: 'jahr',
      wert1: '1888',
      originaltext: 'irgendwas 1888 Text',
    },
  },

  // L. ISO-Tagesform.
  tag('1901-03-14', '1901-03-14'),
  tag('2000-02-29', '2000-02-29'),

  // M. Leer.
  fehler('', 'leer'),
  fehler('   ', 'leer'),

  // N. Ungültiger Tag (echte Monatslänge inkl. Schaltjahr).
  fehler('31.02.1900', 'ungueltiger_tag'),
  fehler('30.02.1901', 'ungueltiger_tag'),
  fehler('31.04.1901', 'ungueltiger_tag'),
  fehler('00.03.1901', 'ungueltiger_tag'),

  // O. Ungültiger Monat.
  fehler('1901-13-01', 'ungueltiger_monat'),
  fehler('15.00.1901', 'ungueltiger_monat'),
  fehler('01.13.1900', 'ungueltiger_monat'),

  // P. Unbekanntes Format (keine vierstellige Jahreszahl enthalten).
  fehler('hello world', 'unbekanntes_format'),
  fehler('12', 'unbekanntes_format'),
  fehler('abc123', 'unbekanntes_format'),
]

describe('parse (src/core/datum/parser.ts, AP-1.1)', () => {
  it.each(FAELLE)('$text', (fall) => {
    const ergebnis = parse(fall.text)

    expect(ergebnis.ok).toBe(fall.ok)
    if (fall.ok && ergebnis.ok) {
      expect(ergebnis.wert).toMatchObject(fall.erwartet)
      expect(ergebnis.wert.sortVon).toBeLessThanOrEqual(ergebnis.wert.sortBis)
    } else if (!fall.ok && !ergebnis.ok) {
      expect(ergebnis.grund).toBe(fall.grund)
    }
  })

  it("'vor 1750': sortVon ist die untere Sentinel-Konstante (offenes Intervall)", () => {
    const ergebnis = parse('vor 1750')
    expect(ergebnis.ok).toBe(true)
    if (ergebnis.ok) {
      expect(ergebnis.wert.sortVon).toBe(SENTINEL_JDN_MIN)
    }
  })

  it("'nach 1812': sortBis ist die obere Sentinel-Konstante (offenes Intervall)", () => {
    const ergebnis = parse('nach 1812')
    expect(ergebnis.ok).toBe(true)
    if (ergebnis.ok) {
      expect(ergebnis.wert.sortBis).toBe(SENTINEL_JDN_MAX)
    }
  })

  it('parse() wirft nie, auch bei völlig unbrauchbarer Eingabe', () => {
    expect(() => parse('§§§ nicht parsbar €€€')).not.toThrow()
  })
})

describe('core-lokale Literale (src/core/datum/typen.ts) stimmen mit den Zod-Enums überein (src/shared/schemata/gemeinsam.ts)', () => {
  it('Kalender deckt sich vollständig mit KalenderEnum.options', () => {
    const alle: Record<Kalender, true> = { gregorian: true, julian: true, hebrew: true, french_r: true }
    expect(Object.keys(alle).sort()).toEqual([...KalenderEnum.options].sort())
  })

  it('Modifikator deckt sich vollständig mit DatumModifikatorEnum.options', () => {
    const alle: Record<Modifikator, true> = {
      exakt: true,
      etwa: true,
      vor: true,
      nach: true,
      zwischen: true,
      von_bis: true,
      geschaetzt: true,
      berechnet: true,
    }
    expect(Object.keys(alle).sort()).toEqual([...DatumModifikatorEnum.options].sort())
  })

  it('Praezision deckt sich vollständig mit DatumPraezisionEnum.options', () => {
    const alle: Record<Praezision, true> = { tag: true, monat: true, jahr: true, jahrzehnt: true }
    expect(Object.keys(alle).sort()).toEqual([...DatumPraezisionEnum.options].sort())
  })
})
