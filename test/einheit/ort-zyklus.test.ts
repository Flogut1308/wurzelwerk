// AP-1.16 PR-A — Einheitentest der reinen Zyklusfreiheits-Funktion für die Ort-Hierarchie
// (CLAUDE.md §5: reine Logik → test/einheit). Muster/Tabelle identisch zu
// `test/einheit/zyklus.test.ts` (Elternschaftsgraph), hier für `src/core/ort/zyklus.ts`.
//
// Richtungserinnerung (s. Modul-Kommentar in `zyklus.ts`): `Ortskante.ortId` ist der
// Untergeordnete, `Ortskante.uebergeordnetId` der Übergeordnete ("ortId gehört zu
// uebergeordnetId"). Ein Zyklus im gerichteten Graphen "gehört zu" bedeutet: ein Ort wäre sein
// eigener (Ur-…)Übergeordneter.
import { describe, expect, it } from 'vitest'
import { hatZyklus, wuerdeZyklusErzeugen, type Ortskante } from '../../src/core/ort/zyklus'

describe('hatZyklus (Ort): konkrete Fälle', () => {
  it('leere Kantenliste: kein Zyklus', () => {
    expect(hatZyklus([])).toBe(false)
  })

  it('Selbstkante (Ort gehört zu sich selbst) ist sofort ein Zyklus', () => {
    expect(hatZyklus([{ ortId: 'A', uebergeordnetId: 'A' }])).toBe(true)
  })

  it('Zweierzyklus (A gehört zu B, B gehört zu A) ist ein Zyklus', () => {
    const kanten: readonly Ortskante[] = [
      { ortId: 'A', uebergeordnetId: 'B' },
      { ortId: 'B', uebergeordnetId: 'A' },
    ]
    expect(hatZyklus(kanten)).toBe(true)
  })

  it('längerer Zyklus (A→B→C→A, je "gehört zu") ist ein Zyklus', () => {
    const kanten: readonly Ortskante[] = [
      { ortId: 'A', uebergeordnetId: 'B' },
      { ortId: 'B', uebergeordnetId: 'C' },
      { ortId: 'C', uebergeordnetId: 'A' },
    ]
    expect(hatZyklus(kanten)).toBe(true)
  })

  it('lineare Kette (Dorf -> Kreis -> Provinz -> Staat) ist zyklenfrei', () => {
    const kanten: readonly Ortskante[] = [
      { ortId: 'Dorf', uebergeordnetId: 'Kreis' },
      { ortId: 'Kreis', uebergeordnetId: 'Provinz' },
      { ortId: 'Provinz', uebergeordnetId: 'Staat' },
    ]
    expect(hatZyklus(kanten)).toBe(false)
  })

  it('zwei Dörfer im selben Kreis (Diamantform) sind zyklenfrei', () => {
    const kanten: readonly Ortskante[] = [
      { ortId: 'DorfA', uebergeordnetId: 'Kreis' },
      { ortId: 'DorfB', uebergeordnetId: 'Kreis' },
      { ortId: 'Kreis', uebergeordnetId: 'Provinz' },
    ]
    expect(hatZyklus(kanten)).toBe(false)
  })

  it('Mehrfachkanten (dieselbe Ort/Übergeordneter-Kombination doppelt) erzeugen keinen falschen Zyklus', () => {
    const kanten: readonly Ortskante[] = [
      { ortId: 'A', uebergeordnetId: 'B' },
      { ortId: 'A', uebergeordnetId: 'B' },
    ]
    expect(hatZyklus(kanten)).toBe(false)
  })

  it('disjunkte Komponenten (eine azyklisch, eine mit Zyklus) werden als Zyklus erkannt', () => {
    const kanten: readonly Ortskante[] = [
      { ortId: 'A', uebergeordnetId: 'B' }, // Komponente 1: azyklisch
      { ortId: 'X', uebergeordnetId: 'Y' }, // Komponente 2: Zweierzyklus
      { ortId: 'Y', uebergeordnetId: 'X' },
    ]
    expect(hatZyklus(kanten)).toBe(true)
  })
})

describe('wuerdeZyklusErzeugen (Ort): konkrete Fälle', () => {
  it('erkennt eine neue Selbstkante (neu.uebergeordnetId === neu.ortId) auch bei leerem Graphen', () => {
    expect(wuerdeZyklusErzeugen([], { ortId: 'A', uebergeordnetId: 'A' })).toBe(true)
  })

  it('eine neue Kante ohne Bezug zum bestehenden Graphen erzeugt keinen Zyklus', () => {
    const kanten: readonly Ortskante[] = [{ ortId: 'A', uebergeordnetId: 'B' }]
    expect(wuerdeZyklusErzeugen(kanten, { ortId: 'X', uebergeordnetId: 'Y' })).toBe(false)
  })

  it('eine Rückkante (der Übergeordnete wird zum Untergeordneten seines eigenen Untergeordneten) erzeugt einen Zyklus', () => {
    // Kette A -> B -> C (C ist Ur-Übergeordneter von A). Neue Kante: A wird Übergeordneter von C.
    const kanten: readonly Ortskante[] = [
      { ortId: 'A', uebergeordnetId: 'B' },
      { ortId: 'B', uebergeordnetId: 'C' },
    ]
    expect(wuerdeZyklusErzeugen(kanten, { ortId: 'C', uebergeordnetId: 'A' })).toBe(true)
  })

  it('eine neue Kante, die nur die Hierarchietiefe erhöht, erzeugt keinen Zyklus', () => {
    const kanten: readonly Ortskante[] = [
      { ortId: 'A', uebergeordnetId: 'B' },
      { ortId: 'B', uebergeordnetId: 'C' },
    ]
    // C bekommt einen weiteren Übergeordneten D — reine Verlängerung nach oben, kein Zyklus.
    expect(wuerdeZyklusErzeugen(kanten, { ortId: 'C', uebergeordnetId: 'D' })).toBe(false)
  })

  it('Konsistenz mit hatZyklus: wuerdeZyklusErzeugen(k, neu) === hatZyklus([...k, neu]) für zyklenfreie k', () => {
    const kanten: readonly Ortskante[] = [
      { ortId: 'A', uebergeordnetId: 'B' },
      { ortId: 'B', uebergeordnetId: 'C' },
    ]
    const rueckkante: Ortskante = { ortId: 'C', uebergeordnetId: 'A' }
    const harmlos: Ortskante = { ortId: 'C', uebergeordnetId: 'D' }
    expect(wuerdeZyklusErzeugen(kanten, rueckkante)).toBe(hatZyklus([...kanten, rueckkante]))
    expect(wuerdeZyklusErzeugen(kanten, harmlos)).toBe(hatZyklus([...kanten, harmlos]))
  })
})
