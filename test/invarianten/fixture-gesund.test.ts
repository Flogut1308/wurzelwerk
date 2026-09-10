// AP-0.12 PR-B — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025). 57_Phase0_Arbeitspakete.md
// §AP-0.12, Test „fixture-gesund": "Jede Fixture besteht `integrity_check`, `foreign_key_check`,
// die Zyklusprüfung und den Ableitungsvergleich." Dieser Test ist die einzige Stelle, die das für
// den GESAMTEN AP-0.12-Korpus (acht handgebaute Bäume + Generator-Korpus) tatsächlich belegt — die
// bisherigen Smoke-Tests in `test/einheit/generator-deterministisch.test.ts` prüfen bewusst nur
// `integrity_check` und verweisen ausdrücklich hierher (s. dortiger Kopfkommentar).
//
// Vier Prüfungen je Datenbank (Reihenfolge wie im Auftrag):
// 1. `PRAGMA integrity_check` == 'ok' — reiner SQLite-Strukturcheck.
// 2. `PRAGMA foreign_key_check` liefert keine Zeile — referentielle Integrität über alle
//    Fremdschlüssel hinweg (die Fixtures fügen mit `defer_foreign_keys = ON` ein, s.
//    `test/hilfsmittel/fixture-bauen.ts` — dieser Test ist die Stelle, die danach tatsächlich
//    nachzählt, dass am Ende nichts offen geblieben ist).
// 3. Zyklusfreiheit (ADR-009 Punkt 2, „niemand ist eigener Vorfahre"): die Elternkanten aus
//    `elternschaft` (Spalten `kind_id`/`elternteil_id`, docs/schema/0002_kern.sql) dürfen im
//    gerichteten Graphen "ist Kind von" (s. Richtungskommentar in `src/core/graph/zyklus.ts`)
//    keinen Zyklus bilden. Das ist zugleich der Beleg, dass `cousinenheirat` trotz Mehrfachpfaden
//    (Ahnenimplex, ein ungerichteter Kreis im Familienbild) azyklisch im Sinn dieser Funktion ist —
//    ein Ahnenimplex ist kein Zyklus (s. Moduldoku dort).
// 4. Ableitungsvergleich — exakt die Technik aus `test/invarianten/abgeleitet-gleich.test.ts`
//    (bitte VOR Änderungen hier lesen): erst den inkrementell (von den `abl_*`-Triggern beim
//    Fixture-Aufbau gepflegten) Zustand von `person_flach`/`name_phonetik`/`suche_fts_quelle`/
//    `suche_fts` sichern, DANN `alleAbgeleitetenNeuAufbauen()` (leert und berechnet neu), DANN
//    erneut abziehen, dann zeichenweise vergleichen. Plus `verwaisteFtsEintraegeAnzahl(db) === 0`
//    vor UND nach dem Neuaufbau (Karteileichen-Prüfung, s. dortiger Kommentar Punkt 4) — beide
//    Hilfsfunktionen kommen unverändert aus `test/einheit/_hilfen-abgeleitet.ts`. Die drei
//    Abzugsfunktionen unten sind absichtlich aus jener Datei dupliziert statt importiert: sie sind
//    dort private Modulfunktionen (nicht exportiert), ein Export ausschließlich für diesen Test
//    wäre eine Änderung an einer bestehenden geschützten Datei — verboten in diesem PR (Auftrag:
//    "Kein Produktivcode, keine Änderung an bestehenden geschützten Dateien").
//
// Fixture-Datenbanken (`fixtureLaden`/`generiere`) laufen bereits durch `baueFixture()`
// (`test/hilfsmittel/fixture-bauen.ts`) vollständig migriert — inklusive des abgeleiteten Schemas
// (v3+) und der `abl_*`-Trigger. Die `fts5vocab`-Hilfstabelle `vocab` (nötig für
// `sucheFtsInhaltAbzug`/`verwaisteFtsEintraegeAnzahl`, s. dortige Moduldoku: `suche_fts` ist
// `content=''` und über seine Spalten nicht direkt lesbar) wird von `baueFixture()` NICHT
// mitangelegt (anders als `test/einheit/_hilfen-abgeleitet.ts`s eigener
// `frischeDatenbankMitAbgeleitetemSchema()`) — dieser Test legt sie darum selbst je Datenbank an.
//
// Korpusgrenze (Auftrag, CLAUDE.md §13 „Determinismus ist Pflicht" — keine nichtdeterministisch
// rote Prüfung): NUR 200 und 2.000 Personen werden hier geprüft, mit expliziten 30-Sekunden-
// Timeouts (der 2.000er-Aufbau + Vier-Punkte-Check dauert auf dem langsamen Windows-CI-Runner laut
// Auftrag ~7s, weit über Vitests 5000-ms-Standardtimeout). 20.000 Personen werden HIER BEWUSST
// NICHT geprüft — das ist ein Leistungsbudget-Fall (`test/budget/`), kein Per-PR-Gate-Fall; ein
// 20.000er-Lauf in jeder Iteration wäre für ein schnelles Gate zu schwer (ADR-025: „gestufte
// Gates" — schnell bei jeder Iteration, langsam als Torwächter vor dem Merge).
import { describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { generiere } from '../../fixtures/generiert/generator'
import { hatZyklus, type Elternkante } from '../../src/core/graph/zyklus'
import { alleAbgeleitetenNeuAufbauen } from '../../src/main/datenbank/trigger'
import { fixtureLaden, type FixtureName } from '../hilfsmittel/fixture-laden'
import { sucheFtsInhaltAbzug, verwaisteFtsEintraegeAnzahl } from '../einheit/_hilfen-abgeleitet'

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

/** Deterministischer, sortierter Abzug von `person_flach` (Primärschlüssel `person_id`, kein rowid-Problem). Dupliziert aus `abgeleitet-gleich.test.ts`, s. Kopfkommentar. */
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

/** Deterministischer, sortierter Abzug von `name_phonetik` (zusammengesetzter Primärschlüssel, kein rowid-Problem). Dupliziert aus `abgeleitet-gleich.test.ts`. */
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
 * Deterministischer, sortierter Abzug von `suche_fts_quelle` — bewusst OHNE die `rowid`-Spalte
 * (AUTOINCREMENT, nimmt nach einem Neuaufbau garantiert andere Werte an). Dupliziert aus
 * `abgeleitet-gleich.test.ts`, s. dortigen Kommentar für die volle Begründung.
 */
function sucheFtsQuelleAbzug(db: Database.Database): string {
  const zeilen = db
    .prepare<[], SucheFtsQuelleZeile>('SELECT quelle_typ, quelle_id FROM suche_fts_quelle ORDER BY quelle_typ, quelle_id')
    .all()
  return JSON.stringify(zeilen)
}

interface IntegritaetZeile {
  readonly integrity_check: string
}

interface FremdschluesselVerletzungZeile {
  readonly table: string
  readonly rowid: number | null
  readonly parent: string
  readonly fkid: number
}

interface ElternschaftKanteZeile {
  readonly kind_id: string
  readonly elternteil_id: string
}

/** Liest alle Elternkanten roh aus `elternschaft` und bildet sie auf `Elternkante` ab (Spaltennamen s. docs/schema/0002_kern.sql). */
function elternkantenAbzug(db: Database.Database): readonly Elternkante[] {
  return db
    .prepare<[], ElternschaftKanteZeile>('SELECT kind_id, elternteil_id FROM elternschaft')
    .all()
    .map((zeile): Elternkante => ({ kindId: zeile.kind_id, elternteilId: zeile.elternteil_id }))
}

/**
 * Legt die `fts5vocab`-Hilfstabelle `vocab` auf `db` an (nötig für `sucheFtsInhaltAbzug`/
 * `verwaisteFtsEintraegeAnzahl`, s. Kopfkommentar). Jede Test-Datenbank hier ist frisch
 * (`fixtureLaden`/`generiere` öffnen je Aufruf eine neue `:memory:`-Verbindung), die Tabelle
 * existiert also nie schon.
 */
function vocabTabelleAnlegen(db: Database.Database): void {
  db.exec("CREATE VIRTUAL TABLE vocab USING fts5vocab('suche_fts', 'instance')")
}

/**
 * Die vier AP-0.12-Pflichtprüfungen gegen eine geöffnete, vollständig migrierte Datenbank
 * (Fixture-Baum oder Generator-Korpus) — s. Kopfkommentar für die Herleitung jeder einzelnen.
 */
function fixtureIstGesund(db: Database.Database): void {
  // 1. integrity_check
  const integritaet = db.prepare<[], IntegritaetZeile>('PRAGMA integrity_check').get()
  expect(integritaet?.integrity_check).toBe('ok')

  // 2. foreign_key_check — liefert nur bei tatsächlichen Verletzungen überhaupt Zeilen.
  const fremdschluesselVerletzungen = db.prepare<[], FremdschluesselVerletzungZeile>('PRAGMA foreign_key_check').all()
  expect(fremdschluesselVerletzungen).toEqual([])

  // 3. Zyklusfreiheit (ADR-009 Punkt 2).
  expect(hatZyklus(elternkantenAbzug(db))).toBe(false)

  // 4. Ableitungsvergleich (Technik aus abgeleitet-gleich.test.ts, s. Kopfkommentar).
  vocabTabelleAnlegen(db)

  // Karteileichen-Prüfung VOR dem Neuaufbau: das ist der Zustand, den die `abl_*`-Trigger beim
  // Fixture-Aufbau allein hinterlassen haben — ein Neuaufbau danach würde jede Karteileiche unter
  // den Tisch fallen lassen (er leert `suche_fts` vollständig neu), das Signal wäre verloren.
  expect(verwaisteFtsEintraegeAnzahl(db)).toBe(0)

  // Erst ALLE inkrementellen Abzüge sichern, DANN neu aufbauen — der Neuaufbau löscht
  // `person_flach`/`name_phonetik`/`suche_fts_quelle`/`suche_fts` vollständig, ein Abzug danach
  // kann den Vorher-Zustand nicht mehr rekonstruieren.
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
  expect(db.prepare<[], IntegritaetZeile>('PRAGMA integrity_check').get()?.integrity_check).toBe('ok')
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
 * Fester, willkürlicher Seed für den Generator-Korpus (s. Kopfkommentar zur Korpusgrenze) — nur
 * Stabilität zählt (derselbe Seed bei jedem Testlauf), kein fachlicher Bezug zum Datum.
 */
const GENERATOR_KORPUS_SEED = 20260910

describe('Invariante: Fixture-Korpus ist gesund (AP-0.12) — integrity_check, foreign_key_check, Zyklusfreiheit, Ableitungsvergleich', () => {
  describe.each(ACHT_FIXTURE_NAMEN)('Fixture "%s"', (name) => {
    it('besteht integrity_check, foreign_key_check, die Zyklusprüfung und den Ableitungsvergleich', () => {
      const db = fixtureLaden(name)
      try {
        fixtureIstGesund(db)
      } finally {
        db.close()
      }
    })
  })

  describe('Generator-Korpus (fixtures/generiert/generator.ts) — 20.000 bewusst ausgenommen, s. Kopfkommentar', () => {
    it(
      '200 Personen sind gesund (integrity_check, foreign_key_check, Zyklusprüfung, Ableitungsvergleich)',
      () => {
        const db = generiere(200, GENERATOR_KORPUS_SEED)
        try {
          fixtureIstGesund(db)
        } finally {
          db.close()
        }
      },
      30_000,
    )

    it(
      '2.000 Personen sind gesund (integrity_check, foreign_key_check, Zyklusprüfung, Ableitungsvergleich)',
      () => {
        const db = generiere(2000, GENERATOR_KORPUS_SEED)
        try {
          fixtureIstGesund(db)
        } finally {
          db.close()
        }
      },
      30_000,
    )
  })
})
