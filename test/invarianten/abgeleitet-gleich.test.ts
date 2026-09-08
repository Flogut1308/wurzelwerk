// AP-0.7 PR-C — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025). WICHTIGSTER Test des Pakets:
// inkrementell-getriggerter Zustand der abgeleiteten Tabellen MUSS nach jeder beliebigen
// Befehlsfolge auf den Basistabellen bitgleich mit einem vollständigen Neuaufbau sein
// (`alleAbgeleitetenNeuAufbauen`, src/main/datenbank/trigger.ts). 55_Architektur.md §5.2/§5.3:
// "Trigger UND Neuaufbau nutzen exakt dieselbe Funktion — das ist der Schlüssel zur
// Bitgleichheit." Dieser Test ist die einzige Prüfung, die das über beliebige Befehlsfolgen
// hinweg tatsächlich belegt (die gezielten Regressionstests in
// test/einheit/abgeleitet-loeschen.test.ts decken nur den konkreten, im Review gefundenen Fall ab).
//
// Vorgehen (fast-check, model-based über test/invarianten/_modell-abgeleitet.ts):
// 1. Eine zufällige Befehlsfolge über person/name/aussage/ort/ortsname/zitat wird gegen eine
//    frische, migrierte Datenbank ausgeführt (referenzintegritätswahrend — s. Modul-Doku dort).
// 2. ERST wird der inkrementelle (von den `abl_*`-Triggern gepflegte) Zustand abgezogen, DANN
//    `alleAbgeleitetenNeuAufbauen()` aufgerufen (das leert und berechnet neu), DANN erneut
//    abgezogen (55_Architektur.md §5.3: der Neuaufbau darf den zu vergleichenden Vorher-Zustand
//    nicht zerstören, bevor er gesichert ist).
// 3. Beide Abzüge müssen zeichenweise identisch sein — für `person_flach`, `name_phonetik` und
//    `suche_fts_quelle` jeweils roh (ohne AUTOINCREMENT-`rowid`, die nach einem Neuaufbau in
//    `suche_fts_quelle` garantiert andere Werte annimmt), für den eigentlichen FTS5-Index über
//    `sucheFtsInhaltAbzug()` (test/einheit/_hilfen-abgeleitet.ts): `suche_fts` ist `content=''`
//    (contentless) und über seine eigenen Spalten gar nicht direkt lesbar — der Abzug geht über
//    das `fts5vocab`-Auxiliarmodul und führt über `suche_fts_quelle` auf die stabile Identität
//    `(quelle_typ, quelle_id)` zurück, damit der rowid-Wechsel den Vergleich nicht stört.
// 4. ZUSÄTZLICH `verwaisteFtsEintraegeAnzahl(db) === 0`: ein `fts5vocab`-Posting, dessen `doc`
//    (= `suche_fts`-rowid) keine passende `suche_fts_quelle`-Zeile mehr hat. Das ist eine andere
//    Fehlerklasse als ein falscher `sucheFtsInhaltAbzug()`-Inhalt — der Join in `sucheFtsInhaltAbzug`
//    ist für Karteileichen blind (die Mapping-Zeile ist ja schon weg, der Join liefert für sie
//    einfach keine Zeile, auf BEIDEN Vergleichsseiten gleichermaßen "unsichtbar"). Genau dieser
//    Bug tauchte im hueter-Review von AP-0.7 PR-A auf (s. test/einheit/abgeleitet-loeschen.test.ts)
//    — ohne diese zweite Prüfung hätte der reine Inhaltsvergleich ihn nicht gefangen.
//
// hueter-Review-Auflage 2 (nach dem ursprünglichen Abschluss dieser Datei): eine adversariale
// Prüfung, die alle 16 abl_*-Trigger einzeln als No-op mutierte, zeigte, dass die Kette
// Person→Ort→Ortsname→`geburtsort`-Aussage über drei UNABHÄNGIG per Index gewählte Ziele nur in
// ~0,03 % der Läufe ein nicht-NULL `person_flach.geburt_ort_name` ergab — `abl_ortsname_au`/`_ad`
// (0003_abgeleitet.sql:711/772) blieben dadurch faktisch unbewacht. Fix im Modell (nicht hier):
// `ort_mit_geburtsort` (test/invarianten/_modell-abgeleitet.ts) baut Person+Ort+bevorzugten
// Ortsnamen+Aussage atomar und garantiert, sodass `ortsname_update`/`ortsname_delete` regelmäßig
// echte Arbeit für diese Trigger auslösen. Belegt (adversarial, nicht committet): alle drei
// abl_ortsname_ai/au/ad einzeln als No-op mutiert → Property schlägt bei Lauf 758/77/19 fehl
// (Seed/numRuns wie unten); die vorher schon gefangenen 13 Trigger bleiben weiterhin gefangen.
//
// Folgepunkt (nicht Teil dieses Tests): AP-0.12 bringt einen großen Fixture-Korpus
// (200/2.000/20.000 Personen). Sobald der existiert, sollte dieselbe Bitgleichheits-Prüfung
// zusätzlich einmal gegen ihn laufen (realistische Verteilung/Größenordnung) — der hier generierte
// Korpus ist bewusst klein und synthetisch, weil es AP-0.12 zum Zeitpunkt dieses Tests noch nicht gibt.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import type Database from 'better-sqlite3'
import { alleAbgeleitetenNeuAufbauen } from '../../src/main/datenbank/trigger'
import {
  frischeDatenbankMitAbgeleitetemSchema,
  sucheFtsInhaltAbzug,
  verwaisteFtsEintraegeAnzahl,
} from '../einheit/_hilfen-abgeleitet'
import { aktionAusfuehren, aktionenArbitrary, basisDatenAnlegen, neuerZustand } from './_modell-abgeleitet'

