// AP-0.12 — gemeinsamer Build-Helfer für den Fixture-Korpus (`fixtures/*/daten.ts`) und den
// Massendaten-Generator (`fixtures/generiert/generator.ts`). Beide beschreiben einen Testbaum
// deklarativ als `FixtureBeschreibung` (Personen/Namen/Elternschaften/Ereignisse/Beteiligungen,
// referenziert über lokale, frei wählbare `schluessel`-Zeichenketten statt echter IDs) — `baueFixture`
// vergibt die tatsächlichen UUID-v7-förmigen IDs und Zeitstempel deterministisch aus einem
// `SeedPrng` (nie `uuid7()`/`Date.now()`, CLAUDE.md §4/§13: eine Fixture muss reproduzierbar sein).
//
// Warum `schluessel` statt echter `id`-Felder in der Beschreibung: die Fixture-Dateien sollen
// lesbar bleiben ("anna" statt einer UUID) und der Generator soll Personen erzeugen können, ohne
// vorab IDs zu kennen. `baueFixture` löst `schluessel` beim Einfügen in echte IDs auf (erster Zugriff
// je Schlüssel erzeugt die ID, jeder weitere Zugriff liefert dieselbe zurück).
//
// Diese Datei öffnet bewusst selbst eine Transaktion (`BEGIN`/`COMMIT`, unten) — das widerspricht
// CLAUDE.md §2 Satz 3 ("Nur src/main/befehle/ öffnet Transaktionen") nicht: diese Regel gilt für
// Produktivcode-Schichten, nicht für Testinfrastruktur. Migrationen (`laeufer.ts`) und der bestehende
// Testhelfer `test/einheit/_hilfen-abgeleitet.ts` (`journalAus`) tun exakt dasselbe außerhalb von
// `src/main/befehle/`. `defer_foreign_keys = ON` (muss VOR `BEGIN` gesetzt werden, SQLite-Doku) lockert
// zusätzlich die Einfügereihenfolge: Vorwärtsreferenzen (z. B. `namen[i].umschriftVonSchluessel` auf
// einen später in der Liste stehenden Namen) werden erst beim `COMMIT` geprüft, nicht bei jedem
// einzelnen `INSERT`.
import type Database from 'better-sqlite3'
import type { Aussage } from '../../src/shared/schemata/aussage'
import type { Beteiligung } from '../../src/shared/schemata/beteiligung'
import type { Elternschaft } from '../../src/shared/schemata/elternschaft'
import type { Ereignis } from '../../src/shared/schemata/ereignis'
import type { Name } from '../../src/shared/schemata/name'
import type { Person } from '../../src/shared/schemata/person'
import type { Quelle } from '../../src/shared/schemata/quelle'
import type { Zitat } from '../../src/shared/schemata/zitat'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { MIGRATIONEN } from '../../src/main/datenbank/migration/registrierung'
import { alleAbgeleitetenNeuAufbauen } from '../../src/main/datenbank/trigger'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { journalAus } from '../../src/main/journal/kontext'
import { SeedPrng } from '../../src/core/zufall/seed-prng'
import { montiereOriginalText, zerlegeName } from '../../src/core/name/zerlegung'

/** Wie `Person`, aber ohne `id` — `schluessel` ist die lokale, fixture-interne Referenz. */
export interface FixturePerson extends Omit<Person, 'id'> {
  readonly schluessel: string
}

/**
 * Wie `Name`, aber `person_id`/`umschrift_von` sind lokale `schluessel`-Referenzen statt echter IDs.
 * Heißt bewusst `FixtureNamenzeile`, nicht `FixtureName` — `test/hilfsmittel/fixture-laden.ts`
 * braucht `FixtureName` bereits für den Union-Typ der acht Baumnamen, zwei gleichnamige, aber
 * inhaltlich verschiedene exportierte Typen in verwandten Dateien wären eine ständige Verwechslungsquelle.
 */
export interface FixtureNamenzeile extends Omit<Name, 'id' | 'person_id' | 'umschrift_von'> {
  readonly schluessel: string
  readonly personSchluessel: string
  /** Muss auf einen VORHER in `namen` stehenden `schluessel` zeigen (Einfüge-Reihenfolge, s. o.). */
  readonly umschriftVonSchluessel?: string | undefined
}

