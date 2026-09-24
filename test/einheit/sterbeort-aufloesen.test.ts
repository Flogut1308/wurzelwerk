// AP-1.34 PR-C2a (§31 U-1.34-E5, „Sterbeort = beides"): Aussage `todesort` ist führend, sonst der
// Ort des Tod-Ereignisses (Rolle `verstorbener`, vom Aufrufer gefiltert — geprüft in
// abfrage-person-detail-sterbeort.test.ts, D2b).
import { describe, expect, it } from 'vitest'
import { sterbeortAufloesen, type SterbeortAussage, type SterbeortTodEreignis } from '../../src/core/person/sterbeort'

function aussage(id: string, wertRefId: string | null, istBevorzugt = false, wertText: string | null = null): SterbeortAussage {
  return { id, istBevorzugt, wertRefId, wertText }
}

function tod(id: string, ortId: string | null): SterbeortTodEreignis {
  return { id, ortId }
}

describe('sterbeortAufloesen (AP-1.34, E5)', () => {
  it('S1: die Aussage todesort schlägt den Ort des Tod-Ereignisses', () => {
    expect(sterbeortAufloesen([aussage('a1', 'ort-aussage')], [tod('e1', 'ort-ereignis')])).toEqual({
      herkunft: 'aussage',
      ortId: 'ort-aussage',
      aussageId: 'a1',
    })
  })

  it('S2: die bevorzugte Aussage gewinnt vor der kleinsten id; ohne Bevorzugung die kleinste id', () => {
    const bevorzugt = sterbeortAufloesen([aussage('a1', 'ort-1'), aussage('a2', 'ort-2', true), aussage('a3', 'ort-3')], [])
    expect(bevorzugt).toEqual({ herkunft: 'aussage', ortId: 'ort-2', aussageId: 'a2' })

    const ohne = sterbeortAufloesen([aussage('a3', 'ort-3'), aussage('a1', 'ort-1'), aussage('a2', 'ort-2')], [])
    expect(ohne).toEqual({ herkunft: 'aussage', ortId: 'ort-1', aussageId: 'a1' })
  })

  it('S3: ohne Aussage gilt das Tod-Ereignis mit Ort und kleinster id', () => {
    expect(sterbeortAufloesen([], [tod('e3', 'ort-3'), tod('e1', null), tod('e2', 'ort-2')])).toEqual({
      herkunft: 'ereignis',
      ortId: 'ort-2',
      aussageId: null,
    })
  })

  it('S4: Tod-Ereignisse ohne Ort (und keine Aussage) ergeben null', () => {
    expect(sterbeortAufloesen([], [tod('e1', null)])).toBeNull()
    expect(sterbeortAufloesen([], [])).toBeNull()
  })

  it('S5: nur die übergebenen (vom Aufrufer auf verstorbener gefilterten) Ereignisse zählen', () => {
    // Der Kern kennt keine Rolle — was nicht übergeben wird, zählt nicht.
    expect(sterbeortAufloesen([], [tod('e9', 'ort-9')])?.ortId).toBe('ort-9')
    expect(sterbeortAufloesen([], [])).toBeNull()
  })

  it('S6: eine Aussage nur mit wert_text zählt als vorhanden (ortId null) und verdrängt das Ereignis', () => {
    expect(sterbeortAufloesen([aussage('a1', null, false, 'bei Verdun')], [tod('e1', 'ort-ereignis')])).toEqual({
      herkunft: 'aussage',
      ortId: null,
      aussageId: 'a1',
    })
  })

  it('S6b: eine Aussage ganz ohne Wert wird übergangen', () => {
    expect(sterbeortAufloesen([aussage('a1', null)], [tod('e1', 'ort-ereignis')])).toEqual({
      herkunft: 'ereignis',
      ortId: 'ort-ereignis',
      aussageId: null,
    })
  })
})
