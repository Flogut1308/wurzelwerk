// AP-1.30 PR 1 (V-D9-anzeige, docs/80 §32): `lebensdatumAufloesen` löst je Angabe (Geburts-/
// Todesdatum, Geburts-/Sterbeort) auf, WELCHE Aussage bzw. WELCHES Ereignis den Wert liefert — über
// dieselbe Regel wie Kernangaben und Sterbeort (`fuehrendeQuelle`, „die Aussage führt, sonst das
// Ereignis", D9). Die Prüfregeln (`aussageTraegtAngabe`/`ereignisTraegtAngabe`) stehen einmal im Kern.
import { describe, expect, it } from 'vitest'
import {
  aussageHatWert,
  aussageTraegtAngabe,
  ereignisHatOrt,
  ereignisTraegtAngabe,
  istRueckfallEreignis,
  LEBENSDATUM_ANGABEN,
  lebensdatumAufloesen,
  lebensdatumArt,
  RUECKFALL_ROLLEN,
  type LebensdatumAussage,
  type LebensdatumEreignis,
} from '../../src/core/person/lebensdaten'

function aussage(id: string, werte: Partial<Omit<LebensdatumAussage, 'id'>> = {}): LebensdatumAussage {
  return { id, istBevorzugt: false, wertText: null, wertZahl: null, wertRefId: null, datumWert1: null, ...werte }
}

function ereignis(id: string, werte: Partial<Omit<LebensdatumEreignis, 'id'>> = {}): LebensdatumEreignis {
  return { id, ortId: null, datumWert1: null, datumOriginaltext: null, ...werte }
}

describe('lebensdatumAufloesen (V-D9-anzeige)', () => {
  it('LA1: die Aussage mit Wert führt, auch wenn ein Ereignis einen Wert trägt', () => {
    const ergebnis = lebensdatumAufloesen('geburtsdatum', [aussage('a1', { datumWert1: '1900' })], [ereignis('e1', { datumWert1: '1899' })])
    expect(ergebnis).toEqual({ angabe: 'geburtsdatum', herkunft: 'aussage', aussageId: 'a1', ereignisId: null })
  })

  it('LA2: ohne Aussage mit Wert springt das Ereignis ein (herkunft ereignis)', () => {
    const ergebnis = lebensdatumAufloesen('todesdatum', [aussage('a1')], [ereignis('e1', { datumWert1: '1974' })])
    expect(ergebnis).toEqual({ angabe: 'todesdatum', herkunft: 'ereignis', aussageId: null, ereignisId: 'e1' })
  })

  it('LA3: ein Ereignis nur mit Originaltext trägt ein Datum (V-D9-ereignisdatum)', () => {
    const ergebnis = lebensdatumAufloesen('geburtsdatum', [], [ereignis('e1', { datumOriginaltext: 'Mariä Lichtmess 1812' })])
    expect(ergebnis).toEqual({ angabe: 'geburtsdatum', herkunft: 'ereignis', aussageId: null, ereignisId: 'e1' })
  })

  it('LA4: eine Orts-Aussage nur mit wert_zahl (oder Datum) trägt keinen Ort → der Ereignis-Ort gilt', () => {
    const ergebnis = lebensdatumAufloesen('geburtsort', [aussage('a1', { wertZahl: 5, datumWert1: '1900' })], [ereignis('e1', { ortId: 'o1' })])
    expect(ergebnis).toEqual({ angabe: 'geburtsort', herkunft: 'ereignis', aussageId: null, ereignisId: 'e1' })
  })

  it('LA5: kein Wert in keiner Quelle → null', () => {
    expect(lebensdatumAufloesen('todesort', [aussage('a1', { wertZahl: 3 })], [ereignis('e1', { datumWert1: '1974' })])).toBeNull()
    expect(lebensdatumAufloesen('geburtsdatum', [], [])).toBeNull()
  })

  it('LA6: unter Aussagen gewinnt die bevorzugte, sonst die kleinste id; Aussagen ohne Wert zählen nicht', () => {
    const bevorzugt = lebensdatumAufloesen(
      'geburtsort',
      [aussage('a1', { wertText: 'Adorf' }), aussage('a3', { wertRefId: 'o3', istBevorzugt: true }), aussage('a0', { wertZahl: 1, istBevorzugt: true })],
      [],
    )
    expect(bevorzugt?.aussageId).toBe('a3')
    const kleinste = lebensdatumAufloesen('todesdatum', [aussage('a9', { wertText: 'um 1900' }), aussage('a2', { datumWert1: '1901' }), aussage('a1')], [])
    expect(kleinste?.aussageId).toBe('a2')
  })

  it('LA7: unter Ereignissen gewinnt das mit Wert und kleinster id', () => {
    const ergebnis = lebensdatumAufloesen('todesort', [], [ereignis('e1'), ereignis('e5', { ortId: 'o5' }), ereignis('e3', { ortId: 'o3' })])
    expect(ergebnis?.ereignisId).toBe('e3')
  })

  it('LA8: Datum und Ort werden getrennt aufgelöst (V-D9-getrennt)', () => {
    const aussagen = [aussage('a1', { datumWert1: '1900' })]
    const ereignisse = [ereignis('e1', { ortId: 'o1', datumWert1: '1899' })]
    expect(lebensdatumAufloesen('geburtsdatum', aussagen, ereignisse)?.herkunft).toBe('aussage')
    expect(lebensdatumAufloesen('geburtsort', aussagen, ereignisse)?.herkunft).toBe('ereignis')
  })

  it('LA9: Eingaben werden nicht verändert', () => {
    const aussagen = Object.freeze([aussage('a2', { wertText: 'B' }), aussage('a1', { wertText: 'A' })])
    const ereignisse = Object.freeze([ereignis('e2', { ortId: 'o2' }), ereignis('e1', { ortId: 'o1' })])
    lebensdatumAufloesen('geburtsort', aussagen, ereignisse)
    lebensdatumAufloesen('todesort', [], ereignisse)
    expect(aussagen.map((a) => a.id)).toEqual(['a2', 'a1'])
    expect(ereignisse.map((e) => e.id)).toEqual(['e2', 'e1'])
  })
})

