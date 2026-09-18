// AP-1.6 PR1, C-16/C-17/A-19, 55_Architektur.md §5. `abfrage:person.liste` — read-only SQL gegen
// `person_flach`/`person`/`name` (CLAUDE.md §2: SQL nur in src/main/repositories/,
// src/main/abfragen/), KEINE Transaktion, Spalten aufgezählt, benannte Parameter.
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
import type Database from 'better-sqlite3'
import { vergleicheNamen } from '../../core/liste/sortierung'
import type { PersonListeAus, PersonListeEin, PersonListeFilter, PersonListeZeile } from '../../shared/schemata/person-liste'

interface FilterBedingungen {
  readonly bedingungen: readonly string[]
  readonly parameter: Record<string, number>
}

/**
 * Baut die `WHERE`-Bedingungen aus `filter` (Tristate `platzhalter`/`privat`, Entscheidung B:
 * `'alle'` filtert nicht — Platzhalterpersonen werden standardmäßig mit angezeigt). `konfidenzMin`:
 * ENTSCHEIDUNG (nicht explizit im Auftrag spezifiziert, hier festgelegt): der Parametername spiegelt
 * die Spalte `person_flach.konfidenz_min` direkt — der Filter zeigt darum Personen mit einer
 * Mindestkonfidenz von mindestens `konfidenzMin` (`>= `), nicht höchstens. Personen ganz ohne
 * Aussage (`konfidenz_min IS NULL`) erfüllen das nicht und werden bei aktivem Filter ausgeschlossen.
 */
function filterBedingungen(filter: PersonListeFilter): FilterBedingungen {
  const bedingungen: string[] = []
  const parameter: Record<string, number> = {}

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

  return { bedingungen, parameter }
}

function whereSql(bedingungen: readonly string[]): string {
  return bedingungen.length > 0 ? `WHERE ${bedingungen.join(' AND ')}` : ''
}

interface GesamtZeile {
  readonly gesamt: number
}

function gesamtLaden(db: Database.Database, whereKlausel: string, parameter: Record<string, number>): number {
  const zeile = db
    .prepare<
      Record<string, number>,
      GesamtZeile
    >(`SELECT COUNT(*) AS gesamt FROM person_flach pf JOIN person p ON p.id = pf.person_id ${whereKlausel}`)
    .get(parameter)
  return zeile?.gesamt ?? 0
}

interface RohZeile {
  readonly person_id: string
  readonly anzeigename: string
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
}

function zeilenLaden(db: Database.Database, whereKlausel: string, parameter: Record<string, number>): readonly RohZeile[] {
  return db
    .prepare<
      Record<string, number>,
      RohZeile
    >(`SELECT pf.person_id AS person_id, pf.anzeigename AS anzeigename, pf.geburt_jahr AS geburt_jahr,
              pf.geburt_sort_von AS geburt_sort_von, pf.tod_jahr AS tod_jahr, pf.tod_sort_von AS tod_sort_von,
              pf.geburt_ort_name AS geburt_ort_name, pf.konfidenz_min AS konfidenz_min,
              pf.hat_widerspruch AS hat_widerspruch, p.ist_platzhalter AS ist_platzhalter,
              bn.nachname AS nachname, bn.vornamen AS vornamen
       FROM person_flach pf
       JOIN person p ON p.id = pf.person_id
       LEFT JOIN (
         SELECT person_id, vornamen, nachname,
           ROW_NUMBER() OVER (PARTITION BY person_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
         FROM name
       ) bn ON bn.person_id = pf.person_id AND bn.rang = 1
       ${whereKlausel}`,
    )
    .all(parameter)
}

/** Zahlenvergleich mit NULL-Werten immer am Ende, unabhängig von `richtungFaktor` (unbekanntes
 * Datum ist kein "spätestes" oder "frühestes" Datum — es steht einfach hinten). */
function vergleicheZahlNullsLetzten(a: number | null, b: number | null, richtungFaktor: number): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return richtungFaktor * (a - b)
}

function vergleicheZeilen(a: RohZeile, b: RohZeile, ein: PersonListeEin): number {
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

function zeileZuAusgabe(zeile: RohZeile): PersonListeZeile {
  return {
    person_id: zeile.person_id,
    anzeigename: zeile.anzeigename,
    geburt_jahr: zeile.geburt_jahr,
    tod_jahr: zeile.tod_jahr,
    geburt_ort_name: zeile.geburt_ort_name,
    konfidenz_min: zeile.konfidenz_min,
    hat_widerspruch: zeile.hat_widerspruch === 1,
    ist_platzhalter: zeile.ist_platzhalter === 1,
  }
}

/** `abfrage:person.liste` (55_Architektur.md §5, AP-1.6 PR1). */
export function personListe(db: Database.Database, ein: PersonListeEin): PersonListeAus {
  const { bedingungen, parameter } = filterBedingungen(ein.filter)
  const whereKlausel = whereSql(bedingungen)

  const gesamt = gesamtLaden(db, whereKlausel, parameter)
  const zeilen = zeilenLaden(db, whereKlausel, parameter)

  const sortiert = [...zeilen].sort((a, b) => vergleicheZeilen(a, b, ein))
  const start = (ein.seite - 1) * ein.proSeite
  const seite = sortiert.slice(start, start + ein.proSeite)

  return { zeilen: seite.map(zeileZuAusgabe), gesamt }
}
