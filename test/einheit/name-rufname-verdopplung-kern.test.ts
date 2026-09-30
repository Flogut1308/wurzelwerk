// A-02, AP-1.30 (U-130-rufname-doppelt, docs/80 §33): die reine Erkennung `rufnameWuerdeVerdoppelt`
// (src/core/name/rufname-verdopplung.ts). Sie muss GENAU die Fälle treffen, in denen `zerlegeName`
// (unverändert, Regel 3) einen mehrwortigen Rufnamen anhängt, dessen Wörter schon als Folge in den
// Vornamen stehen — Gegenprobe darum jeweils an `zerlegeName` selbst.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { rufnameWuerdeVerdoppelt } from '../../src/core/name/rufname-verdopplung'
import { rekonstruiereFlach, zerlegeName, type FlacherName } from '../../src/core/name/zerlegung'

describe('rufnameWuerdeVerdoppelt', () => {
  it.each<[string, FlacherName]>([
    ['„Hans Peter" + „Hans Peter"', { vornamen: 'Hans Peter', rufnameText: 'Hans Peter' }],
    ['„Johann Georg Karl" + „Johann Georg" (Anfang)', { vornamen: 'Johann Georg Karl', rufnameText: 'Johann Georg' }],
    ['„Karl Hans Peter" + „Hans Peter" (Ende)', { vornamen: 'Karl Hans Peter', rufnameText: 'Hans Peter' }],
    ['„Karl Hans Peter Otto" + „Hans Peter" (Mitte)', { vornamen: 'Karl Hans Peter Otto', rufnameText: 'Hans Peter' }],
    ['Leerraum normiert', { vornamen: ' Hans\tPeter ', rufnameText: 'Hans   Peter ' }],
    ['Index null', { vornamen: 'Hans Peter', rufnameText: 'Hans Peter', rufnameIndex: null }],
    ['Index negativ', { vornamen: 'Hans Peter', rufnameText: 'Hans Peter', rufnameIndex: -1 }],
    ['Index hinter den Vornamen', { vornamen: 'Hans Peter', rufnameText: 'Hans Peter', rufnameIndex: 2 }],
  ])('trifft: %s', (_titel, flach) => {
    expect(rufnameWuerdeVerdoppelt(flach)).toBe(true)
  })

  it.each<[string, FlacherName]>([
    ['Teilwort „Hans Peterson"', { vornamen: 'Hans Peterson', rufnameText: 'Hans Peter' }],
    ['Teilwort vorn „Johannes Peter"', { vornamen: 'Johannes Peter', rufnameText: 'Hans Peter' }],
    ['andere Reihenfolge „Peter Hans"', { vornamen: 'Peter Hans', rufnameText: 'Hans Peter' }],
    ['nicht zusammenhängend „Hans Karl Peter"', { vornamen: 'Hans Karl Peter', rufnameText: 'Hans Peter' }],
    ['einwortig', { vornamen: 'Hans Peter', rufnameText: 'Peter' }],
    ['einwortig mit Leerraum', { vornamen: 'Hans Peter', rufnameText: ' Peter ' }],
    ['gültiger Index 0', { vornamen: 'Hans Peter', rufnameText: 'Hans Peter', rufnameIndex: 0 }],
    ['gültiger Index 1 (letzter Vorname)', { vornamen: 'Hans Peter', rufnameText: 'Hans Peter', rufnameIndex: 1 }],
    ['Rufname länger als die Vornamen', { vornamen: 'Hans', rufnameText: 'Hans Peter' }],
    ['keine Vornamen', { rufnameText: 'Hans Peter' }],
    ['kein Rufname', { vornamen: 'Hans Peter' }],
    ['leerer Rufname', { vornamen: 'Hans Peter', rufnameText: '' }],
    ['Koseform', { vornamen: 'Friedrich', rufnameText: 'Fritz' }],
    ['mehrwortig, nicht in den Vornamen', { vornamen: 'Karl', rufnameText: 'Hans Peter' }],
    ['Groß-/Kleinschreibung zählt', { vornamen: 'Hans Peter', rufnameText: 'hans peter' }],
  ])('trifft nicht: %s', (_titel, flach) => {
    expect(rufnameWuerdeVerdoppelt(flach)).toBe(false)
  })

  it('zerlegeName bleibt unverändert: im Trefferfall entsteht (weiterhin) die Verdopplung, die abgewiesen wird', () => {
    expect(rekonstruiereFlach(zerlegeName({ vornamen: 'Hans Peter', rufnameText: 'Hans Peter' }))).toMatchObject({
      vornamen: 'Hans Peter Hans Peter',
      rufnameIndex: 2,
      rufnameText: 'Hans Peter',
    })
  })

  // Eigenschaft: ein Treffer bedeutet immer, dass `zerlegeName` einen markierten Vornamen ANHÄNGT
  // (Position hinter allen Vornamen-Wörtern) und dass dessen Wörter schon in den Vornamen standen.
  it('Eigenschaft: Treffer ⇒ zerlegeName hängt einen schon vorhandenen Wortlaut an', () => {
    const wort = fc.constantFrom('Hans', 'Peter', 'Karl', 'Georg', 'Anna')
    fc.assert(
      fc.property(
        fc.array(wort, { maxLength: 5 }),
        fc.array(wort, { minLength: 2, maxLength: 3 }),
        fc.option(fc.integer({ min: -1, max: 6 }), { nil: undefined }),
        (vornamen, rufname, rufnameIndex) => {
          const flach: FlacherName = { vornamen: vornamen.join(' '), rufnameText: rufname.join(' '), rufnameIndex }
          if (!rufnameWuerdeVerdoppelt(flach)) return
          const teile = zerlegeName(flach).filter((teil) => teil.art === 'vorname')
          const angehaengt = teile.find((teil) => teil.istRufname)
          expect(angehaengt?.sortierIndex).toBe(vornamen.length)
          expect(angehaengt?.wert).toBe(rufname.join(' '))
        },
      ),
      { seed: 130, numRuns: 300 },
    )
  })
})
