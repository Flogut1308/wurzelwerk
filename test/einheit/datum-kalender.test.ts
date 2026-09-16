// AP-1.1 PR-A, test/einheit/datum-kalender.test.ts (CLAUDE.md §5 eiserne Regel: erst der Test).
// Reine ganzzahlige JDN-Arithmetik (src/core/datum/kalender.ts). Anker und Rundläufe von Hand
// gegen bekannte Referenzpunkte geprüft:
//  - 2000-01-01 gregorianisch = JDN 2451545 (Standardanker der astronomischen Kalenderrechnung).
//  - 1582-10-04 julianisch / 1582-10-15 gregorianisch sind aufeinanderfolgende JDN — das ist
//    exakt der historische Kalenderreformsprung (Papst Gregor XIII., der Julianische Zweig
//    bildet diesen Sprung bewusst NICHT nach, siehe CLAUDE.md-Auftrag).
//  - 1700-02-18 julianisch = 1700-02-28 gregorianisch: der Zehn-Tage-Versatz von 1582 gilt bis
//    zum julianischen Schalttag 1700-02-29 (den der gregorianische Kalender nicht kennt, da 1700
//    nicht durch 400 teilbar ist) — danach erst wächst der Versatz auf elf Tage
//    (1700-03-01 jul. = 1700-03-12 greg., ebenfalls unten geprüft).
import { describe, expect, it } from 'vitest'
import { nachJdn, vonJdn } from '../../src/core/datum/kalender'

describe('kalender (src/core/datum/kalender.ts, AP-1.1)', () => {
  it('JDN-Anker: 2000-01-01 gregorianisch = JDN 2451545', () => {
    expect(nachJdn(2000, 1, 1, 'gregorian')).toBe(2451545)
  })

  it('Kalenderreform: 1582-10-04 julianisch und 1582-10-15 gregorianisch sind aufeinanderfolgende Tage', () => {
    const julianischerJdn = nachJdn(1582, 10, 4, 'julian')
    const gregorianischerJdn = nachJdn(1582, 10, 15, 'gregorian')
    expect(gregorianischerJdn).toBe(julianischerJdn + 1)
  })

  it('julianischer Zweig bildet den 1582-Sprung NICHT nach: 1582-10-04 und 1582-10-05 sind dort aufeinanderfolgende Tage', () => {
    expect(nachJdn(1582, 10, 5, 'julian')).toBe(nachJdn(1582, 10, 4, 'julian') + 1)
  })

  it('1700-02-18 julianisch entspricht 1700-02-28 gregorianisch (Zehn-Tage-Versatz, gilt bis zum julianischen Schalttag 1700-02-29)', () => {
    expect(nachJdn(1700, 2, 18, 'julian')).toBe(nachJdn(1700, 2, 28, 'gregorian'))
  })

  it('1700-03-01 julianisch entspricht 1700-03-12 gregorianisch (Elf-Tage-Versatz ab dem julianischen Schalttag 1700-02-29)', () => {
    expect(nachJdn(1700, 3, 1, 'julian')).toBe(nachJdn(1700, 3, 12, 'gregorian'))
  })

  it('1999-12-19 julianisch entspricht 2000-01-01 gregorianisch (Dreizehn-Tage-Versatz im 20./21. Jahrhundert)', () => {
    expect(nachJdn(1999, 12, 19, 'julian')).toBe(nachJdn(2000, 1, 1, 'gregorian'))
  })

  it.each([
    { jahr: -4712, monat: 1, tag: 1 },
    { jahr: 1, monat: 1, tag: 1 },
    { jahr: 1582, monat: 10, tag: 15 },
    { jahr: 1700, monat: 2, tag: 28 },
    { jahr: 1900, monat: 2, tag: 28 },
    { jahr: 2000, monat: 2, tag: 29 },
    { jahr: 2024, monat: 12, tag: 31 },
    { jahr: 9999, monat: 12, tag: 31 },
  ])('gregorianischer Rundlauf: vonJdn(nachJdn($jahr-$monat-$tag)) = Eingabe', ({ jahr, monat, tag }) => {
    const jdn = nachJdn(jahr, monat, tag, 'gregorian')
    expect(vonJdn(jdn, 'gregorian')).toEqual({ jahr, monat, tag })
  })

  it.each([
    { jahr: -4712, monat: 1, tag: 1 },
    { jahr: 1, monat: 1, tag: 1 },
    { jahr: 1582, monat: 10, tag: 4 },
    { jahr: 1700, monat: 1, tag: 1 },
    { jahr: 1700, monat: 2, tag: 29 },
    { jahr: 1999, monat: 12, tag: 19 },
    { jahr: 2024, monat: 12, tag: 31 },
  ])('julianischer Rundlauf: vonJdn(nachJdn($jahr-$monat-$tag)) = Eingabe', ({ jahr, monat, tag }) => {
    const jdn = nachJdn(jahr, monat, tag, 'julian')
    expect(vonJdn(jdn, 'julian')).toEqual({ jahr, monat, tag })
  })

  it('vonJdn ist die Inverse von nachJdn auch quer über den gregorianischen Schalttag 2000-02-29', () => {
    const jdn = nachJdn(2000, 2, 29, 'gregorian')
    expect(vonJdn(jdn, 'gregorian')).toEqual({ jahr: 2000, monat: 2, tag: 29 })
    expect(vonJdn(jdn + 1, 'gregorian')).toEqual({ jahr: 2000, monat: 3, tag: 1 })
  })
})
