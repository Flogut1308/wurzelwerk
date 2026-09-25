// AP-1.6 PR1, erweitert AP-1.10 PR-A: deterministischer Massendaten-Aufbau für das Leistungsbudget
// von `abfrage:person.liste`/`abfrage:suche` (test/budget/leistung.test.ts) UND für
// `test/einheit/suche-mit-filter.test.ts` (Suche + Filter + Sortierung + Seite gegen die 2.000er-
// Fixture). Reine Wiederverwendung von `baueFixture()` (test/hilfsmittel/fixture-bauen.ts) — kein
// zusätzliches SQL hier, kein `Math.random`/`Date.now` (CLAUDE.md §4/§13): ein fester `seed` liefert
// bei jedem Lauf exakt dieselbe Datenbank, das Leistungsbudget bleibt reproduzierbar.
//
// AP-1.10 PR-A-Ergänzung: die Zeilenabfrage der Liste (heute `zeilenFuerIdsLaden()`,
// src/main/abfragen/person-liste.ts, nur für die Seite) joint seit dieser Stufe zusätzlich gegen `aussage`/`aussage_zitat`/`elternschaft` (Beruf, Belegzahl, Kinderzahl,
// volle Geburts-/Todes-Datumsgruppe) — ohne echte Zeilen in diesen Tabellen würde das
// Leistungsbudget nur den leeren Best case messen, nicht den tatsächlichen Worst Case. Jede der
// `ANZAHL_PERSONEN` Personen bekommt darum: eine `geburtsdatum`- und eine `todesdatum`-Aussage (mit
// rotierendem Modifikator exakt/etwa/zwischen, echten `sortIntervall()`-Werten statt erfundener
// Zahlen), eine `beruf`-Aussage, 0–2 Belege (`aussage_zitat` auf eine gemeinsame `quelle`/mehrere
// `zitat`-Zeilen) sowie — für ein Viertel der ersten Hälfte — 1–3 Kinder über `elternschaft`
// (zyklusfrei: nur von der unteren in die obere Hälfte der Indizes, nie umgekehrt).
import type Database from 'better-sqlite3'
import { sortIntervall } from '../../src/core/datum/sortierschluessel'
import type { Kalender, Modifikator } from '../../src/core/datum/typen'
import type {
  FixtureAussage,
  FixtureAussageZitat,
  FixtureBeschreibung,
  FixtureElternschaft,
  FixtureNamenzeile,
  FixturePerson,
  FixtureQuelle,
  FixtureZitat,
} from './fixture-bauen'
import { baueFixture } from './fixture-bauen'

/** Deutsche Nachnamen, bewusst inklusive Umlaut-/ASCII-Paaren (Müller/Mueller, Meyer/Maier) —
 * damit Sortierkollation (Entscheidung A) und Kölner-Phonetik-Suche auch im Massenbestand echte
 * Arbeit haben, nicht nur ein leerer Durchlauf über 2000 gleichförmige Zeilen. */
const NACHNAMEN = [
  'Müller',
  'Mueller',
  'Schmidt',
  'Schulze',
  'Fischer',
  'Weber',
  'Meyer',
  'Maier',
  'Wagner',
  'Becker',
  'Hoffmann',
  'Schäfer',
  'Koch',
  'Richter',
  'Klein',
  'Wolf',
  'Neumann',
  'Schwarz',
  'Zimmermann',
  'Krüger',
] as const

const VORNAMEN = ['Anna', 'Hans', 'Peter', 'Maria', 'Klaus', 'Petra', 'Wolfgang', 'Ursula', 'Josef', 'Elisabeth'] as const

/** AP-1.10 PR-A: Berufe für die `beruf`-Aussage — rein zur Abwechslung im Massenbestand, keine
 * fachliche Bedeutung. */
const BERUFE = ['Bauer', 'Schmied', 'Weber', 'Lehrer', 'Schreiner', 'Müllerin', 'Kaufmann', 'Schneiderin', 'Bäcker', 'Fischer'] as const

const ANZAHL_PERSONEN = 2000
const GROSSBESTAND_SEED = 20260918
const KALENDER: Kalender = 'gregorian'

function ausListe<T>(liste: readonly T[], index: number): T {
  const wert = liste[index % liste.length]
  if (wert === undefined) {
    throw new RangeError('ausListe: leere Liste — kann nicht vorkommen (Modulo einer nichtleeren readonly-Liste).')
  }
  return wert
}

