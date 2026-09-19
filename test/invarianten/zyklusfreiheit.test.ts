// AP-0.9 PR-B2 — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025). Fachliche Invariante aus
// ADR-009 Punkt 2: "Niemand ist eigener Vorfahre" (Zyklusfreiheit). Vorbereitung: den Befehl, der
// eine Elternkante setzt, gibt es noch nicht (der kommt erst ab AP-0.10) - dieser Test prüft
// ausschließlich die reine Funktion `hatZyklus`/`wuerdeZyklusErzeugen` aus `core/graph/zyklus.ts`
// (auf main via PR #16), die dieser spätere Befehl vor jedem Setzen einer Elternkante aufrufen wird.
//
// Richtungserinnerung (s. auch Modul-Kommentar in zyklus.ts): `Elternkante.elternteilId` ist der
// Vorfahre, `Elternkante.kindId` der Nachkomme ("kindId ist Kind von elternteilId"). Ein Zyklus im
// gerichteten Graphen "ist Kind von" bedeutet: jemand wäre sein eigener (Ur-…)Vorfahre. Das ist
// ausdrücklich NICHT dasselbe wie ein ungerichteter Kreis im Familienbild - der entsteht bei jeder
// Cousinenheirat/jedem Ahnenimplex (Diamant-Test unten) und ist legitim, kein Zyklus.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { hatZyklus, wuerdeZyklusErzeugen, type Elternkante } from '../../src/core/graph/zyklus'
import { pruefhinweise } from '../../src/main/abfragen/pruefhinweise'
import { baueFixture } from '../hilfsmittel/fixture-bauen'

/**
 * Arbitrary für einen per Konstruktion azyklischen Elternschaftsgraphen: `knotenAnzahl` Knoten,
 * durchnummeriert `p0..p(n-1)`; jede erzeugte Kante zeigt von einem Kind mit Index `k >= 1` auf
 * einen Elternteil mit STRIKT kleinerem Index (`elternteilIndex = elternteilRoh % k`, und `k >=
 * 1` garantiert `k > 0` als Modulus). Ein Zyklus wäre nur möglich, wenn irgendeine Kante "nach
 * oben" (zu einem gleich- oder höherindizierten Knoten) zeigte - das kommt hier nie vor, die
 * Knotenindizes selbst sind eine gültige topologische Ordnung. Mehrfachkanten (dieselbe
 * Kind/Eltern-Kombination mehrfach) und mehrere Elternteile pro Kind (Diamant/Ahnenimplex) sind
 * ausdrücklich möglich, weil mehrere Kanten pro Kind-Index erzeugt werden können.
 */
function azyklischerGraphArbitrary(): fc.Arbitrary<{ readonly knotenAnzahl: number; readonly kanten: readonly Elternkante[] }> {
  return fc.integer({ min: 1, max: 20 }).chain((knotenAnzahl) =>
    fc
      .array(
        fc.record({
          kindIndex: fc.integer({ min: 1, max: Math.max(1, knotenAnzahl - 1) }),
          elternteilRoh: fc.nat(),
        }),
        { maxLength: 60 },
      )
      .map((eintraege) => ({
        knotenAnzahl,
        kanten: eintraege
          .filter((eintrag) => eintrag.kindIndex <= knotenAnzahl - 1)
          .map((eintrag) => ({
            kindId: `p${eintrag.kindIndex}`,
            elternteilId: `p${eintrag.elternteilRoh % eintrag.kindIndex}`,
          })),
      })),
  )
}

