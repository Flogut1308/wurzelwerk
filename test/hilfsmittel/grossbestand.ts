// AP-1.6 PR1: deterministischer Massendaten-Aufbau für das Leistungsbudget von
// `abfrage:person.liste`/`abfrage:suche` (test/budget/leistung.test.ts). Reine Wiederverwendung von
// `baueFixture()` (test/hilfsmittel/fixture-bauen.ts) — kein zusätzliches SQL hier, kein
// `Math.random`/`Date.now` (CLAUDE.md §4/§13): ein fester `seed` liefert bei jedem Lauf exakt
// dieselbe Datenbank, das Leistungsbudget bleibt reproduzierbar.
import type Database from 'better-sqlite3'
import type { FixtureBeschreibung, FixtureNamenzeile, FixturePerson } from './fixture-bauen'
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

const ANZAHL_PERSONEN = 2000
const GROSSBESTAND_SEED = 20260918

function ausListe<T>(liste: readonly T[], index: number): T {
  const wert = liste[index % liste.length]
  if (wert === undefined) {
    throw new RangeError('ausListe: leere Liste — kann nicht vorkommen (Modulo einer nichtleeren readonly-Liste).')
  }
  return wert
}

/**
 * Baut eine frische, migrierte In-Memory-Datenbank mit `ANZAHL_PERSONEN` Personen samt bevorzugtem
 * Namen — deterministisch (fester Seed), für das Leistungsbudget in `test/budget/leistung.test.ts`.
 * Jede fünfzigste Person ist Platzhalter, jede zwanzigste privat (Entscheidung B: der Default-Filter
 * zeigt beides trotzdem an, das Budget misst also den "worst case" ohne Filterreduktion). Aufrufer
 * schließt die zurückgegebene Verbindung selbst (`db.close()`).
 */
export function grossbestandAufbauen(): Database.Database {
  const personen: FixturePerson[] = []
  const namen: FixtureNamenzeile[] = []

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
  }

  const beschreibung: FixtureBeschreibung = { personen, namen }
  return baueFixture(beschreibung, GROSSBESTAND_SEED)
}