/** Wie `Elternschaft`, aber `elternteil_id`/`kind_id` sind lokale `schluessel`-Referenzen auf `personen`. */
export interface FixtureElternschaft extends Omit<Elternschaft, 'id' | 'elternteil_id' | 'kind_id'> {
  readonly schluessel: string
  readonly elternteilSchluessel: string
  readonly kindSchluessel: string
}

/** Wie `Ereignis`, aber mit lokalem `schluessel` statt `id`. */
export interface FixtureEreignis extends Omit<Ereignis, 'id'> {
  readonly schluessel: string
}

/** Wie `Beteiligung`, aber `ereignis_id`/`person_id` sind lokale `schluessel`-Referenzen. */
export interface FixtureBeteiligung extends Omit<Beteiligung, 'id' | 'ereignis_id' | 'person_id'> {
  readonly schluessel: string
  readonly ereignisSchluessel: string
  readonly personSchluessel: string
}

/** Wie `Aussage`, aber `subjekt_id` ist eine lokale `schluessel`-Referenz (AP-1.10 PR-A, für
 * `test/hilfsmittel/grossbestand.ts`: Beruf-/Geburts-/Todesaussagen im Leistungsbudget-Bestand). */
export interface FixtureAussage extends Omit<Aussage, 'id' | 'subjekt_id'> {
  readonly schluessel: string
  readonly subjektSchluessel: string
}

/** Wie `Quelle`, aber mit lokalem `schluessel` statt `id`. */
export interface FixtureQuelle extends Omit<Quelle, 'id'> {
  readonly schluessel: string
}

/** Wie `Zitat`, aber `quelle_id` ist eine lokale `schluessel`-Referenz. */
export interface FixtureZitat extends Omit<Zitat, 'id' | 'quelle_id'> {
  readonly schluessel: string
  readonly quelleSchluessel: string
}

/** Wie `AussageZitat` (kein eigenes `id`), beide Seiten lokale `schluessel`-Referenzen. */
export interface FixtureAussageZitat {
  readonly aussageSchluessel: string
  readonly zitatSchluessel: string
}

/** Deklarative Beschreibung eines Testbaums — Eingabe für `baueFixture`. */
export interface FixtureBeschreibung {
  readonly personen: readonly FixturePerson[]
  readonly namen?: readonly FixtureNamenzeile[] | undefined
  readonly elternschaften?: readonly FixtureElternschaft[] | undefined
  readonly ereignisse?: readonly FixtureEreignis[] | undefined
  readonly beteiligungen?: readonly FixtureBeteiligung[] | undefined
  readonly aussagen?: readonly FixtureAussage[] | undefined
  readonly quellen?: readonly FixtureQuelle[] | undefined
  readonly zitate?: readonly FixtureZitat[] | undefined
  readonly aussageZitate?: readonly FixtureAussageZitat[] | undefined
}

/** Verwaltet die Abbildung `schluessel -> echte ID`, IDs kommen aus dem übergebenen `SeedPrng`. */
class SchluesselAufloeser {
  private readonly idVonSchluessel = new Map<string, string>()

  constructor(private readonly prng: SeedPrng) {}

  aufloesen(schluessel: string): string {
    const bestehende = this.idVonSchluessel.get(schluessel)
    if (bestehende !== undefined) {
      return bestehende
    }
    const neu = this.prng.naechsteId()
    this.idVonSchluessel.set(schluessel, neu)
    return neu
  }
}

/** Deterministischer, monoton steigender Zeitstempelzähler — bewusst KEIN `Date.now()` (CLAUDE.md §4). */
class Zeitstempelzaehler {
  private wert: number
  constructor(start: number) {
    this.wert = start
  }
  naechster(): number {
    this.wert += 1
    return this.wert
  }
}

const FESTER_ZEIT_START = 1_700_000_000_000

