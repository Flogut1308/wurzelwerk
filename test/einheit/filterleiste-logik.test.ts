// AP-1.6 Stufe 3 (C-16/C-17), CLAUDE.md §5 eiserne Regel: erst der Test.
import { describe, expect, it } from 'vitest'
import {
  boolZuUmschalterZustand,
  filterWertZuKonfidenzMin,
  konfidenzMinZuFilterWert,
  tristateFilterZuZustand,
  umschalterZustandZuBool,
  zustandZuTristateFilter,
} from '../../src/renderer/bausteine/filterleiste-logik'

describe('Tristate-Filter <-> Umschalter (src/renderer/bausteine/filterleiste-logik.ts, AP-1.6)', () => {
  it('bildet "ohne"/"nur"/"alle" auf "aus"/"ein"/"unbestimmt" ab', () => {
    expect(tristateFilterZuZustand('ohne')).toBe('aus')
    expect(tristateFilterZuZustand('nur')).toBe('ein')
    expect(tristateFilterZuZustand('alle')).toBe('unbestimmt')
  })

  it('ist die exakte Umkehrung von zustandZuTristateFilter (Rundreise)', () => {
    for (const wert of ['ohne', 'nur', 'alle'] as const) {
      expect(zustandZuTristateFilter(tristateFilterZuZustand(wert))).toBe(wert)
    }
  })
})

describe('Boolescher Widerspruchsfilter <-> Umschalter (AP-1.6)', () => {
  it('false wird als "aus" angezeigt, true als "ein"', () => {
    expect(boolZuUmschalterZustand(false)).toBe('aus')
    expect(boolZuUmschalterZustand(true)).toBe('ein')
  })

  it('ein voller Klickzyklus (aus->ein->unbestimmt) schaltet genau zweimal um: false->true->false', () => {
    let wert = false
    // Klick 1: aus -> ein
    wert = umschalterZustandZuBool('ein')
    expect(wert).toBe(true)
    // Klick 2 (Zustand war "ein", Umschalter geht weiter zu "unbestimmt"): muss wieder false ergeben
    wert = umschalterZustandZuBool('unbestimmt')
    expect(wert).toBe(false)
    // Klick 3 (Zustand war jetzt wieder "aus" gerendert, Umschalter geht zu "ein"): wieder true
    wert = umschalterZustandZuBool('ein')
    expect(wert).toBe(true)
  })
})

describe('Konfidenz-Mindestwert <-> Auswahlfeld-Wert (AP-1.6)', () => {
  it('undefined wird zu "alle" und zurück', () => {
    expect(konfidenzMinZuFilterWert(undefined)).toBe('alle')
    expect(filterWertZuKonfidenzMin('alle')).toBeUndefined()
  })

  it('jede Konfidenzstufe rundet sich verlustfrei (Rundreise)', () => {
    for (const stufe of [1, 2, 3, 4] as const) {
      expect(filterWertZuKonfidenzMin(konfidenzMinZuFilterWert(stufe))).toBe(stufe)
    }
  })
})
