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
import type { Beteiligung } from '../../src/shared/schemata/beteiligung'
import type { Elternschaft } from '../../src/shared/schemata/elternschaft'
import type { Ereignis } from '../../src/shared/schemata/ereignis'
import type { Name } from '../../src/shared/schemata/name'
import type { Person } from '../../src/shared/schemata/person'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { MIGRATIONEN } from '../../src/main/datenbank/migration/registrierung'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { journalAus } from '../../src/main/journal/kontext'
import { SeedPrng } from '../../src/core/zufall/seed-prng'

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

/** Deklarative Beschreibung eines Testbaums — Eingabe für `baueFixture`. */
export interface FixtureBeschreibung {
  readonly personen: readonly FixturePerson[]
  readonly namen?: readonly FixtureNamenzeile[] | undefined
  readonly elternschaften?: readonly FixtureElternschaft[] | undefined
  readonly ereignisse?: readonly FixtureEreignis[] | undefined
  readonly beteiligungen?: readonly FixtureBeteiligung[] | undefined
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

/**
 * Baut eine frische, vollständig migrierte In-Memory-Datenbank (`:memory:`) aus einer
 * `FixtureBeschreibung`. Journal ist aus (Testdaten, kein Nutzer-Undo-Schritt), IDs/Zeitstempel
 * kommen deterministisch aus `seed` — zwei Aufrufe mit gleicher `beschreibung` und gleichem `seed`
 * liefern eine bitgleiche Datenbank (AP-0.12-Abnahme, geprüft in
 * `test/einheit/generator-deterministisch.test.ts` über `fixtures/generiert/generator.ts`, das
 * diesen Helfer wiederverwendet). Aufrufer schließt die Verbindung selbst (`db.close()`).
 */
export function baueFixture(beschreibung: FixtureBeschreibung, seed: number | bigint): Database.Database {
  const db = oeffnen(':memory:')
  migrieren(db, { migrationen: MIGRATIONEN, appVersion: 'fixture' })
  journalAus(db, 'AP-0.12 Fixture-Aufbau (test/hilfsmittel/fixture-bauen.ts): Testdaten ohne Befehlsbus-Armierung.')

  const prng = new SeedPrng(seed)
  const schluessel = new SchluesselAufloeser(prng)
  const zeit = new Zeitstempelzaehler(FESTER_ZEIT_START)

  const personEinfuegen = db.prepare(
    `INSERT INTO person
       (id, geschlecht, lebend_status, privat, notiz, gesperrt_bis, ist_platzhalter, platzhalter_grund, erstellt_am, geaendert_am)
     VALUES
       (@id, @geschlecht, @lebend_status, @privat, @notiz, @gesperrt_bis, @ist_platzhalter, @platzhalter_grund, @erstellt_am, @geaendert_am)`,
  )
  const nameEinfuegen = db.prepare(
    `INSERT INTO name
       (id, person_id, typ, schrift, umschrift_von, umschrift_norm, vornamen, rufname_index, rufname_text,
        nachname, praefix, titel_vor, zusatz_nach, original_text, sprache, ist_bevorzugt, gueltig_von,
        gueltig_bis, erstellt_am, geaendert_am)
     VALUES
       (@id, @person_id, @typ, @schrift, @umschrift_von, @umschrift_norm, @vornamen, @rufname_index, @rufname_text,
        @nachname, @praefix, @titel_vor, @zusatz_nach, @original_text, @sprache, @ist_bevorzugt, @gueltig_von,
        @gueltig_bis, @erstellt_am, @geaendert_am)`,
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

    for (const name of beschreibung.namen ?? []) {
      const zeitpunkt = zeit.naechster()
      nameEinfuegen.run({
        id: schluessel.aufloesen(name.schluessel),
        person_id: schluessel.aufloesen(name.personSchluessel),
        typ: name.typ,
        schrift: name.schrift ?? null,
        umschrift_von: name.umschriftVonSchluessel === undefined ? null : schluessel.aufloesen(name.umschriftVonSchluessel),
        umschrift_norm: name.umschrift_norm ?? null,
        vornamen: name.vornamen ?? null,
        rufname_index: name.rufname_index ?? null,
        rufname_text: name.rufname_text ?? null,
        nachname: name.nachname ?? null,
        praefix: name.praefix ?? null,
        titel_vor: name.titel_vor ?? null,
        zusatz_nach: name.zusatz_nach ?? null,
        original_text: name.original_text ?? null,
        sprache: name.sprache ?? null,
        ist_bevorzugt: name.ist_bevorzugt ?? null,
        gueltig_von: name.gueltig_von ?? null,
        gueltig_bis: name.gueltig_bis ?? null,
        erstellt_am: zeitpunkt,
        geaendert_am: zeitpunkt,
      })
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

    db.exec('COMMIT')
  } catch (fehler) {
    db.exec('ROLLBACK')
    throw fehler
  }

  return db
}
