// AP-1.33 (hueter-Auflage 1): test/einheit/name-zerlegung.test.ts — deckt die reine Kern-Funktion
// `zerlegeName` (src/core/name/zerlegung.ts) ab, insbesondere den Kollisionsfall „rufname_text ist
// unter den Vornamen, aber rufname_index markiert keinen": der vorhandene Vorname-Token muss dann
// als Rufname markiert werden (verlustfrei), OHNE einen zweiten „Hans"-Token anzulegen. Kein Node/
// SQL — reine Datenstruktur-Eingabe, deterministisch.
import { describe, expect, it } from 'vitest'
import { anzeigetextVon } from '../../src/core/name/anzeigename'
import { montiereOriginalText, rekonstruiereFlach, zerlegeName } from '../../src/core/name/zerlegung'

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

// Vorarbeiten AP-1.30, PR 3 (docs/80 §30 U-1.33-vatersname-anzeige): die Rekonstruktion übergeht
// den Vatersnamen nicht mehr; die flachen Felder der alten Namenssicht bleiben unverändert.
describe('rekonstruiereFlach mit Vatersname (U-1.33-vatersname-anzeige)', () => {
  it('liefert den Vatersnamen als eigenes Feld, verkettet in sortierIndex-Reihenfolge', () => {
    const flach = rekonstruiereFlach([
      { art: 'vorname', wert: 'Iwan', istRufname: false, sortierIndex: 0 },
      { art: 'vatersname', wert: 'Petrowitsch', istRufname: false, sortierIndex: 0 },
      { art: 'nachname', wert: 'Iwanow', istRufname: false, sortierIndex: 0 },
    ])
    expect(flach).toMatchObject({ vornamen: 'Iwan', vatersname: 'Petrowitsch', nachname: 'Iwanow', praefix: null })
    expect(rekonstruiereFlach([]).vatersname).toBeNull()
  })
})

// AP-1.30 PR 3 (docs/80 §32 V-3-flache-bruecke-vatersname): Zerlegung und Montage kennen den
// Vatersnamen — sonst löschte die flache Brücke (`name-repo.aktualisieren`) ihn beim Ändern still.
describe('zerlegeName/montiereOriginalText mit Vatersname (V-3-flache-bruecke-vatersname)', () => {
  it('zerlegt den Vatersnamen in GENAU einen Teil mit sortierIndex 0 (auch mehrteilig)', () => {
    const teile = zerlegeName({ vornamen: 'Iwan', vatersname: 'Petrowitsch Sidorow', nachname: 'Iwanow' })
    expect(teile.filter((teil) => teil.art === 'vatersname')).toStrictEqual([
      { art: 'vatersname', wert: 'Petrowitsch Sidorow', istRufname: false, sortierIndex: 0 },
    ])
  })

  it('ein leerer oder fehlender Vatersname erzeugt keinen Teil', () => {
    expect(zerlegeName({ vornamen: 'Iwan', vatersname: '' }).some((teil) => teil.art === 'vatersname')).toBe(false)
    expect(zerlegeName({ vornamen: 'Iwan', vatersname: null }).some((teil) => teil.art === 'vatersname')).toBe(false)
  })

  it('montiert „Titel Vornamen Vatersname Präfix Nachname Zusatz" — gleich dem Anzeigetext', () => {
    const flach = { titelVor: 'Dr.', vornamen: 'Iwan', vatersname: 'Petrowitsch', praefix: 'von', nachname: 'Iwanow', zusatzNach: 'd. Ä.' }
    expect(montiereOriginalText({ vornamen: 'Iwan', vatersname: 'Petrowitsch', nachname: 'Iwanow' })).toBe('Iwan Petrowitsch Iwanow')
    expect(montiereOriginalText(flach)).toBe('Dr. Iwan Petrowitsch von Iwanow d. Ä.')
    expect(montiereOriginalText(flach)).toBe(anzeigetextVon({ teile: zerlegeName(flach), originalText: null }))
  })

  it('Rundreise: rekonstruiereFlach(zerlegeName(x)).vatersname === x.vatersname', () => {
    expect(rekonstruiereFlach(zerlegeName({ vornamen: 'Iwan', vatersname: 'Petrowitsch', nachname: 'Iwanow' })).vatersname).toBe('Petrowitsch')
  })
})