describe('Invariante: Zyklusfreiheit im Elternschaftsgraphen (ADR-009 Punkt 2, „niemand ist eigener Vorfahre“)', () => {
  it('ein per Konstruktion azyklischer Graph (Kind-Index > Elternteil-Index) liefert immer hatZyklus === false', () => {
    fc.assert(
      fc.property(azyklischerGraphArbitrary(), ({ kanten }) => {
        expect(hatZyklus(kanten)).toBe(false)
      }),
      { seed: 20260909, numRuns: 500 },
    )
  })

  it('Rückkante (bestehender Nachkomme wird Elternteil eines seiner Vorfahren) erzeugt immer einen Zyklus', () => {
    fc.assert(
      fc.property(
        azyklischerGraphArbitrary().filter(({ kanten }) => kanten.length > 0),
        fc.nat(),
        ({ kanten }, rohIndex) => {
          // Nicht-null: `kanten.length > 0` ist per `.filter()` oben garantiert, `kanten[index]`
          // existiert also immer für einen per Modulo reduzierten Index (kein `!`, CLAUDE.md §4).
          const index = rohIndex % kanten.length
          const bestehendeKante = kanten[index]
          if (bestehendeKante === undefined) {
            throw new Error('unerreichbar: index < kanten.length per Konstruktion')
          }

          // Die Rückkante macht den bisherigen Elternteil zum Kind seines eigenen Kindes -
          // exakt der Fall "Nachkomme wird Elternteil eines seiner Vorfahren".
          const rueckkante: Elternkante = {
            elternteilId: bestehendeKante.kindId,
            kindId: bestehendeKante.elternteilId,
          }

          expect(wuerdeZyklusErzeugen(kanten, rueckkante)).toBe(true)
          expect(hatZyklus([...kanten, rueckkante])).toBe(true)
        },
      ),
      { seed: 20260909, numRuns: 500 },
    )
  })

  it('Konsistenz: für zyklenfreie Kanten gilt wuerdeZyklusErzeugen(kanten, neu) === hatZyklus([...kanten, neu])', () => {
    fc.assert(
      fc.property(
        azyklischerGraphArbitrary(),
        fc.integer({ min: 0, max: 19 }),
        fc.integer({ min: 0, max: 19 }),
        ({ knotenAnzahl, kanten }, elternteilRoh, kindRoh) => {
          // Indizes bewusst über den ganzen Bereich [0,19] gestreut (nicht nur bis knotenAnzahl-1),
          // damit auch Kanten zu Knoten außerhalb des bisherigen Graphen mitgeprüft werden.
          const neu: Elternkante = { elternteilId: `p${elternteilRoh}`, kindId: `p${kindRoh}` }

          expect(wuerdeZyklusErzeugen(kanten, neu)).toBe(hatZyklus([...kanten, neu]))
          // Referenz auf knotenAnzahl nur, damit die Arbitrary-Form (Objekt statt Tupel) nicht als
          // "ungenutzt" auffällt - der eigentliche Test braucht den Wert nicht separat.
          expect(knotenAnzahl).toBeGreaterThanOrEqual(1)
        },
      ),
      { seed: 20260909, numRuns: 500 },
    )
  })

  it('leere Kantenliste: kein Zyklus', () => {
    expect(hatZyklus([])).toBe(false)
  })

  it('Selbstkante (A ist Kind von A) ist sofort ein Zyklus', () => {
    expect(hatZyklus([{ elternteilId: 'A', kindId: 'A' }])).toBe(true)
  })

  it('Zweierzyklus (A ist Kind von B, B ist Kind von A) ist ein Zyklus', () => {
    const kanten: readonly Elternkante[] = [
      { elternteilId: 'B', kindId: 'A' },
      { elternteilId: 'A', kindId: 'B' },
    ]
    expect(hatZyklus(kanten)).toBe(true)
  })

  it('lineare Kette (A -> B -> C -> D, je Kind von) ist zyklenfrei', () => {
    const kanten: readonly Elternkante[] = [
      { elternteilId: 'A', kindId: 'B' },
      { elternteilId: 'B', kindId: 'C' },
      { elternteilId: 'C', kindId: 'D' },
    ]
    expect(hatZyklus(kanten)).toBe(false)
  })

  it('Diamant/Ahnenimplex (D hat Eltern B und C, beide Kinder von A) ist zyklenfrei - Cousinenheirat ist legitim', () => {
    const kanten: readonly Elternkante[] = [
      { elternteilId: 'A', kindId: 'B' },
      { elternteilId: 'A', kindId: 'C' },
      { elternteilId: 'B', kindId: 'D' },
      { elternteilId: 'C', kindId: 'D' },
    ]
    expect(hatZyklus(kanten)).toBe(false)
  })

  it('Mehrfachkanten (dieselbe Kind/Eltern-Kombination doppelt) erzeugen keinen falschen Zyklus', () => {
    const kanten: readonly Elternkante[] = [
      { elternteilId: 'A', kindId: 'B' },
      { elternteilId: 'A', kindId: 'B' },
    ]
    expect(hatZyklus(kanten)).toBe(false)
  })

  it('wuerdeZyklusErzeugen erkennt eine neue Selbstkante (neu.elternteilId === neu.kindId) auch bei leerem Graphen', () => {
    expect(wuerdeZyklusErzeugen([], { elternteilId: 'A', kindId: 'A' })).toBe(true)
  })

  it('wuerdeZyklusErzeugen: eine neue Kante ohne Bezug zum bestehenden Graphen erzeugt keinen Zyklus', () => {
    const kanten: readonly Elternkante[] = [{ elternteilId: 'A', kindId: 'B' }]
    expect(wuerdeZyklusErzeugen(kanten, { elternteilId: 'X', kindId: 'Y' })).toBe(false)
  })
})