export interface BaueFixtureOptionen {
  /**
   * AP-1.10 PR-A (gemessen an `test/hilfsmittel/grossbestand.ts`, 2.000 Personen + `aussage`-
   * Zeilen): jeder inkrementelle `abl_*_ai`-Trigger (docs/schema/0003_abgeleitet.sql) berechnet bei
   * JEDEM einzelnen INSERT eine Fensterfunktions-Projektion über die komplette (wachsende)
   * Basistabelle neu — bei Tausenden Zeilen wird der Fixture-Aufbau dadurch quadratisch statt
   * linear (>20s statt <1s für den Massenbestand). Bei `true` werden alle `abl_*`-Trigger für die
   * Dauer des Einfügens per `DROP TRIGGER`/`CREATE TRIGGER` entfernt (die Trigger-SQL wird aus
   * `sqlite_master.sql` zurückgelesen — keine zweite, gepflegte Kopie der generierten SQL hier) und
   * `person_flach`/`name_phonetik`/`suche_fts`/`suche_fts_quelle` am Ende EINMAL über
   * `alleAbgeleitetenNeuAufbauen()` (src/main/datenbank/trigger.ts — dieselbe kanonische
   * Projektions-SQL wie die Trigger selbst, "Bitgleichheits-Garantie" laut deren Kopfkommentar) neu
   * aufgebaut. Default `false`: unverändertes Verhalten für jeden bestehenden Aufrufer
   * (Fixture-Korpus, Generator) — nur `grossbestandAufbauen()` schaltet das ein.
   */
  readonly abgeleiteteEinmaligNeuAufbauen?: boolean
}

interface AblTriggerZeile {
  readonly name: string
  readonly sql: string
}

/**
 * Baut eine frische, vollständig migrierte In-Memory-Datenbank (`:memory:`) aus einer
 * `FixtureBeschreibung`. Journal ist aus (Testdaten, kein Nutzer-Undo-Schritt), IDs/Zeitstempel
 * kommen deterministisch aus `seed` — zwei Aufrufe mit gleicher `beschreibung` und gleichem `seed`
 * liefern eine bitgleiche Datenbank (AP-0.12-Abnahme, geprüft in
 * `test/einheit/generator-deterministisch.test.ts` über `fixtures/generiert/generator.ts`, das
 * diesen Helfer wiederverwendet). Aufrufer schließt die Verbindung selbst (`db.close()`).
 */
