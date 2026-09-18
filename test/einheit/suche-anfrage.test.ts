// AP-1.6 PR1, C-16/C-17: rote Tests für die reine Kern-Funktion `sucheAnfrageBauen`
// (src/core/suche/anfrage.ts) — VOR der Implementierung geschrieben (CLAUDE.md §5). Reine Logik,
// keine Datenbank (CLAUDE.md §2: src/core ist reines TypeScript) — deckt Tokenisierung,
// FTS5-Escaping (doppelte Anführungszeichen verdoppeln, Tokens als Phrasen quoten) und die
// Kölner-Codes je Token ab. Apostrophe in genealogischen Namen (O'Brien, d'Aboville) dürfen die
// gebaute MATCH-Anfrage nicht syntaktisch brechen — geprüft hier auf Ebene der reinen
// String-Konstruktion, end-to-end gegen echtes FTS5 zusätzlich in
// test/einheit/suche-mehrschriftig.test.ts.
import { describe, expect, it } from 'vitest'
import { sucheAnfrageBauen } from '../../src/core/suche/anfrage'

describe('sucheAnfrageBauen (AP-1.6 PR1, core, rein)', () => {
  it('baut aus einem einzelnen Wort eine einzige gequotete Phrase', () => {
    const anfrage = sucheAnfrageBauen('Schmidt')
    expect(anfrage.tokens).toEqual(['Schmidt'])
    expect(anfrage.matchAusdruck).toBe('"Schmidt"')
  })

  it('tokenisiert mehrere durch Leerraum getrennte Wörter (auch mehrfachen/verschiedenen Leerraum) und verknüpft die Phrasen mit Leerzeichen (FTS5-Standard: implizites UND)', () => {
    const anfrage = sucheAnfrageBauen('Anna   Müller\tSchmidt')
    expect(anfrage.tokens).toEqual(['Anna', 'Müller', 'Schmidt'])
    expect(anfrage.matchAusdruck).toBe('"Anna" "Müller" "Schmidt"')
  })

  it('trimmt führenden/nachfolgenden Leerraum', () => {
    const anfrage = sucheAnfrageBauen('  Schmidt  ')
    expect(anfrage.tokens).toEqual(['Schmidt'])
    expect(anfrage.matchAusdruck).toBe('"Schmidt"')
  })

  it('liefert eine leere Anfrage für leere Eingabe, ohne einen ungültigen MATCH-Ausdruck zu bauen', () => {
    const anfrage = sucheAnfrageBauen('')
    expect(anfrage.tokens).toEqual([])
    expect(anfrage.matchAusdruck).toBe('')
    expect(anfrage.koelnerCodes).toEqual([])
  })

  it('liefert eine leere Anfrage für reinen Leerraum', () => {
    const anfrage = sucheAnfrageBauen('   \t  ')
    expect(anfrage.tokens).toEqual([])
    expect(anfrage.matchAusdruck).toBe('')
  })

  it('lässt einen Apostroph innerhalb eines Namens unverändert in der Phrase stehen (O\'Brien bricht die Query nicht)', () => {
    const anfrage = sucheAnfrageBauen("O'Brien")
    expect(anfrage.tokens).toEqual(["O'Brien"])
    expect(anfrage.matchAusdruck).toBe('"O\'Brien"')
  })

  it('lässt einen führenden Apostroph unverändert (d\'Aboville bricht die Query nicht)', () => {
    const anfrage = sucheAnfrageBauen("d'Aboville")
    expect(anfrage.tokens).toEqual(["d'Aboville"])
    expect(anfrage.matchAusdruck).toBe('"d\'Aboville"')
  })

  it('verdoppelt ein doppeltes Anführungszeichen in der Eingabe (FTS5-Escaping für Literalzeichen in Phrasen)', () => {
    const anfrage = sucheAnfrageBauen('Sch"midt')
    expect(anfrage.matchAusdruck).toBe('"Sch""midt"')
  })

  it('verdoppelt mehrere doppelte Anführungszeichen in einem Token', () => {
    const anfrage = sucheAnfrageBauen('"Spitzname"')
    expect(anfrage.matchAusdruck).toBe('"""Spitzname"""')
  })

  it('liefert je Token einen Kölner-Phonetik-Code, leere Codes werden ausgelassen', () => {
    const anfrage = sucheAnfrageBauen('Meyer 123')
    expect(anfrage.tokens).toEqual(['Meyer', '123'])
    expect(anfrage.koelnerCodes).toHaveLength(1)
    expect(anfrage.koelnerCodes[0]).not.toBe('')
  })

  it('Meyer und Maier liefern denselben Kölner-Code (phonetische Äquivalenz, Grundlage für die schwächere zweite Suchquelle)', () => {
    const meyer = sucheAnfrageBauen('Meyer')
    const maier = sucheAnfrageBauen('Maier')
    expect(meyer.koelnerCodes).toEqual(maier.koelnerCodes)
    expect(meyer.koelnerCodes).toHaveLength(1)
  })
})
