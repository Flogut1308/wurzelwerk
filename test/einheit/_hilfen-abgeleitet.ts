// Gemeinsamer Helfer für Tests, die AP-0.7s abgeleitetes Schema brauchen, OHNE dass es als
// Migration v3 registriert ist (bewusste PR-A-Entscheidung, siehe docs/schema/0003_abgeleitet.sql
// Kopfkommentar). `docs/schema/0003_abgeleitet.sql` wird darum nicht über `migrieren()` erreicht,
// sondern direkt (readFileSync + db.exec) auf eine bereits per `migrieren()` auf SCHEMA_VERSION
// (aktuell 2) gebrachte Datenbank angewendet — genau das Muster, das PR-B dann durch eine echte
// Migration v3 ersetzt.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'

/**
 * Frische, migrierte (bis `SCHEMA_VERSION`) In-Memory-Datenbank mit zusätzlich direkt angewendetem
 * `docs/schema/0003_abgeleitet.sql` (person_flach, suche_fts, suche_fts_quelle, abl_*-Trigger).
 * Legt zusätzlich die `fts5vocab`-Hilfstabelle `vocab` an (siehe `sucheFtsInhaltAbzug`). Aufrufer
 * schließt die Verbindung selbst (`db.close()`).
 */
export function frischeDatenbankMitAbgeleitetemSchema(): Database.Database {
  const db = oeffnen(':memory:')
  migrieren(db)
  const abgeleitetesSchema = readFileSync(join('docs', 'schema', '0003_abgeleitet.sql'), 'utf8')
  db.exec(abgeleitetesSchema)
  db.exec("CREATE VIRTUAL TABLE vocab USING fts5vocab('suche_fts', 'instance')")
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