/**
 * AP-1.8 (57_Phase0_Arbeitspakete.md Z.1316): dieselbe Invariante, jetzt über den echten Bestand -
 * nicht nur `hatZyklus`/`wuerdeZyklusErzeugen` isoliert (oben), sondern der volle Pfad einer echten,
 * migrierten SQLite-Datenbank -> `abfrage:pruefhinweise` (`src/main/abfragen/pruefhinweise.ts`) ->
 * `pruefeBestand()` (`src/core/plausibilitaet/regeln.ts`). `test/einheit/plausibilitaet-bestand.test.ts`
 * prüft die `zyklus`-Regel bereits gegen von Hand gebaute `BestandEingabe`-Objekte - hier kommt die
 * Eingabe stattdessen aus echten `person`/`elternschaft`-Zeilen, inklusive der SQL-Ladefunktionen.
 *
 * DB-Aufbau: `test/hilfsmittel/fixture-bauen.ts::baueFixture()` - dieselbe In-Memory-SQLite-Fixture-
 * Infrastruktur wie `test/einheit/integritaet.test.ts`/`test/budget/leistung.test.ts`: frische
 * `:memory:`-Datenbank, alle Migrationen angewendet (`migrieren()`), Journal aus (Testdaten, kein
 * Undo-Schritt). Deterministisch über einen festen `seed` (CLAUDE.md §4/§13 - keine `Date.now`/
 * `Math.random` in den Fixtures).
 */
