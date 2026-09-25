// AP-1.6 PR1, C-16/C-17/A-19, 55_Architektur.md §5. `abfrage:person.liste` — read-only SQL gegen
// `person_flach`/`person`/`name`/`aussage`/`aussage_zitat`/`elternschaft` (CLAUDE.md §2: SQL nur in
// src/main/repositories/, src/main/abfragen/), KEINE Transaktion, Spalten aufgezählt, benannte
// Parameter.
//
// Sortierung (Entscheidung A, freigegeben): `person_flach.sortier_nachname`/`sortier_vornamen`
// entfernen Diakritika vollständig (suchnormalform(), src/core/name/suchnormalform.ts) und taugen
// darum NICHT für die Personenliste — "Müller" würde zu "muller" und wäre von "Mueller" nicht mehr
// unterscheidbar. Diese Abfrage liest darum stattdessen den ROHEN bevorzugten Namen (JOIN auf
// `name`, dieselbe "bevorzugter Eintrag"-Fensterfunktion wie in den `abl_*`-Triggern,
// docs/schema/0003_abgeleitet.sql) und sortiert mit der eigenen, getesteten Kern-Kollation
// (`src/core/liste/sortierung.ts`) NACH dem Laden — ein zweiter, in SQL nachgebauter
// Kollationsalgorithmus wäre eine ständige Drift-Quelle gegenüber dem in `test/einheit/
// abfrage-person-liste.test.ts` geprüften Verhalten. Bei bis zu einigen Tausend Personen (aktueller
// Formfaktor der App, s. test/budget/leistung.test.ts) ist "gefilterten Bestand laden, in JS
// sortieren, dann seitenweise schneiden" günstiger als zwei Abfragepfade (SQL-Sortierung für
// geburt/tod, JS-Nachsortierung für nachname/vornamen) mit doppelter Wartungslast zu pflegen.
//
// AP-1.10 PR-A (Listen-Vertrag): die Zeile trägt zusätzlich Beruf, Belegzahl, Kinderzahl und die
// volle Datums-Spaltengruppe für Geburt/Tod — jeweils über EINE gruppierte Nebenabfrage (Fenster-
// funktion bzw. `GROUP BY`) statt einer Abfrage je Person (Budget: test/budget/leistung.test.ts hält
// das 20-ms-Median-Budget ohne neuen Index, s. dortiger Kommentar). Seit den Vorarbeiten zu AP-1.30
// (Teil 2, PR 5) in zwei Phasen: `sortierZeilenLaden` (alle gefilterten Personen, nur Sortierschlüssel)
// und `zeilenFuerIdsLaden` (volle Zeilen nur für die Seite). `filterBedingungen`, `vergleicheZeilen`,
// `whereSql`, `sortierZeilenLaden`, `zeilenFuerIdsLaden` und `zeileZuAusgabe` sind benannt exportiert:
// `src/main/abfragen/suche.ts` verwendet sie unverändert wieder (U-1.6-suche-ohne-filter-sortierung-
// seite), statt eine zweite Filter-/Sortier-/Lade-Implementierung zu pflegen.
import type Database from 'better-sqlite3'
import { namensSortierschluessel, vergleicheNamen, vergleicheNamensschluessel, type NamensSortierschluessel } from '../../core/liste/sortierung'
// AP-1.33: bevorzugter Name je Person aus name_form + name_part rekonstruiert — dieselben SQL-
// Bausteine wie die kanonische person_flach-Projektion (Bitgleichheit, kein zweiter Nachbau).
import { bevorzugteFormIdSql, nameFormNachnameSql, nameFormVornamenSql } from '../datenbank/abgeleitet-projektion'
// Vorarbeiten AP-1.30, PR 4a (Eigentümer 25.09.2026): der SICHTBARE Name kommt aus dem Kern
// (`anzeigenameFuer`), die Projektion (`bn.*`, `person_flach`) bleibt nur für Sortierung/Suche;
// `pf.anzeigename` wird hier bewusst nicht mehr geladen (hueter #128, Befund 7).
import { anzeigenamenLaden } from './_anzeigenamen'
import { DatumModifikatorEnum, DatumPraezisionEnum, KalenderEnum } from '../../shared/schemata/gemeinsam'
import type { PersonListeAus, PersonListeDatumsgruppe, PersonListeEin, PersonListeFilter, PersonListeZeile } from '../../shared/schemata/person-liste'
import { PersonListeRichtungEnum, PersonListeSortierungEnum } from '../../shared/schemata/person-liste'
import type { z } from 'zod'

