// AP-1.34 PR-C2b (§31 U-1.34-C2-O1): `istEigenerVorfahre` — der Zyklus-Befund für EINE Person
// (Feldwarnung `zyklus`), unabhängig davon, welchen Zyklus `findeZyklusKnoten` im Gesamtbestand
// zuerst findet.
import { describe, expect, it } from 'vitest'
import { findeZyklusKnoten, istEigenerVorfahre, type Elternkante } from '../../src/core/graph/zyklus'

const k = (elternteilId: string, kindId: string): Elternkante => ({ elternteilId, kindId })

describe('istEigenerVorfahre()', () => {
  it('ohne Kanten und bei einfacher Linie: nein', () => {
    expect(istEigenerVorfahre('a', [])).toBe(false)
    expect(istEigenerVorfahre('a', [k('b', 'a'), k('c', 'b')])).toBe(false)
  })

  it('Selbstkante: ja', () => {
    expect(istEigenerVorfahre('a', [k('a', 'a')])).toBe(true)
  })

  it('Zyklus über zwei und drei Generationen: ja für jede Person darauf', () => {
    expect(istEigenerVorfahre('a', [k('b', 'a'), k('a', 'b')])).toBe(true)
    const drei = [k('b', 'a'), k('c', 'b'), k('a', 'c')]
    for (const p of ['a', 'b', 'c']) expect(istEigenerVorfahre(p, drei), p).toBe(true)
  })

  it('Person unterhalb eines Zyklus ist NICHT eigener Vorfahre', () => {
    const kanten = [k('b', 'kind'), k('c', 'b'), k('b', 'c')]
    expect(istEigenerVorfahre('kind', kanten)).toBe(false)
    expect(istEigenerVorfahre('b', kanten)).toBe(true)
  })

  it('tiefe Kette (5000 Generationen) ohne Stapelüberlauf, mit Rückkante oben', () => {
    const kette: Elternkante[] = []
    for (let i = 0; i < 5000; i += 1) kette.push(k(`p${i + 1}`, `p${i}`))
    expect(istEigenerVorfahre('p0', kette)).toBe(false)
    expect(istEigenerVorfahre('p0', [...kette, k('p0', 'p5000')])).toBe(true)
  })

  it('Raute / Ahnenimplex (Cousinenheirat) ist kein Fehlalarm', () => {
    // kind hat Eltern v und m; v und m haben dieselben Großeltern g1/g2 über zwei Geschwister.
    const kanten = [
      k('v', 'kind'), k('m', 'kind'),
      k('s1', 'v'), k('s2', 'm'),
      k('g1', 's1'), k('g2', 's1'), k('g1', 's2'), k('g2', 's2'),
      k('g1', 'kind2'), k('v', 'kind2'),
    ]
    for (const p of ['kind', 'kind2', 'v', 'm', 's1', 's2', 'g1', 'g2']) expect(istEigenerVorfahre(p, kanten), p).toBe(false)
  })

  it('jede von findeZyklusKnoten gemeldete Person ist eigener Vorfahre', () => {
    const kanten = [k('b', 'a'), k('c', 'b'), k('a', 'c'), k('x', 'y'), k('y', 'x')]
    const knoten = findeZyklusKnoten(kanten)
    expect(knoten.length).toBeGreaterThan(0)
    for (const p of knoten) expect(istEigenerVorfahre(p, kanten), p).toBe(true)
    // Der zweite, unabhängige Zyklus wird von findeZyklusKnoten nicht gemeldet, hier aber schon.
    expect(istEigenerVorfahre('x', kanten)).toBe(true)
  })
})
