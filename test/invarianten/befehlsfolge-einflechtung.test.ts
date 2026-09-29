// AP-1.30 PR 9c-b (docs/80 §33 V-130-9c-b) — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025).
// Nachweis zur KURZBESCHREIBUNGS-EINFLECHTUNG (`befehlsfolgeArbitrary()`, `_befehlsfolge-generator.ts`):
// die eingeflochtenen Kurzbeschreibungs-Aktionen verschieben den Zufallsstrom der übrigen Folge NICHT.
// Für genau die Seeds und Laufzahlen der Aufrufer (`undo-bitgleich`, `genau-ein-hauptname`,
// `kennung-nie-neu-vergeben`) ist jede erzeugte Folge ohne ihre `kurzbeschreibung`-Aktionen gleich der
// Folge der Fassung vor 9c-b (`mitKurzbeschreibung: false`). Damit gelten die gemessenen
// Deckungswerte der Hauptfolge (`MAIN_TREFFER`, ADR-009-Nachtrag) weiter für dieselben Befehlsfolgen;
// was sich ändern kann, sind nur Ziele, die eine Aktion aus `zustand.aussagen` wählt.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { befehlsfolgeArbitrary } from './_befehlsfolge-generator'

/** Seeds und Laufzahlen der Aufrufer von `befehlsfolgeArbitrary()` im Profil `bestand`. */
const AUFRUFER: readonly (readonly [string, number, number])[] = [
  ['undo-bitgleich', 20260910, 300],
  ['genau-ein-hauptname', 20260924, 300],
  ['kennung-nie-neu-vergeben', 20260924, 100],
]

/** Die Folgen, die `fc.assert` mit genau diesen Optionen erzeugt — über denselben Weg wie die Aufrufer
 * (`fc.property`, samt Bias je Lauf), nicht über `fc.sample`. */
function folgenWieImAufrufer<T>(arbitrary: fc.Arbitrary<T>, seed: number, numRuns: number): readonly T[] {
  const folgen: T[] = []
  fc.assert(
    fc.property(arbitrary, (folge) => {
      folgen.push(folge)
    }),
    { seed, numRuns },
  )
  return folgen
}

describe('Einflechtung der Kurzbeschreibung lässt die übrige Befehlsfolge unverändert', () => {
  it.each(AUFRUFER)('%s: ohne Kurzbeschreibungs-Aktionen dieselbe Folge wie vor der Einflechtung', (_name, seed, numRuns) => {
    const mit = folgenWieImAufrufer(befehlsfolgeArbitrary(), seed, numRuns)
    const ohne = folgenWieImAufrufer(befehlsfolgeArbitrary({ profil: 'bestand', mitKurzbeschreibung: false }), seed, numRuns)
    expect(mit).toHaveLength(numRuns)
    expect(mit.map((folge) => folge.filter((aktion) => aktion.art !== 'kurzbeschreibung'))).toEqual(ohne)
    // Gegenprobe: es wurde überhaupt etwas eingeflochten (sonst wäre die Gleichheit trivial).
    expect(mit.every((folge) => folge.some((aktion) => aktion.art === 'kurzbeschreibung'))).toBe(true)
  })
})