describe('Prüfregeln an einer Stelle', () => {
  it('LP1: aussageHatWert — Text, Zahl, Verweis oder Datum', () => {
    expect(aussageHatWert({ wertText: 'x', wertZahl: null, wertRefId: null, datumWert1: null })).toBe(true)
    expect(aussageHatWert({ wertText: null, wertZahl: 0, wertRefId: null, datumWert1: null })).toBe(true)
    expect(aussageHatWert({ wertText: null, wertZahl: null, wertRefId: 'r', datumWert1: null })).toBe(true)
    expect(aussageHatWert({ wertText: null, wertZahl: null, wertRefId: null, datumWert1: '1900' })).toBe(true)
    expect(aussageHatWert({ wertText: null, wertZahl: null, wertRefId: null, datumWert1: null })).toBe(false)
  })

  it('LP2: Orts-Angaben prüfen `traegtOrt`, Datums-Angaben `aussageHatWert`', () => {
    const nurZahl = aussage('a', { wertZahl: 5 })
    expect(aussageTraegtAngabe('geburtsort', nurZahl)).toBe(false)
    expect(aussageTraegtAngabe('todesort', nurZahl)).toBe(false)
    expect(aussageTraegtAngabe('geburtsdatum', nurZahl)).toBe(true)
    expect(aussageTraegtAngabe('todesort', aussage('a', { wertText: 'Adorf' }))).toBe(true)
  })

  it('LP3: Ereignisse — Ort über ort_id, Datum über ereignisHatDatum', () => {
    expect(ereignisHatOrt({ ortId: 'o' })).toBe(true)
    expect(ereignisHatOrt({ ortId: null })).toBe(false)
    const nurOrt = ereignis('e', { ortId: 'o' })
    expect(ereignisTraegtAngabe('geburtsort', nurOrt)).toBe(true)
    expect(ereignisTraegtAngabe('geburtsdatum', nurOrt)).toBe(false)
    expect(ereignisTraegtAngabe('todesdatum', ereignis('e', { datumOriginaltext: 'Ostern' }))).toBe(true)
  })

  it('LP4: Angaben und ihre Rückfall-Art (Rollen laut RUECKFALL_ROLLEN)', () => {
    expect(LEBENSDATUM_ANGABEN).toEqual(['geburtsdatum', 'geburtsort', 'todesdatum', 'todesort'])
    expect(LEBENSDATUM_ANGABEN.map(lebensdatumArt)).toEqual(['geburt', 'geburt', 'tod', 'tod'])
    for (const rolle of RUECKFALL_ROLLEN.geburt) expect(istRueckfallEreignis('geburt', rolle)).toBe(lebensdatumArt('geburtsort'))
    for (const rolle of RUECKFALL_ROLLEN.tod) expect(istRueckfallEreignis('tod', rolle)).toBe(lebensdatumArt('todesdatum'))
  })
})
