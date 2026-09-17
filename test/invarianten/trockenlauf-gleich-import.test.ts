// AP-1.5 PR-B — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025): die EINZIGE Invariante dieses
// PRs. 56_Import_Vertrag.md §6.1 verspricht "Der Trockenlauf ist der echte Import in einer
// Transaktion, die zurückgerollt wird." Der AP-1.5-Auftrag (`src/main/befehle/import-ausfuehren.ts`,
// Kopfkommentar) macht das konstruktiv wahr: `importAusfuehren()` gibt IMMER genau den bereits
// fertigen `importTrockenlaufDurchfuehren()`-Sondierungsbericht zurück — KEIN zweiter
// `baueBericht()`-Aufruf im Echtpfad. Diese Datei prüft das Ende-zu-Ende, über den gesamten
// gültigen Fixture-Korpus (`fixtures/import/v1/gueltig/*.json`) hinweg: "Ist er es nicht, ist der
// Trockenlauf eine Lüge."
//
// Aufbau je Fixture: ZWEI getrennte, frisch migrierte Datenbanken in ZWEI getrennten
// Temp-Ordnern — derselbe (leere) Ausgangszustand, reproduzierbar über `migrieren()` aufgebaut.
// `importTrockenlaufDurchfuehren()` läuft gegen DB A (rollt intern zurück) → Bericht A;
// `importAusfuehren()` läuft gegen DB B (committet) → Bericht B. Beide Berichte müssen sowohl
// strukturiert (`toEqual`) als auch als Klartext (`alsText()`, `src/main/import/bericht.ts`)
// bitgleich sein. Zwei getrennte DBs statt einer einzigen: eine einzige DB sähe nacheinander zwei
// UNTERSCHIEDLICHE Bestände (nach dem committeten echten Import stünden die Personen schon drin),
// das wäre kein Vergleich gegen denselben Ausgangszustand mehr.
//
// Nicht-deterministische UUIDs (`neueId()`) dürfen diesen Vergleich nicht brechen: die
// Bericht-Zusammenfassung hängt an Zählern und an den Kennungen AUS DER IMPORTDATEI selbst
// (`tmp:…`/`db:…`), nicht an intern erzeugten UUIDs (s. `src/main/import/bericht.ts`,
// `RohBerichtsdaten` — keines der Felder ist eine erzeugte UUID). Eine explizite `neueId`-Injektion
// ist darum nicht nötig.
//
// Zusätzlich zu den drei vorhandenen gültigen Fixtures (alle deutlich unter der Schwelle
// `RUECKNAHME_SCHWELLE_ZEILEN = 500` geänderter Zeilen, s. `test/einheit/import-undo-klein.test.ts`)
// ein deterministisch generierter Großfall (800 Personen, analog
// `test/einheit/import-undo-gross.test.ts`) — nur der erreicht den Schnappschuss-Zweig von
// `importAusfuehren()` (ADR-019), den keine der drei gültigen Fixtures auslöst. Ohne ihn bliebe der
// `schnappschussErzeugen()`-Vorschreibpfad von dieser Invariante ungeprüft.
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importAusfuehren } from '../../src/main/befehle/import-ausfuehren'
import { importTrockenlaufDurchfuehren } from '../../src/main/befehle/import-trockenlauf'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { alsText } from '../../src/main/import/bericht'

const GUELTIG_ORDNER = fileURLToPath(new URL('../../fixtures/import/v1/gueltig/', import.meta.url))

/** Alle gültigen Fixture-Dateien, deterministisch sortiert (Verzeichnisreihenfolge ist plattform-
 * abhängig nicht garantiert stabil — CLAUDE.md §13 Determinismus ist Pflicht). */
function gueltigeFixturePfade(): readonly string[] {
  return readdirSync(GUELTIG_ORDNER)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => join(GUELTIG_ORDNER, name))
}

const ANZAHL_PERSONEN_GROSS = 800

/** Deterministisch generierter Großfall — analog `test/einheit/import-undo-gross.test.ts`: 800
 * Personen liegen weit über der Schwelle `RUECKNAHME_SCHWELLE_ZEILEN` (500 geänderte Zeilen) und
 * lösen damit den Schnappschuss-Zweig von `importAusfuehren()` aus (der einzige Zweig, der VOR dem
 * Schreiben `schnappschussErzeugen()` aufruft, s. Kopfkommentar von
 * `src/main/befehle/import-ausfuehren.ts`). Keine `Math.random`/`Date.now`-Abhängigkeit — feste
 * Schleife über einen festen Index, feste Zeichenketten. */
