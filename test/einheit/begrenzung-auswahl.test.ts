// AP-0.11, 55_Architektur.md §4.6 (ADR-003): Tabellen-/Property-Test für die reine
// Journalbegrenzungsauswahl (`src/core/journal/begrenzung-auswahl.ts`) — Zeit injiziert, NICHT
// `Date.now()` (CLAUDE.md §4).
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { zuBegrenzendeTransaktionen, type JournalTransaktionKandidat } from '../../src/core/journal/begrenzung-auswahl'

const TAG_MS = 86_400_000

function kandidat(id: string, zeitpunktMs: number, lfd: number): JournalTransaktionKandidat {
  return { id, zeitpunktMs, lfd }
}

describe('zuBegrenzendeTransaktionen() — Journalbegrenzungsauswahl (55_Architektur.md §4.6, AP-0.11)', () => {
  it('leere Liste: nichts zu begrenzen', () => {
    expect(zuBegrenzendeTransaktionen([], 0)).toEqual([])
  })

  it('weniger als 200 Transaktionen, alle jünger als 30 Tage: nichts zu begrenzen', () => {
    const jetzt = 100 * TAG_MS
    const liste = [kandidat('a', jetzt, 1), kandidat('b', jetzt - TAG_MS, 2), kandidat('c', jetzt - 5 * TAG_MS, 3)]
    expect(zuBegrenzendeTransaktionen(liste, jetzt)).toEqual([])
  })

  it('eine einzelne Transaktion älter als 30 Tage, aber unter den letzten 200 (nach lfd): bleibt erhalten', () => {
    const jetzt = 100 * TAG_MS
    const liste = [kandidat('alt-aber-neu-lfd', jetzt - 40 * TAG_MS, 1)]
    expect(zuBegrenzendeTransaktionen(liste, jetzt)).toEqual([])
  })

  it('250 Transaktionen, alle älter als 30 Tage: genau die ältesten 50 (lfd 1..50) werden begrenzt, die letzten 200 (lfd 51..250) bleiben', () => {
    const jetzt = 1_000 * TAG_MS
    const liste: JournalTransaktionKandidat[] = []
    for (let lfd = 1; lfd <= 250; lfd += 1) {
      // Alle weit älter als 30 Tage - der Zeitpunkt selbst sinkt mit steigender lfd nicht
      // notwendigerweise streng monoton in der Praxis, hier der Einfachheit halber schon.
      liste.push(kandidat(`tx-${String(lfd)}`, jetzt - (300 - lfd) * TAG_MS, lfd))
    }

    const zuBegrenzen = zuBegrenzendeTransaktionen(liste, jetzt)
    expect(zuBegrenzen).toHaveLength(50)
    for (let lfd = 1; lfd <= 50; lfd += 1) {
      expect(zuBegrenzen).toContain(`tx-${String(lfd)}`)
    }
    for (let lfd = 51; lfd <= 250; lfd += 1) {
      expect(zuBegrenzen).not.toContain(`tx-${String(lfd)}`)
    }
  })

  it('eine Transaktion mit hoher lfd, aber jünger als 30 Tage, bleibt auch dann erhalten, wenn 200 jüngere lfd-Werte existieren', () => {
    const jetzt = 1_000 * TAG_MS
    const liste: JournalTransaktionKandidat[] = [kandidat('jung-niedrige-lfd', jetzt - TAG_MS, 1)]
    for (let lfd = 2; lfd <= 210; lfd += 1) {
      liste.push(kandidat(`tx-${String(lfd)}`, jetzt - 500 * TAG_MS, lfd))
    }

    const zuBegrenzen = zuBegrenzendeTransaktionen(liste, jetzt)
    expect(zuBegrenzen).not.toContain('jung-niedrige-lfd')
  })

  it('property: das Ergebnis ist immer eine Teilmenge der Eingabe-IDs, ohne Duplikate', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            zeitpunktMs: fc.integer({ min: 0, max: 1_000 * TAG_MS }),
            lfd: fc.integer({ min: 1, max: 100_000 }),
          }),
          { maxLength: 50 },
        ),
        fc.integer({ min: 0, max: 1_000 * TAG_MS }),
        (liste, jetztMs) => {
          const eindeutig = Array.from(new Map(liste.map((eintrag) => [eintrag.id, eintrag])).values())
          const ergebnis = zuBegrenzendeTransaktionen(eindeutig, jetztMs)
          const eingabeIds = new Set(eindeutig.map((eintrag) => eintrag.id))

          expect(new Set(ergebnis).size).toBe(ergebnis.length)
          for (const id of ergebnis) {
            expect(eingabeIds.has(id)).toBe(true)
          }
        },
      ),
    )
  })

  it('property: mindestens die letzten 200 (nach lfd) sind NIE im Ergebnis', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            zeitpunktMs: fc.integer({ min: 0, max: 1_000 * TAG_MS }),
            lfd: fc.integer({ min: 1, max: 100_000 }),
          }),
          { minLength: 1, maxLength: 60 },
        ),
        fc.integer({ min: 0, max: 1_000 * TAG_MS }),
        (liste, jetztMs) => {
          const eindeutig = Array.from(new Map(liste.map((eintrag) => [eintrag.id, eintrag])).values())
          const top200Ids = new Set(
            [...eindeutig].sort((a, b) => b.lfd - a.lfd).slice(0, 200).map((eintrag) => eintrag.id),
          )
          const ergebnis = zuBegrenzendeTransaktionen(eindeutig, jetztMs)
          for (const id of ergebnis) {
            expect(top200Ids.has(id)).toBe(false)
          }
        },
      ),
    )
  })
})
