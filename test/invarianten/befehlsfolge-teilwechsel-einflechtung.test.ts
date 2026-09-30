// AP-1.30 PR 10a-b (docs/80 §33 V-130-10a-verdichtet) — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025).
// Nachweis zur TEILWECHSEL-EINFLECHTUNG (`befehlsfolgeArbitrary({ …, mitTeilWechsel: true })`,
// `_befehlsfolge-generator.ts`; Serienvariante `teilWechselSerieArbitrary()` in
// `_befehlsfolge-koaleszenz.ts`): die eingeflochtenen Teilwechsel-Serien verschieben den Zufallsstrom
// der übrigen Folge NICHT. Für Seed und Laufzahl von `undo-bitgleich` (dem einzigen Aufrufer mit
// `mitTeilWechsel: true`) ist jede erzeugte Folge ohne ihre Teilwechsel-Serien gleich der Folge ohne
// die Option — also gleich der Hauptfolge samt Datumswert- und Kurzbeschreibungs-Einschüben vor
// dieser Erweiterung. Damit gelten die gemessenen Deckungswerte (`MAIN_TREFFER`, ADR-009-Nachtrag)
// weiter für dieselben Befehlsfolgen; was sich ändern kann, sind nur Inhalte der Namen, die eine
// Teilwechsel-Serie ändert.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { befehlsfolgeArbitrary } from './_befehlsfolge-generator'

/** Seed und Laufzahl von `undo-bitgleich.test.ts`. */
const SEED = 20260910
const NUM_RUNS = 300

/** Die Folgen, die `fc.assert` mit genau diesen Optionen erzeugt — über denselben Weg wie der Aufrufer
 * (`fc.property`, samt Bias je Lauf), nicht über `fc.sample`. */
function folgenWieImAufrufer<T>(arbitrary: fc.Arbitrary<T>): readonly T[] {
  const folgen: T[] = []
  fc.assert(
    fc.property(arbitrary, (folge) => {
      folgen.push(folge)
    }),
    { seed: SEED, numRuns: NUM_RUNS },
  )
  return folgen
}

function wortzahl(wert: string): number {
  return wert === '' ? 0 : wert.split(' ').length
}

describe('Einflechtung der Teilwechsel-Serien lässt die übrige Befehlsfolge unverändert', () => {
  const mit = folgenWieImAufrufer(befehlsfolgeArbitrary({ profil: 'bestand', mitTeilWechsel: true }))
  const ohne = folgenWieImAufrufer(befehlsfolgeArbitrary())

  it('undo-bitgleich: ohne Teilwechsel-Serien dieselbe Folge wie ohne die Option', () => {
    expect(mit).toHaveLength(NUM_RUNS)
    expect(mit.map((folge) => folge.filter((aktion) => !(aktion.art === 'serie' && aktion.variante === 'teilWechsel')))).toEqual(ohne)
    // Gegenprobe: in jeder Folge wurde etwas eingeflochten (sonst wäre die Gleichheit trivial) …
    expect(mit.every((folge) => folge.some((aktion) => aktion.art === 'serie' && aktion.variante === 'teilWechsel'))).toBe(true)
    // … und ohne die Option trägt keine Serie die Marke.
    expect(ohne.some((folge) => folge.some((aktion) => aktion.art === 'serie' && aktion.variante !== undefined))).toBe(false)
  })

  it('jede Teilwechsel-Serie ändert die Vornamen mit steigender und wieder fallender Wortzahl', () => {
    const serien = mit.flatMap((folge) => folge.flatMap((aktion) => (aktion.art === 'serie' && aktion.variante === 'teilWechsel' ? [aktion] : [])))
    expect(serien.length).toBeGreaterThanOrEqual(NUM_RUNS)
    for (const serie of serien) {
      expect(serie.befehl).toBe('nameAendern')
      expect(serie.feldPassend.every((passend) => passend)).toBe(true)
      expect(serie.werte.length).toBeGreaterThanOrEqual(3)
      expect(serie.abstaendeMs).toHaveLength(serie.werte.length - 1)
      const [erste = '', zweite = '', dritte = ''] = serie.werte
      expect(wortzahl(erste)).toBeGreaterThanOrEqual(1)
      expect(wortzahl(zweite)).toBeGreaterThan(wortzahl(erste))
      expect(wortzahl(dritte)).toBe(wortzahl(erste))
    }
  })
})
