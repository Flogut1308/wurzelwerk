// AP-1.30 PR 9a: Feldschlüssel des SchreibBeobachters für die ganzzeilig ersetzenden Befehle
// `aussage.aendern` und `ereignis.aendern` — je Zeile ein Schlüssel, unabhängig vom geänderten Feld
// (Begründung wie `schreibFeldNameAendern`, V-130-2a-rundreise).
import { describe, expect, it } from 'vitest'
import { schreibFeldAussageAendern, schreibFeldEreignisAendern } from '../../src/renderer/brücke/schreib-beobachter'

describe('SchreibBeobachter-Schlüssel für aussage.aendern / ereignis.aendern (AP-1.30 PR 9a)', () => {
  it('aussage.aendern: ein Schlüssel je Aussage, gleich für jedes Feld', () => {
    const konfidenz = schreibFeldAussageAendern({ id: 'a1', konfidenz: 2, datumBeibehalten: true, feld: 'konfidenz' })
    const text = schreibFeldAussageAendern({ id: 'a1', wertText: 'x', konfidenz: 2, feld: 'wertText' })
    expect(konfidenz).toBe('aussage.aendern:a1')
    expect(text).toBe(konfidenz)
    expect(schreibFeldAussageAendern({ id: 'a2', konfidenz: 2, datumBeibehalten: true })).not.toBe(konfidenz)
  })

  it('ereignis.aendern: ein Schlüssel je Ereignis', () => {
    expect(schreibFeldEreignisAendern({ id: 'e1', typ: 'geburt', feld: 'notiz' })).toBe('ereignis.aendern:e1')
    expect(schreibFeldEreignisAendern({ id: 'e1', typ: 'geburt' })).toBe('ereignis.aendern:e1')
  })
})
