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
// ein deterministisch generierter Großfall — nur der erreicht den Schnappschuss-Zweig von
// `importAusfuehren()` (ADR-019), den keine der drei gültigen Fixtures auslöst. Ohne ihn bliebe der
// `schnappschussErzeugen()`-Vorschreibpfad von dieser Invariante ungeprüft.
//
// Personenzahl (CI-Nachtrag, Windows-Timeout in PR #63 bei 800 Personen, 23,8 s > 20-s-Limit):
// jede generierte Person schreibt gemessen genau 5 geänderte Zeilen (person + name +
// Existenz-Aussage + aussage_zitat + zitat), plus 1 feste Zeile für die Quelle — empirisch
// bestätigt (`geaenderteZeilenAnzahl = 5 * anzahl + 1`, lokal gemessen: 90 → 451/„undo", 100 →
// 501/„schnappschuss"). Die Mindestzahl, um die Schwelle zu überschreiten, ist also 100 — gewählt
// wird `ANZAHL_PERSONEN_GROSS = 200` (2× die Mindestzahl, komfortable Reserve, 1001 geänderte
// Zeilen, weit über 500), statt der früheren 800. Das Verhalten (Trockenlauf schreibt+rollt
// zurück, echter Import committet mit VOR-Schreib-Schnappschuss) bleibt bei jeder Anzahl > 100
// dasselbe — 200 ist deutlich schneller (weniger Personen zu schreiben UND zu kopieren) und
// zusätzlich per Assertion unten (`ruecknahmeArt === 'schnappschuss'`) gegen ein stilles
// Abrutschen unter die Schwelle abgesichert.
//
// GELTUNGSBEREICH (adversariales Review-Nachtrag, wichtig gegen Missverständnis als
// Write-Gate): diese Invariante belegt AUSSCHLIESSLICH Berichtsgleichheit — "Trockenlauf-Bericht
// == Bericht des echten Imports" (CLAUDE.md §5) — und ist KONSTRUKTIONSBEDINGT BLIND für die
// Korrektheit des Schreibpfads selbst. Grund: `importAusfuehren()` gibt exakt den VOR dem
// Schreiben erzeugten Sondierungsbericht verbatim zurück (s. oben, "KEIN zweiter
// `baueBericht()`-Aufruf im Echtpfad"), und der Trockenlauf schreibt `import_lauf`/
// `import_herkunft` gar nicht — das sind reine Schreibpfad-Tabellen, die im verglichenen
// `Trockenlaufbericht` gar nicht vorkommen. Eine Divergenz, die NUR im echten Schreibpfad
// entsteht (z. B. eine doppelte `import_lauf`-Zeile oder eine fehlende `import_herkunft`-Zeile),
// würde diese Invariante darum NICHT fangen — der Bericht selbst wüsste nichts davon, ein
// `toEqual`/`alsText`-Vergleich zweier identischer Berichte bliebe trotzdem grün. Schreib-
// korrektheit wird an anderer Stelle geprüft: `test/einheit/import-undo-klein.test.ts`
// ("Undo(Aktion) stellt den Datenbestand bitgleich wieder her", AP-1.5 PR-A) und die künftige
// Idempotenz-Invariante ("Import → Export → Import ist idempotent", D-01, CLAUDE.md §5 Tabelle,
// bis dahin `test.todo`) — NICHT diese Datei hier. Diese Datei ist ein Berichts-Gate, kein
// Write-Gate.
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
import type { Trockenlaufbericht } from '../../src/shared/import/trockenlauf-bericht'

const GUELTIG_ORDNER = fileURLToPath(new URL('../../fixtures/import/v1/gueltig/', import.meta.url))

/** Alle gültigen Fixture-Dateien, deterministisch sortiert (Verzeichnisreihenfolge ist plattform-
 * abhängig nicht garantiert stabil — CLAUDE.md §13 Determinismus ist Pflicht). */
function gueltigeFixturePfade(): readonly string[] {
  return readdirSync(GUELTIG_ORDNER)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => join(GUELTIG_ORDNER, name))
}

const ANZAHL_PERSONEN_GROSS = 200

