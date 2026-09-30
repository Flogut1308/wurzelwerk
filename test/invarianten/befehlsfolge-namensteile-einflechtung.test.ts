// AP-1.30 PR 10b (docs/80 §33 V-130-10b) — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025).
// Nachweis zur NAMENSTEIL-EINFLECHTUNG (`befehlsfolgeArbitrary({ …, mitNamensteilen: true })`,
// `_befehlsfolge-generator.ts`; Aktionen in `_befehlsfolge-namensteile.ts`): die eingeflochtenen
// Namensteil-Aktionen verschieben den Zufallsstrom der übrigen Folge NICHT. Für Seed und Laufzahl der
// Aufrufer (`undo-bitgleich`, `namensteil-sortierindex-eindeutig`) ist jede erzeugte Folge ohne ihre
// `namensteile`-Aktionen gleich der Folge ohne die Option — also gleich der Hauptfolge samt Datumswert-,
// Kurzbeschreibungs- und Teilwechsel-Einschüben vor dieser Erweiterung. Damit gelten die gemessenen
// Deckungswerte (`MAIN_TREFFER`, ADR-009-Nachtrag) weiter für dieselben Befehlsfolgen; was sich ändern
// kann, ist nur, was eine Namensteil-Aktion im Bestand hinterlässt (Teile, Formen, oberste Transaktion).
//
// GEGENPROBE: dieselben Einschübe als ERSTES Tupelelement gezogen (vor der Hauptfolge) verschieben den
// Strom — dann weicht die Folge ohne die Einschübe von der ohne die Option ab. Die Gleichheit oben ist
// also keine Eigenschaft jeder beliebigen Einflechtung, sondern hängt an der Reihenfolge der Ziehung.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { befehlsfolgeArbitrary, einflechtenVonHinten, namensteileEinschuebeArbitrary, type Aktion } from './_befehlsfolge-generator'

/** Seed und Laufzahl der Aufrufer mit `mitNamensteilen: true` (s. dort). */
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

function ohneNamensteile(folge: readonly Aktion[]): readonly Aktion[] {
  return folge.filter((aktion) => aktion.art !== 'namensteile')
}

describe('Einflechtung der Namensteil-Aktionen lässt die übrige Befehlsfolge unverändert', () => {
  for (const aufrufer of AUFRUFER) {
    it(`${aufrufer.name}: ohne die Namensteil-Aktionen dieselbe Folge wie ohne die Option`, () => {
      const basis = { profil: 'bestand', mitTeilWechsel: aufrufer.mitTeilWechsel } as const
      const mit = folgenWieImAufrufer(befehlsfolgeArbitrary({ ...basis, mitNamensteilen: true }), aufrufer.seed, aufrufer.numRuns)
      const ohne = folgenWieImAufrufer(befehlsfolgeArbitrary(basis), aufrufer.seed, aufrufer.numRuns)
      expect(mit).toHaveLength(aufrufer.numRuns)
      expect(mit.map(ohneNamensteile)).toEqual(ohne)
      // Gegenprobe: in jeder Folge wurde etwas eingeflochten (sonst wäre die Gleichheit trivial) …
      expect(mit.every((folge) => folge.filter((aktion) => aktion.art === 'namensteile').length >= 3)).toBe(true)
      // … und ohne die Option trägt keine Folge eine Namensteil-Aktion.
      expect(ohne.some((folge) => folge.some((aktion) => aktion.art === 'namensteile'))).toBe(false)
    })
  }

  it('Gegenprobe: an ERSTER Stelle gezogen verschieben dieselben Einschübe die Hauptfolge', () => {
    const [aufrufer] = AUFRUFER
    const basis = { profil: 'bestand', mitTeilWechsel: aufrufer.mitTeilWechsel } as const
    const vorn = folgenWieImAufrufer(
      fc.tuple(namensteileEinschuebeArbitrary(), befehlsfolgeArbitrary(basis)).map(([einschuebe, folge]) => einflechtenVonHinten(folge, einschuebe)),
      aufrufer.seed,
      aufrufer.numRuns,
    )
    const ohne = folgenWieImAufrufer(befehlsfolgeArbitrary(basis), aufrufer.seed, aufrufer.numRuns)
    const abweichend = vorn.filter((folge, i) => JSON.stringify(ohneNamensteile(folge)) !== JSON.stringify(ohne[i])).length
    expect(abweichend).toBeGreaterThan(aufrufer.numRuns / 2)
  })

  it('jeder Weg der Namensteil-Aktionen kommt vor', () => {
    const [aufrufer] = AUFRUFER
    const mit = folgenWieImAufrufer(
      befehlsfolgeArbitrary({ profil: 'bestand', mitTeilWechsel: aufrufer.mitTeilWechsel, mitNamensteilen: true }),
      aufrufer.seed,
      aufrufer.numRuns,
    )
    const wege = new Set(mit.flatMap((folge) => folge.flatMap((aktion) => (aktion.art === 'namensteile' ? [aktion.weg] : []))))
    expect([...wege].sort()).toEqual(
      [
        'ablehnungFremdeForm',
        'ablehnungKeinVorname',
        'ablehnungLeer',
        'ablehnungLeerraum',
        'ablehnungPosition',
        'formAendern',
        'formAnlegen',
        'rufnameSetzen',
        'teilAendern',
        'teilAnlegen',
        'teilLoeschen',
        'teilVerschieben',
      ].sort(),
    )
  })
})
