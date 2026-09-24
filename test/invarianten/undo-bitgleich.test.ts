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
// 2. Eine fast-check-generierte Befehlsfolge (`_befehlsfolge-generator.ts`) über die registrierten
//    Befehle über den ECHTEN Befehlsbus (`fuehreAus`) ausführen — nach jeder Aktion wird die `id`
//    von `undoZiel(db)` (der obersten anwendbaren Transaktion, `journal-repo.ts`) mit der vor der
//    Aktion verglichen:
//    - ändert sich die `id` (eine neue Transaktionszeile liegt jetzt oben), wird ein neuer
//      Schnappschuss ANGEHÄNGT — ein echter neuer Undo-Schritt.
//    - bleibt die `id` GLEICH, wird der ZULETZT aufgezeichnete Schnappschuss ERSETZT statt
//      angehängt. Das deckt zwei Fälle ab, die sich von außen nicht unterscheiden lassen und beide
//      denselben Umgang brauchen: (a) ein echter No-op (Aktion hat nichts verändert, der Ersatz
//      schreibt denselben Wert erneut) und (b) KOALESZENZ (AP-0.15, `versucheZusammenfassen()` in
//      `src/main/journal/koaleszenz.ts`) — zwei schnelle Änderungen mit demselben
//      Koaleszenz-Schlüssel (z. B. zwei `feldSetzen('notiz', …)` auf dieselbe Person, `bus.ts`
//      §4.8) werden zu EINEM Undo-Schritt verschmolzen; die resultierende Zeile behält die `id` der
//      ERSTEN der beiden (`kandidat.id`), ihr Inhalt (der Vorzustand, den ein Undo wiederherstellt)
//      ändert sich aber. Ein reiner `COUNT(*) FROM transaktion`-Vergleich (frühere Fassung dieses
//      Tests) übersieht Fall (b): die verworfene, neu angelegte Zeile hebt den Zählerstand wieder
//      exakt auf, obwohl sich die JETZT oberste Transaktion inhaltlich geändert hat — genau diese
//      Lücke hat die erhöhte Demote-Deckung in `_befehlsfolge-generator.ts` (AP-1.12 PR-B,
//      Kopfkommentar dort "DEMOTE-DECKUNG") real getroffen (zwei aufeinanderfolgende
//      `feldSetzen('notiz', …)` innerhalb des 2-Sekunden-Fensters).
//    `schnappschuesse` ist damit exakt die Folge der Zustände nach 0, 1, 2, … tatsächlich
//    ANWENDBAREN (nicht bloß tabellenweise gezählten) Undo-Schritten — unabhängig von No-ops
//    (Modul-Kommentar `_befehlsfolge-generator.ts`) und von Koaleszenz.
// 3. `undo()` GENAU `schnappschuesse.length - 1`-mal aufrufen — nach dem i-ten `undo()`-Aufruf MUSS
//    der kanonische Abzug mit `schnappschuesse[schnappschuesse.length - 1 - i]` übereinstimmen: das
//    prüft nicht nur den Endzustand, sondern JEDEN einzelnen Rücknahmeschritt gegen den exakt
//    passenden Vorzustand (fängt genau die oben beschriebene Bugklasse).
// 4. Am Ende zusätzlich `undoZiel(db) === undefined` (nichts mehr rücknehmbar) als Gegenprobe, dass
//    die Zählung stimmt.
//
// FRÜHERE DECKUNGSGRENZE, JETZT GESCHLOSSEN (hueter-Auflage 1, PR-B; AP-1.12 PR-B zieht nach):
// Mit den drei ursprünglich registrierten Befehlen (`person.anlegen`/`feldSetzen`/`loeschen`)
// berührte jede Transaktion GENAU EINE `person`-Zeile — die Rücknahme-REIHENFOLGE innerhalb einer
// Transaktion (DESC) und `defer_foreign_keys` waren mit diesem Befehlsvorrat prinzipiell
// unerreichbar (Mutationsprobe M2/M3 überlebte — kein Invarianten-Defekt, sondern fehlende
// Angriffsfläche). AP-1.12 hat inzwischen `name`/`elternschaft`/`partnerschaft`/`ereignis`/
// `aussage` als Schreibbefehle eingeführt, jeder davon mit einer Mehrzeilen-Transaktion (Kante +
// Existenz-Aussage, Kante + N Beteiligungszeilen + Existenz-Aussage, ein `update` + ein `insert`
// beim "Fakt ändern"-Demote-Pfad, …) — `_befehlsfolge-generator.ts` deckt seit AP-1.12 PR-B genau
// diese Befehle mit ab (s. dortiger Kopfkommentar für die Generierungsregeln), DESC und
// `defer_foreign_keys` sind damit real geprüft, nicht mehr nur eine offene Lücke.
//
// DECKUNGSZÄHLER (AP-1.34 PR-B2, Eigentümer-Entscheidung E-B2-1 (c)): `aktionAusfuehren()` meldet
// die tatsächlich getroffenen Zweige (`Zweig`, `_befehlsfolge-beleg.ts`). Nach `fc.assert` muss jeder
// Beleg-Zweig (`BELEG_PFLICHTZWEIGE`: Textanker/feld bei `aussage_zitat.anlegen`/`.aendern`,
// `zitat.aendern` bleibt/entwertet, Ablehnungen), jeder vom Generator erzeugte Befehl samt Demote
// und Nachrücken (`BESTAND_PFLICHTZWEIGE`) und das Undo eines Schritts, der einen Anker entwertet
// hat (`undo.entwertung`), mehr als 0 Treffer haben. Früher standen solche Zahlen nur im PR-Bericht
// einer temporären, nicht committeten Zählung — ein später verdrängter Zweig (z. B. durch eine
// Gewichtsänderung) blieb dann still ungeprüft. Fällt ein Zähler auf 0: Gewichtung im Generator
// korrigieren, nie Seed oder `numRuns`. Ein abgelehnter Befehl (`belegAblehnen`, E-B2-2) erzeugt
// keine Transaktion und fällt in Punkt 2 unter „gleiche oberste Transaktion" (identischer
// Schnappschuss ersetzt den letzten).
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
import { aktionAusfuehren, befehlsfolgeArbitrary, neuerZustand, type Zweig } from './_befehlsfolge-generator'
import { BELEG_PFLICHTZWEIGE, BESTAND_PFLICHTZWEIGE } from './_befehlsfolge-beleg'

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