describe('Invariante: Zyklusfreiheit über den echten Bestand (AP-1.8, abfrage:pruefhinweise gegen eine echte Datenbank)', () => {
  it('gesunder, mehrgenerationaler Bestand mit Ahnenimplex/Diamant (legitime Cousinenheirat) liefert keinen zyklus-Hinweis', () => {
    // Vier Generationen: g1/g2 (Urgroßeltern) sind beide Eltern von p1 UND p2 (Geschwister). p1 ist
    // Elternteil von c1, p2 von c2 (Cousin/Cousine). c1 und c2 heiraten und bekommen gemeinsam
    // "kind" - der klassische Ahnenimplex: g1/g2 sind über ZWEI Pfade Vorfahren von "kind", ein
    // ungerichteter Kreis im Familienbild, aber KEIN Zyklus im gerichteten "ist Kind von"-Graphen
    // (Modul-Kommentar `src/core/graph/zyklus.ts`) - derselbe Fall wie der reine Diamant-Test oben
    // ("Diamant/Ahnenimplex ... ist zyklenfrei"), hier aber über den vollständigen Bestand-Pfad.
    const db = baueFixture(
      {
        personen: [
          { schluessel: 'g1', privat: 0, ist_platzhalter: 0, geschlecht: 'M' },
          { schluessel: 'g2', privat: 0, ist_platzhalter: 0, geschlecht: 'F' },
          { schluessel: 'p1', privat: 0, ist_platzhalter: 0, geschlecht: 'M' },
          { schluessel: 'p2', privat: 0, ist_platzhalter: 0, geschlecht: 'F' },
          { schluessel: 'c1', privat: 0, ist_platzhalter: 0, geschlecht: 'M' },
          { schluessel: 'c2', privat: 0, ist_platzhalter: 0, geschlecht: 'F' },
          { schluessel: 'kind', privat: 0, ist_platzhalter: 0 },
          // Eine Platzhalterperson (A-17) mit unklarer Elternschaft daneben - muss von der
          // Zyklusregel unbeteiligt bleiben (`pruefeBestandZyklus` filtert Platzhalter-Kanten vor
          // der Suche heraus, `src/core/plausibilitaet/regeln.ts`).
          { schluessel: 'unbekannt', privat: 0, ist_platzhalter: 1, platzhalter_grund: 'unbekannt' },
        ],
        elternschaften: [
          { schluessel: 'e1', elternteilSchluessel: 'g1', kindSchluessel: 'p1', typ: 'biologisch' },
          { schluessel: 'e2', elternteilSchluessel: 'g2', kindSchluessel: 'p1', typ: 'biologisch' },
          { schluessel: 'e3', elternteilSchluessel: 'g1', kindSchluessel: 'p2', typ: 'biologisch' },
          { schluessel: 'e4', elternteilSchluessel: 'g2', kindSchluessel: 'p2', typ: 'biologisch' },
          { schluessel: 'e5', elternteilSchluessel: 'p1', kindSchluessel: 'c1', typ: 'biologisch' },
          { schluessel: 'e6', elternteilSchluessel: 'p2', kindSchluessel: 'c2', typ: 'biologisch' },
          { schluessel: 'e7', elternteilSchluessel: 'c1', kindSchluessel: 'kind', typ: 'biologisch' },
          { schluessel: 'e8', elternteilSchluessel: 'c2', kindSchluessel: 'kind', typ: 'biologisch' },
          { schluessel: 'e9', elternteilSchluessel: 'unbekannt', kindSchluessel: 'kind', typ: 'unbekannt' },
        ],
      },
      424242,
    )
    try {
      const ergebnis = pruefhinweise(db)
      expect(ergebnis.eintraege.map((eintrag) => eintrag.code)).not.toContain('zyklus')
    } finally {
      db.close()
    }
  })

  it('Bestand mit einer direkt auf Datenebene eingefügten Rückkante meldet zyklus-Hinweise für genau die beteiligten Personen', () => {
    // Der Schreib-Befehl, der eine neue Elternkante gegen `wuerdeZyklusErzeugen` prüft (AP-0.9-
    // Zyklusschutz), existiert für `elternschaft` noch nicht (kommt erst mit dem Elternschafts-
    // Befehl, s. Kopfkommentar `src/core/graph/zyklus.ts`: "der kommt erst ab AP-0.10") - ein Zyklus
    // lässt sich also gar nicht über einen Befehl erzeugen, den es noch nicht gibt. `baueFixture()`
    // fügt Zeilen ohnehin direkt per rohem `INSERT` ein, ohne einen Befehl/Guard zu durchlaufen (s.
    // Kopfkommentar `fixture-bauen.ts`) - das ist hier bewusst genutzt, um den Zyklus überhaupt erst
    // auf Datenebene erzeugen zu können. Geprüft wird die ERKENNUNG (`pruefeBestandZyklus` /
    // `findeZyklusKnoten`), nicht der (hier noch nicht existierende) Guard.
    const db = baueFixture(
      {
        personen: [
          { schluessel: 'a', privat: 0, ist_platzhalter: 0 },
          { schluessel: 'b', privat: 0, ist_platzhalter: 0 },
        ],
        elternschaften: [
          { schluessel: 'e1', elternteilSchluessel: 'a', kindSchluessel: 'b', typ: 'biologisch' },
          // Rückkante: b (bisher Kind von a) wird zusätzlich zum Elternteil von a - a wäre damit
          // sein eigener (Ur-)Vorfahre. Exakt der Fall "Rückkante erzeugt immer einen Zyklus" oben.
          { schluessel: 'e2', elternteilSchluessel: 'b', kindSchluessel: 'a', typ: 'biologisch' },
        ],
      },
      525252,
    )
    try {
      interface IdZeile {
        readonly id: string
      }
      const alleIds = new Set(db.prepare<[], IdZeile>('SELECT id AS id FROM person').all().map((zeile) => zeile.id))
      expect(alleIds.size).toBe(2)

      const ergebnis = pruefhinweise(db)
      const zyklusHinweise = ergebnis.eintraege.filter((eintrag) => eintrag.code === 'zyklus')

      // `pruefeBestandZyklus` erzeugt EIN Hinweis JE Person auf dem gefundenen Zyklus (Modul-
      // Kommentar `src/core/plausibilitaet/regeln.ts`) - bei einem Zweierzyklus also zwei Einträge,
      // die zusammen genau die beiden beteiligten Personen nennen (nicht bloß irgendeine Teilmenge
      // aller Personen im Bestand - hier gibt es ohnehin nur diese zwei). Eine Mutation, die
      // `hatZyklus`/die Zyklusregel immer `false` liefern ließe, würde diese Liste leer machen -
      // genau die Mutationsprobe, die diese Zusicherung absichern soll.
      expect(zyklusHinweise).toHaveLength(2)
      expect(new Set(zyklusHinweise.map((eintrag) => eintrag.personId))).toEqual(alleIds)
    } finally {
      db.close()
    }
  })
})
