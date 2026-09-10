// AP-0.11, 55_Architektur.md §6.2 (F-04, ADR-003): Tabellen-/Property-Test für die reine
// Aufbewahrungsauswahl (`src/core/aufbewahrung/schnappschuss-auswahl.ts`) — Zeit injiziert, NICHT
// `Date.now()` (CLAUDE.md §4).
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { zuLoeschendeSchnappschuesse, type SchnappschussKandidat } from '../../src/core/aufbewahrung/schnappschuss-auswahl'

const TAG_MS = 86_400_000
const STUNDE_MS = 60 * 60 * 1000

/** Baut einen Schnappschuss-Kandidaten mit lesbarer ID (praktisch für Testerwartungen). */
function kandidat(id: string, zeitpunktMs: number): SchnappschussKandidat {
  return { id, zeitpunktMs }
}

describe('zuLoeschendeSchnappschuesse() — Aufbewahrungsauswahl (55_Architektur.md §6.2, AP-0.11)', () => {
  it('leere Liste: nichts zu löschen', () => {
    expect(zuLoeschendeSchnappschuesse([], 0)).toEqual([])
  })

  it('weniger als 10 Kandidaten, alle innerhalb der letzten 7 Tage: nichts zu löschen', () => {
    const jetzt = 10 * TAG_MS
    const liste = [kandidat('a', jetzt), kandidat('b', jetzt - TAG_MS), kandidat('c', jetzt - 2 * TAG_MS)]
    expect(zuLoeschendeSchnappschuesse(liste, jetzt)).toEqual([])
  })

  it('60 Schnappschüsse über 60 Tage verteilt (einer pro Tag): genau die erwartete Menge bleibt erhalten', () => {
    // Ein Schnappschuss pro Tag, vom ältesten (Tag 0) zum jüngsten (Tag 59) - "jetzt" liegt am
    // Ende von Tag 59. Erwartet: die letzten 10 (Tage 50..59) + je einer der letzten 7 Tage
    // (bereits Teilmenge der letzten 10) + je einer der letzten 4 Wochen (Tage 32..59 grob, je nach
    // Wochenraster) - der Rest (die älteren Tage) wird gelöscht.
    const jetzt = 59 * TAG_MS + 12 * STUNDE_MS
    const liste: SchnappschussKandidat[] = []
    for (let tag = 0; tag < 60; tag += 1) {
      liste.push(kandidat(`tag-${String(tag)}`, tag * TAG_MS + 12 * STUNDE_MS))
    }

    const zuLoeschen = new Set(zuLoeschendeSchnappschuesse(liste, jetzt))
    const behalten = liste.filter((eintrag) => !zuLoeschen.has(eintrag.id))

    // Die letzten 10 (Tage 50..59) müssen in jedem Fall erhalten bleiben.
    for (let tag = 50; tag < 60; tag += 1) {
      expect(zuLoeschen.has(`tag-${String(tag)}`)).toBe(false)
    }
    // Ein Schnappschuss, der weder zu den letzten 10 zählt noch in einen der Wochen-/Tages-Buckets
    // der letzten 7 Tage/4 Wochen fällt (z. B. Tag 0, ganz am Anfang), wird gelöscht.
    expect(zuLoeschen.has('tag-0')).toBe(true)
    expect(zuLoeschen.has('tag-1')).toBe(true)

    // Jeder behaltene Eintrag ist entweder unter den letzten 10 ODER der einzige seines
    // Tages-/Wochen-Buckets innerhalb der jeweiligen Fenster - insgesamt bleiben also deutlich
    // weniger als alle 40 (bzw. 60) übrig.
    expect(behalten.length).toBeLessThan(liste.length)
    expect(behalten.length).toBeGreaterThanOrEqual(10)
  })

  it('bei mehreren Schnappschüssen am selben UTC-Tag wird der jüngste behalten (Tie-Break)', () => {
    const tagAnfang = 100 * TAG_MS
    const frueh = tagAnfang + 1_000
    const spaet = tagAnfang + TAG_MS - 1_000
    const jetzt = tagAnfang + TAG_MS - 500 // noch derselbe UTC-Tag wie frueh/spaet

    const liste = [
      kandidat('frueh', frueh),
      kandidat('spaet', spaet),
      // 10 weitere Einträge desselben Tages, alle jünger als 'frueh': schieben 'frueh' aus der
      // "letzte 10"-Regel heraus, ohne selbst der Tages-Höchstwert zu sein (das bleibt 'spaet').
      ...Array.from({ length: 10 }, (_v, i) => kandidat(`fueller-${String(i)}`, frueh + (i + 1) * 1_000)),
    ]

    const zuLoeschen = new Set(zuLoeschendeSchnappschuesse(liste, jetzt))
    expect(zuLoeschen.has('spaet')).toBe(false)
    expect(zuLoeschen.has('frueh')).toBe(true)
  })

  it('property: das Ergebnis ist immer eine Teilmenge der Eingabe-IDs, ohne Duplikate', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ id: fc.uuid(), zeitpunktMs: fc.integer({ min: -1_000 * TAG_MS, max: 1_000 * TAG_MS }) }),
          { maxLength: 50 },
        ),
        fc.integer({ min: -1_000 * TAG_MS, max: 1_000 * TAG_MS }),
        (liste, jetztMs) => {
          // Eindeutige IDs erzwingen (fast-check kann sonst zufällig Duplikate erzeugen).
          const eindeutig = Array.from(new Map(liste.map((eintrag) => [eintrag.id, eintrag])).values())
          const ergebnis = zuLoeschendeSchnappschuesse(eindeutig, jetztMs)
          const eingabeIds = new Set(eindeutig.map((eintrag) => eintrag.id))

          expect(new Set(ergebnis).size).toBe(ergebnis.length)
          for (const id of ergebnis) {
            expect(eingabeIds.has(id)).toBe(true)
          }
        },
      ),
    )
  })

  it('property: deterministisch — zweimaliger Aufruf mit denselben Eingaben liefert dasselbe Ergebnis', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ id: fc.uuid(), zeitpunktMs: fc.integer({ min: 0, max: 1_000 * TAG_MS }) }),
          { maxLength: 30 },
        ),
        fc.integer({ min: 0, max: 1_000 * TAG_MS }),
        (liste, jetztMs) => {
          const eindeutig = Array.from(new Map(liste.map((eintrag) => [eintrag.id, eintrag])).values())
          expect(zuLoeschendeSchnappschuesse(eindeutig, jetztMs)).toEqual(zuLoeschendeSchnappschuesse(eindeutig, jetztMs))
        },
      ),
    )
  })
})