/** Deterministisch generierter Großfall — analog `test/einheit/import-undo-gross.test.ts`, aber
 * mit 200 statt 800 Personen (s. Kopfkommentar): liegt mit ~1001 geänderten Zeilen weit über der
 * Schwelle `RUECKNAHME_SCHWELLE_ZEILEN` (500) und löst damit den Schnappschuss-Zweig von
 * `importAusfuehren()` aus (der einzige Zweig, der VOR dem Schreiben `schnappschussErzeugen()`
 * aufruft, s. Kopfkommentar von `src/main/befehle/import-ausfuehren.ts`). Keine
 * `Math.random`/`Date.now`-Abhängigkeit — feste Schleife über einen festen Index, feste
 * Zeichenketten. */
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
   * vergleicht die beiden zurückgegebenen Berichte — strukturiert UND als Klartext. Gibt den
   * echten Bericht zurück, damit Aufrufer bei Bedarf zusätzliche Zusicherungen (z. B.
   * `ruecknahmeArt`) auf demselben Lauf prüfen können, ohne einen dritten Import auszulösen. */
  function pruefeBerichtGleichheit(importPfad: string): Trockenlaufbericht {
    const dbTrockenlauf = oeffnen(join(ordnerTrockenlauf, 'baum.sqlite'))
    const dbEcht = oeffnen(join(ordnerEcht, 'baum.sqlite'))
    try {
      migrieren(dbTrockenlauf)
      migrieren(dbEcht)

      const berichtTrockenlauf = importTrockenlaufDurchfuehren(dbTrockenlauf, importPfad)
      const berichtEcht = importAusfuehren(dbEcht, { pfad: importPfad })

      expect(berichtEcht).toEqual(berichtTrockenlauf)
      expect(alsText(berichtEcht)).toBe(alsText(berichtTrockenlauf))
      return berichtEcht
    } finally {
      dbTrockenlauf.close()
      dbEcht.close()
    }
  }

  it.each(gueltigeFixturePfade())('%s: Trockenlaufbericht ist gleich dem Bericht des echten Imports', (pfad) => {
    pruefeBerichtGleichheit(pfad)
  })

  it(
    'Großfall (200 Personen, > RUECKNAHME_SCHWELLE_ZEILEN, Schnappschuss-Zweig): Trockenlaufbericht ist gleich dem Bericht des echten Imports',
    () => {
      const importPfad = join(ordnerTrockenlauf, 'import-gross.json')
      writeFileSync(importPfad, JSON.stringify(baueGrossenImport(ANZAHL_PERSONEN_GROSS)), 'utf8')

      const bericht = pruefeBerichtGleichheit(importPfad)

      // Der eigentliche Sinn des Großfalls (s. Kopfkommentar): OHNE diese Zusicherung könnte die
      // Personenzahl unbemerkt unter die Schwelle rutschen (z. B. bei einer künftigen Änderung der
      // Zeilen-pro-Person-Zahl) und der Schnappschuss-Zweig bliebe stillschweigend ungeprüft.
      expect(bericht.zusammenfassung.ruecknahmeArt).toBe('schnappschuss')
      expect(bericht.zusammenfassung.geaenderteZeilenAnzahl).toBeGreaterThan(500)
    },
    // Explizites, großzügiges Timeout NUR für diesen einen schweren Fall (zwei volle Importe von
    // 200 Personen samt Schnappschuss-Dateioperationen) — auf dem langsameren Windows-CI-Runner
    // reichte das vitest-Standard-Timeout selbst nach der Verkleinerung von 800 auf 200 Personen
    // nicht sicher aus (PR #63: 800 Personen liefen dort in 23,8 s gegen ein 20-s-Limit). `it()`s
    // dritter Parameter ist eine reine Zahl in Millisekunden (kein Optionsobjekt, s.
    // vitest-Signatur — analog `test/invarianten/abgeleitet-gleich.test.ts:168`).
    40_000,
  )
})

// Absicherung gegen einen leeren `it.each` (CLAUDE.md §13: additive Tests, keine leere Prüfung,
// die stillschweigend nichts prüft, wenn der Fixture-Ordner einmal leer wäre).
describe('Fixture-Korpus vorhanden', () => {
  it('mindestens drei gültige Fixture-Dateien liegen unter fixtures/import/v1/gueltig/', () => {
    expect(gueltigeFixturePfade().length).toBeGreaterThanOrEqual(3)
  })
})
