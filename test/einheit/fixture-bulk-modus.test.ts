// AP-1.10 — Korrektheitsnachweis für den opt-in Bulk-Modus `abgeleiteteEinmaligNeuAufbauen` von
// `test/hilfsmittel/fixture-bauen.ts` (dort ausführlich begründet, s. `BaueFixtureOptionen`): der
// Modus entfernt die inkrementellen `abl_*`-Trigger für die Ladephase und baut die abgeleiteten
// Tabellen am Ende EINMAL über `alleAbgeleitetenNeuAufbauen()` neu, um den beim Massenbestand
// quadratischen Aufbau zu vermeiden. Dieser Test beweist Verhaltensgleichheit: derselbe Bestand,
// einmal mit, einmal ohne Bulk-Modus gebaut, muss in JEDER abgeleiteten Tabelle (`person_flach`,
// `name_phonetik`, `suche_fts`, `suche_fts_quelle`) bitgleiche Zeilen ergeben — UND nach dem
// Bulk-Lauf müssen exakt dieselben `abl_*`-/`jrn_*`-Trigger wieder existieren wie ohne Bulk-Modus.
//
// Liegt bewusst in `test/einheit/`, NICHT in `test/invarianten/`: geprüft wird hier eine
// Eigenschaft des TESTHELFERS `fixture-bauen.ts`, nicht eine fachliche Invariante der Anwendung
// (CLAUDE.md §5 Tabelle). `fixture-bauen.ts` selbst ist trotzdem indirekt geschützter Prüfpfad
// (Import in `test/invarianten/zyklusfreiheit.test.ts`) — dieser PR fasst dort NUR den bereits
// vorhandenen Bulk-Modus-Code an, nicht `src/`.
import type Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import type { FixtureBeschreibung } from '../hilfsmittel/fixture-bauen'
import { baueFixture } from '../hilfsmittel/fixture-bauen'

/** Fester, kleiner Testbestand: drei Personen (eine Elternschaft), zwei Namen (regt
 * `abl_name_*`/`name_phonetik`/FTS an), zwei `aussage`-Zeilen (Beruf + Geburtsdatum) — die
 * Geburtsdatum-Aussage regt `person_flach.geburt_jahr`/`geburt_sort_von` an, zwei WIDERSPRÜCHLICHE
 * Berufsaussagen (kein `ist_bevorzugt`) regen `person_flach.hat_widerspruch = 1` an (E21, s.
 * `personFlachProjektionSql`-Kommentar in `src/main/datenbank/abgeleitet-projektion.ts`). */
const BESTAND: FixtureBeschreibung = {
  personen: [
    { schluessel: 'anna', privat: 0, ist_platzhalter: 0 },
    { schluessel: 'bernd', privat: 0, ist_platzhalter: 0 },
    { schluessel: 'clara', privat: 0, ist_platzhalter: 0 },
  ],
  namen: [
    { schluessel: 'anna-name', personSchluessel: 'anna', typ: 'geburtsname', nachname: 'Müller', vornamen: 'Anna', ist_bevorzugt: 1 },
    { schluessel: 'bernd-name', personSchluessel: 'bernd', typ: 'geburtsname', nachname: 'Schmidt', vornamen: 'Bernd', ist_bevorzugt: 1 },
    { schluessel: 'clara-name', personSchluessel: 'clara', typ: 'geburtsname', nachname: 'Schmidt', vornamen: 'Clara', ist_bevorzugt: 1 },
  ],
  elternschaften: [
    { schluessel: 'e-anna-clara', elternteilSchluessel: 'anna', kindSchluessel: 'clara', typ: 'biologisch' },
    { schluessel: 'e-bernd-clara', elternteilSchluessel: 'bernd', kindSchluessel: 'clara', typ: 'biologisch' },
  ],
  aussagen: [
    {
      schluessel: 'anna-geburt',
      subjekt_typ: 'person',
      subjektSchluessel: 'anna',
      praedikat: 'geburtsdatum',
      datum_wert1: '1850-03-01',
      datum_sort_von: 18500301,
      ist_bevorzugt: 1,
    },
    { schluessel: 'bernd-beruf-1', subjekt_typ: 'person', subjektSchluessel: 'bernd', praedikat: 'beruf', wert_text: 'Schmied' },
    { schluessel: 'bernd-beruf-2', subjekt_typ: 'person', subjektSchluessel: 'bernd', praedikat: 'beruf', wert_text: 'Bauer' },
  ],
}

const SEED = 42

interface TabelleNameZeile {
  readonly name: string
}

function triggerNamen(db: Database.Database, praefix: string): readonly string[] {
  return db
    .prepare<[string], TabelleNameZeile>("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE ? ORDER BY name")
    .all(`${praefix}%`)
    .map((zeile) => zeile.name)
}

/** Werte-Record einer abgeleiteten Tabellenzeile — beliebige Spaltennamen auf einfache SQLite-Werte. */
type ZeileWerte = Record<string, string | number | bigint | Uint8Array | null>