/** Modifikator-Rotation für Geburts-/Todesdatum: die meisten Personen `exakt`, jede fünfte `etwa`,
 * jede siebte `zwischen` (mit `wert2` = Jahr + 5) — deterministisch aus dem Index, keine drei
 * gleich verteilten Fälle wären ein zu unrealistischer Bestand für ein Anzeige-/Sortier-Budget. */
function modifikatorFuer(index: number): Modifikator {
  if (index % 7 === 0) return 'zwischen'
  if (index % 5 === 0) return 'etwa'
  return 'exakt'
}

interface DatumAussageEingabe {
  readonly schluessel: string
  readonly subjektSchluessel: string
  readonly praedikat: 'geburtsdatum' | 'todesdatum'
  /** Personenindex — bestimmt die Modifikator-Rotation (`modifikatorFuer`), NICHT `jahr` (Geburts-
   * und Todesjahr unterscheiden sich je Person, der Index bleibt die stabile, deterministische
   * Quelle für die Verteilung). */
  readonly index: number
  readonly jahr: number
}

/** Baut eine `geburtsdatum`/`todesdatum`-`FixtureAussage` mit echten `sortIntervall()`-Werten
 * (src/core/datum/sortierschluessel.ts) — keine erfundenen Sortierzahlen, damit eine Sortierung
 * nach "geburt"/"tod" im 2.000er-Bestand (test/einheit/suche-mit-filter.test.ts) ein echtes,
 * konsistentes Ergebnis liefert. */
function datumAussage(eingabe: DatumAussageEingabe): FixtureAussage {
  const modifikator = modifikatorFuer(eingabe.index)
  const zweitesDatum = modifikator === 'zwischen' ? { jahr: eingabe.jahr + 5 } : undefined
  const intervall = sortIntervall({
    kalender: KALENDER,
    modifikator,
    praezision: 'jahr',
    datum: { jahr: eingabe.jahr },
    ...(zweitesDatum === undefined ? {} : { zweitesDatum }),
  })
  return {
    schluessel: eingabe.schluessel,
    subjektSchluessel: eingabe.subjektSchluessel,
    subjekt_typ: 'person',
    praedikat: eingabe.praedikat,
    ist_bevorzugt: 1,
    datum_kalender: KALENDER,
    datum_modifikator: modifikator,
    datum_praezision: 'jahr',
    datum_wert1: String(eingabe.jahr),
    ...(zweitesDatum === undefined ? {} : { datum_wert2: String(zweitesDatum.jahr) }),
    datum_sort_von: intervall.sortVon,
    datum_sort_bis: intervall.sortBis,
  }
}

/**
 * Baut eine frische, migrierte In-Memory-Datenbank mit `ANZAHL_PERSONEN` Personen samt bevorzugtem
 * Namen, Geburts-/Todesdatum, Beruf, 0–2 Belegen und (für einen Teil der Personen) Kindern — für
 * das Leistungsbudget in `test/budget/leistung.test.ts` und die Suche+Filter+Sortierung+Seite-Tests
 * in `test/einheit/suche-mit-filter.test.ts`. Jede fünfzigste Person ist Platzhalter, jede
 * zwanzigste privat (Entscheidung B: der Default-Filter zeigt beides trotzdem an, das Budget misst
 * also den "worst case" ohne Filterreduktion). Aufrufer schließt die zurückgegebene Verbindung
 * selbst (`db.close()`).
 */