interface PersonFlachZeile {
  readonly person_id: string
  readonly anzeigename: string
  readonly sortier_nachname: string
  readonly sortier_vornamen: string
  readonly geburt_jahr: number | null
  readonly geburt_sort_von: number | null
  readonly geburt_ort_name: string | null
  readonly tod_jahr: number | null
  readonly tod_sort_von: number | null
  readonly konfidenz_min: number | null
  readonly hat_widerspruch: number
}

/** Deterministischer, sortierter Abzug von `person_flach` (Primärschlüssel `person_id`, kein rowid-Problem). */
function personFlachAbzug(db: Database.Database): string {
  const zeilen = db
    .prepare<
      [],
      PersonFlachZeile
    >(`SELECT person_id, anzeigename, sortier_nachname, sortier_vornamen, geburt_jahr, geburt_sort_von,
                geburt_ort_name, tod_jahr, tod_sort_von, konfidenz_min, hat_widerspruch
         FROM person_flach ORDER BY person_id`)
    .all()
  return JSON.stringify(zeilen)
}

interface NamePhonetikZeile {
  readonly name_id: string
  readonly verfahren: string
  readonly code: string
}

/** Deterministischer, sortierter Abzug von `name_phonetik` (zusammengesetzter Primärschlüssel, kein rowid-Problem). */
function namePhonetikAbzug(db: Database.Database): string {
  const zeilen = db
    .prepare<[], NamePhonetikZeile>('SELECT name_id, verfahren, code FROM name_phonetik ORDER BY name_id, verfahren')
    .all()
  return JSON.stringify(zeilen)
}

interface SucheFtsQuelleZeile {
  readonly quelle_typ: string
  readonly quelle_id: string
}

/**
 * Deterministischer, sortierter Abzug von `suche_fts_quelle` — bewusst OHNE die `rowid`-Spalte:
 * `rowid` ist `INTEGER PRIMARY KEY AUTOINCREMENT` (docs/schema/0003_abgeleitet.sql) und nimmt nach
 * `alleAbgeleitetenNeuAufbauen()` garantiert andere Werte an (AUTOINCREMENT vergibt nie eine
 * bereits benutzte Nummer erneut, ein `DELETE FROM ... ` gefolgt von `INSERT` fängt also nicht bei
 * den alten Werten an). Die stabile, vergleichbare Identität ist `(quelle_typ, quelle_id)`.
 */
