// AP-0.9 PR-B1 — Einheitentest der reinen Zyklusfreiheits-Funktion (CLAUDE.md §5: reine Logik →
// test/einheit). Die fachliche Invariante „niemand ist eigener Vorfahre" (ADR-009 Punkt 2) als
// fast-check-Property liegt getrennt in test/invarianten/zyklusfreiheit.test.ts (geschützter
// Prüfpfad, ADR-025 → eigener PR, nie in derselben Iteration wie dieser Produktivcode).
//
// Richtungserinnerung (s. Modul-Kommentar in zyklus.ts): `Elternkante.elternteilId` ist der
// Vorfahre, `Elternkante.kindId` der Nachkomme („kindId ist Kind von elternteilId"). Ein Zyklus im
// gerichteten Graphen „ist Kind von" bedeutet: jemand wäre sein eigener (Ur-…)Vorfahre. Das ist
// NICHT dasselbe wie ein ungerichteter Kreis im Familienbild — der entsteht bei jeder
// Cousinenheirat/jedem Ahnenimplex (Diamant-Test unten) und ist legitim, kein Zyklus.
import { describe, expect, it } from 'vitest'
import { hatZyklus, wuerdeZyklusErzeugen, type Elternkante } from '../../src/core/graph/zyklus'

describe('hatZyklus: konkrete Fälle', () => {
  it('leere Kantenliste: kein Zyklus', () => {
    expect(hatZyklus([])).toBe(false)
  })

  it('Selbstkante (A ist Kind von A) ist sofort ein Zyklus', () => {
    expect(hatZyklus([{ elternteilId: 'A', kindId: 'A' }])).toBe(true)
  })

  it('Zweierzyklus (A ist Kind von B, B ist Kind von A) ist ein Zyklus', () => {
    const kanten: readonly Elternkante[] = [
      { elternteilId: 'B', kindId: 'A' },
      { elternteilId: 'A', kindId: 'B' },
    ]
    expect(hatZyklus(kanten)).toBe(true)
  })

  it('längerer Zyklus (A→B→C→A, je Kind von) ist ein Zyklus', () => {
    const kanten: readonly Elternkante[] = [
      { elternteilId: 'A', kindId: 'B' },
      { elternteilId: 'B', kindId: 'C' },
      { elternteilId: 'C', kindId: 'A' },
    ]
    expect(hatZyklus(kanten)).toBe(true)
  })

  it('lineare Kette (A -> B -> C -> D, je Kind von) ist zyklenfrei', () => {
    const kanten: readonly Elternkante[] = [
      { elternteilId: 'A', kindId: 'B' },
      { elternteilId: 'B', kindId: 'C' },
      { elternteilId: 'C', kindId: 'D' },
    ]
    expect(hatZyklus(kanten)).toBe(false)
  })

  it('Diamant/Ahnenimplex (D hat Eltern B und C, beide Kinder von A) ist zyklenfrei - Cousinenheirat ist legitim', () => {
    const kanten: readonly Elternkante[] = [
      { elternteilId: 'A', kindId: 'B' },
      { elternteilId: 'A', kindId: 'C' },
      { elternteilId: 'B', kindId: 'D' },
      { elternteilId: 'C', kindId: 'D' },
    ]
    expect(hatZyklus(kanten)).toBe(false)
  })

  it('Mehrfachkanten (dieselbe Kind/Eltern-Kombination doppelt) erzeugen keinen falschen Zyklus', () => {
    const kanten: readonly Elternkante[] = [
      { elternteilId: 'A', kindId: 'B' },
      { elternteilId: 'A', kindId: 'B' },
    ]
    expect(hatZyklus(kanten)).toBe(false)
  })

  it('disjunkte Komponenten (eine azyklisch, eine mit Zyklus) werden als Zyklus erkannt', () => {
    const kanten: readonly Elternkante[] = [
      { elternteilId: 'A', kindId: 'B' }, // Komponente 1: azyklisch
      { elternteilId: 'X', kindId: 'Y' }, // Komponente 2: Zweierzyklus
      { elternteilId: 'Y', kindId: 'X' },
    ]
    expect(hatZyklus(kanten)).toBe(true)
  })
})

describe('wuerdeZyklusErzeugen: konkrete Fälle', () => {
  it('erkennt eine neue Selbstkante (neu.elternteilId === neu.kindId) auch bei leerem Graphen', () => {
    expect(wuerdeZyklusErzeugen([], { elternteilId: 'A', kindId: 'A' })).toBe(true)
  })

  it('eine neue Kante ohne Bezug zum bestehenden Graphen erzeugt keinen Zyklus', () => {
    const kanten: readonly Elternkante[] = [{ elternteilId: 'A', kindId: 'B' }]
    expect(wuerdeZyklusErzeugen(kanten, { elternteilId: 'X', kindId: 'Y' })).toBe(false)
  })

  it('eine Rückkante (Nachkomme wird Elternteil eines seiner Vorfahren) erzeugt einen Zyklus', () => {
    // Kette A -> B -> C (C ist Ur-Enkel von A). Neue Kante: A wird Kind von C → A wäre eigener Vorfahre.
    const kanten: readonly Elternkante[] = [
      { elternteilId: 'A', kindId: 'B' },
      { elternteilId: 'B', kindId: 'C' },
    ]
    expect(wuerdeZyklusErzeugen(kanten, { elternteilId: 'C', kindId: 'A' })).toBe(true)
  })

  it('eine neue Kante, die nur die Baumtiefe erhöht, erzeugt keinen Zyklus', () => {
    const kanten: readonly Elternkante[] = [
      { elternteilId: 'A', kindId: 'B' },
      { elternteilId: 'B', kindId: 'C' },
    ]
    // C bekommt ein weiteres Kind D — reine Verlängerung nach unten, kein Zyklus.
    expect(wuerdeZyklusErzeugen(kanten, { elternteilId: 'C', kindId: 'D' })).toBe(false)
  })

  it('Konsistenz mit hatZyklus: wuerdeZyklusErzeugen(k, neu) === hatZyklus([...k, neu]) für zyklenfreie k', () => {
    const kanten: readonly Elternkante[] = [
      { elternteilId: 'A', kindId: 'B' },
      { elternteilId: 'B', kindId: 'C' },
    ]
    const rueckkante: Elternkante = { elternteilId: 'C', kindId: 'A' }
    const harmlos: Elternkante = { elternteilId: 'C', kindId: 'D' }
    expect(wuerdeZyklusErzeugen(kanten, rueckkante)).toBe(hatZyklus([...kanten, rueckkante]))
    expect(wuerdeZyklusErzeugen(kanten, harmlos)).toBe(hatZyklus([...kanten, harmlos]))
  })
})
