// AP-1.30 PR 12a: Geschwister-Ableitung (docs/80_Offene_Fragen.md §33 V-130-12-geschwister-regel).
import { describe, expect, it } from 'vitest'
import { geschwisterAbleiten, type GeschwisterKante, type GeschwisterKantentyp } from '../../src/core/person/geschwister'

const P = 'p'
const k = (elternteilId: string, kindId: string, typ: GeschwisterKantentyp = 'biologisch'): GeschwisterKante => ({ elternteilId, kindId, typ })

describe('geschwisterAbleiten', () => {
  it('voll: zwei gemeinsame Eltern', () => {
    const ergebnis = geschwisterAbleiten(P, [k('m', P), k('v', P), k('m', 's'), k('v', 's')])
    expect(ergebnis).toEqual([{ personId: 's', art: 'voll', gemeinsameElternIds: ['m', 'v'] }])
  })

  it('halb: ein gemeinsamer Elternteil, beide haben zwei', () => {
    const ergebnis = geschwisterAbleiten(P, [k('m', P), k('v', P), k('m', 's'), k('v2', 's')])
    expect(ergebnis).toEqual([{ personId: 's', art: 'halb', gemeinsameElternIds: ['m'] }])
  })

  it('offen: P hat nur einen Elternteil', () => {
    expect(geschwisterAbleiten(P, [k('m', P), k('m', 's'), k('v2', 's')])[0]?.art).toBe('offen')
  })

  it('offen: S hat nur einen Elternteil', () => {
    expect(geschwisterAbleiten(P, [k('m', P), k('v', P), k('m', 's')])[0]?.art).toBe('offen')
  })

  it('sozial: nur über eine Stiefkante', () => {
    const ergebnis = geschwisterAbleiten(P, [k('m', P), k('v', P), k('v2', P, 'stief'), k('v2', 's')])
    expect(ergebnis).toEqual([{ personId: 's', art: 'sozial', gemeinsameElternIds: [] }])
  })

  it.each<GeschwisterKantentyp>(['pflege', 'zieh', 'leihmutter'])('%s stiftet keine Geschwisterschaft', (typ) => {
    expect(geschwisterAbleiten(P, [k('m', P, typ), k('m', 's')])[0]?.art).toBe('sozial')
  })

  it('stief und biologisch gemischt: nur die biologische Kante zählt', () => {
    const ergebnis = geschwisterAbleiten(P, [k('m', P), k('x', P, 'stief'), k('m', 's'), k('x', 's')])
    expect(ergebnis).toEqual([{ personId: 's', art: 'offen', gemeinsameElternIds: ['m'] }])
  })

  it.each<GeschwisterKantentyp>(['adoptiv', 'unbekannt', 'anerkannt'])('%s stiftet Geschwisterschaft', (typ) => {
    expect(geschwisterAbleiten(P, [k('m', P), k('v', P), k('m', 's', typ), k('v', 's', typ)])[0]?.art).toBe('voll')
  })

  it('Doppelkante biologisch+adoptiv zur selben Person zählt als ein Elternteil', () => {
    const ergebnis = geschwisterAbleiten(P, [k('m', P), k('m', P, 'adoptiv'), k('m', 's')])
    expect(ergebnis).toEqual([{ personId: 's', art: 'offen', gemeinsameElternIds: ['m'] }])
  })

  it('Platzhalter-Elternteil zählt als gemeinsamer Elternteil', () => {
    const ergebnis = geschwisterAbleiten(P, [k('platzhalter', P), k('v', P), k('platzhalter', 's'), k('v2', 's')])
    expect(ergebnis[0]).toEqual({ personId: 's', art: 'halb', gemeinsameElternIds: ['platzhalter'] })
  })

  it('drei Eltern: zwei gemeinsame sind voll', () => {
    const ergebnis = geschwisterAbleiten(P, [k('a', P), k('b', P), k('c', P), k('a', 's'), k('b', 's')])
    expect(ergebnis[0]).toEqual({ personId: 's', art: 'voll', gemeinsameElternIds: ['a', 'b'] })
  })

  it('keine Eltern: leer', () => {
    expect(geschwisterAbleiten(P, [k('m', 's')])).toEqual([])
    expect(geschwisterAbleiten(P, [])).toEqual([])
  })

  it('P ist nie enthalten', () => {
    expect(geschwisterAbleiten(P, [k('m', P), k('m', 's')]).some((g) => g.personId === P)).toBe(false)
  })

  it('feste Reihenfolge: Art (voll, halb, offen, sozial), dann personId', () => {
    const kanten = [
      k('m', P), k('v', P), k('s2', P, 'stief'),
      k('s2', 'e-sozial'),
      k('m', 'd-offen'),
      k('m', 'c-halb'), k('x', 'c-halb'),
      k('m', 'b-voll'), k('v', 'b-voll'),
      k('m', 'a-voll'), k('v', 'a-voll'),
    ]
    expect(geschwisterAbleiten(P, kanten).map((g) => g.personId)).toEqual(['a-voll', 'b-voll', 'c-halb', 'd-offen', 'e-sozial'])
  })

  it('verändert die Eingabe nicht', () => {
    const kanten = [k('m', P), k('v', P), k('m', 's'), k('v', 's')]
    const kopie = JSON.stringify(kanten)
    geschwisterAbleiten(P, kanten)
    expect(JSON.stringify(kanten)).toBe(kopie)
  })
})
