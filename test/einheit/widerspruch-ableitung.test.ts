// AP-1.7 PR-A, test/einheit/widerspruch-ableitung.test.ts (CLAUDE.md §5 eiserne Regel: erst der
// Test — VOR der Implementierung von src/core/aussage/widerspruch.ts geschrieben). Prüft die reine
// Core-Funktion `hatWiderspruch()` direkt, ohne Datenbank (kein geschützter Prüfpfad, CLAUDE.md
// §13 — diese Datei liegt bewusst NICHT unter test/invarianten/). Deckt exakt die Regel des
// generierten Triggers `abl_aussage_ai` (docs/schema/0003_abgeleitet.sql Z.66-75) ab: mindestens
// zwei unterscheidbare Wert-Tupel UND keine bevorzugte Aussage.
//
// hueter-Auflage 1 (PR #65, E21): zusätzlich `anzahlUnterscheidbareWerte()` — das kanonische
// "es gibt konkurrierende Angaben"-Signal je Feld, das AUCH dann noch true bleibt, wenn der
// Widerspruch durch eine Bevorzugung bereits aufgelöst ist (`hatWiderspruch=false`). `hatWiderspruch`
// nutzt dieselbe Funktion, damit es genau EINE Tupelquelle für Distinktheit gibt.
import { describe, expect, it } from 'vitest'
import { anzahlUnterscheidbareWerte, hatWiderspruch, type AussageFuerWiderspruch } from '../../src/core/aussage/widerspruch'

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

describe('anzahlUnterscheidbareWerte (src/core/aussage/widerspruch.ts, hueter-Auflage 1 PR #65)', () => {
  it('keine Aussagen: 0 unterscheidbare Werte', () => {
    expect(anzahlUnterscheidbareWerte([])).toBe(0)
  })

  it('eine Aussage: genau 1 unterscheidbarer Wert', () => {
    expect(anzahlUnterscheidbareWerte([aussage({ wertText: 'Bauer' })])).toBe(1)
  })

  it('zwei identische Aussagen (auch mehrfach erfasst) zählen als 1 unterscheidbarer Wert', () => {
    const aussagen = [aussage({ wertText: 'Schmied' }), aussage({ wertText: 'Schmied' }), aussage({ wertText: 'Schmied' })]

    expect(anzahlUnterscheidbareWerte(aussagen)).toBe(1)
  })

  it('zwei abweichende Werte zählen als 2 unterscheidbare Werte — UNABHÄNGIG von einer Bevorzugung', () => {
    const aussagenAufgeloest = [aussage({ datumWert1: '1961', istBevorzugt: true }), aussage({ datumWert1: '1958' })]
    const aussagenOffen = [aussage({ datumWert1: '1961' }), aussage({ datumWert1: '1958' })]

    expect(anzahlUnterscheidbareWerte(aussagenAufgeloest)).toBe(2)
    expect(anzahlUnterscheidbareWerte(aussagenOffen)).toBe(2)
  })

  it('drei Aussagen mit nur zwei unterschiedlichen Werten: 2 unterscheidbare Werte', () => {
    const aussagen = [aussage({ wertText: 'Bauer' }), aussage({ wertText: 'Schmied' }), aussage({ wertText: 'Bauer' })]

    expect(anzahlUnterscheidbareWerte(aussagen)).toBe(2)
  })
})
