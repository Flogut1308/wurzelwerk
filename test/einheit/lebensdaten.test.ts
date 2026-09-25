// Vorarbeiten AP-1.30, PR 2 (Nachtrag ADR-031, docs/80 §32 V-D9-*): die EINE Regel „Aussage führt,
// sonst Ereignis" für Geburts-/Todesdatum und -ort — gemeinsam für Kernangaben, Sterbeort und
// offene Punkte.
import { describe, expect, it } from 'vitest'
import { ereignisHatDatum, fuehrendeQuelle, istRueckfallEreignis } from '../../src/core/person/lebensdaten'

describe('istRueckfallEreignis (V-D9-rollen)', () => {
  it('L1: Geburt mit hauptperson oder kind, Tod mit verstorbener oder hauptperson', () => {
    expect(istRueckfallEreignis('geburt', 'hauptperson')).toBe('geburt')
    expect(istRueckfallEreignis('geburt', 'kind')).toBe('geburt')
    expect(istRueckfallEreignis('tod', 'verstorbener')).toBe('tod')
    expect(istRueckfallEreignis('tod', 'hauptperson')).toBe('tod')
  })

  it('L2: andere Rollen und Ersatz-Ereignisse (Taufe, Beerdigung) sind kein Rückfall', () => {
    expect(istRueckfallEreignis('geburt', 'vater')).toBeNull()
    expect(istRueckfallEreignis('geburt', 'hebamme')).toBeNull()
    expect(istRueckfallEreignis('geburt', 'verstorbener')).toBeNull()
    expect(istRueckfallEreignis('tod', 'informant')).toBeNull()
    expect(istRueckfallEreignis('tod', 'kind')).toBeNull()
    expect(istRueckfallEreignis('taufe', 'hauptperson')).toBeNull()
    expect(istRueckfallEreignis('taufe', 'kind')).toBeNull()
    expect(istRueckfallEreignis('beerdigung', 'verstorbener')).toBeNull()
  })
})

describe('ereignisHatDatum (V-D9-ereignisdatum)', () => {
  it('L3: geparster Wert oder Originaltext genügt, beides leer nicht', () => {
    expect(ereignisHatDatum({ datumWert1: '1812-02-02', datumOriginaltext: null })).toBe(true)
    expect(ereignisHatDatum({ datumWert1: null, datumOriginaltext: 'Mariä Lichtmess 1812' })).toBe(true)
    expect(ereignisHatDatum({ datumWert1: null, datumOriginaltext: null })).toBe(false)
  })
})

describe('fuehrendeQuelle (V-D9-aussage-fuehrt)', () => {
  interface A {
    readonly id: string
    readonly wert: boolean
  }
  interface E {
    readonly id: string
    readonly wert: boolean
  }
  const aTraegt = (a: A): boolean => a.wert
  const eTraegt = (e: E): boolean => e.wert

  it('L4: eine Aussage mit Wert führt, auch wenn ein Ereignis einen Wert hat', () => {
    const aussagen: readonly A[] = [
      { id: 'a1', wert: false },
      { id: 'a2', wert: true },
    ]
    expect(fuehrendeQuelle(aussagen, aTraegt, [{ id: 'e1', wert: true }], eTraegt)).toEqual({ herkunft: 'aussage', kandidaten: [{ id: 'a2', wert: true }] })
  })

  it('L5: ohne Aussage mit Wert springt das Ereignis ein, nur Ereignisse mit Wert sind Kandidaten', () => {
    const ereignisse: readonly E[] = [
      { id: 'e1', wert: false },
      { id: 'e2', wert: true },
    ]
    expect(fuehrendeQuelle([{ id: 'a1', wert: false }], aTraegt, ereignisse, eTraegt)).toEqual({ herkunft: 'ereignis', kandidaten: [{ id: 'e2', wert: true }] })
    expect(fuehrendeQuelle([], aTraegt, ereignisse, eTraegt)).toEqual({ herkunft: 'ereignis', kandidaten: [{ id: 'e2', wert: true }] })
  })

  it('L6: weder Aussage noch Ereignis mit Wert → null', () => {
    expect(fuehrendeQuelle([{ id: 'a1', wert: false }], aTraegt, [{ id: 'e1', wert: false }], eTraegt)).toBeNull()
    expect(fuehrendeQuelle<A, E>([], aTraegt, [], eTraegt)).toBeNull()
  })

  it('L7: die Eingaben bleiben unverändert', () => {
    const aussagen = Object.freeze([Object.freeze({ id: 'a1', wert: true })])
    const ereignisse = Object.freeze([Object.freeze({ id: 'e1', wert: true })])
    expect(() => fuehrendeQuelle(aussagen, aTraegt, ereignisse, eTraegt)).not.toThrow()
  })
})