interface FilterBedingungen {
  readonly bedingungen: readonly string[]
  readonly parameter: Record<string, number | string>
}

/**
 * Baut die `WHERE`-Bedingungen aus `filter` (Tristate `platzhalter`/`privat`, Entscheidung B:
 * `'alle'` filtert nicht — Platzhalterpersonen werden standardmäßig mit angezeigt). `konfidenzMin`:
 * ENTSCHEIDUNG (nicht explizit im Auftrag spezifiziert, hier festgelegt): der Parametername spiegelt
 * die Spalte `person_flach.konfidenz_min` direkt — der Filter zeigt darum Personen mit einer
 * Mindestkonfidenz von mindestens `konfidenzMin` (`>= `), nicht höchstens. Personen ganz ohne
 * Aussage (`konfidenz_min IS NULL`) erfüllen das nicht und werden bei aktivem Filter ausgeschlossen.
 *
 * AP-1.10 PR-A: `zeitraumVon`/`zeitraumBis` filtern über `person_flach.geburt_jahr` (Personen ohne
 * Geburtsjahr erfüllen ein aktives Zeitraum-Ende nicht — analog zu `konfidenzMin`). `ort` ist ein
 * groß-/kleinschreibungsunabhängiger Teilstring-Treffer über `person_flach.geburt_ort_name`, über
 * `INSTR()` statt `LIKE`, damit `%`/`_` in einem Ortsnamen keine versehentliche Wildcard-Bedeutung
 * bekommen (SQLite-`LIKE` bräuchte sonst eine eigene Escape-Klausel).
 */
export function filterBedingungen(filter: PersonListeFilter): FilterBedingungen {
  const bedingungen: string[] = []
  const parameter: Record<string, number | string> = {}

  if (filter.platzhalter === 'nur') bedingungen.push('p.ist_platzhalter = 1')
  else if (filter.platzhalter === 'ohne') bedingungen.push('p.ist_platzhalter = 0')

  if (filter.privat === 'nur') bedingungen.push('p.privat = 1')
  else if (filter.privat === 'ohne') bedingungen.push('p.privat = 0')

  if (filter.konfidenzMin !== undefined) {
    bedingungen.push('pf.konfidenz_min >= @konfidenzMin')
    parameter.konfidenzMin = filter.konfidenzMin
  }

  if (filter.nurWiderspruch) {
    bedingungen.push('pf.hat_widerspruch = 1')
  }

  if (filter.zeitraumVon !== undefined) {
    bedingungen.push('pf.geburt_jahr >= @zeitraumVon')
    parameter.zeitraumVon = filter.zeitraumVon
  }

  if (filter.zeitraumBis !== undefined) {
    bedingungen.push('pf.geburt_jahr <= @zeitraumBis')
    parameter.zeitraumBis = filter.zeitraumBis
  }

  if (filter.ort !== undefined && filter.ort.trim() !== '') {
    bedingungen.push("INSTR(LOWER(COALESCE(pf.geburt_ort_name, '')), LOWER(@ort)) > 0")
    parameter.ort = filter.ort.trim()
  }

  return { bedingungen, parameter }
}

export function whereSql(bedingungen: readonly string[]): string {
  return bedingungen.length > 0 ? `WHERE ${bedingungen.join(' AND ')}` : ''
}

interface GesamtZeile {
  readonly gesamt: number
}

function gesamtLaden(db: Database.Database, whereKlausel: string, parameter: Record<string, number | string>): number {
  const zeile = db
    .prepare<
      Record<string, number | string>,
      GesamtZeile
    >(`SELECT COUNT(*) AS gesamt FROM person_flach pf JOIN person p ON p.id = pf.person_id ${whereKlausel}`)
    .get(parameter)
  return zeile?.gesamt ?? 0
}

