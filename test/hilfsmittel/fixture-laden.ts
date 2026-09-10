// AP-0.12 — lädt einen der acht handgebauten Fixture-Bäume (`fixtures/<name>/daten.ts`) als
// geöffnete In-Memory-Datenbank. Ein fester, pro Name unterschiedlicher Seed reicht hier: die
// Bitgleichheits-Abnahme ("zwei Läufe mit gleichem Seed -> bitgleiche Datenbank") gilt für den
// MASSENDATEN-GENERATOR (`fixtures/generiert/generator.ts`,
// `test/einheit/generator-deterministisch.test.ts`) — für die acht Bäume hier genügt irgendein
// fester Seed, Hauptsache derselbe bei jedem Aufruf (keine zwei Aufrufe von `fixtureLaden` mit
// demselben Namen sollen je unterschiedliche IDs erzeugen).
import type Database from 'better-sqlite3'
import { baueFixture } from './fixture-bauen'
import { daten as adoption } from '../../fixtures/adoption/daten'
import { daten as cousinenheirat } from '../../fixtures/cousinenheirat/daten'
import { daten as fehlendeDaten } from '../../fixtures/fehlende-daten/daten'
import { daten as kaputteKodierung } from '../../fixtures/kaputte-kodierung/daten'
import { daten as kyrillischPolnisch } from '../../fixtures/kyrillisch-polnisch/daten'
import { daten as mehrfachehe } from '../../fixtures/mehrfachehe/daten'
import { daten as minimal } from '../../fixtures/minimal/daten'
import { daten as unscharfeDatumsangaben } from '../../fixtures/unscharfe-datumsangaben/daten'

/** Die acht im Korpus vorhandenen Fixture-Bäume (AP-0.12-Abnahme: "acht handgebaute Bäume"). */
export type FixtureName =
  | 'minimal'
  | 'mehrfachehe'
  | 'adoption'
  | 'cousinenheirat'
  | 'fehlende-daten'
  | 'kaputte-kodierung'
  | 'unscharfe-datumsangaben'
  | 'kyrillisch-polnisch'

/**
 * Fester Seed je Fixture-Name — willkürlich, aber stabil (s. Moduldoku oben). Ein eigener Seed pro
 * Name ist rein kosmetisch (unterschiedliche IDs je Baum, falls je zwei Fixtures einmal in
 * derselben Diagnoseausgabe nebeneinanderstehen) und keine Korrektheitsanforderung.
 */
const SEED_JE_NAME: Readonly<Record<FixtureName, number>> = {
  minimal: 1,
  mehrfachehe: 2,
  adoption: 3,
  cousinenheirat: 4,
  'fehlende-daten': 5,
  'kaputte-kodierung': 6,
  'unscharfe-datumsangaben': 7,
  'kyrillisch-polnisch': 8,
}

/** Gibt für jeden Fixture-Namen die zugehörige, oben importierte `FixtureBeschreibung` zurück. */
function beschreibungFuer(name: FixtureName) {
  switch (name) {
    case 'minimal':
      return minimal
    case 'mehrfachehe':
      return mehrfachehe
    case 'adoption':
      return adoption
    case 'cousinenheirat':
      return cousinenheirat
    case 'fehlende-daten':
      return fehlendeDaten
    case 'kaputte-kodierung':
      return kaputteKodierung
    case 'unscharfe-datumsangaben':
      return unscharfeDatumsangaben
    case 'kyrillisch-polnisch':
      return kyrillischPolnisch
  }
}

/**
 * Lädt den benannten Fixture-Baum als frische, vollständig migrierte In-Memory-Datenbank
 * (Journal aus, s. `baueFixture`). Aufrufer schließt die Verbindung selbst (`db.close()`).
 */
export function fixtureLaden(name: FixtureName): Database.Database {
  return baueFixture(beschreibungFuer(name), SEED_JE_NAME[name])
}