export function grossbestandAufbauen(): Database.Database {
  const personen: FixturePerson[] = []
  const namen: FixtureNamenzeile[] = []
  const aussagen: FixtureAussage[] = []
  const aussageZitate: FixtureAussageZitat[] = []

  for (let i = 0; i < ANZAHL_PERSONEN; i += 1) {
    const schluessel = `person-${i}`
    const istPlatzhalter: 0 | 1 = i % 50 === 0 ? 1 : 0
    personen.push({
      schluessel,
      privat: i % 20 === 0 ? 1 : 0,
      ist_platzhalter: istPlatzhalter,
      ...(istPlatzhalter === 1 ? { platzhalter_grund: 'unbekannt' as const } : {}),
    })
    namen.push({
      schluessel: `name-${i}`,
      personSchluessel: schluessel,
      typ: 'geburtsname',
      nachname: ausListe(NACHNAMEN, i),
      vornamen: ausListe(VORNAMEN, i),
      ist_bevorzugt: 1,
    })

    const geburtsjahr = 1800 + (i % 200)
    const todesjahr = geburtsjahr + 40 + (i % 40)
    const geburtSchluessel = `aussage-geburt-${i}`
    const todSchluessel = `aussage-tod-${i}`
    const berufSchluessel = `aussage-beruf-${i}`
    aussagen.push(datumAussage({ schluessel: geburtSchluessel, subjektSchluessel: schluessel, praedikat: 'geburtsdatum', index: i, jahr: geburtsjahr }))
    aussagen.push(datumAussage({ schluessel: todSchluessel, subjektSchluessel: schluessel, praedikat: 'todesdatum', index: i, jahr: todesjahr }))
    aussagen.push({
      schluessel: berufSchluessel,
      subjektSchluessel: schluessel,
      subjekt_typ: 'person',
      praedikat: 'beruf',
      wert_text: ausListe(BERUFE, i),
      // Konfidenz 1..4, Periode 7 (NICHT 4 oder ein Teiler von 20 — sonst wäre die Konfidenz
      // innerhalb eines einzelnen Nachnamens konstant, weil `ausListe(NACHNAMEN, i)` mit Periode 20
      // arbeitet: jeder Nachname träfe dann IMMER dieselbe Konfidenzstufe, und der konfidenzMin-
      // Filter hätte innerhalb eines Suchtreffers nie echte Auswahl). Treibt außerdem
      // `person_flach.konfidenz_min` (sonst bei jeder Person NULL, da keine andere Aussage einen
      // Konfidenzwert trägt).
      konfidenz: (i % 7 % 4) + 1,
      ist_bevorzugt: 1,
    })

    // 0–2 Belege je Person, an die geburtsdatum-Aussage geheftet (belegzahl-Streuung fürs Budget/
    // die Filtertests — welche Aussage genau trägt den Beleg, ist für `belegzahl` irrelevant: das
    // Feld zählt über ALLE Aussagen der Person, s. src/main/abfragen/person-liste.ts).
    const belegzahl = i % 3
    for (let belegIndex = 0; belegIndex < belegzahl; belegIndex += 1) {
      aussageZitate.push({ aussageSchluessel: geburtSchluessel, zitatSchluessel: `zitat-${i}-${belegIndex}` })
    }
  }

  // Eine gemeinsame Quelle für alle Belege — reduziert die Einfügemenge, ohne die Belegzahl-
  // Zählung zu beeinflussen (`aussage_zitat` verweist auf einzelne `zitat`-Zeilen, nicht auf die
  // `quelle` direkt).
  const quellen: readonly FixtureQuelle[] = [{ schluessel: 'quelle-gemeinsam', typ: 'kirchenbuch' }]
  const zitate: FixtureZitat[] = []
  for (let i = 0; i < ANZAHL_PERSONEN; i += 1) {
    const belegzahl = i % 3
    for (let belegIndex = 0; belegIndex < belegzahl; belegIndex += 1) {
      zitate.push({ schluessel: `zitat-${i}-${belegIndex}`, quelleSchluessel: 'quelle-gemeinsam' })
    }
  }

  // Kinder: nur von der unteren in die obere Hälfte der Indizes (zyklusfrei per Konstruktion) —
  // Person `p` (0..999) bekommt `p % 4` Kinder aus der oberen Hälfte (1000..1999).
  const elternschaften: FixtureElternschaft[] = []
  const parentAnzahl = ANZAHL_PERSONEN / 2
  for (let p = 0; p < parentAnzahl; p += 1) {
    const kinderzahl = p % 4
    for (let kindIndex = 0; kindIndex < kinderzahl; kindIndex += 1) {
      const kind = parentAnzahl + ((p * 3 + kindIndex) % parentAnzahl)
      elternschaften.push({
        schluessel: `elternschaft-${p}-${kindIndex}`,
        elternteilSchluessel: `person-${p}`,
        kindSchluessel: `person-${kind}`,
        typ: 'biologisch',
      })
    }
  }

  const beschreibung: FixtureBeschreibung = { personen, namen, aussagen, quellen, zitate, aussageZitate, elternschaften }
  // `abgeleiteteEinmaligNeuAufbauen: true` (AP-1.10 PR-A): ohne diese Option feuert jeder der über
  // 6.000 `aussage`-INSERTs den `abl_aussage_ai`-Trigger, der `person_flach` per Fensterfunktion
  // über die komplette, wachsende `aussage`/`name`-Tabelle neu berechnet — quadratisch, gemessen
  // >20s statt <1s (s. Kommentar an `BaueFixtureOptionen` in fixture-bauen.ts).
  return baueFixture(beschreibung, GROSSBESTAND_SEED, { abgeleiteteEinmaligNeuAufbauen: true })
}
