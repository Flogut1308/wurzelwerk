// AP-1.30 PR 11-0b (docs/80 §33 V-130-11-0b) — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025).
// Nachweis zur ÜBERNEHMEN-EINFLECHTUNG (`befehlsfolgeArbitrary({ …, mitUebernehmen: true })`,
// `_befehlsfolge-generator.ts`; Aktionen in `_befehlsfolge-uebernehmen.ts`): die eingeflochtenen
// `uebernehmen`-Aktionen verschieben den Zufallsstrom der übrigen Folge NICHT. Für Seed und Laufzahl der
// Aufrufer (`undo-bitgleich`, `namensteil-sortierindex-eindeutig`) ist jede erzeugte Folge ohne ihre
// `uebernehmen`-Aktionen gleich der Folge ohne die Option — also gleich der Hauptfolge samt aller bisherigen
// Einschübe (Datumswert, Kurzbeschreibung, Teilwechsel, Namensteile) vor dieser Erweiterung. Damit gelten die
// gemessenen Deckungswerte (ADR-009-Nachtrag) weiter für dieselben Befehlsfolgen; was sich ändern kann, ist
// nur, was eine Übernehmen-Aktion im Bestand hinterlässt (Teile, Formen, Hauptname, oberste Transaktion).
//
// GEGENPROBE: dieselben Einschübe als ERSTES Tupelelement gezogen verschieben den Strom — die Gleichheit hängt
// an der Reihenfolge der Ziehung, sie ist keine Eigenschaft jeder beliebigen Einflechtung.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { befehlsfolgeArbitrary, einflechtenVonHinten, uebernehmenEinschuebeArbitrary, type Aktion } from './_befehlsfolge-generator'

/** Seed, Laufzahl und Optionen der Aufrufer mit `mitUebernehmen: true` (s. dort). */
const AUFRUFER = [
  { name: 'undo-bitgleich', seed: 20260910, numRuns: 300, mitTeilWechsel: true },
  { name: 'namensteil-sortierindex-eindeutig', seed: 20260930, numRuns: 300, mitTeilWechsel: false },
] as const

/** Die Folgen, die `fc.assert` mit genau diesen Optionen erzeugt — über denselben Weg wie der Aufrufer
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

function ohneUebernehmen(folge: readonly Aktion[]): readonly Aktion[] {
  return folge.filter((aktion) => aktion.art !== 'uebernehmen')
}

describe('Einflechtung der Übernehmen-Aktionen lässt die übrige Befehlsfolge unverändert', () => {
  for (const aufrufer of AUFRUFER) {
    it(`${aufrufer.name}: ohne die Übernehmen-Aktionen dieselbe Folge wie ohne die Option`, () => {
      const basis = { profil: 'bestand', mitTeilWechsel: aufrufer.mitTeilWechsel, mitNamensteilen: true } as const
      const mit = folgenWieImAufrufer(befehlsfolgeArbitrary({ ...basis, mitUebernehmen: true }), aufrufer.seed, aufrufer.numRuns)
      const ohne = folgenWieImAufrufer(befehlsfolgeArbitrary(basis), aufrufer.seed, aufrufer.numRuns)
      expect(mit).toHaveLength(aufrufer.numRuns)
      expect(mit.map(ohneUebernehmen)).toEqual(ohne)
      // Gegenprobe: in jeder Folge wurde etwas eingeflochten (sonst wäre die Gleichheit trivial) …
      expect(mit.every((folge) => folge.filter((aktion) => aktion.art === 'uebernehmen').length >= 2)).toBe(true)
      // … und ohne die Option trägt keine Folge eine Übernehmen-Aktion.
      expect(ohne.some((folge) => folge.some((aktion) => aktion.art === 'uebernehmen'))).toBe(false)
    })
  }

  it('Gegenprobe: an ERSTER Stelle gezogen verschieben dieselben Einschübe die übrige Folge', () => {
    const [aufrufer] = AUFRUFER
    const basis = { profil: 'bestand', mitTeilWechsel: aufrufer.mitTeilWechsel, mitNamensteilen: true } as const
    const vorn = folgenWieImAufrufer(
      fc.tuple(uebernehmenEinschuebeArbitrary(), befehlsfolgeArbitrary(basis)).map(([einschuebe, folge]) => einflechtenVonHinten(folge, einschuebe)),
      aufrufer.seed,
      aufrufer.numRuns,
    )
    const ohne = folgenWieImAufrufer(befehlsfolgeArbitrary(basis), aufrufer.seed, aufrufer.numRuns)
    const abweichend = vorn.filter((folge, i) => JSON.stringify(ohneUebernehmen(folge)) !== JSON.stringify(ohne[i])).length
    expect(abweichend).toBeGreaterThan(aufrufer.numRuns / 2)
  })

  it('jeder Weg der Übernehmen-Aktionen kommt vor', () => {
    const [aufrufer] = AUFRUFER
    const mit = folgenWieImAufrufer(
      befehlsfolgeArbitrary({ profil: 'bestand', mitTeilWechsel: aufrufer.mitTeilWechsel, mitNamensteilen: true, mitUebernehmen: true }),
      aufrufer.seed,
      aufrufer.numRuns,
    )
    const wege = new Set(mit.flatMap((folge) => folge.flatMap((aktion) => (aktion.art === 'uebernehmen' ? [aktion.weg] : []))))
    expect([...wege].sort()).toEqual(
      [
        'ablehnungArt',
        'ablehnungFremd',
        'ablehnungKeinVorname',
        'ablehnungLeerraum',
        'ablehnungFlachBezug',
        'ablehnungUmschrift',
        'e3Grenzfall',
        'gemischt',
        'kopf',
        'leer',
        'neueForm',
        'noop',
        'originalTextNeu',
      ].sort(),
    )
  })
})
