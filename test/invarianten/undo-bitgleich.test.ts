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
//
//    AP-1.30 PR 4b (KOALESZIERTE FOLGEN, `_befehlsfolge-koaleszenz.ts`): seit der Aktion „Serie"
//    (2–5 Aufrufe desselben Autosave-Befehls auf dasselbe Subjekt+Feld, feste Testuhr, Abstände
//    teils < 2000 ms, teils ≥ 2000 ms) kann EINE Aktion mehrere Undo-Schritte erzeugen. Die
//    Erfassung (`schrittErfassen`) läuft darum nach JEDEM Serienaufruf (`zwischenSchritt`) und nach
//    jeder Aktion, und sie führt je Schritt die tragende Transaktions-`id` mit (`schrittIds`)
//    statt nur „gleich wie vorher / anders". Drei Fälle:
//    (a) eine unbekannte `id` liegt oben → neuer Schritt, Schnappschuss ANGEHÄNGT;
//    (b) dieselbe `id` → No-op oder Koaleszenz, der letzte Schnappschuss wird ERSETZT. Der
//        Vorzustand des Schritts (`schnappschuesse[length - 2]`) bleibt dabei unangetastet — die
//        Zusicherung „Undo stellt den Vorzustand bitgleich her" gilt für einen koaleszierten Schritt
//        also gegen den Zustand VOR DEM ERSTEN zusammengefassten Aufruf, nicht vor dem letzten;
//    (c) eine FRÜHERE `id` (oder keine) liegt oben → ein Merge ist leer geworden
//        (`versucheZusammenfassen()` → `null`, beide Transaktionszeilen gelöscht): die Schritte
//        danach werden ENTFERNT statt ein neuer angehängt, und zusätzlich muss der jetzige Stand
//        bitgleich der vor dem verschwundenen Schritt sein. Die frühere Fassung hätte hier einen
//        Schnappschuss ANGEHÄNGT (die `id` hatte sich ja „geändert") und damit einen Schritt zu viel
//        gezählt. Mit dem heutigen Befehlsvorrat ist (c) laut `koaleszenz.ts` unerreichbar (jede
//        Transaktion mit Schlüssel ändert auch eine über beide bestehende Zeile) — der Zweig ist das
//        Sicherheitsnetz für einen künftigen Befehl, der es erreicht.
//    Keine bisherige Zusicherung entfällt: jeder Rücknahmeschritt wird weiter gegen genau seinen
//    Vorzustand verglichen, am Ende muss `undoZiel` leer sein.
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
// die tatsächlich getroffenen Zweige (`Zweig`, `_befehlsfolge-beleg.ts`). Nach `fc.assert` gilt
// (hueter PR #119, H1/H7): jeder Befehl, Demote und Nachrücken erreichen mindestens 50 % ihres
// main-Werts (`MAIN_TREFFER`, gemessen auf d0a095b mit genau diesem Seed/`numRuns`); neue Befehle
// und das Undo eines Schritts, der einen Anker entwertet hat (`undo.entwertung`), eine feste
// Mindestzahl (`NEUE_MINDESTTREFFER`); und jeder beobachtete `befehl:*`-Zweig steht in einer der
// beiden Tabellen — ein neuer Generator-Befehl ohne Eintrag macht den Test rot. Dieser Test
// nutzt das Generator-Profil `bestand` (main-Gewichte, hueter PR #119 H1/H2); die feinen
// Beleg-Zweige prüft `textanker-gueltig.test.ts` mit dem Profil `beleg`. Früher standen solche Zahlen nur im PR-Bericht
// einer temporären, nicht committeten Zählung — ein später verdrängter Zweig (z. B. durch eine
// Gewichtsänderung) blieb dann still ungeprüft. Fällt ein Zähler auf 0: Gewichtung im Generator
// korrigieren, nie Seed oder `numRuns`. Ein abgelehnter Befehl (`belegAblehnen`, E-B2-2) erzeugt
// keine Transaktion und fällt in Punkt 2 unter „gleiche oberste Transaktion" (identischer
// Schnappschuss ersetzt den letzten).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

type Zaehlschluessel = Zweig | 'undo.entwertung'

/**
 * Treffer auf main (d0a095b) mit `{ seed: 20260910, numRuns: 300 }` — gemessen mit einer
 * temporären, nicht committeten Zählung im main-Generator (dieselbe Zählweise wie
 * `aktionAusfuehren()`: `befehl:<name>` je erfolgreich zurückgekehrtem `fuehreAus`, Demote/Nachrücken
 * am Vorzustand), zweimal gemessen, identisch (AP-1.34 PR-B2). Schwelle: ≥ 50 % davon
 * (aufgerundet). Neu messen nur mit ADR-009-Nachtrag, nie einen Wert senken, damit ein Test grün wird.
 */