export interface RohZeile {
  readonly person_id: string
  readonly geburt_jahr: number | null
  readonly geburt_sort_von: number | null
  readonly tod_jahr: number | null
  readonly tod_sort_von: number | null
  readonly geburt_ort_name: string | null
  readonly konfidenz_min: number | null
  readonly hat_widerspruch: number
  readonly ist_platzhalter: number
  readonly nachname: string | null
  readonly vornamen: string | null
  readonly beruf: string | null
  readonly belegzahl: number
  readonly kinderzahl: number
  readonly geburt_kalender: string | null
  readonly geburt_modifikator: string | null
  readonly geburt_praezision: string | null
  readonly geburt_wert1: string | null
  readonly geburt_wert2: string | null
  readonly geburt_originaltext: string | null
  readonly geburt_datum_sort_von: number | null
  readonly geburt_datum_sort_bis: number | null
  readonly tod_kalender: string | null
  readonly tod_modifikator: string | null
  readonly tod_praezision: string | null
  readonly tod_wert1: string | null
  readonly tod_wert2: string | null
  readonly tod_originaltext: string | null
  readonly tod_datum_sort_von: number | null
  readonly tod_datum_sort_bis: number | null
}

/** Die Felder, nach denen die Liste sortiert und seitenweise geschnitten wird (Phase 1). */
export type SortierZeile = Pick<RohZeile, 'person_id' | 'nachname' | 'vornamen' | 'geburt_sort_von' | 'tod_sort_von'>

/** Die Felder, die Phase 2 für die Zeilen der Seite lädt: alles außer dem Rohnamen — den sichtbaren
 * Namen liefert `anzeigenamenLaden` aus dem Kern, sortiert ist schon in Phase 1 (Vorarbeiten AP-1.30
 * Teil 3, Leistung). */
export type SeitenZeile = Omit<RohZeile, 'nachname' | 'vornamen'>

/**
 * Phase 1 (Vorarbeiten AP-1.30 Teil 2, PR 5; Teil 3, Leistung): für ALLE gefilterten Personen nur die
 * Id und den Sortierschlüssel. Bei Sortierung nach Nach- bzw. Vornamen wird NUR diese eine Spalte der
 * bevorzugten Namensform als korrelierter Einzelwert je Zeile berechnet — über `bevorzugteFormIdSql`
 * (`ist_bevorzugt = 1` zuerst, sonst niedrigste `id`: dieselbe Wahl wie die `rang = 1`-Fensterfunktion
 * der Projektion, aber ohne Zwischentabelle über alle Formen und ohne die zweite `group_concat`-
 * Spalte). Die ungebrauchte Namensspalte bleibt NULL: `sortiereZeilen`/`vergleicheZeilen` lesen je
 * Sortierung nur ihre eigene Spalte, der Tie-Break läuft über `person_id`. Bei Geburt/Tod genügen die
 * Sortierwerte aus `person_flach`. Die Namenssortierung bleibt in JS (Kern-Kollation), kein SQL-
 * `ORDER BY`. Beruf, Datumsgruppen, Beleg- und Kinderzahl lädt erst Phase 2 für die Zeilen der Seite
 * (`zeilenFuerIdsLaden`). Das Ergebnis ist bitgleich (test/einheit/person-liste-zwei-phasen.test.ts).
 */
export function sortierZeilenLaden(
  db: Database.Database,
  whereKlausel: string,
  parameter: Record<string, number | string>,
  sortierung: SortierEingabe['sortierung'],
): readonly SortierZeile[] {
  const formId = bevorzugteFormIdSql('pf.person_id')
  const nachname = sortierung === 'nachname' ? nameFormNachnameSql(formId) : 'NULL'
  const vornamen = sortierung === 'vornamen' ? nameFormVornamenSql(formId) : 'NULL'
  return db
    .prepare<Record<string, number | string>, SortierZeile>(
      `SELECT pf.person_id AS person_id, pf.geburt_sort_von AS geburt_sort_von, pf.tod_sort_von AS tod_sort_von,
              ${nachname} AS nachname, ${vornamen} AS vornamen
       FROM person_flach pf
       JOIN person p ON p.id = pf.person_id
       ${whereKlausel}`,
    )
    .all(parameter)
}

/**
 * Phase 2: die vollen Zeilen für die übergebenen Personen (die Seite) samt Beruf, Belegzahl, Kinderzahl und der vollen Geburts-/Todes-Datumsgruppe — in der Reihenfolge von
 * `personIds`. Jede Nebentabelle ist eine EINMAL berechnete, gruppierte Nebenabfrage (Fensterfunktion
 * für „bevorzugter/erster Eintrag je Person", `GROUP BY` für die Zahlen), eingeschränkt auf die
 * Personen der Seite. Die Einschränkung ändert keinen Wert: jede Fensterpartition und jede Gruppe
 * gehört genau einer Person und bleibt vollständig. Die Ids gehen als EIN JSON-Parameter über
 * `json_each` in die Abfrage (benannter Parameter, kein zusammengesetztes SQL, CLAUDE.md §6).
 */