function baueGrossenImport(anzahl: number): unknown {
  const personen = Array.from({ length: anzahl }, (_, i) => ({
    id: `tmp:p${i}`,
    geschlecht: 'M',
    lebend_status: 'verstorben',
    namen: [{ typ: 'geburtsname', vornamen: `Vorname${i}`, nachname: `Nachname${i}`, ist_bevorzugt: true }],
    konfidenz: 4,
    belege: [{ quelle: 'tmp:q1', konfidenz: 4 }],
  }))
  return {
    vertrag: 'wurzelwerk-import/v1',
    erzeugt: { am: '2026-09-17', werkzeug: 'test' },
    zusammenfassung: { personen: anzahl, notizen_unverarbeitet: 0 },
    quellen: [{ id: 'tmp:q1', typ: 'sonstiges', titel: 'Generierte Testquelle (trockenlauf-gleich-import)' }],
    personen,
    notizen_unverarbeitet: [],
  }
}

describe('Invariante: Trockenlaufbericht == Bericht des echten Imports (AP-1.5, 56_Import_Vertrag.md §6.1/§6.3)', () => {
  let ordnerTrockenlauf: string
  let ordnerEcht: string

  beforeEach(() => {
    ordnerTrockenlauf = mkdtempSync(join(tmpdir(), 'wurzelwerk-trockenlauf-'))
    ordnerEcht = mkdtempSync(join(tmpdir(), 'wurzelwerk-echt-'))
  })

  afterEach(() => {
    rmSync(ordnerTrockenlauf, { recursive: true, force: true })
    rmSync(ordnerEcht, { recursive: true, force: true })
  })

  /** Baut zwei frische, migrierte Datenbanken im selben (leeren) Ausgangszustand, führt gegen die
   * eine `importTrockenlaufDurchfuehren()` und gegen die andere `importAusfuehren()` aus und
   * vergleicht die beiden zurückgegebenen Berichte — strukturiert UND als Klartext. */
  function pruefeBerichtGleichheit(importPfad: string): void {
    const dbTrockenlauf = oeffnen(join(ordnerTrockenlauf, 'baum.sqlite'))
    const dbEcht = oeffnen(join(ordnerEcht, 'baum.sqlite'))
    try {
      migrieren(dbTrockenlauf)
      migrieren(dbEcht)

      const berichtTrockenlauf = importTrockenlaufDurchfuehren(dbTrockenlauf, importPfad)
      const berichtEcht = importAusfuehren(dbEcht, { pfad: importPfad })

      expect(berichtEcht).toEqual(berichtTrockenlauf)
      expect(alsText(berichtEcht)).toBe(alsText(berichtTrockenlauf))
    } finally {
      dbTrockenlauf.close()
      dbEcht.close()
    }
  }

  it.each(gueltigeFixturePfade())('%s: Trockenlaufbericht ist gleich dem Bericht des echten Imports', (pfad) => {
    pruefeBerichtGleichheit(pfad)
  })

  it('Großfall (800 Personen, > RUECKNAHME_SCHWELLE_ZEILEN, Schnappschuss-Zweig): Trockenlaufbericht ist gleich dem Bericht des echten Imports', () => {
    const importPfad = join(ordnerTrockenlauf, 'import-gross.json')
    writeFileSync(importPfad, JSON.stringify(baueGrossenImport(ANZAHL_PERSONEN_GROSS)), 'utf8')
    pruefeBerichtGleichheit(importPfad)
  })
})

// Absicherung gegen einen leeren `it.each` (CLAUDE.md §13: additive Tests, keine leere Prüfung,
// die stillschweigend nichts prüft, wenn der Fixture-Ordner einmal leer wäre).
describe('Fixture-Korpus vorhanden', () => {
  it('mindestens drei gültige Fixture-Dateien liegen unter fixtures/import/v1/gueltig/', () => {
    expect(gueltigeFixturePfade().length).toBeGreaterThanOrEqual(3)
  })
})