const MAIN_TREFFER: readonly (readonly [Zweig, number])[] = [
  ['befehl:archiv.aendern', 63],
  ['befehl:archiv.anlegen', 367],
  ['befehl:aussage.aendern', 123],
  ['befehl:aussage.anlegen', 414],
  ['befehl:aussage.loeschen', 64],
  ['befehl:aussage_zitat.anlegen', 29],
  ['befehl:aussage_zitat.loeschen', 3],
  ['befehl:beteiligung.loeschen', 21],
  ['befehl:elternschaft.aendern', 13],
  ['befehl:elternschaft.anlegen', 65],
  ['befehl:elternschaft.loeschen', 10],
  ['befehl:ereignis.aendern', 38],
  ['befehl:ereignis.anlegen', 174],
  ['befehl:ereignis.loeschen', 37],
  ['befehl:hauptname.wechseln', 10],
  ['befehl:name.aendern', 29],
  ['befehl:name.anlegen', 264],
  ['befehl:name.loeschen', 28],
  ['befehl:negativbefund.aendern', 13],
  ['befehl:negativbefund.anlegen', 163],
  ['befehl:negativbefund.loeschen', 20],
  ['befehl:ort-externe-id.anlegen', 142],
  ['befehl:ort-externe-id.loeschen', 16],
  ['befehl:ort.aendern', 83],
  ['befehl:ort.anlegen', 390],
  ['befehl:ortsname.aendern', 72],
  ['befehl:ortsname.anlegen', 157],
  ['befehl:ortsname.loeschen', 74],
  ['befehl:ortszugehoerigkeit.aendern', 12],
  ['befehl:ortszugehoerigkeit.anlegen', 71],
  ['befehl:ortszugehoerigkeit.loeschen', 9],
  ['befehl:partnerschaft.aendern', 8],
  ['befehl:partnerschaft.anlegen', 87],
  ['befehl:partnerschaft.loeschen', 12],
  ['befehl:person.anlegen', 548],
  ['befehl:person.feldSetzen', 177],
  ['befehl:person.loeschen', 82],
  ['befehl:quelle.aendern', 91],
  ['befehl:quelle.anlegen', 365],
  ['befehl:zitat.aendern', 19],
  ['befehl:zitat.anlegen', 166],
  ['befehl:zitat.loeschen', 23],
  ['demote', 136],
  ['nachruecken', 6],
]

/** Neue Befehle/Zweige ohne main-Wert: feste Mindestzahl (Branch-Werte AP-1.34 PR-B2: 7 bzw. 1). */
const NEUE_MINDESTTREFFER: readonly (readonly [Zaehlschluessel, number])[] = [
  ['befehl:aussage_zitat.aendern', 3],
  ['undo.entwertung', 1],
  // AP-1.30 Vorarbeiten Teil 3, PR 4c (V-E5-erhalt): Branch-Wert 8 mit diesem Seed/`numRuns`.
  ['aussage.aendern.datumBeibehalten', 4],
  // AP-1.30 PR 3b (docs/80 §33 V-130-3-vatersname), am Datenbankergebnis gemessen: Form trägt nach
  // `name.anlegen`/`name.aendern` einen Vatersnamen-Teil (Branch-Wert 202) bzw. `name.aendern` hat
  // ihn gelöscht (Branch-Wert 4) — Schwelle je die Hälfte.
  ['name.vatersname.gesetzt', 101],
  ['name.vatersname.entfernt', 2],
]

const zaehler = new Map<Zaehlschluessel, number>()

function zaehle(schluessel: Zaehlschluessel): void {
  zaehler.set(schluessel, (zaehler.get(schluessel) ?? 0) + 1)
}