export function zeilenFuerIdsLaden(db: Database.Database, personIds: readonly string[]): readonly SeitenZeile[] {
  if (personIds.length === 0) return []
  const ids = 'SELECT value FROM json_each(@ids)'
  const zeilen = db
    .prepare<
      { readonly ids: string },
      SeitenZeile
    >(`SELECT pf.person_id AS person_id, pf.geburt_jahr AS geburt_jahr,
              pf.geburt_sort_von AS geburt_sort_von, pf.tod_jahr AS tod_jahr, pf.tod_sort_von AS tod_sort_von,
              pf.geburt_ort_name AS geburt_ort_name, pf.konfidenz_min AS konfidenz_min,
              pf.hat_widerspruch AS hat_widerspruch, p.ist_platzhalter AS ist_platzhalter,
              ber.beruf AS beruf,
              COALESCE(bz.belegzahl, 0) AS belegzahl,
              COALESCE(kz.kinderzahl, 0) AS kinderzahl,
              gbv.datum_kalender AS geburt_kalender, gbv.datum_modifikator AS geburt_modifikator,
              gbv.datum_praezision AS geburt_praezision, gbv.datum_wert1 AS geburt_wert1,
              gbv.datum_wert2 AS geburt_wert2, gbv.datum_originaltext AS geburt_originaltext,
              gbv.datum_sort_von AS geburt_datum_sort_von, gbv.datum_sort_bis AS geburt_datum_sort_bis,
              tdv.datum_kalender AS tod_kalender, tdv.datum_modifikator AS tod_modifikator,
              tdv.datum_praezision AS tod_praezision, tdv.datum_wert1 AS tod_wert1,
              tdv.datum_wert2 AS tod_wert2, tdv.datum_originaltext AS tod_originaltext,
              tdv.datum_sort_von AS tod_datum_sort_von, tdv.datum_sort_bis AS tod_datum_sort_bis
       FROM person_flach pf
       JOIN person p ON p.id = pf.person_id
       LEFT JOIN (
         SELECT subjekt_id AS person_id, wert_text AS beruf,
           ROW_NUMBER() OVER (PARTITION BY subjekt_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
         FROM aussage
         WHERE subjekt_typ = 'person' AND praedikat = 'beruf' AND subjekt_id IN (${ids})
       ) ber ON ber.person_id = pf.person_id AND ber.rang = 1
       LEFT JOIN (
         SELECT subjekt_id AS person_id, datum_kalender, datum_modifikator, datum_praezision,
           datum_wert1, datum_wert2, datum_originaltext, datum_sort_von, datum_sort_bis,
           ROW_NUMBER() OVER (PARTITION BY subjekt_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
         FROM aussage
         WHERE subjekt_typ = 'person' AND praedikat = 'geburtsdatum' AND subjekt_id IN (${ids})
       ) gbv ON gbv.person_id = pf.person_id AND gbv.rang = 1
       LEFT JOIN (
         SELECT subjekt_id AS person_id, datum_kalender, datum_modifikator, datum_praezision,
           datum_wert1, datum_wert2, datum_originaltext, datum_sort_von, datum_sort_bis,
           ROW_NUMBER() OVER (PARTITION BY subjekt_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
         FROM aussage
         WHERE subjekt_typ = 'person' AND praedikat = 'todesdatum' AND subjekt_id IN (${ids})
       ) tdv ON tdv.person_id = pf.person_id AND tdv.rang = 1
       LEFT JOIN (
         SELECT a.subjekt_id AS person_id, COUNT(az.zitat_id) AS belegzahl
         FROM aussage a
         LEFT JOIN aussage_zitat az ON az.aussage_id = a.id
         WHERE a.subjekt_typ = 'person' AND a.subjekt_id IN (${ids})
         GROUP BY a.subjekt_id
       ) bz ON bz.person_id = pf.person_id
       LEFT JOIN (
         SELECT elternteil_id AS person_id, COUNT(*) AS kinderzahl
         FROM elternschaft
         WHERE elternteil_id IN (${ids})
         GROUP BY elternteil_id
       ) kz ON kz.person_id = pf.person_id
       WHERE pf.person_id IN (${ids})`,
    )
    .all({ ids: JSON.stringify([...new Set(personIds)]) })
  const jeId = new Map(zeilen.map((zeile) => [zeile.person_id, zeile]))
  return personIds.flatMap((personId) => {
    const zeile = jeId.get(personId)
    return zeile === undefined ? [] : [zeile]
  })
}

