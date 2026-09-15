// AP-0.21 PR-B — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025). 57_Phase0_Arbeitspakete.md
// §AP-0.21, F-02/D-2 (AP-0.8): `aenderung.datensatz_id` verkettet die Primärschlüsselwerte einer
// journalisierten Zeile mit dem Trennzeichen `|`, in `pkSpalten`-Reihenfolge (s.
// `skripte/trigger-generieren.ts` `datensatzIdSql`: `NEW.pk1 || '|' || NEW.pk2 || …`). Beim
// Zurücknehmen (`src/main/journal/undo.ts` → `rohLoeschen`) wird `datensatz_id` mit dem echten
// `datensatzIdZerlegen()` wieder in die einzelnen PK-Werte zerlegt. Enthielte auch nur EIN PK-Wert
// selbst ein `|`, zerlegte `datensatz_id` an der falschen Stelle und `rohLoeschen()` träfe die
// falsche Zeile. Diese Invariante sichert genau das ab.
//
// ZWEI Assertionen je Fixture × je journalisierter Tabelle:
//   1. Direkte Daten-Prüfung: kein PK-Wert einer journalisierten Tabelle enthält `|`
//      (`SELECT <spalte> … WHERE <spalte> LIKE '%|%'` liefert `[]`).
//   2. Round-Trip gegen den ECHTEN Produktionscode (der Anti-Vakuum-Kern, ADR-025/§13): für jede
//      Zeile wird `datensatz_id` GENAU SO gebildet wie die Produktion (PK-Werte in
//      `pkSpalten(db, tabelle)`-Reihenfolge, mit `|` verkettet — die JS-Entsprechung von
//      `|| '|' ||` in `datensatzIdSql`), dann mit dem exportierten, echten `datensatzIdZerlegen()`
//      aus `src/main/repositories/basis.ts` zerlegt und Wert für Wert gegen die ursprünglichen
//      PK-Werte geprüft. Bei mehrspaltigen Primärschlüsseln (`ortsname`, `partnerschaft_person`,
//      `beteiligung`, `ort_externe_id`, `aussage_zitat`, `medium_zuordnung`) fällt eine falsche
//      Trennzeichen-Logik hier hart auf: `datensatzIdZerlegen()` wirft dann (Spaltenzahl passt
//      nicht) oder liefert falsch zerlegte Werte. Der Test trifft bewusst den Produktivcode selbst,
//      nicht eine Kopie — eine leere (vakuöse) Invariante ist damit ausgeschlossen (Nachweis:
//      Selbst-Mutationsprobe im PR-Rumpf, `split('|')` → `split(':')` macht diesen Test rot).
//
// Tabellen-/Spaltennamen sind ausschließlich Literale aus `JOURNALISIERT` (Produktions-Import,
// erlaubt — wir SCHREIBEN nur unter test/invarianten) bzw. `pkSpalten` (`PRAGMA table_info`), nie
// Nutzereingaben (CLAUDE.md §6: Bezeichner dürfen im SQL-Text stehen, Werte bleiben gebunden bzw.
// sind hier reine Literale). PK-Werte werden über ein geprüftes Zod-Schema aus der Zeile gelesen
// (CLAUDE.md §4: unbekannte Laufzeitdaten sind `unknown` + Zod, kein `as`).
//
// Korpus- und Timeout-Muster GENAU wie `test/invarianten/fixture-gesund.test.ts` (dort lesen):
// acht handgebaute Fixture-Bäume + Generator-Korpus 200/2.000 Personen mit 30-Sekunden-Timeouts.
// 20.000 Personen bewusst NICHT (schnelles Per-PR-Gate, kein Leistungsbudget-Fall — ADR-025
// „gestufte Gates").
import { describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { generiere } from '../../fixtures/generiert/generator'
import { JOURNALISIERT } from '../../src/main/journal/journalisierung'
import { datensatzIdZerlegen, pkSpalten } from '../../src/main/repositories/basis'
import { fixtureLaden, type FixtureName } from '../hilfsmittel/fixture-laden'

/**
 * Eine rohe Zeile aus einem PK-Spalten-Abzug: journalisierte Tabellen haben TEXT-Primärschlüssel
 * (F-05: UUID v7), das Schema deckt der Vollständigkeit halber aber auch INTEGER/NULL ab (STRICT-
 * Tabellen kennen nur diese Wertetypen). Ein `NULL` in einer PK-Spalte wäre ein Schemafehler und
 * wird unten hart abgewiesen.
 */
const pkZeileSchema = z.record(z.string(), z.union([z.string(), z.number(), z.null()]))

interface PkTrefferZeile {
  readonly pk_wert: string
}

/**
 * Die beiden Assertionen aus dem Kopfkommentar, über alle Tabellen aus `JOURNALISIERT` gegen eine
 * geöffnete, vollständig migrierte Datenbank (Fixture-Baum oder Generator-Korpus).
 */
function journalSchluesselIstUnversehrt(db: Database.Database): void {
  for (const tabelle of JOURNALISIERT) {
    // `JournalisierteTabelle` ist eine Teilmenge von `Tabelle` (beide aus Literal-Konstanten) —
    // `pkSpalten` nimmt sie ohne Umweg entgegen, kein `as` nötig.
    const spalten = pkSpalten(db, tabelle)
    expect(spalten.length, `journalisierte Tabelle "${tabelle}" ohne Primärschlüssel`).toBeGreaterThan(0)

    // Assertion 1 — kein PK-Wert enthält das Trennzeichen `|`. `|` ist in LIKE kein Platzhalter und
    // matcht damit den literalen senkrechten Strich.
    for (const spalte of spalten) {
      const treffer = db
        .prepare<[], PkTrefferZeile>(`SELECT ${spalte} AS pk_wert FROM ${tabelle} WHERE ${spalte} LIKE '%|%'`)
        .all()
      expect(treffer, `PK-Spalte "${tabelle}"."${spalte}" enthält einen Wert mit "|"`).toEqual([])
    }

    // Assertion 2 — Round-Trip gegen den echten `datensatzIdZerlegen()`.
    const rohzeilen = db.prepare(`SELECT ${spalten.join(', ')} FROM ${tabelle}`).all()
    for (const roh of rohzeilen) {
      const zeile = pkZeileSchema.parse(roh)
      const pkWerte = spalten.map((spalte) => {
        const wert = zeile[spalte]
        if (wert === null || wert === undefined) {
          throw new Error(`PK-Spalte "${tabelle}"."${spalte}" ist NULL — im Schema unmöglich.`)
        }
        return String(wert)
      })
      // `datensatz_id` GENAU wie die Produktion bilden (`datensatzIdSql`: `|| '|' ||`), in
      // `pkSpalten`-Reihenfolge — dann mit dem echten Produktivcode wieder zerlegen.
      const datensatzId = pkWerte.join('|')
      const zerlegt = datensatzIdZerlegen(datensatzId, spalten)
      expect(zerlegt, `Round-Trip datensatz_id für "${tabelle}"`).toEqual(pkWerte)
    }
  }
}

/** Die acht im Korpus vorhandenen Fixture-Bäume (s. `test/hilfsmittel/fixture-laden.ts`). */
const ACHT_FIXTURE_NAMEN: readonly FixtureName[] = [
  'minimal',
  'mehrfachehe',
  'adoption',
  'cousinenheirat',
  'fehlende-daten',
  'kaputte-kodierung',
  'unscharfe-datumsangaben',
  'kyrillisch-polnisch',
]

/**
 * Fester, willkürlicher Seed für den Generator-Korpus (wie `fixture-gesund.test.ts`) — nur
 * Stabilität zählt, kein fachlicher Bezug zum Datum.
 */
const GENERATOR_KORPUS_SEED = 20260910

describe('Invariante: Journal-Schlüssel — kein PK-Wert enthält das Trennzeichen "|" (AP-0.21, F-02/D-2)', () => {
  describe.each(ACHT_FIXTURE_NAMEN)('Fixture "%s"', (name) => {
    it('kein PK-Wert enthält "|" und der datensatz_id-Round-Trip ist verlustfrei', () => {
      const db = fixtureLaden(name)
      try {
        journalSchluesselIstUnversehrt(db)
      } finally {
        db.close()
      }
    })
  })

  // Anti-Vakuum-Kern (ADR-025/§13, Selbst-Mutationsprobe): der Round-Trip über die vorhandenen
  // Fixture-/Korpus-Zeilen (oben) trifft mit dem echten `datensatzIdZerlegen()` faktisch NUR
  // einspaltige Primärschlüssel — die vier zusammengesetzten journalisierten Tabellen
  // (`ort_externe_id`, `partnerschaft_person`, `aussage_zitat`, `medium_zuordnung`) sind im
  // gesamten AP-0.12-Korpus (acht Bäume + Generator) LEER (empirisch geprüft). Eine kaputte
  // Trennzeichen-Logik in `datensatzIdZerlegen` bricht aber erst bei MEHRSPALTIGEN Schlüsseln auf
  // (bei einer einzelnen Spalte gibt jedes `split(<x>)` den Wert unverändert zurück). Ohne den
  // folgenden Block wäre die Round-Trip-Prüfung gegen genau diese Mutation vakuös. Der Block
  // schließt die Lücke IN dieser einen Datei (kein Produktivcode, keine Fixture angefasst): er
  // liest die zusammengesetzten PK-Aritäten aus dem ECHTEN migrierten Schema und schickt
  // repräsentative Wertetupel (UUID-/Enum-förmig, ohne `|`, wie die Produktion sie erzeugt) durch
  // die Produktions-Bildung (`|`-Verkettung in `pkSpalten`-Reihenfolge) und den echten
  // `datensatzIdZerlegen()`. Diese Lücke im Fixture-Korpus ist im PR vermerkt (Design-/Test-Lücke
  // nach CLAUDE.md §14: weiterbauen, nicht anhalten, und melden).
  describe('Zusammengesetzte Primärschlüssel — Round-Trip gegen den echten datensatzIdZerlegen() (Anti-Vakuum)', () => {
    it('jede mehrspaltige journalisierte Tabelle: datensatz_id bilden → zerlegen ist verlustfrei', () => {
      const db = fixtureLaden('minimal')
      try {
        const mehrspaltige = JOURNALISIERT.map((tabelle) => ({ tabelle, spalten: pkSpalten(db, tabelle) })).filter(
          (eintrag) => eintrag.spalten.length > 1,
        )
        // Wächter: fände sich hier keine einzige mehrspaltige Tabelle mehr (Schemaänderung), wäre
        // dieser Anti-Vakuum-Block selbst leer — das soll auffallen, nicht stillschweigend grün sein.
        expect(mehrspaltige.length, 'keine mehrspaltige journalisierte Tabelle im Schema gefunden').toBeGreaterThan(0)

        for (const { tabelle, spalten } of mehrspaltige) {
          // Repräsentative PK-Werte, wie die Produktion sie erzeugt: TEXT (UUID v7 bzw. Enum-Text),
          // garantiert ohne `|`. Bewusst ein `:` im Wert, damit die Mutationsprobe `split(':')` auch
          // dann falsch zerlegte statt bloß geworfener Ergebnisse liefern würde.
          const pkWerte = spalten.map((spalte, index) => `wert-${spalte}-${index}:0192f1a2`)
          const datensatzId = pkWerte.join('|')
          const zerlegt = datensatzIdZerlegen(datensatzId, spalten)
          expect(zerlegt, `Round-Trip datensatz_id für "${tabelle}" (${spalten.join('|')})`).toEqual(pkWerte)
        }
      } finally {
        db.close()
      }
    })
  })

  describe('Generator-Korpus (fixtures/generiert/generator.ts) — 20.000 bewusst ausgenommen', () => {
    it(
      '200 Personen: kein PK-Wert enthält "|", Round-Trip verlustfrei',
      () => {
        const db = generiere(200, GENERATOR_KORPUS_SEED)
        try {
          journalSchluesselIstUnversehrt(db)
        } finally {
          db.close()
        }
      },
      30_000,
    )

    it(
      '2.000 Personen: kein PK-Wert enthält "|", Round-Trip verlustfrei',
      () => {
        const db = generiere(2000, GENERATOR_KORPUS_SEED)
        try {
          journalSchluesselIstUnversehrt(db)
        } finally {
          db.close()
        }
      },
      30_000,
    )
  })
})