type Zaehlschluessel = Zweig | 'undo.entwertung'

const zaehler = new Map<Zaehlschluessel, number>()

function zaehle(schluessel: Zaehlschluessel): void {
  zaehler.set(schluessel, (zaehler.get(schluessel) ?? 0) + 1)
}

describe('Invariante: Undo(Aktion) stellt den Datenbestand bitgleich wieder her (ADR-009 §2, 55_Architektur.md §4.9 Punkt 5)', () => {
  it('jeder einzelne Undo-Schritt einer beliebigen Befehlsfolge (alle registrierten Schreibbefehle, AP-1.12 PR-B) trifft exakt den passenden Vorzustand', () => {
    fc.assert(
      fc.property(befehlsfolgeArbitrary(), (folge) => {
        const db = neueTestDatenbank()
        try {
          const schnappschuesse: string[] = [kanonischerAbzug(db)]
          // Zweige je Undo-Schritt: `schrittZweige[i]` gehört zum Übergang schnappschuesse[i] → [i + 1].
          const schrittZweige: Set<Zweig>[] = []
          // `id` der aktuell obersten anwendbaren Transaktion — `undefined`, solange keine existiert.
          // s. Modul-Kommentar Punkt 2 für die Fallunterscheidung (neue Transaktion vs. No-op/Koaleszenz).
          let oberstesTxIdVorher = undoZiel(db)?.id

          const zustand = neuerZustand()
          for (const aktion of folge) {
            const zweige = aktionAusfuehren(db, zustand, aktion)
            for (const z of zweige) {
              zaehle(z)
            }
            const oberstesTxIdJetzt = undoZiel(db)?.id
            if (oberstesTxIdJetzt !== oberstesTxIdVorher) {
              schnappschuesse.push(kanonischerAbzug(db))
              schrittZweige.push(new Set(zweige))
            } else if (oberstesTxIdJetzt !== undefined) {
              const letzterIndex = schnappschuesse.length - 1
              schnappschuesse[letzterIndex] = kanonischerAbzug(db)
              const letzteZweige = schrittZweige[schrittZweige.length - 1]
              if (letzteZweige === undefined) {
                throw new Error('unerreichbar: eine oberste Transaktion existiert, also auch ein Schritt.')
              }
              for (const z of zweige) {
                letzteZweige.add(z)
              }
            }
            oberstesTxIdVorher = oberstesTxIdJetzt
          }

          const anzahlSchritte = schnappschuesse.length - 1
          for (let schritt = 1; schritt <= anzahlSchritte; schritt += 1) {
            undo(db)
            const erwartet = schnappschuesse[anzahlSchritte - schritt]
            if (erwartet === undefined) {
              throw new Error('unerreichbar: Index liegt per Konstruktion innerhalb von schnappschuesse.')
            }
            expect(kanonischerAbzug(db)).toBe(erwartet)
            if (schrittZweige[anzahlSchritte - schritt]?.has('zitat.entwertet') === true) {
              zaehle('undo.entwertung')
            }
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

    // E-B2-1 (c): kein Pflichtzweig darf leer grün sein (s. Modul-Kommentar DECKUNGSZÄHLER).
    for (const z of [...BELEG_PFLICHTZWEIGE, ...BESTAND_PFLICHTZWEIGE, 'undo.entwertung' as const]) {
      expect(zaehler.get(z) ?? 0, `Deckungszweig ${z}`).toBeGreaterThan(0)
    }
  }, 180_000)
  // it()-Timeout 180s statt 60s (AP-1.12 PR-B, Nachzug): die erhöhte Demote-Deckung
  // (`minLength: 15`, `_befehlsfolge-generator.ts`) braucht auf dem Windows-CI-Runner
  // beobachtet 79286ms — deutlich über den vorherigen 60000ms, obwohl macOS lokal schneller
  // durchläuft. Das ist eine reine Laufzeit-/Runner-Frage, keine Abschwächung der Prüfung:
  // `numRuns: 300` und `minLength: 15` (Demote-Deckung, hueter-Auflage) bleiben unverändert;
  // 180s lässt auf dem langsameren Runner klaren Sicherheitsabstand samt CI-Lastreserve.
})
