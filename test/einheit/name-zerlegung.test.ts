// AP-1.33 (hueter-Auflage 1): test/einheit/name-zerlegung.test.ts — deckt die reine Kern-Funktion
// `zerlegeName` (src/core/name/zerlegung.ts) ab, insbesondere den Kollisionsfall „rufname_text ist
// unter den Vornamen, aber rufname_index markiert keinen": der vorhandene Vorname-Token muss dann
// als Rufname markiert werden (verlustfrei), OHNE einen zweiten „Hans"-Token anzulegen. Kein Node/
// SQL — reine Datenstruktur-Eingabe, deterministisch.
import { describe, expect, it } from 'vitest'
import { zerlegeName } from '../../src/core/name/zerlegung'

describe('zerlegeName (src/core/name/zerlegung.ts, AP-1.33)', () => {
  it('markiert einen vorhandenen Vorname-Token als Rufname, wenn rufname_text ihn trifft und rufname_index leer ist', () => {
    // vornamen='Hans Peter', rufname_index=NULL, rufname_text='Hans' (Rufname IST unter den Vornamen).
    const teile = zerlegeName({ vornamen: 'Hans Peter', rufnameIndex: null, rufnameText: 'Hans', nachname: 'Weber' })

    const vornamen = teile.filter((teil) => teil.art === 'vorname')
    expect(vornamen.map((teil) => teil.wert)).toEqual(['Hans', 'Peter'])

    // Genau EIN „Hans"-Vorname (kein zusätzlicher Token) …
    const hansTeile = vornamen.filter((teil) => teil.wert === 'Hans')
    expect(hansTeile).toHaveLength(1)

    // … und genau dieser Token trägt ist_rufname.
    const rufnamen = vornamen.filter((teil) => teil.istRufname)
    expect(rufnamen.map((teil) => teil.wert)).toEqual(['Hans'])
  })

  it('rufname_index hat Vorrang vor rufname_text', () => {
    // rufname_index=1 markiert 'Peter'; rufname_text='Hans' darf keinen zweiten Rufname setzen.
    const teile = zerlegeName({ vornamen: 'Hans Peter', rufnameIndex: 1, rufnameText: 'Hans' })
    const rufnamen = teile.filter((teil) => teil.art === 'vorname' && teil.istRufname)
    expect(rufnamen.map((teil) => teil.wert)).toEqual(['Peter'])
  })

  it('rufname_text als eigenständiger Zusatz-Vorname bleibt, wenn er KEIN vorhandener Token ist', () => {
    const teile = zerlegeName({ vornamen: 'Johann Baptist', rufnameIndex: null, rufnameText: 'Hans' })
    const vornamen = teile.filter((teil) => teil.art === 'vorname')
    expect([...vornamen.map((teil) => teil.wert)].sort()).toEqual(['Baptist', 'Hans', 'Johann'])
    const rufnamen = vornamen.filter((teil) => teil.istRufname)
    expect(rufnamen.map((teil) => teil.wert)).toEqual(['Hans'])
  })
})
