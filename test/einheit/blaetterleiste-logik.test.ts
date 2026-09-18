// AP-1.6 Stufe 3 (C-16), CLAUDE.md §5 eiserne Regel: erst der Test. Deckt `blaetterleisteBerechnen`
// aus `src/renderer/bausteine/blaetterleiste-logik.ts` — insbesondere den Randfall `gesamt === 0`,
// der bei einer naiven `Math.ceil(0 / proSeite)`-Rechnung „Seite 1 von 0" ergäbe.
import { describe, expect, it } from 'vitest'
import { blaetterleisteBerechnen } from '../../src/renderer/bausteine/blaetterleiste-logik'

describe('blaetterleisteBerechnen (src/renderer/bausteine/blaetterleiste-logik.ts, AP-1.6)', () => {
  it('erste Seite einer vollen Liste: von=1, bis=proSeite', () => {
    const ergebnis = blaetterleisteBerechnen({ seite: 1, proSeite: 100, gesamt: 284 })
    expect(ergebnis).toEqual({ gesamtSeiten: 3, von: 1, bis: 100, zurueckMoeglich: false, vorMoeglich: true })
  })

  it('letzte Seite einer nicht vollen Liste: bis = gesamt, nicht seite*proSeite', () => {
    const ergebnis = blaetterleisteBerechnen({ seite: 3, proSeite: 100, gesamt: 284 })
    expect(ergebnis).toEqual({ gesamtSeiten: 3, von: 201, bis: 284, zurueckMoeglich: true, vorMoeglich: false })
  })

  it('mittlere Seite: sowohl zurück als auch vor möglich', () => {
    const ergebnis = blaetterleisteBerechnen({ seite: 2, proSeite: 100, gesamt: 284 })
    expect(ergebnis.zurueckMoeglich).toBe(true)
    expect(ergebnis.vorMoeglich).toBe(true)
  })

  it('gesamt === 0: gesamtSeiten bleibt 1 (nicht 0), von/bis sind 0, kein Blättern möglich', () => {
    const ergebnis = blaetterleisteBerechnen({ seite: 1, proSeite: 100, gesamt: 0 })
    expect(ergebnis).toEqual({ gesamtSeiten: 1, von: 0, bis: 0, zurueckMoeglich: false, vorMoeglich: false })
  })

  it('gesamt genau durch proSeite teilbar: letzte Seite endet exakt auf gesamt', () => {
    const ergebnis = blaetterleisteBerechnen({ seite: 2, proSeite: 100, gesamt: 200 })
    expect(ergebnis).toEqual({ gesamtSeiten: 2, von: 101, bis: 200, zurueckMoeglich: true, vorMoeglich: false })
  })
})