describe('Invariante: Undo(Aktion) stellt den Datenbestand bitgleich wieder her (ADR-009 §2, 55_Architektur.md §4.9 Punkt 5)', () => {
  // AP-1.30 PR 4b: nur `Date` gefälscht (Timer laufen echt) — der Generator stellt die Uhr je Aufruf
  // (`_befehlsfolge-koaleszenz.ts`, Modul-Kommentar UHR).
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterAll(() => {
    vi.useRealTimers()
  })

  it('jeder einzelne Undo-Schritt einer beliebigen Befehlsfolge (alle registrierten Schreibbefehle, AP-1.12 PR-B) trifft exakt den passenden Vorzustand', () => {
    fc.assert(
      fc.property(befehlsfolgeArbitrary(), (folge) => {
        const db = neueTestDatenbank()
        try {
          const schnappschuesse: string[] = [kanonischerAbzug(db)]
          // Zweige je Undo-Schritt: `schrittZweige[i]` gehört zum Übergang schnappschuesse[i] → [i + 1].
          const schrittZweige: Set<Zweig>[] = []
          // `schrittIds[i]`: `id` der Transaktion, die Undo-Schritt i trägt (Übergang schnappschuesse[i] → [i + 1]).
          // s. Modul-Kommentar Punkt 2 für die Fallunterscheidung (neu / gleich / zurückgefallen).
          const schrittIds: string[] = []

          // Nach jedem Befehl (Aktion, bzw. jedem Serienaufruf — `zwischenSchritt`) aufgerufen.
          const schrittErfassen = (zweige: readonly Zweig[]): void => {
            const jetzt = undoZiel(db)?.id
            const letzteId = schrittIds[schrittIds.length - 1]
            if (jetzt === letzteId) {
              if (jetzt === undefined) {
                return
              }
              // (b) No-op oder Koaleszenz: derselbe Schritt, neuer Nachzustand. Der Vorzustand
              // `schnappschuesse[length - 2]` bleibt der vor dem ERSTEN zusammengefassten Aufruf.
              schnappschuesse[schnappschuesse.length - 1] = kanonischerAbzug(db)
              const letzteZweige = schrittZweige[schrittZweige.length - 1]
              if (letzteZweige === undefined) {
                throw new Error('unerreichbar: eine oberste Transaktion existiert, also auch ein Schritt.')
              }
              for (const z of zweige) {
                letzteZweige.add(z)
              }
              return
            }
            const frueher = jetzt === undefined ? -1 : schrittIds.indexOf(jetzt)
            if (jetzt === undefined || frueher >= 0) {
              // (c) Zurückgefallen: ein Merge ist leer geworden (`versucheZusammenfassen()` → `null`),
              // der jüngste Schritt ist verschwunden, `undoZiel` zeigt auf einen älteren (oder keinen).
              // Die Schritte danach werden ENTFERNT statt ein neuer angehängt — und der jetzige Stand
              // muss der vor dem verschwundenen Schritt sein (bitgleich, zusätzliche Zusicherung).
              schrittIds.length = frueher + 1
              schrittZweige.length = frueher + 1
              schnappschuesse.length = frueher + 2
              expect(kanonischerAbzug(db), 'leerer Merge: Stand gleich dem vor dem verschwundenen Schritt').toBe(schnappschuesse[frueher + 1])
              return
            }
            // (a) Neue Transaktion oben: ein neuer Undo-Schritt.
            schrittIds.push(jetzt)
            schnappschuesse.push(kanonischerAbzug(db))
            schrittZweige.push(new Set(zweige))
          }

          const zustand = neuerZustand()
          for (const aktion of folge) {
            const zweige = aktionAusfuehren(db, zustand, aktion, () => schrittErfassen([]))
            for (const z of zweige) {
              zaehle(z)
            }
            schrittErfassen(zweige)
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

    // E-B2-1 (c), hueter PR #119 H1/H7 (s. Modul-Kommentar DECKUNGSZÄHLER).
    for (const [z, mainWert] of MAIN_TREFFER) {
      expect(zaehler.get(z) ?? 0, `Deckungszweig ${z} (main ${mainWert})`).toBeGreaterThanOrEqual(Math.ceil(mainWert / 2))
    }
    for (const [z, mindestens] of NEUE_MINDESTTREFFER) {
      expect(zaehler.get(z) ?? 0, `Deckungszweig ${z}`).toBeGreaterThanOrEqual(mindestens)
    }
    const bekannt = new Set<Zaehlschluessel>([...MAIN_TREFFER.map(([z]) => z), ...NEUE_MINDESTTREFFER.map(([z]) => z)])
    const unbekannt = [...zaehler.keys()].filter((z) => z.startsWith('befehl:') && !bekannt.has(z))
    expect(unbekannt, 'befehl:*-Zweige ohne Schwelle in MAIN_TREFFER/NEUE_MINDESTTREFFER').toEqual([])
  }, 180_000)
  // it()-Timeout 180s statt 60s (AP-1.12 PR-B, Nachzug): die erhöhte Demote-Deckung
  // (`minLength: 15`, `_befehlsfolge-generator.ts`) braucht auf dem Windows-CI-Runner
  // beobachtet 79286ms — deutlich über den vorherigen 60000ms, obwohl macOS lokal schneller
  // durchläuft. Das ist eine reine Laufzeit-/Runner-Frage, keine Abschwächung der Prüfung:
  // `numRuns: 300` und `minLength: 15` (Demote-Deckung, hueter-Auflage) bleiben unverändert;
  // 180s lässt auf dem langsameren Runner klaren Sicherheitsabstand samt CI-Lastreserve.
})
