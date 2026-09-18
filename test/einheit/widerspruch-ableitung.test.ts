// AP-1.7 PR-A, test/einheit/widerspruch-ableitung.test.ts (CLAUDE.md §5 eiserne Regel: erst der
// Test — VOR der Implementierung von src/core/aussage/widerspruch.ts geschrieben). Prüft die reine
// Core-Funktion `hatWiderspruch()` direkt, ohne Datenbank (kein geschützter Prüfpfad, CLAUDE.md
// §13 — diese Datei liegt bewusst NICHT unter test/invarianten/). Deckt exakt die Regel des
// generierten Triggers `abl_aussage_ai` (docs/schema/0003_abgeleitet.sql Z.66-75) ab: mindestens
// zwei unterscheidbare Wert-Tupel UND keine bevorzugte Aussage.
import { describe, expect, it } from 'vitest'
import { hatWiderspruch, type AussageFuerWiderspruch } from '../../src/core/aussage/widerspruch'

const LEERES_TUPEL = { wertText: null, wertZahl: null, wertRefId: null, datumWert1: null, datumWert2: null }

function aussage(ueberschreibung: Partial<AussageFuerWiderspruch['wert']> & { readonly istBevorzugt?: boolean }): AussageFuerWiderspruch {
  const { istBevorzugt = false, ...wertUeberschreibung } = ueberschreibung
  return { wert: { ...LEERES_TUPEL, ...wertUeberschreibung }, istBevorzugt }
}

describe('hatWiderspruch (src/core/aussage/widerspruch.ts, AP-1.7 PR-A)', () => {
  it('zwei abweichende todesdatum-Aussagen (1961 vs. 1958) OHNE Bevorzugung: Widerspruch', () => {
    const aussagen = [aussage({ datumWert1: '1961' }), aussage({ datumWert1: '1958' })]

    expect(hatWiderspruch(aussagen)).toBe(true)
  })

  it('sobald EINE der beiden abweichenden Aussagen istBevorzugt ist: kein Widerspruch mehr', () => {
    const aussagen = [aussage({ datumWert1: '1961', istBevorzugt: true }), aussage({ datumWert1: '1958' })]

    expect(hatWiderspruch(aussagen)).toBe(false)
  })

  it('identische Werte (auch mehrfach erfasst) sind kein Widerspruch — nur EIN unterscheidbares Tupel', () => {
    const aussagen = [aussage({ wertText: 'Schmied' }), aussage({ wertText: 'Schmied' })]

    expect(hatWiderspruch(aussagen)).toBe(false)
  })

  it('eine einzelne Aussage ist nie ein Widerspruch', () => {
    const aussagen = [aussage({ wertText: 'Bauer' })]

    expect(hatWiderspruch(aussagen)).toBe(false)
  })

  it('keine Aussagen (leere Gruppe) ist kein Widerspruch', () => {
    expect(hatWiderspruch([])).toBe(false)
  })

  it('drei abweichende Werte, EINE davon bevorzugt: kein Widerspruch (die Bevorzugung allein entscheidet)', () => {
    const aussagen = [aussage({ wertText: 'Bauer' }), aussage({ wertText: 'Schmied', istBevorzugt: true }), aussage({ wertText: 'Schneider' })]

    expect(hatWiderspruch(aussagen)).toBe(false)
  })

  it('unterscheidet sich nur in wert_zahl (nicht wert_text): trotzdem zwei Tupel, also Widerspruch ohne Bevorzugung', () => {
    const aussagen = [aussage({ wertZahl: 12 }), aussage({ wertZahl: 13 })]

    expect(hatWiderspruch(aussagen)).toBe(true)
  })
})
