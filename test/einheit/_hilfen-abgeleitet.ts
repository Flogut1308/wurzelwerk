// Gemeinsamer Helfer für Tests, die AP-0.7s abgeleitetes Schema brauchen. Seit PR-B ist
// `docs/schema/0003_abgeleitet.sql` als Migration v3 registriert (`SCHEMA_VERSION = 3`,
// `src/main/datenbank/migration/registrierung.ts`) — `migrieren()` bringt eine frische Datenbank
// damit bereits vollständig auf den abgeleiteten Stand (person_flach, suche_fts, suche_fts_quelle,
// abl_*-Trigger). Die frühere PR-A-Fassung dieser Datei wandte 0003_abgeleitet.sql zusätzlich noch
// direkt per `readFileSync` + `db.exec` an (siehe Kopfkommentar von 0003_abgeleitet.sql: "die
// physische JOURNALISIERT/NICHT_JOURNALISIERT-Liste + jrn_*-Trigger folgen in AP-0.8" — die
// Migrationsregistrierung selbst war schon für PR-B vorgesehen) — das würde jetzt an
// `migrieren()` scheitern ("table person_flach already exists").
//
// AP-0.8-Nachtrag: Seit `docs/schema/0004_journal.sql` ist `journal_kontext.aktiv = 1` ab der
// ersten Migration scharf ("scharfer Ruhezustand", 55_Architektur.md §4.3) — jeder Schreibvorgang
// auf einer journalisierten Tabelle OHNE armierte Transaktion (`aenderung.transaktion_id NOT
// NULL`) scheitert seitdem, das ist die zentrale Abnahme aus AP-0.8. Diese Tests hier (AP-0.7)
// prüfen ausschließlich die `abl_*`-Trigger-Familie (abgeleitete Tabellen) über rohe,
// unarmiertes-Bus-lose `db.prepare(...).run()`-Aufrufe — der Befehlsbus, der armieren würde, ist
// erst AP-0.9. Diese Testdatei liegt bewusst NICHT unter `test/invarianten/`
// (CLAUDE.md §13 geschützter Prüfpfad) und darf daher additiv angepasst werden: `journalAus()`
// schaltet das Journal für diese Helfer-Datenbanken ab, bevor sie an den jeweiligen Test
// zurückgegeben werden - der Journal-Mechanismus selbst wird bereits eigenständig geprüft
// (test/einheit/journal-trigger.test.ts, test/schema/trigger-vorhanden.test.ts).
import type Database from 'better-sqlite3'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { journalAus } from '../../src/main/journal/kontext'

/**
 * Frische, vollständig migrierte (bis `SCHEMA_VERSION`, inkl. abgeleitetem Schema seit v3)
 * In-Memory-Datenbank. Legt zusätzlich die `fts5vocab`-Hilfstabelle `vocab` an (siehe
 * `sucheFtsInhaltAbzug`) und deaktiviert das Änderungsjournal (s. Moduldoku oben — diese Tests
 * decken die `abl_*`-Trigger ab, nicht das Journal, und schreiben ohne Befehlsbus-Armierung).
 * Aufrufer schließt die Verbindung selbst (`db.close()`).
 */
export function frischeDatenbankMitAbgeleitetemSchema(): Database.Database {
  const db = oeffnen(':memory:')
  migrieren(db)
  db.exec("CREATE VIRTUAL TABLE vocab USING fts5vocab('suche_fts', 'instance')")
  journalAus(db, 'AP-0.7-Testhelfer (test/einheit/_hilfen-abgeleitet.ts): prüft abl_*-Trigger ohne Befehlsbus-Armierung (Bus erst AP-0.9).')
  return db
}

interface FtsInstanzZeile {
  readonly quelle_typ: string
  readonly quelle_id: string
  readonly col: string
  readonly term: string
}

/**
 * Deterministischer, vergleichbarer Abzug des tatsächlichen `suche_fts`-Indexinhalts. `suche_fts`
 * ist contentless (`content=''`) — ein direktes `SELECT` auf seine Spalten liefert immer NULL,
 * darum der Umweg über das `fts5vocab`-Auxiliarmodul (`'instance'`: liefert `(term, doc, col,
 * offset)`, wobei `doc` die `rowid` ist). `doc`/`rowid` selbst ist NICHT vergleichbar: `suche_fts_
 * quelle.rowid` ist `AUTOINCREMENT` und wird nach einem `alleAbgeleitetenNeuAufbauen()` in
 * derselben Sitzung nie wiederverwendet — darum wird über `suche_fts_quelle` auf die stabile
 * Identität `(quelle_typ, quelle_id)` zurückgeführt, sortiert für einen stringgleichen Vergleich.
 */
export function sucheFtsInhaltAbzug(db: Database.Database): string {
  const zeilen = db
    .prepare<[], FtsInstanzZeile>(
      `SELECT q.quelle_typ, q.quelle_id, vocab.col, vocab.term
       FROM vocab JOIN suche_fts_quelle q ON q.rowid = vocab.doc
       ORDER BY q.quelle_typ, q.quelle_id, vocab.col, vocab.term`,
    )
    .all()
  return JSON.stringify(zeilen)
}

/**
 * Zählt Karteileichen: `fts5vocab`-Einträge, deren `doc` (= `suche_fts`-`rowid`) NICHT (mehr) in
 * `suche_fts_quelle` steht. So etwas darf nie vorkommen — jede indizierte `rowid` muss über
 * `suche_fts_quelle` einer lebenden Quelle zugeordnet sein. `sucheFtsInhaltAbzug` allein fängt das
 * NICHT: es joint über `suche_fts_quelle` und ist darum blind für genau diesen Fall (ein
 * `'delete'`-Aufruf mit falschen Vorher-Werten hinterlässt ein Posting, dessen `suche_fts_quelle`-
 * Zeile trotzdem sauber gelöscht wurde - hueter-Review AP-0.7 PR-A).
 */
export function verwaisteFtsEintraegeAnzahl(db: Database.Database): number {
  const zeile = db
    .prepare<[], { readonly anzahl: number }>(
      'SELECT COUNT(*) AS anzahl FROM vocab WHERE doc NOT IN (SELECT rowid FROM suche_fts_quelle)',
    )
    .get()
  return zeile?.anzahl ?? 0
}