function abgeleiteteAbzuege(db: Database.Database): {
  readonly personFlach: readonly string[]
  readonly namePhonetik: readonly string[]
  readonly sucheFtsQuelle: readonly string[]
  readonly sucheFts: readonly string[]
} {
  const personFlach = db
    .prepare<[], ZeileWerte>(
      `SELECT person_id, anzeigename, sortier_nachname, sortier_vornamen, geburt_jahr, geburt_sort_von,
              geburt_ort_name, tod_jahr, tod_sort_von, konfidenz_min, hat_widerspruch
       FROM person_flach ORDER BY person_id`,
    )
    .all()
    .map((zeile) => JSON.stringify(zeile, Object.keys(zeile).sort()))

  const namePhonetik = db
    .prepare<[], ZeileWerte>('SELECT name_id, verfahren, code FROM name_phonetik ORDER BY name_id, verfahren')
    .all()
    .map((zeile) => JSON.stringify(zeile, Object.keys(zeile).sort()))

  const sucheFtsQuelle = db
    .prepare<[], ZeileWerte>('SELECT rowid, quelle_typ, quelle_id FROM suche_fts_quelle ORDER BY rowid')
    .all()
    .map((zeile) => JSON.stringify(zeile, Object.keys(zeile).sort()))

  // `suche_fts` ist eine contentless FTS5-Tabelle — die gespeicherten Spalten sind trotzdem direkt
  // abfragbar (s. `abgeleiteteNeuAufbauenInner`/die generierten `abl_*`-Trigger, dieselbe Auswahl).
  const sucheFts = db
    .prepare<[], ZeileWerte>('SELECT rowid, original, umschrift, normalform, notiz, transkript FROM suche_fts ORDER BY rowid')
    .all()
    .map((zeile) => JSON.stringify(zeile, Object.keys(zeile).sort()))

  return { personFlach, namePhonetik, sucheFtsQuelle, sucheFts }
}

describe('test/hilfsmittel/fixture-bauen: Bulk-Modus (abgeleiteteEinmaligNeuAufbauen)', () => {
  it('liefert bitgleiche abgeleitete Tabellen wie der Nicht-Bulk-Pfad', () => {
    const dbBulk = baueFixture(BESTAND, SEED, { abgeleiteteEinmaligNeuAufbauen: true })
    const dbInkrementell = baueFixture(BESTAND, SEED)
    try {
      const abzugBulk = abgeleiteteAbzuege(dbBulk)
      const abzugInkrementell = abgeleiteteAbzuege(dbInkrementell)

      // Erst die Sanity-Prüfung, dass überhaupt etwas geschrieben wurde (sonst wäre ein leerer
      // Vergleich auf beiden Seiten trivial "gleich", ohne etwas zu beweisen).
      expect(abzugInkrementell.personFlach).toHaveLength(3)
      expect(abzugInkrementell.namePhonetik).toHaveLength(3)
      expect(abzugInkrementell.sucheFtsQuelle.length).toBeGreaterThan(0)
      expect(abzugInkrementell.sucheFts.length).toBeGreaterThan(0)

      expect(abzugBulk.personFlach).toEqual(abzugInkrementell.personFlach)
      expect(abzugBulk.namePhonetik).toEqual(abzugInkrementell.namePhonetik)
      expect(abzugBulk.sucheFtsQuelle).toEqual(abzugInkrementell.sucheFtsQuelle)
      expect(abzugBulk.sucheFts).toEqual(abzugInkrementell.sucheFts)

      // Die widersprüchlichen Berufsaussagen müssen in BEIDEN Läufen `hat_widerspruch = 1` für
      // Bernd ergeben — sonst würde ein für beide Seiten gleich falscher Aufbau den Vergleich oben
      // unbemerkt bestehen lassen (E21).
      const berndFlach = abzugInkrementell.personFlach.find((zeile) => zeile.includes('Bernd'))
      expect(berndFlach).toBeDefined()
      expect(berndFlach).toContain('"hat_widerspruch":1')
    } finally {
      dbBulk.close()
      dbInkrementell.close()
    }
  })

  it('stellt nach dem Bulk-Lauf alle abl_*- und jrn_*-Trigger vollständig wieder her', () => {
    const dbBulk = baueFixture(BESTAND, SEED, { abgeleiteteEinmaligNeuAufbauen: true })
    const dbInkrementell = baueFixture(BESTAND, SEED)
    try {
      expect(triggerNamen(dbBulk, 'abl_')).toEqual(triggerNamen(dbInkrementell, 'abl_'))
      expect(triggerNamen(dbBulk, 'jrn_')).toEqual(triggerNamen(dbInkrementell, 'jrn_'))
      // Zusätzlich eine konkrete untere Schranke, damit ein Test, der zwei leere Listen vergleicht,
      // nicht unbemerkt grün wäre.
      expect(triggerNamen(dbInkrementell, 'abl_').length).toBeGreaterThan(0)
      expect(triggerNamen(dbInkrementell, 'jrn_').length).toBeGreaterThan(0)
    } finally {
      dbBulk.close()
      dbInkrementell.close()
    }
  })
})
