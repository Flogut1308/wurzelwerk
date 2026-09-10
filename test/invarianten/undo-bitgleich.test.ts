// AP-0.10 PR-B — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025). ADR-009 §2: "Undo(Aktion)
// stellt den Datenbestand bitgleich wieder her" — 55_Architektur.md §4.9 Punkt 5 nennt das
// bislang ungeprüft ("„Bitgleich" wird nie geprüft. [...] Das ist nur dann eine Zusicherung, wenn
// ein Test es tatsächlich vergleicht."). Dieser Test IST dieser Vergleich.
//
// WARUM NICHT nur "Folge ausführen, komplett zurücknehmen, mit dem Ausgangszustand vergleichen"
// (der im Auftrag skizzierte, dem 55_Architektur.md-Prototyp nachempfundene erste Entwurf dieses
// Tests): eine adversariale Selbstprüfung (Undo einer 'update'-Zeile testweise auf `wert_neu_json`
// statt `wert_alt_json` umgestellt, s. Auftragsbericht - NICHT committet) zeigte, dass dieser
// simplere Vergleich bei einer LEEREN Ausgangsdatenbank strukturell blind für genau diese Bugklasse
// ist: JEDE hier angelegte Person wird beim vollständigen Zurückrollen am Ende ohnehin über die
// Rücknahme ihrer eigenen `person.anlegen`-Transaktion gelöscht (`rohLoeschen` löscht nur über die
// ID, unabhängig vom Zeileninhalt) - ein kaputtes Zurückschreiben einer dazwischenliegenden
// `feldSetzen`-Rücknahme fällt beim reinen Vorher/Nachher-Vergleich der leeren Datenbank NIE auf,
// weil die betroffene Zeile am Ende sowieso komplett verschwindet. Der 55_Architektur.md-Prototyp
// selbst lädt darum eine gefüllte Fixture (`fixtureLaden('mehrfachehe')`, existiert erst ab
// AP-0.12) - mit einer leeren DB braucht es stattdessen die Prüfung SCHRITTWEISE (unten), damit
// `feldSetzen`/`loeschen`-Rücknahmen auf innerhalb derselben Folge erzeugten Personen ebenfalls
// wirksam geprüft werden, statt von der Rücknahme ihres eigenen `anlegen` überdeckt zu werden.
//
// Vorgehen:
// 1. Frische, leere migrierte `:memory:`-Datenbank (kein Fixture-Korpus — der existiert erst ab
//    AP-0.12, Entscheidung "Default 1" laut Auftrag). `schnappschuesse[0]` = ihr kanonischer Abzug.
// 2. Eine fast-check-generierte Befehlsfolge (`_befehlsfolge-generator.ts`) über die drei
//    registrierten Befehle über den ECHTEN Befehlsbus (`fuehreAus`) ausführen — NACH JEDER Aktion,
//    die tatsächlich eine neue `transaktion`-Zeile committet hat (erkannt an einer gestiegenen
//    `COUNT(*) FROM transaktion` — eine vom Befehlsbus verworfene leere Transaktion hinterlässt
//    dort NIE eine Zeile, `src/main/befehle/bus.ts`), einen weiteren Schnappschuss anhängen.
//    `schnappschuesse` ist damit exakt die Folge der Zustände nach 0, 1, 2, … tatsächlich
//    committeten Transaktionen — unabhängig von No-op-Aktionen (Modul-Kommentar
//    `_befehlsfolge-generator.ts`) und leeren `feldSetzen`-Aufrufen.
// 3. `undo()` GENAU `schnappschuesse.length - 1`-mal aufrufen — nach dem i-ten `undo()`-Aufruf MUSS
//    der kanonische Abzug mit `schnappschuesse[schnappschuesse.length - 1 - i]` übereinstimmen: das
//    prüft nicht nur den Endzustand, sondern JEDEN einzelnen Rücknahmeschritt gegen den exakt
//    passenden Vorzustand (fängt genau die oben beschriebene Bugklasse).
// 4. Am Ende zusätzlich `undoZiel(db) === undefined` (nichts mehr rücknehmbar) als Gegenprobe, dass
//    die Zählung stimmt.
//
// BEKANNTE DECKUNGSGRENZE (hueter-Auflage 1, PR-B): Alle drei heute registrierten Befehle
// (`person.anlegen`/`feldSetzen`/`loeschen`) berühren GENAU EINE `person`-Zeile → jede Transaktion
// hat genau eine `aenderung`-Zeile, und es gibt keinen Befehl mit wechselseitigen Fremdschlüsseln
// (`ort.nachfolger_ort_id`). Damit sind zwei Undo-Codepfade mit dem AP-0.9-Befehlsvorrat prinzipiell
// unerreichbar und hier ungeprüft: die Rücknahme-REIHENFOLGE innerhalb einer Transaktion (DESC) und
// `defer_foreign_keys` (Mutationsprobe M2/M3 überlebt — kein Invarianten-Defekt, sondern fehlende
// Angriffsfläche). SOBALD der erste Befehl landet, dessen Transaktion MEHR ALS EINE `aenderung`-Zeile
// erzeugt (z. B. `ort`, `name`, `elternschaft` oder ein `person.anlegen` mit zusätzlicher Namenszeile),
// ist `_befehlsfolge-generator.ts` um diesen Befehl zu erweitern — sonst bleiben DESC und
// defer_foreign_keys dauerhaft ungeprüft.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { vi } from 'vitest'