/** Zahlenvergleich mit NULL-Werten immer am Ende, unabhängig von `richtungFaktor` (unbekanntes
 * Datum ist kein "spätestes" oder "frühestes" Datum — es steht einfach hinten). */
function vergleicheZahlNullsLetzten(a: number | null, b: number | null, richtungFaktor: number): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return richtungFaktor * (a - b)
}

/** Nur die Felder, die die Sortierung tatsächlich braucht — `src/main/abfragen/suche.ts` reicht
 * dafür sein eigenes `SucheEin` durch (strukturell kompatibel, keine Kopplung an `PersonListeEin`). */
export interface SortierEingabe {
  readonly sortierung: z.infer<typeof PersonListeSortierungEnum>
  readonly richtung: z.infer<typeof PersonListeRichtungEnum>
}

export function vergleicheZeilen(a: SortierZeile, b: SortierZeile, ein: SortierEingabe): number {
  const richtungFaktor = ein.richtung === 'auf' ? 1 : -1
  let vergleich: number
  switch (ein.sortierung) {
    case 'nachname':
      vergleich = richtungFaktor * vergleicheNamen(a.nachname ?? '', b.nachname ?? '')
      break
    case 'vornamen':
      vergleich = richtungFaktor * vergleicheNamen(a.vornamen ?? '', b.vornamen ?? '')
      break
    case 'geburt':
      vergleich = vergleicheZahlNullsLetzten(a.geburt_sort_von, b.geburt_sort_von, richtungFaktor)
      break
    case 'tod':
      vergleich = vergleicheZahlNullsLetzten(a.tod_sort_von, b.tod_sort_von, richtungFaktor)
      break
  }
  if (vergleich !== 0) return vergleich
  // Stabiler Tie-Break, unabhängig von `richtung`: deterministische Seitenweise-Ausgabe bei
  // vollständig gleichem Sortierschlüssel (z. B. zwei Namensvettern ohne Geburtsdatum).
  if (a.person_id < b.person_id) return -1
  if (a.person_id > b.person_id) return 1
  return 0
}

/**
 * Sortiert Zeilen in genau der Ordnung von `vergleicheZeilen` (Vorarbeiten AP-1.30, PR 4a), berechnet
 * den Namens-Sortierschlüssel aber EINMAL je Zeile statt in jedem der ~n·log n Vergleiche: der
 * Leistungsbudget-Lauf (2000 Personen, 20 ms) lag schon vorher auf Kante, und der Kern-Anzeigename
 * kommt pro Seite hinzu. `vergleicheZeilen` bleibt die Referenz (Gleichheit geprüft in
 * test/einheit/person-liste-sortierung.test.ts).
 */
export function sortiereZeilen<Z extends SortierZeile>(zeilen: readonly Z[], ein: SortierEingabe): readonly Z[] {
  if (ein.sortierung !== 'nachname' && ein.sortierung !== 'vornamen') {
    return [...zeilen].sort((a, b) => vergleicheZeilen(a, b, ein))
  }
  const richtungFaktor = ein.richtung === 'auf' ? 1 : -1
  const nachVornamen = ein.sortierung === 'vornamen'
  const geschmueckt: { readonly zeile: Z; readonly schluessel: NamensSortierschluessel }[] = zeilen.map((zeile) => ({
    zeile,
    schluessel: namensSortierschluessel((nachVornamen ? zeile.vornamen : zeile.nachname) ?? ''),
  }))
  geschmueckt.sort((a, b) => {
    const vergleich = richtungFaktor * vergleicheNamensschluessel(a.schluessel, b.schluessel)
    if (vergleich !== 0) return vergleich
    if (a.zeile.person_id < b.zeile.person_id) return -1
    if (a.zeile.person_id > b.zeile.person_id) return 1
    return 0
  })
  return geschmueckt.map((eintrag) => eintrag.zeile)
}

interface DatumsgruppeRoh {
  readonly kalender: string | null
  readonly modifikator: string | null
  readonly praezision: string | null
  readonly wert1: string | null
  readonly wert2: string | null
  readonly originaltext: string | null
  readonly sortVon: number | null
  readonly sortBis: number | null
}

