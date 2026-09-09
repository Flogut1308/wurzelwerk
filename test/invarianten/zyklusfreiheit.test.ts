// AP-0.9 PR-B — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025). Fachliche Invariante aus
// ADR-009 Punkt 2: "Niemand ist eigener Vorfahre" (Zyklusfreiheit). Vorbereitung: den Befehl, der
// eine Elternkante setzt, gibt es noch nicht (der kommt erst ab AP-0.10) - dieser Test prüft
// ausschließlich die reine Funktion `hatZyklus`/`wuerdeZyklusErzeugen` aus `core/graph/zyklus.ts`,
// die dieser spätere Befehl vor jedem Setzen einer Elternkante aufrufen wird.
//
// Richtungserinnerung (s. auch Modul-Kommentar in zyklus.ts): `Elternkante.elternteilId` ist der
// Vorfahre, `Elternkante.kindId` der Nachkomme ("kindId ist Kind von elternteilId"). Ein Zyklus im
// gerichteten Graphen "ist Kind von" bedeutet: jemand wäre sein eigener (Ur-…)Vorfahre. Das ist
// ausdrücklich NICHT dasselbe wie ein ungerichteter Kreis im Familienbild - der entsteht bei jeder
// Cousinenheirat/jedem Ahnenimplex (Diamant-Test unten) und ist legitim, kein Zyklus.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { hatZyklus, wuerdeZyklusErzeugen, type Elternkante } from '../../src/core/graph/zyklus'

/**
 * Arbitrary für einen per Konstruktion azyklischen Elternschaftsgraphen: `knotenAnzahl` Knoten,
 * durchnummeriert `p0..p(n-1)`; jede erzeugte Kante zeigt von einem Kind mit Index `k >= 1` auf
 * einen Elternteil mit STRIKT kleinerem Index (`elternteilIndex = elternteilRoh % k`, und `k >=
 * 1` garantiert `k > 0` als Modulus). Ein Zyklus wäre nur möglich, wenn irgendeine Kante "nach
 * oben" (zu einem gleich- oder höherindizierten Knoten) zeigte - das kommt hier nie vor, die
 * Knotenindizes selbst sind eine gültige topologische Ordnung. Mehrfachkanten (dieselbe
 * Kind/Eltern-Kombination mehrfach) und mehrere Elternteile pro Kind (Diamant/Ahnenimplex) sind
 * ausdrücklich möglich, weil mehrere Kanten pro Kind-Index erzeugt werden können.
 */
function azyklischerGraphArbitrary(): fc.Arbitrary<{ readonly knotenAnzahl: number; readonly kanten: readonly Elternkante[] }> {
  return fc.integer({ min: 1, max: 20 }).chain((knotenAnzahl) =>
    fc
      .array(
        fc.record({
          kindIndex: fc.integer({ min: 1, max: Math.max(1, knotenAnzahl - 1) }),
          elternteilRoh: fc.nat(),
        }),
        { maxLength: 60 },
      )
      .map((eintraege) => ({
        knotenAnzahl,
        kanten: eintraege
          .filter((eintrag) => eintrag.kindIndex <= knotenAnzahl - 1)
          .map((eintrag) => ({
            kindId: `p${eintrag.kindIndex}`,
            elternteilId: `p${eintrag.elternteilRoh % eintrag.kindIndex}`,
          })),
      })),
  )
}

describe('Invariante: Zyklusfreiheit im Elternschaftsgraphen (ADR-009 Punkt 2, „niemand ist eigener Vorfahre“)', () => {
  it('ein per Konstruktion azyklischer Graph (Kind-Index > Elternteil-Index) liefert immer hatZyklus === false', () => {
    fc.assert(
      fc.property(azyklischerGraphArbitrary(), ({ kanten }) => {
        expect(hatZyklus(kanten)).toBe(false)
      }),
      { seed: 20260909, numRuns: 500 },
    )
  })

  it('Rückkante (bestehender Nachkomme wird Elternteil eines seiner Vorfahren) erzeugt immer einen Zyklus', () => {
    fc.assert(
      fc.property(
        azyklischerGraphArbitrary().filter(({ kanten }) => kanten.length > 0),
        fc.nat(),
        ({ kanten }, rohIndex) => {
          // Nicht-null: `kanten.length > 0` ist per `.filter()` oben garantiert, `kanten[index]`
          // existiert also immer für einen per Modulo reduzierten Index (kein `!`, CLAUDE.md §4).
          const index = rohIndex % kanten.length
          const bestehendeKante = kanten[index]
          if (bestehendeKante === undefined) {
            throw new Error('unerreichbar: index < kanten.length per Konstruktion')
          }

          // Die Rückkante macht den bisherigen Elternteil zum Kind seines eigenen Kindes -
          // exakt der Fall "Nachkomme wird Elternteil eines seiner Vorfahren".
          const rueckkante: Elternkante = {
            elternteilId: bestehendeKante.kindId,
            kindId: bestehendeKante.elternteilId,
          }

          expect(wuerdeZyklusErzeugen(kanten, rueckkante)).toBe(true)
          expect(hatZyklus([...kanten, rueckkante])).toBe(true)
        },
      ),
      { seed: 20260909, numRuns: 500 },
    )
  })

  it('Konsistenz: für zyklenfreie Kanten gilt wuerdeZyklusErzeugen(kanten, neu) === hatZyklus([...kanten, neu])', () => {
    fc.assert(
      fc.property(
        azyklischerGraphArbitrary(),
        fc.integer({ min: 0, max: 19 }),
        fc.integer({ min: 0, max: 19 }),
        ({ knotenAnzahl, kanten }, elternteilRoh, kindRoh) => {
          // Indizes bewusst über den ganzen Bereich [0,19] gestreut (nicht nur bis knotenAnzahl-1),
          // damit auch Kanten zu Knoten außerhalb des bisherigen Graphen mitgeprüft werden.
          const neu: Elternkante = { elternteilId: `p${elternteilRoh}`, kindId: `p${kindRoh}` }

          expect(wuerdeZyklusErzeugen(kanten, neu)).toBe(hatZyklus([...kanten, neu]))
          // Referenz auf knotenAnzahl nur, damit die Arbitrary-Form (Objekt statt Tupel) nicht als
          // "ungenutzt" auffällt - der eigentliche Test braucht den Wert nicht separat.
          expect(knotenAnzahl).toBeGreaterThanOrEqual(1)
        },
      ),
      { seed: 20260909, numRuns: 500 },
    )
  })

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

  it('wuerdeZyklusErzeugen erkennt eine neue Selbstkante (neu.elternteilId === neu.kindId) auch bei leerem Graphen', () => {
    expect(wuerdeZyklusErzeugen([], { elternteilId: 'A', kindId: 'A' })).toBe(true)
  })

  it('wuerdeZyklusErzeugen: eine neue Kante ohne Bezug zum bestehenden Graphen erzeugt keinen Zyklus', () => {
    const kanten: readonly Elternkante[] = [{ elternteilId: 'A', kindId: 'B' }]
    expect(wuerdeZyklusErzeugen(kanten, { elternteilId: 'X', kindId: 'Y' })).toBe(false)
  })
})
