// AP-1.2 PR-B — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025). Fachliche Invariante für das
// Umschrift-Modul (src/core/name/{umschrift,umschrift-tabellen}.ts, auf main gemergt). Dieser PR
// fügt AUSSCHLIESSLICH diese eine Datei hinzu — kein Produktivcode wird angefasst
// (dependency-cruiser/ESLint sind hier ohnehin nicht anwendbar, das Gate ist der separate
// `pruefpfad-pruefen`-Lauf im PR).
//
// Geprüfte Invariante (die Invariante, die ADR-014 begründet):
//  `iso9Zurueck(iso9(s)) === s.normalize('NFC')` für jede Zeichenkette `s`, die ausschließlich aus
//  den kyrillischen Zeichen der ISO9_TABELLE sowie Leer-/Trennzeichen besteht. `iso9()` bildet
//  1:1 auf Latein ab, `iso9Zurueck()` ist die Inverse derselben Tabelle (siehe Kommentar in
//  umschrift.ts) — für den durch diese Tabelle abgedeckten Zeichenvorrat muss der Rundlauf daher
//  verlustfrei sein. Die NFC-Normalisierung auf der rechten Seite spiegelt exakt das, was
//  `abbilden()` in umschrift.ts intern tut (CLAUDE.md §5: additive Tests, keine geratene
//  Toleranz).
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { iso9, iso9Zurueck } from '../../src/core/name/umschrift'
import { ISO9_TABELLE } from '../../src/core/name/umschrift-tabellen'

// Zeichenvorrat aus der Tabelle selbst abgeleitet (nicht neu abgetippt) — jedes kyrillische
// Zeichen, das ISO9_TABELLE als Schlüssel führt, plus Leer-/Trennzeichen, wie in der Aufgabe
// gefordert.
const KYRILLISCHE_ZEICHEN: readonly string[] = ISO9_TABELLE.map(([kyrillisch]) => kyrillisch)
const TRENNZEICHEN: readonly string[] = [' ', '-']
const ZEICHENVORRAT: readonly string[] = [...KYRILLISCHE_ZEICHEN, ...TRENNZEICHEN]

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
})