// `sendeEreignis` wird gemockt (nicht `electron`/`BrowserWindow`): `src/main/ipc/ereignisse.ts`
// selbst importiert `electron`, aber ein kompletter Modul-Mock ersetzt die Datei, bevor dieser
// Import überhaupt läuft (dasselbe Muster wie `test/einheit/undo-redo-linear.test.ts` und
// `test/einheit/befehl-bus.test.ts`).
vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { undo } from '../../src/main/journal/undo'
import { undoZiel } from '../../src/main/repositories/journal-repo'
import { kanonischerAbzug } from './_kanonischer-abzug'
import { aktionAusfuehren, befehlsfolgeArbitrary, neuerZustand } from './_befehlsfolge-generator'

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

interface TransaktionAnzahlZeile {
  readonly anzahl: number
}

/** Anzahl der (ausschließlich committeten — s. Modul-Kommentar) `transaktion`-Zeilen. */
function transaktionAnzahl(db: ReturnType<typeof oeffnen>): number {
  const zeile = db.prepare<[], TransaktionAnzahlZeile>('SELECT COUNT(*) AS anzahl FROM transaktion').get()
  if (zeile === undefined) {
    throw new Error('transaktionAnzahl(): COUNT(*)-Abfrage lieferte unerwartet keine Zeile.')
  }
  return zeile.anzahl
}

describe('Invariante: Undo(Aktion) stellt den Datenbestand bitgleich wieder her (ADR-009 §2, 55_Architektur.md §4.9 Punkt 5)', () => {
  it('jeder einzelne Undo-Schritt einer beliebigen Befehlsfolge (person.anlegen/feldSetzen/loeschen) trifft exakt den passenden Vorzustand', () => {
    fc.assert(
      fc.property(befehlsfolgeArbitrary(), (folge) => {
        const db = neueTestDatenbank()
        try {
          const schnappschuesse: string[] = [kanonischerAbzug(db)]
          let anzahlVorher = transaktionAnzahl(db)

          const zustand = neuerZustand()
          for (const aktion of folge) {
            aktionAusfuehren(db, zustand, aktion)
            const anzahlJetzt = transaktionAnzahl(db)
            if (anzahlJetzt > anzahlVorher) {
              schnappschuesse.push(kanonischerAbzug(db))
              anzahlVorher = anzahlJetzt
            }
          }

          const anzahlSchritte = schnappschuesse.length - 1
          for (let schritt = 1; schritt <= anzahlSchritte; schritt += 1) {
            undo(db)
            const erwartet = schnappschuesse[anzahlSchritte - schritt]
            if (erwartet === undefined) {
              throw new Error('unerreichbar: Index liegt per Konstruktion innerhalb von schnappschuesse.')
            }
            expect(kanonischerAbzug(db)).toBe(erwartet)
          }

          // Gegenprobe: die Zählung stimmt — nach genau `anzahlSchritte` Rücknahmen ist nichts mehr rücknehmbar.
          expect(undoZiel(db)).toBeUndefined()
        } finally {
          db.close()
        }
      }),
      // Fester Seed + Mindestlaufzahl 300 (CLAUDE.md §13: Determinismus ist Pflicht, Auftragsvorgabe).
      { seed: 20260910, numRuns: 300 },
    )
  }, 60_000)
})