/** Baut eine `PersonListeDatumsgruppe`, oder `null`, wenn eine der Kernangaben (Kalender/
 * Modifikator/Präzision/wert1) fehlt — defensiv (CLAUDE.md §4: kein `!`), auch wenn die
 * `aussage`-Spalten bei einer `geburtsdatum`/`todesdatum`-Aussage aus dem Datumsparser (AP-1.1)
 * immer gemeinsam gesetzt werden. `KalenderEnum`/`DatumModifikatorEnum`/`DatumPraezisionEnum.parse`
 * statt `as`: die Spalten sind zwar über `CHECK` eingeschränkt (docs/schema/0002_kern.sql), aber ein
 * `as` bräuchte trotzdem einen geprüften Wert (CLAUDE.md §4) — `.parse()` liefert genau das. */
function datumsgruppeBauen(roh: DatumsgruppeRoh): PersonListeDatumsgruppe | null {
  if (roh.kalender === null || roh.modifikator === null || roh.praezision === null || roh.wert1 === null) {
    return null
  }
  return {
    kalender: KalenderEnum.parse(roh.kalender),
    modifikator: DatumModifikatorEnum.parse(roh.modifikator),
    praezision: DatumPraezisionEnum.parse(roh.praezision),
    wert1: roh.wert1,
    wert2: roh.wert2,
    originaltext: roh.originaltext,
    sortVon: roh.sortVon ?? 0,
    sortBis: roh.sortBis ?? 0,
  }
}

function geburtDatumsgruppe(zeile: SeitenZeile): PersonListeDatumsgruppe | null {
  return datumsgruppeBauen({
    kalender: zeile.geburt_kalender,
    modifikator: zeile.geburt_modifikator,
    praezision: zeile.geburt_praezision,
    wert1: zeile.geburt_wert1,
    wert2: zeile.geburt_wert2,
    originaltext: zeile.geburt_originaltext,
    sortVon: zeile.geburt_datum_sort_von,
    sortBis: zeile.geburt_datum_sort_bis,
  })
}

function todDatumsgruppe(zeile: SeitenZeile): PersonListeDatumsgruppe | null {
  return datumsgruppeBauen({
    kalender: zeile.tod_kalender,
    modifikator: zeile.tod_modifikator,
    praezision: zeile.tod_praezision,
    wert1: zeile.tod_wert1,
    wert2: zeile.tod_wert2,
    originaltext: zeile.tod_originaltext,
    sortVon: zeile.tod_datum_sort_von,
    sortBis: zeile.tod_datum_sort_bis,
  })
}

/** `anzeigenamen`: sichtbarer Name je Person aus `anzeigenamenLaden` (nur für die Zeilen der Seite
 * geladen); fehlt die Person dort, hat sie keine Namensform (''). */
export function zeileZuAusgabe(zeile: SeitenZeile, anzeigenamen: ReadonlyMap<string, string>): PersonListeZeile {
  return {
    person_id: zeile.person_id,
    anzeigename: anzeigenamen.get(zeile.person_id) ?? '',
    geburt_jahr: zeile.geburt_jahr,
    tod_jahr: zeile.tod_jahr,
    geburt_ort_name: zeile.geburt_ort_name,
    konfidenz_min: zeile.konfidenz_min,
    hat_widerspruch: zeile.hat_widerspruch === 1,
    ist_platzhalter: zeile.ist_platzhalter === 1,
    beruf: zeile.beruf,
    belegzahl: zeile.belegzahl,
    kinderzahl: zeile.kinderzahl,
    geburt_datum: geburtDatumsgruppe(zeile),
    tod_datum: todDatumsgruppe(zeile),
  }
}

/** `abfrage:person.liste` (55_Architektur.md §5, AP-1.6 PR1). */
export function personListe(db: Database.Database, ein: PersonListeEin): PersonListeAus {
  const { bedingungen, parameter } = filterBedingungen(ein.filter)
  const whereKlausel = whereSql(bedingungen)

  const gesamt = gesamtLaden(db, whereKlausel, parameter)
  const sortiert = sortiereZeilen(sortierZeilenLaden(db, whereKlausel, parameter, ein.sortierung), ein)
  const start = (ein.seite - 1) * ein.proSeite
  const seitenIds = sortiert.slice(start, start + ein.proSeite).map((zeile) => zeile.person_id)

  const seite = zeilenFuerIdsLaden(db, seitenIds)
  const anzeigenamen = anzeigenamenLaden(db, seitenIds)
  return { zeilen: seite.map((zeile) => zeileZuAusgabe(zeile, anzeigenamen)), gesamt }
}
