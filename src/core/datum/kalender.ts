// Reine ganzzahlige JDN-Arithmetik (AP-1.1). Proleptisch: der gregorianische Zweig wendet die
// 100/400-Schaltjahrregel auf JEDES Jahr an (auch vor 1582), der julianische Zweig wendet NUR
// die 4er-Regel an und bildet den historischen Sprung vom 4. auf den 15. Oktober 1582 NICHT
// nach — beide Kalender laufen durchgängig nach ihrer eigenen Regel, ohne Bruchstelle.
//
// Algorithmus: Richards (vorwärts, nachJdn) und die dazu passende Umkehrung nach Fliegel & Van
// Flandern (rückwärts, gregorianisch) bzw. deren julianisches Gegenstück (vonJdn) — das
// Standardverfahren der astronomischen Kalenderrechnung. Von Hand gegen bekannte Anker und
// Rundläufe geprüft, siehe test/einheit/datum-kalender.test.ts: 2000-01-01 gregorianisch =
// JDN 2451545; 1582-10-04 julianisch/1582-10-15 gregorianisch sind aufeinanderfolgende JDN
// (Kalenderreformsprung); 1700-02-18 julianisch = 1700-02-28 gregorianisch (Zehn-Tage-Versatz,
// gilt bis zum julianischen Schalttag 1700-02-29 — danach erst elf Tage Versatz).
//
// Kein new Date()/Date.now()/Math.random()/process/globalThis (CLAUDE.md §4).
import type { Kalender } from './typen'

/** Ganzzahlige Bodendivision — sicher für JDN-Größenordnungen (niedriger einstelliger Millionenbereich, weit unter Number.MAX_SAFE_INTEGER). */
function floorDiv(zaehler: number, nenner: number): number {
  return Math.floor(zaehler / nenner)
}

/**
 * Kalenderdatum -> julianische Tageszahl (JDN). `monat` wird als 1-12 erwartet, `tag` als
 * gültiger Kalendertag — diese Funktion ist reine Arithmetik und prüft das NICHT (das ist
 * Aufgabe von parser.ts über `tageImMonat`); außerhalb des Kalenders liegende Werte liefern
 * kein sinnvolles Ergebnis.
 */
export function nachJdn(jahr: number, monat: number, tag: number, kalender: Kalender): number {
  const a = floorDiv(14 - monat, 12)
  const y = jahr + 4800 - a
  const m = monat + 12 * a - 3
  const kernTag = tag + floorDiv(153 * m + 2, 5) + 365 * y + floorDiv(y, 4)

  switch (kalender) {
    case 'gregorian':
      return kernTag - floorDiv(y, 100) + floorDiv(y, 400) - 32045
    case 'julian':
      return kernTag - 32083
    case 'hebrew':
    case 'french_r':
      throw new Error(`nachJdn: Kalender '${kalender}' ist in AP-1.1 nicht implementiert.`)
  }
}

/** julianische Tageszahl (JDN) -> Kalenderdatum. Inverse von `nachJdn` für denselben Kalender. */
export function vonJdn(jdn: number, kalender: Kalender): { readonly jahr: number; readonly monat: number; readonly tag: number } {
  switch (kalender) {
    case 'gregorian':
      return vonJdnGregorianisch(jdn)
    case 'julian':
      return vonJdnJulianisch(jdn)
    case 'hebrew':
    case 'french_r':
      throw new Error(`vonJdn: Kalender '${kalender}' ist in AP-1.1 nicht implementiert.`)
  }
}

function vonJdnGregorianisch(jdn: number): { readonly jahr: number; readonly monat: number; readonly tag: number } {
  const p = jdn + 68569
  const q = floorDiv(4 * p, 146097)
  const r = p - floorDiv(146097 * q + 3, 4)
  const s = floorDiv(4000 * (r + 1), 1461001)
  const t = r - floorDiv(1461 * s, 4) + 31
  const u = floorDiv(80 * t, 2447)
  const v = floorDiv(u, 11)

  const tag = t - floorDiv(2447 * u, 80)
  const monat = u + 2 - 12 * v
  const jahr = 100 * (q - 49) + s + v
  return { jahr, monat, tag }
}

function vonJdnJulianisch(jdn: number): { readonly jahr: number; readonly monat: number; readonly tag: number } {
  const c = jdn + 32082
  const d = floorDiv(4 * c + 3, 1461)
  const e = c - floorDiv(1461 * d, 4)
  const m = floorDiv(5 * e + 2, 153)

  const tag = e - floorDiv(153 * m + 2, 5) + 1
  const monat = m + 3 - 12 * floorDiv(m, 10)
  const jahr = d - 4800 + floorDiv(m, 10)
  return { jahr, monat, tag }
}

/**
 * Anzahl der Tage in `monat` (1-12) von `jahr` im gegebenen Kalender — abgeleitet aus der
 * JDN-Differenz zum Folgemonat, damit Schaltjahrregeln nicht ein zweites Mal per Hand gepflegt
 * werden müssen. Erwartet einen bereits auf 1-12 geprüften `monat` (parser.ts prüft das vorher).
 */
export function tageImMonat(jahr: number, monat: number, kalender: Kalender): number {
  const naechsterMonatJahr = monat === 12 ? jahr + 1 : jahr
  const naechsterMonat = monat === 12 ? 1 : monat + 1
  return nachJdn(naechsterMonatJahr, naechsterMonat, 1, kalender) - nachJdn(jahr, monat, 1, kalender)
}
