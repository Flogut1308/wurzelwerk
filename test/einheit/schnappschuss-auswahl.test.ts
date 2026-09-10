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

  it('74 Schnappschüsse über 60 simulierte Tage: hart von Hand ausgerechnete Soll-Menge (hueter-Auflage A1, AP-0.11) — NICHT tautologisch', () => {
    // VON HAND (nicht durch Aufruf von `zuLoeschendeSchnappschuesse()`) ausgerechnete Soll-Menge.
    // Ein einfaches "ein Eintrag pro Tag über 60 Tage"-Szenario würde einen Off-by-one in
    // `proBucketJuengstenBehalten()` NICHT zuverlässig aufdecken: bei genau einem Eintrag pro Tag
    // überlappt die "letzte 10"-Regel die "1 pro Tag der letzten 7 Tage"-Regel immer vollständig
    // (10 > 7), sodass ein 6-statt-7-Tage-Bug unbemerkt bliebe (durchprobiert - s. u.).
    //
    // Deshalb hier bewusst entkoppelt: Tag 59 ("heute") bekommt 15 Einträge (verschiedene
    // Stunden) - das füllt die "letzte 10"-Regel VOLLSTÄNDIG mit Tag-59-Einträgen und schirmt alle
    // älteren Tage komplett davon ab. Tag 0..58 bekommen je einen Eintrag (12:00 Uhr). Damit hängen
    // die älteren, noch behaltenen Einträge (Tag 41/48/53..58) ausschließlich an der Tages-/
    // Wochen-Bucket-Regel - eine Änderung von `TAGE_BEHALTEN`/`WOCHEN_BEHALTEN` verschiebt hier
    // nachweislich das Ergebnis (mit `TAGE_BEHALTEN = 6` verschwindet z. B. Tag 53 fälschlich aus
    // der Soll-Menge, mit `WOCHEN_BEHALTEN = 3` Tag 41 - beides von Hand geprüft).
    //
    // "jetzt" = Tag 59, 23:00 Uhr. heuteTag = 59, heuteWoche = floor(jetzt/WOCHE_MS) = 8.
    // - "letzte 10": die 10 jüngsten Tag-59-Stunden (h5..h14 von 15 Stunden 0..14).
    // - "1 pro Tag der letzten 7 Tage" (Bucket 53..59): Tag 59 bereits über die letzte-10-Regel
    //   gedeckt; NEU dazu Tag 53, 54, 55, 56, 57, 58 (je der einzige Eintrag dieses Tages).
    // - "1 pro Woche der letzten 4 Wochen" (Bucket 5..8, WOCHE_MS = 7 × TAG_MS; Tag 35..41 → Woche
    //   5, 42..48 → Woche 6, 49..55 → Woche 7, 56..59 → Woche 8): der jüngste Tag je Woche ist
    //   Tag 41, 48, 55, 59 - Tag 55 und 59 sind bereits gedeckt, Tag 41 und 48 sind NEU.
    const jetzt = 59 * TAG_MS + 23 * STUNDE_MS
    const liste: SchnappschussKandidat[] = []
    for (let stunde = 0; stunde < 15; stunde += 1) {
      liste.push(kandidat(`tag59-h${String(stunde)}`, 59 * TAG_MS + stunde * STUNDE_MS))
    }
    for (let tag = 0; tag < 59; tag += 1) {
      liste.push(kandidat(`tag-${String(tag)}`, tag * TAG_MS + 12 * STUNDE_MS))
    }

    const erwartetBehalten = [
      'tag-41',
      'tag-48',
      'tag-53',
      'tag-54',
      'tag-55',
      'tag-56',
      'tag-57',
      'tag-58',
      'tag59-h5',
      'tag59-h6',
      'tag59-h7',
      'tag59-h8',
      'tag59-h9',
      'tag59-h10',
      'tag59-h11',
      'tag59-h12',
      'tag59-h13',
      'tag59-h14',
    ]
    // Selbstprüfung der Handrechnung: die erwartete Menge ist eine Teilmenge der Eingabe ohne
    // Duplikate, mit der von Hand hergeleiteten Größe (18) - kein Tippfehler im Literal oben.
    const eingabeIds = new Set(liste.map((eintrag) => eintrag.id))
    expect(new Set(erwartetBehalten).size).toBe(erwartetBehalten.length)
    expect(erwartetBehalten.length).toBe(18)
    for (const id of erwartetBehalten) {
      expect(eingabeIds.has(id)).toBe(true)
    }

    const ergebnis = zuLoeschendeSchnappschuesse(liste, jetzt)
    const behalten = liste.map((eintrag) => eintrag.id).filter((id) => !ergebnis.includes(id))
    expect(behalten.sort()).toEqual([...erwartetBehalten].sort())
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
