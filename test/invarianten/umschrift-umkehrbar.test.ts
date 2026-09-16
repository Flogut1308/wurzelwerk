// AP-1.2 PR-B — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025). Fachliche Invariante für das
// Umschrift-Modul (src/core/name/{umschrift,umschrift-tabellen}.ts, auf main gemergt). Dieser PR
// fügt AUSSCHLIESSLICH diese eine Datei hinzu — kein Produktivcode wird angefasst
// (dependency-cruiser/ESLint sind hier ohnehin nicht anwendbar, das Gate ist der separate
// `pruefpfad-pruefen`-Lauf im PR).
//
// Geprüfte Invariante (die Invariante, die ADR-014 begründet):
//  `iso9Zurueck(iso9(s)) === s.normalize('NFC')` für jede Zeichenkette `s`, die ausschließlich aus
//  den kyrillischen Zeichen der ISO9_TABELLE (sowohl präkomponiert als auch — für die vier
//  Zeichen mit kanonischer Zerlegung — DEKOMPONIERT) sowie Leer-/Trennzeichen besteht. `iso9()`
//  bildet 1:1 auf Latein ab, `iso9Zurueck()` ist die Inverse derselben Tabelle (siehe Kommentar in
//  umschrift.ts) — für den durch diese Tabelle abgedeckten Zeichenvorrat muss der Rundlauf daher
//  verlustfrei sein. Die NFC-Normalisierung auf der rechten Seite spiegelt exakt das, was
//  `abbilden()` in umschrift.ts intern tut (CLAUDE.md §5: additive Tests, keine geratene
//  Toleranz).
//
//  Adversarialer Nachtrag (Review zu PR #54): ein Generator, der nur präkomponierte
//  NFC-Einzelcodepoints erzeugt, übt die `.normalize('NFC')`-Klausel in `abbilden()` nie aus —
//  jede präkomponierte Eingabe ist bereits ihr eigenes NFC-Ergebnis, der Test wäre also auch ohne
//  die Normalisierung im Produktivcode grün. Der Zeichenvorrat nimmt darum zusätzlich die
//  DEKOMPONIERTEN Formen der vier Zeichen mit kanonischer Zerlegung auf (`й`, `ё`, `Й`, `Ё` —
//  Basisbuchstabe + kombinierendes diakritisches Zeichen, NFD-Form), damit der NFC-Pfad tatsächlich
//  geprüft wird.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { iso9, iso9Zurueck } from '../../src/core/name/umschrift'
import { ISO9_TABELLE } from '../../src/core/name/umschrift-tabellen'

// Zeichenvorrat aus der Tabelle selbst abgeleitet (nicht neu abgetippt) — jedes kyrillische
// Zeichen, das ISO9_TABELLE als Schlüssel führt, plus Leer-/Trennzeichen, wie in der Aufgabe
// gefordert.
const KYRILLISCHE_ZEICHEN: readonly string[] = ISO9_TABELLE.map(([kyrillisch]) => kyrillisch)
const TRENNZEICHEN: readonly string[] = [' ', '-']

// Dekomponierte (NFD-)Formen der vier ISO9_TABELLE-Zeichen mit kanonischer Zerlegung: jeweils
// Basisbuchstabe + kombinierendes diakritisches Zeichen. Erzeugt durch `.normalize('NFD')` auf den
// präkomponierten Zeichen aus der Tabelle — nicht von Hand als Codepoints abgetippt, damit hier
// nichts unbemerkt auseinanderläuft, falls sich die Tabelle je ändert.
const DEKOMPONIERT_KANDIDATEN: readonly string[] = ['й', 'ё', 'Й', 'Ё']
const DEKOMPONIERTE_ZEICHEN: readonly string[] = DEKOMPONIERT_KANDIDATEN.map((zeichen) => zeichen.normalize('NFD'))

// Selbstprüfung: jeder Kandidat muss tatsächlich aus mehr als einem Codepoint bestehen (sonst
// zerlegt `normalize('NFD')` nichts, und der Test würde die NFC-Klausel wieder nicht ausüben).
for (const [index, dekomponiert] of DEKOMPONIERTE_ZEICHEN.entries()) {
  if ([...dekomponiert].length < 2) {
    throw new Error(
      `DEKOMPONIERTE_ZEICHEN[${index}] ('${DEKOMPONIERT_KANDIDATEN[index] ?? '?'}') zerlegt nicht in mehrere Codepoints — Testannahme verletzt.`,
    )
  }
}

const ZEICHENVORRAT: readonly string[] = [...KYRILLISCHE_ZEICHEN, ...TRENNZEICHEN, ...DEKOMPONIERTE_ZEICHEN]

/** Zeichenkette aus dem obigen Zeichenvorrat, beliebig lang (inkl. leer). */
function kyrillischTextArbitrary(): fc.Arbitrary<string> {
  return fc.string({ unit: fc.constantFrom(...ZEICHENVORRAT), minLength: 0, maxLength: 40 })
}

describe('Invariante: ISO-9-Umschrift ist umkehrbar (AP-1.2, ADR-014)', () => {
  it('iso9Zurueck(iso9(s)) === s (nach NFC-Normalisierung) für jede Zeichenkette aus dem ISO-9-Zeichenvorrat', () => {
    fc.assert(
      fc.property(kyrillischTextArbitrary(), (s) => {
        const hin = iso9(s)
        const zurueck = iso9Zurueck(hin)
        expect(zurueck).toBe(s.normalize('NFC'))
      }),
      { seed: 20260916, numRuns: 500 },
    )
  })

  it('deckt den NFC-Normalisierungspfad deterministisch ab: dekomponierte Eingaben (й, ё, Й, Ё als NFD) rundlaufen bitgleich zur NFC-Form', () => {
    // Nicht dem Zufall überlassen (auch wenn der Generator oben die dekomponierten Zeichen längst
    // im Vorrat führt): dieser Test garantiert bei jedem Lauf, dass die `.normalize('NFC')`-Klausel
    // in `abbilden()` tatsächlich einen Unterschied macht — ohne sie wäre `zurueck` hier NICHT
    // gleich der präkomponierten Form.
    for (const dekomponiert of DEKOMPONIERTE_ZEICHEN) {
      const s = `${dekomponiert}ванов${dekomponiert}`
      const hin = iso9(s)
      const zurueck = iso9Zurueck(hin)
      expect(zurueck).toBe(s.normalize('NFC'))
      // Die Eingabe selbst ist NICHT bereits NFC (sonst würde der Test die Normalisierung nicht
      // prüfen) — Gegenprobe zur eigenen Testannahme.
      expect(s).not.toBe(s.normalize('NFC'))
    }
  })
})