function sucheFtsQuelleAbzug(db: Database.Database): string {
  const zeilen = db
    .prepare<[], SucheFtsQuelleZeile>('SELECT quelle_typ, quelle_id FROM suche_fts_quelle ORDER BY quelle_typ, quelle_id')
    .all()
  return JSON.stringify(zeilen)
}

describe('Invariante: abgeleitete Tabellen nach Trigger-Pflege == abgeleitete Tabellen nach Neuaufbau (AP-0.7)', () => {
  it('person_flach/name_phonetik/suche_fts_quelle/suche_fts sind nach beliebigen Befehlsfolgen bitgleich mit alleAbgeleitetenNeuAufbauen()', () => {
    fc.assert(
      fc.property(aktionenArbitrary(), (aktionen) => {
        const db = frischeDatenbankMitAbgeleitetemSchema()
        try {
          const zustand = neuerZustand()
          const { quelleId } = basisDatenAnlegen(db)
          for (const aktion of aktionen) {
            aktionAusfuehren(db, zustand, quelleId, aktion)
          }

          // Karteileichen-Prüfung VOR dem Neuaufbau: das ist der Zustand, den die Trigger allein
          // hinterlassen haben — ein Neuaufbau danach würde jede Karteileiche unter den Tisch
          // fallen lassen (er leert `suche_fts` vollständig neu), das Signal wäre verloren.
          expect(verwaisteFtsEintraegeAnzahl(db)).toBe(0)

          // Erst ALLE inkrementellen Abzüge sichern, DANN neu aufbauen (55_Architektur.md §5.3) —
          // der Neuaufbau löscht `person_flach`/`name_phonetik`/`suche_fts_quelle`/`suche_fts`
          // vollständig, ein Abzug danach kann den Vorher-Zustand nicht mehr rekonstruieren.
          const personFlachVorher = personFlachAbzug(db)
          const namePhonetikVorher = namePhonetikAbzug(db)
          const sucheFtsQuelleVorher = sucheFtsQuelleAbzug(db)
          const sucheFtsInhaltVorher = sucheFtsInhaltAbzug(db)

          alleAbgeleitetenNeuAufbauen(db)

          expect(personFlachAbzug(db)).toBe(personFlachVorher)
          expect(namePhonetikAbzug(db)).toBe(namePhonetikVorher)
          expect(sucheFtsQuelleAbzug(db)).toBe(sucheFtsQuelleVorher)
          expect(sucheFtsInhaltAbzug(db)).toBe(sucheFtsInhaltVorher)
          expect(verwaisteFtsEintraegeAnzahl(db)).toBe(0)
          expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
        } finally {
          db.close()
        }
      }),
      // Fester Seed + Mindestlaufzahl (CLAUDE.md §13: Determinismus ist Pflicht) — reproduzierbar,
      // kein Date.now/Math.random außerhalb von fast-checks eigenem, hier fixierten Seed. 1000
      // Läufe statt der Mindestzahl 100: eine adversariale Selbstprüfung (mutierter
      // abl_ortsname_ai-Fan-out, s. Auftragsbericht) brauchte 544 Läufe, bis ein Gegenbeispiel
      // auftauchte — das Bugmuster (Aussage vor passendem Ortsnamen, danach keine weitere
      // Berührung derselben Person) ist selten genug, dass 100-150 Läufe es zuverlässig verfehlt
      // hätten.
      { seed: 20260908, numRuns: 1000 },
    )
    // Explizites, großzügiges Timeout: die 1000 fast-check-Läufe (jeder mit frischer DB +
    // Trigger-Pflege + Neuaufbau) brauchen auf langsamer CI ~12-15s (lokal ~3.6s) und sprengen
    // sonst das vitest-Standard-Timeout von 5000ms. numRuns bleibt bei 1000 — niedriger würde die
    // Mutations-Erkennung schwächen (der geburt_ort_name-Fan-out wird erst bei Lauf 758 gefangen).
  }, 60_000)
})