export function baueFixture(beschreibung: FixtureBeschreibung, seed: number | bigint, optionen?: BaueFixtureOptionen): Database.Database {
  const db = oeffnen(':memory:')
  migrieren(db, { migrationen: MIGRATIONEN, appVersion: 'fixture' })
  journalAus(db, 'AP-0.12 Fixture-Aufbau (test/hilfsmittel/fixture-bauen.ts): Testdaten ohne Befehlsbus-Armierung.')

  const bulkModus = optionen?.abgeleiteteEinmaligNeuAufbauen ?? false
  const zurueckgestellteTrigger: readonly AblTriggerZeile[] = bulkModus
    ? db.prepare<[], AblTriggerZeile>("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'abl_%'").all()
    : []
  for (const trigger of zurueckgestellteTrigger) {
    db.exec(`DROP TRIGGER ${trigger.name}`)
  }

  const prng = new SeedPrng(seed)
  const schluessel = new SchluesselAufloeser(prng)
  const zeit = new Zeitstempelzaehler(FESTER_ZEIT_START)

  const personEinfuegen = db.prepare(
    `INSERT INTO person
       (id, geschlecht, lebend_status, privat, notiz, gesperrt_bis, ist_platzhalter, platzhalter_grund, erstellt_am, geaendert_am)
     VALUES
       (@id, @geschlecht, @lebend_status, @privat, @notiz, @gesperrt_bis, @ist_platzhalter, @platzhalter_grund, @erstellt_am, @geaendert_am)`,
  )
  // AP-1.33: das flache `name` ist durch `name_form` + `name_part` ersetzt (0006_namensformen.sql).
  // Die Fixture-Beschreibung bleibt flach (`FixtureNamenzeile`); `baueFixture` zerlegt sie hier mit
  // derselben Logik wie die Migration (src/core/name/zerlegung.ts).
  const nameFormEinfuegen = db.prepare(
    `INSERT INTO name_form
       (id, person_id, sprache, schrift, reihenfolge, rolle, rollen_notiz, ist_bevorzugt, umschrift_von,
        umschrift_norm, konfidenz, sortier_index, gueltig_von, gueltig_bis, original_text, erstellt_am, geaendert_am)
     VALUES
       (@id, @person_id, @sprache, @schrift, NULL, @rolle, NULL, @ist_bevorzugt, @umschrift_von,
        @umschrift_norm, NULL, NULL, @gueltig_von, @gueltig_bis, @original_text, @erstellt_am, @geaendert_am)`,
  )
  const namePartEinfuegen = db.prepare(
    `INSERT INTO name_part (id, name_form_id, art, wert, ist_rufname, sortier_index, feminine_variante, erstellt_am, geaendert_am)
     VALUES (@id, @name_form_id, @art, @wert, @ist_rufname, @sortier_index, NULL, @erstellt_am, @geaendert_am)`,
  )
  const elternschaftEinfuegen = db.prepare(
    `INSERT INTO elternschaft (id, elternteil_id, kind_id, typ, konfidenz, notiz, erstellt_am, geaendert_am)
     VALUES (@id, @elternteil_id, @kind_id, @typ, @konfidenz, @notiz, @erstellt_am, @geaendert_am)`,
  )
  const ereignisEinfuegen = db.prepare(
    `INSERT INTO ereignis
       (id, typ, ort_id, datum_kalender, datum_modifikator, datum_praezision, datum_wert1, datum_wert2,
        datum_originaltext, datum_sort_von, datum_sort_bis, datum_zweitkalender, datum_zweitwert,
        datum_doppeljahr, beschreibung, notiz, erstellt_am, geaendert_am)
     VALUES
       (@id, @typ, @ort_id, @datum_kalender, @datum_modifikator, @datum_praezision, @datum_wert1, @datum_wert2,
        @datum_originaltext, @datum_sort_von, @datum_sort_bis, @datum_zweitkalender, @datum_zweitwert,
        @datum_doppeljahr, @beschreibung, @notiz, @erstellt_am, @geaendert_am)`,
  )
  const beteiligungEinfuegen = db.prepare(
    `INSERT INTO beteiligung (id, ereignis_id, person_id, rolle, reihenfolge, erstellt_am, geaendert_am)
     VALUES (@id, @ereignis_id, @person_id, @rolle, @reihenfolge, @erstellt_am, @geaendert_am)`,
  )
  // AP-1.10 PR-A: Aussage/Quelle/Zitat/aussage_zitat — für `test/hilfsmittel/grossbestand.ts`
  // (Beruf-/Geburts-/Todesaussagen + Belege im Leistungsbudget-Bestand). Spaltennamen bereits
  // snake_case in `Aussage`/`Quelle`/`Zitat` (src/shared/schemata/*.ts) — Parameter binden darum
  // 1:1 an die Feldnamen, wie bei `person`/`name` oben.
  const aussageEinfuegen = db.prepare(
    `INSERT INTO aussage (
       id, subjekt_typ, subjekt_id, praedikat, wert_text, wert_zahl, wert_ref_id,
       datum_kalender, datum_modifikator, datum_praezision, datum_wert1, datum_wert2, datum_originaltext,
       datum_sort_von, datum_sort_bis, datum_zweitkalender, datum_zweitwert, datum_doppeljahr,
       konfidenz, ist_bevorzugt, begruendung, unsicherheit, gueltig_von, gueltig_bis, erstellt_am, geaendert_am
     ) VALUES (
       @id, @subjekt_typ, @subjekt_id, @praedikat, @wert_text, @wert_zahl, @wert_ref_id,
       @datum_kalender, @datum_modifikator, @datum_praezision, @datum_wert1, @datum_wert2, @datum_originaltext,
       @datum_sort_von, @datum_sort_bis, @datum_zweitkalender, @datum_zweitwert, @datum_doppeljahr,
       @konfidenz, @ist_bevorzugt, @begruendung, @unsicherheit, @gueltig_von, @gueltig_bis, @erstellt_am, @geaendert_am
     )`,
  )
  const quelleEinfuegen = db.prepare(
    `INSERT INTO quelle (
       id, typ, titel, autor, verlag, jahr, art, informationsart, archiv_id, signatur, notiz,
       informant_person_id, gespraechsdatum_kalender, gespraechsdatum_modifikator, gespraechsdatum_praezision,
       gespraechsdatum_wert1, gespraechsdatum_wert2, gespraechsdatum_originaltext, gespraechsdatum_sort_von,
       gespraechsdatum_sort_bis, gespraechsdatum_zweitkalender, gespraechsdatum_zweitwert, gespraechsdatum_doppeljahr,
       form, unmittelbarkeit, audio_medium_id, erstellt_am, geaendert_am
     ) VALUES (
       @id, @typ, @titel, @autor, @verlag, @jahr, @art, @informationsart, @archiv_id, @signatur, @notiz,
       @informant_person_id, @gespraechsdatum_kalender, @gespraechsdatum_modifikator, @gespraechsdatum_praezision,
       @gespraechsdatum_wert1, @gespraechsdatum_wert2, @gespraechsdatum_originaltext, @gespraechsdatum_sort_von,
       @gespraechsdatum_sort_bis, @gespraechsdatum_zweitkalender, @gespraechsdatum_zweitwert, @gespraechsdatum_doppeljahr,
       @form, @unmittelbarkeit, @audio_medium_id, @erstellt_am, @geaendert_am
     )`,
  )
  const zitatEinfuegen = db.prepare(
    `INSERT INTO zitat (
       id, quelle_id, seite, eintragsnummer, band, jahr,
       zugriffsdatum_kalender, zugriffsdatum_modifikator, zugriffsdatum_praezision, zugriffsdatum_wert1,
       zugriffsdatum_wert2, zugriffsdatum_originaltext, zugriffsdatum_sort_von, zugriffsdatum_sort_bis,
       zugriffsdatum_zweitkalender, zugriffsdatum_zweitwert, zugriffsdatum_doppeljahr,
       digitalisat_url, transkript, uebersetzung, konfidenz, medium_id, zeitmarke_sekunden, erstellt_am, geaendert_am
     ) VALUES (
       @id, @quelle_id, @seite, @eintragsnummer, @band, @jahr,
       @zugriffsdatum_kalender, @zugriffsdatum_modifikator, @zugriffsdatum_praezision, @zugriffsdatum_wert1,
       @zugriffsdatum_wert2, @zugriffsdatum_originaltext, @zugriffsdatum_sort_von, @zugriffsdatum_sort_bis,
       @zugriffsdatum_zweitkalender, @zugriffsdatum_zweitwert, @zugriffsdatum_doppeljahr,
       @digitalisat_url, @transkript, @uebersetzung, @konfidenz, @medium_id, @zeitmarke_sekunden, @erstellt_am, @geaendert_am
     )`,
  )
  const aussageZitatEinfuegen = db.prepare(
    `INSERT INTO aussage_zitat (aussage_id, zitat_id, erstellt_am, geaendert_am)
     VALUES (@aussage_id, @zitat_id, @erstellt_am, @geaendert_am)`,
  )

  // `defer_foreign_keys` muss VOR `BEGIN` gesetzt werden (SQLite-Doku: innerhalb einer laufenden
  // Transaktion ist die PRAGMA ein No-op) — erst dann lockert sie die Einfügereihenfolge bis zum COMMIT.
  db.pragma('defer_foreign_keys = ON')
  db.exec('BEGIN')
  try {
    for (const person of beschreibung.personen) {
      const zeitpunkt = zeit.naechster()
      personEinfuegen.run({
        id: schluessel.aufloesen(person.schluessel),
        geschlecht: person.geschlecht ?? null,
        lebend_status: person.lebend_status ?? null,
        privat: person.privat,
        notiz: person.notiz ?? null,
        gesperrt_bis: person.gesperrt_bis ?? null,
        ist_platzhalter: person.ist_platzhalter,
        platzhalter_grund: person.platzhalter_grund ?? null,
        erstellt_am: zeitpunkt,
        geaendert_am: zeitpunkt,
      })
    }

    // „Genau ein Hauptname je Person" (0006): pro Person genau eine bevorzugte Form — die erste
    // explizit mit `ist_bevorzugt: 1` markierte, sonst die erste Namenszeile der Person.
    const namenListe = beschreibung.namen ?? []
    const hauptnameJePerson = new Map<string, string>()
    for (const name of namenListe) {
      if (name.ist_bevorzugt === 1 && !hauptnameJePerson.has(name.personSchluessel)) {
        hauptnameJePerson.set(name.personSchluessel, name.schluessel)
      }
    }
    for (const name of namenListe) {
      if (!hauptnameJePerson.has(name.personSchluessel)) {
        hauptnameJePerson.set(name.personSchluessel, name.schluessel)
      }
    }

    for (const name of namenListe) {
      const zeitpunkt = zeit.naechster()
      const formId = schluessel.aufloesen(name.schluessel)
      nameFormEinfuegen.run({
        id: formId,
        person_id: schluessel.aufloesen(name.personSchluessel),
        sprache: name.sprache ?? null,
        schrift: name.schrift ?? null,
        rolle: name.typ === 'transliteriert' ? null : name.typ,
        ist_bevorzugt: hauptnameJePerson.get(name.personSchluessel) === name.schluessel ? 1 : 0,
        umschrift_von: name.umschriftVonSchluessel === undefined ? null : schluessel.aufloesen(name.umschriftVonSchluessel),
        umschrift_norm: name.umschrift_norm ?? null,
        gueltig_von: name.gueltig_von ?? null,
        gueltig_bis: name.gueltig_bis ?? null,
        // AP-1.33: `original_text` montieren, wenn nicht gesetzt — der abgeleitete Trigger
        // `abl_name_form_ai` indiziert die FTS-Normalform daraus (die name_part-Zeilen existieren zum
        // Zeitpunkt des Form-Inserts noch nicht); s. `montiereOriginalText`.
        original_text:
          name.original_text ??
          montiereOriginalText({
            vornamen: name.vornamen,
            rufnameIndex: name.rufname_index,
            rufnameText: name.rufname_text,
            nachname: name.nachname,
            praefix: name.praefix,
            titelVor: name.titel_vor,
            zusatzNach: name.zusatz_nach,
          }),
        erstellt_am: zeitpunkt,
        geaendert_am: zeitpunkt,
      })
      for (const teil of zerlegeName({
        vornamen: name.vornamen,
        rufnameIndex: name.rufname_index,
        rufnameText: name.rufname_text,
        nachname: name.nachname,
        praefix: name.praefix,
        titelVor: name.titel_vor,
        zusatzNach: name.zusatz_nach,
      })) {
        namePartEinfuegen.run({
          id: prng.naechsteId(),
          name_form_id: formId,
          art: teil.art,
          wert: teil.wert,
          ist_rufname: teil.istRufname ? 1 : 0,
          sortier_index: teil.sortierIndex,
          erstellt_am: zeitpunkt,
          geaendert_am: zeitpunkt,
        })
      }
    }

    for (const elternschaft of beschreibung.elternschaften ?? []) {
      const zeitpunkt = zeit.naechster()
      elternschaftEinfuegen.run({
        id: schluessel.aufloesen(elternschaft.schluessel),
        elternteil_id: schluessel.aufloesen(elternschaft.elternteilSchluessel),
        kind_id: schluessel.aufloesen(elternschaft.kindSchluessel),
        typ: elternschaft.typ,
        konfidenz: elternschaft.konfidenz ?? null,
        notiz: elternschaft.notiz ?? null,
        erstellt_am: zeitpunkt,
        geaendert_am: zeitpunkt,
      })
    }

    for (const ereignis of beschreibung.ereignisse ?? []) {
      const zeitpunkt = zeit.naechster()
      ereignisEinfuegen.run({
        id: schluessel.aufloesen(ereignis.schluessel),
        typ: ereignis.typ,
        ort_id: ereignis.ort_id ?? null,
        datum_kalender: ereignis.datum_kalender ?? null,
        datum_modifikator: ereignis.datum_modifikator ?? null,
        datum_praezision: ereignis.datum_praezision ?? null,
        datum_wert1: ereignis.datum_wert1 ?? null,
        datum_wert2: ereignis.datum_wert2 ?? null,
        datum_originaltext: ereignis.datum_originaltext ?? null,
        datum_sort_von: ereignis.datum_sort_von ?? null,
        datum_sort_bis: ereignis.datum_sort_bis ?? null,
        datum_zweitkalender: ereignis.datum_zweitkalender ?? null,
        datum_zweitwert: ereignis.datum_zweitwert ?? null,
        datum_doppeljahr: ereignis.datum_doppeljahr ?? null,
        beschreibung: ereignis.beschreibung ?? null,
        notiz: ereignis.notiz ?? null,
        erstellt_am: zeitpunkt,
        geaendert_am: zeitpunkt,
      })
    }

    for (const beteiligung of beschreibung.beteiligungen ?? []) {
      const zeitpunkt = zeit.naechster()
      beteiligungEinfuegen.run({
        id: schluessel.aufloesen(beteiligung.schluessel),
        ereignis_id: schluessel.aufloesen(beteiligung.ereignisSchluessel),
        person_id: schluessel.aufloesen(beteiligung.personSchluessel),
        rolle: beteiligung.rolle,
        reihenfolge: beteiligung.reihenfolge ?? null,
        erstellt_am: zeitpunkt,
        geaendert_am: zeitpunkt,
      })
    }

    for (const aussage of beschreibung.aussagen ?? []) {
      const zeitpunkt = zeit.naechster()
      aussageEinfuegen.run({
        id: schluessel.aufloesen(aussage.schluessel),
        subjekt_typ: aussage.subjekt_typ,
        subjekt_id: schluessel.aufloesen(aussage.subjektSchluessel),
        praedikat: aussage.praedikat,
        wert_text: aussage.wert_text ?? null,
        wert_zahl: aussage.wert_zahl ?? null,
        wert_ref_id: aussage.wert_ref_id ?? null,
        datum_kalender: aussage.datum_kalender ?? null,
        datum_modifikator: aussage.datum_modifikator ?? null,
        datum_praezision: aussage.datum_praezision ?? null,
        datum_wert1: aussage.datum_wert1 ?? null,
        datum_wert2: aussage.datum_wert2 ?? null,
        datum_originaltext: aussage.datum_originaltext ?? null,
        datum_sort_von: aussage.datum_sort_von ?? null,
        datum_sort_bis: aussage.datum_sort_bis ?? null,
        datum_zweitkalender: aussage.datum_zweitkalender ?? null,
        datum_zweitwert: aussage.datum_zweitwert ?? null,
        datum_doppeljahr: aussage.datum_doppeljahr ?? null,
        konfidenz: aussage.konfidenz ?? null,
        ist_bevorzugt: aussage.ist_bevorzugt ?? null,
        begruendung: aussage.begruendung ?? null,
        unsicherheit: aussage.unsicherheit ?? null,
        gueltig_von: aussage.gueltig_von ?? null,
        gueltig_bis: aussage.gueltig_bis ?? null,
        erstellt_am: zeitpunkt,
        geaendert_am: zeitpunkt,
      })
    }

    for (const quelle of beschreibung.quellen ?? []) {
      const zeitpunkt = zeit.naechster()
      quelleEinfuegen.run({
        id: schluessel.aufloesen(quelle.schluessel),
        typ: quelle.typ,
        titel: quelle.titel ?? null,
        autor: quelle.autor ?? null,
        verlag: quelle.verlag ?? null,
        jahr: quelle.jahr ?? null,
        art: quelle.art ?? null,
        informationsart: quelle.informationsart ?? null,
        archiv_id: quelle.archiv_id ?? null,
        signatur: quelle.signatur ?? null,
        notiz: quelle.notiz ?? null,
        informant_person_id: quelle.informant_person_id ?? null,
        gespraechsdatum_kalender: quelle.gespraechsdatum_kalender ?? null,
        gespraechsdatum_modifikator: quelle.gespraechsdatum_modifikator ?? null,
        gespraechsdatum_praezision: quelle.gespraechsdatum_praezision ?? null,
        gespraechsdatum_wert1: quelle.gespraechsdatum_wert1 ?? null,
        gespraechsdatum_wert2: quelle.gespraechsdatum_wert2 ?? null,
        gespraechsdatum_originaltext: quelle.gespraechsdatum_originaltext ?? null,
        gespraechsdatum_sort_von: quelle.gespraechsdatum_sort_von ?? null,
        gespraechsdatum_sort_bis: quelle.gespraechsdatum_sort_bis ?? null,
        gespraechsdatum_zweitkalender: quelle.gespraechsdatum_zweitkalender ?? null,
        gespraechsdatum_zweitwert: quelle.gespraechsdatum_zweitwert ?? null,
        gespraechsdatum_doppeljahr: quelle.gespraechsdatum_doppeljahr ?? null,
        form: quelle.form ?? null,
        unmittelbarkeit: quelle.unmittelbarkeit ?? null,
        audio_medium_id: quelle.audio_medium_id ?? null,
        erstellt_am: zeitpunkt,
        geaendert_am: zeitpunkt,
      })
    }

    for (const zitat of beschreibung.zitate ?? []) {
      const zeitpunkt = zeit.naechster()
      zitatEinfuegen.run({
        id: schluessel.aufloesen(zitat.schluessel),
        quelle_id: schluessel.aufloesen(zitat.quelleSchluessel),
        seite: zitat.seite ?? null,
        eintragsnummer: zitat.eintragsnummer ?? null,
        band: zitat.band ?? null,
        jahr: zitat.jahr ?? null,
        zugriffsdatum_kalender: zitat.zugriffsdatum_kalender ?? null,
        zugriffsdatum_modifikator: zitat.zugriffsdatum_modifikator ?? null,
        zugriffsdatum_praezision: zitat.zugriffsdatum_praezision ?? null,
        zugriffsdatum_wert1: zitat.zugriffsdatum_wert1 ?? null,
        zugriffsdatum_wert2: zitat.zugriffsdatum_wert2 ?? null,
        zugriffsdatum_originaltext: zitat.zugriffsdatum_originaltext ?? null,
        zugriffsdatum_sort_von: zitat.zugriffsdatum_sort_von ?? null,
        zugriffsdatum_sort_bis: zitat.zugriffsdatum_sort_bis ?? null,
        zugriffsdatum_zweitkalender: zitat.zugriffsdatum_zweitkalender ?? null,
        zugriffsdatum_zweitwert: zitat.zugriffsdatum_zweitwert ?? null,
        zugriffsdatum_doppeljahr: zitat.zugriffsdatum_doppeljahr ?? null,
        digitalisat_url: zitat.digitalisat_url ?? null,
        transkript: zitat.transkript ?? null,
        uebersetzung: zitat.uebersetzung ?? null,
        konfidenz: zitat.konfidenz ?? null,
        medium_id: zitat.medium_id ?? null,
        zeitmarke_sekunden: zitat.zeitmarke_sekunden ?? null,
        erstellt_am: zeitpunkt,
        geaendert_am: zeitpunkt,
      })
    }

    for (const aussageZitat of beschreibung.aussageZitate ?? []) {
      const zeitpunkt = zeit.naechster()
      aussageZitatEinfuegen.run({
        aussage_id: schluessel.aufloesen(aussageZitat.aussageSchluessel),
        zitat_id: schluessel.aufloesen(aussageZitat.zitatSchluessel),
        erstellt_am: zeitpunkt,
        geaendert_am: zeitpunkt,
      })
    }

    db.exec('COMMIT')
  } catch (fehler) {
    db.exec('ROLLBACK')
    throw fehler
  }

  for (const trigger of zurueckgestellteTrigger) {
    db.exec(trigger.sql)
  }
  if (bulkModus) {
    alleAbgeleitetenNeuAufbauen(db)
  }

  return db
}
