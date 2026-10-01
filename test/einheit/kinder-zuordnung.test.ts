// AP-1.30 PR 12a: Kinder unter Partnerschaften (docs/80_Offene_Fragen.md §33 V-130-12-kinder-zuordnung).
import { describe, expect, it } from 'vitest'
import { kindHatPartnerElternteil, kinderZuordnen } from '../../src/core/person/kinder-zuordnung'

const P = 'p'
const kind = (id: string, elternIds: readonly string[], istPlatzhalter = false) => ({ id, istPlatzhalter, elternIds })
const partnerschaft = (id: string, personIds: readonly string[]) => ({ id, personIds })

describe('kinderZuordnen', () => {
  it('ordnet ein Kind über den anderen Elternteil zu', () => {
    const ergebnis = kinderZuordnen({ personId: P, kinder: [kind('k1', [P, 'q'])], partnerschaften: [partnerschaft('x', [P, 'q'])] })
    expect(ergebnis).toEqual({ partnerschaften: [{ partnerschaftId: 'x', kindIds: ['k1'] }], ohnePartnerschaft: [] })
  })

  it('P als einziger Elternteil: ohne Partnerschaft', () => {
    const ergebnis = kinderZuordnen({ personId: P, kinder: [kind('k1', [P])], partnerschaften: [partnerschaft('x', [P, 'q'])] })
    expect(ergebnis).toEqual({ partnerschaften: [{ partnerschaftId: 'x', kindIds: [] }], ohnePartnerschaft: ['k1'] })
  })

  it('zwei Partnerschaften mit demselben Partner: Kind unter beiden', () => {
    const ergebnis = kinderZuordnen({
      personId: P,
      kinder: [kind('k1', [P, 'q'])],
      partnerschaften: [partnerschaft('x', [P, 'q']), partnerschaft('y', [P, 'q'])],
    })
    expect(ergebnis.partnerschaften.map((e) => e.kindIds)).toEqual([['k1'], ['k1']])
    expect(ergebnis.ohnePartnerschaft).toEqual([])
  })

  it('Platzhalterkind steht in ohnePartnerschaft', () => {
    const ergebnis = kinderZuordnen({ personId: P, kinder: [kind('ph', [P], true)], partnerschaften: [] })
    expect(ergebnis.ohnePartnerschaft).toEqual(['ph'])
  })

  it('Partnerschaft mit nur P bekommt kein Kind', () => {
    const ergebnis = kinderZuordnen({ personId: P, kinder: [kind('k1', [P])], partnerschaften: [partnerschaft('x', [P])] })
    expect(ergebnis).toEqual({ partnerschaften: [{ partnerschaftId: 'x', kindIds: [] }], ohnePartnerschaft: ['k1'] })
  })

  it('Doppelkanten: ein Kind nur einmal', () => {
    const ergebnis = kinderZuordnen({
      personId: P,
      kinder: [kind('k1', [P, 'q']), kind('k1', [P, 'q'])],
      partnerschaften: [partnerschaft('x', [P, 'q'])],
    })
    expect(ergebnis.partnerschaften[0]?.kindIds).toEqual(['k1'])
  })

  it('Reihenfolge: Partnerschaften und Kinder in Eingabereihenfolge', () => {
    const ergebnis = kinderZuordnen({
      personId: P,
      kinder: [kind('k2', [P, 'q']), kind('k1', [P, 'q'])],
      partnerschaften: [partnerschaft('y', [P, 'q']), partnerschaft('x', [P])],
    })
    expect(ergebnis.partnerschaften).toEqual([
      { partnerschaftId: 'y', kindIds: ['k2', 'k1'] },
      { partnerschaftId: 'x', kindIds: [] },
    ])
  })

  it('verändert die Eingabe nicht', () => {
    const eingabe = { personId: P, kinder: [kind('k1', [P, 'q'])], partnerschaften: [partnerschaft('x', [P, 'q'])] }
    const kopie = JSON.stringify(eingabe)
    kinderZuordnen(eingabe)
    expect(JSON.stringify(eingabe)).toBe(kopie)
  })
})

describe('kindHatPartnerElternteil', () => {
  it('zählt P selbst nicht als Partner', () => {
    expect(kindHatPartnerElternteil(P, kind('k', [P]), new Set([P]))).toBe(false)
    expect(kindHatPartnerElternteil(P, kind('k', [P, 'q']), new Set(['q']))).toBe(true)
  })
})
