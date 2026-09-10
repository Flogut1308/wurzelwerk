// AP-0.13 — eigenständiger PRODUKTIONS-Abzug der abgeleiteten Tabellen, für
// `src/main/datenbank/integritaet.ts` (`ableitungAbweichung`, Menüpunkt „Datenbestand prüfen").
// BEWUSST NICHT aus `test/` importiert (CLAUDE.md §2: Produktivcode darf keinen Testcode
// referenzieren) — dieselbe Idee wie `test/einheit/_hilfen-abgeleitet.ts` (`sucheFtsInhaltAbzug`)
// und `test/invarianten/abgeleitet-gleich.test.ts` (Abzüge von `person_flach`/`name_phonetik`/
// `suche_fts_quelle`), aber eigenständig für den Produktionspfad nachgebaut.
//
// Jeder Abzug ist eine deterministisch sortierte, zeichenweise vergleichbare Zeichenkette
// (`JSON.stringify` über explizit aufgezählte Spalten, kein `SELECT *`, CLAUDE.md §6). `suche_fts`
// ist `content=''` (contentless) und über seine eigenen Spalten nicht direkt lesbar — der Abzug
// geht über das `fts5vocab`-Auxiliarmodul (`'instance'`: liefert `(term, doc, col, offset)`, `doc`
// = `suche_fts`-`rowid`) und führt über `suche_fts_quelle` auf die stabile Identität
// `(quelle_typ, quelle_id)` zurück, damit ein AUTOINCREMENT-`rowid`-Wechsel nach einem Neuaufbau
// den Vergleich nicht stört. Die Hilfstabelle selbst legt der Aufrufer an (s. `integritaet.ts`) —
// dieses Modul öffnet keine eigene Datenbankverbindung und keine eigene Transaktion.
import type Database from 'better-sqlite3'
import { PERSON_FLACH_SPALTEN } from './abgeleitet-projektion'

/** Namen der vier abgeleiteten Tabellen, in der Reihenfolge, in der ein Bericht sie nennen soll. */
export const ABGELEITETE_TABELLEN = ['person_flach', 'name_phonetik', 'suche_fts_quelle', 'suche_fts'] as const
export type AbgeleiteteTabelle = (typeof ABGELEITETE_TABELLEN)[number]

/** Ein Abzug je abgeleiteter Tabelle — zwei Abzüge sind bitgleich, wenn alle vier Zeichenketten übereinstimmen. */
export type AbgeleiteterAbzug = Readonly<Record<AbgeleiteteTabelle, string>>

/** Zeilenwerte von `person_flach` — beliebige Spaltennamen aus `PERSON_FLACH_SPALTEN` auf einfache SQLite-Werte. */
type PersonFlachZeile = Record<(typeof PERSON_FLACH_SPALTEN)[number], string | number | null>

/** Deterministischer, sortierter Abzug von `person_flach` (Primärschlüssel `person_id`, kein rowid-Problem). */
function personFlachAbzug(db: Database.Database): string {
  const spalten = PERSON_FLACH_SPALTEN.join(', ')
  const zeilen = db.prepare<[], PersonFlachZeile>(`SELECT ${spalten} FROM person_flach ORDER BY person_id`).all()
  return JSON.stringify(zeilen)
}

interface NamePhonetikZeile {
  readonly name_id: string
  readonly verfahren: string
  readonly code: string
}

/** Deterministischer, sortierter Abzug von `name_phonetik` (zusammengesetzter Primärschlüssel, kein rowid-Problem). */
function namePhonetikAbzug(db: Database.Database): string {
  const zeilen = db
    .prepare<[], NamePhonetikZeile>('SELECT name_id, verfahren, code FROM name_phonetik ORDER BY name_id, verfahren')
    .all()
  return JSON.stringify(zeilen)
}

interface SucheFtsQuelleZeile {
  readonly quelle_typ: string
  readonly quelle_id: string
}

/**
 * Deterministischer, sortierter Abzug von `suche_fts_quelle` — bewusst OHNE die `rowid`-Spalte:
 * `rowid` ist `INTEGER PRIMARY KEY AUTOINCREMENT` (docs/schema/0003_abgeleitet.sql) und nimmt nach
 * einem Neuaufbau garantiert andere Werte an. Die stabile, vergleichbare Identität ist
 * `(quelle_typ, quelle_id)`.
 */
function sucheFtsQuelleAbzug(db: Database.Database): string {
  const zeilen = db
    .prepare<[], SucheFtsQuelleZeile>('SELECT quelle_typ, quelle_id FROM suche_fts_quelle ORDER BY quelle_typ, quelle_id')
    .all()
  return JSON.stringify(zeilen)
}

interface FtsInstanzZeile {
  readonly quelle_typ: string
  readonly quelle_id: string
  readonly col: string
  readonly term: string
}

/**
 * Deterministischer, vergleichbarer Abzug des tatsächlichen `suche_fts`-Indexinhalts über die
 * bereits angelegte `fts5vocab`-Hilfstabelle `vocabTabelle` (Name inkl. `temp.`-Präfix, falls
 * zutreffend — der Aufrufer legt sie an und löscht sie wieder, s. Moduldoku oben).
 */
function sucheFtsInhaltAbzug(db: Database.Database, vocabTabelle: string): string {
  const zeilen = db
    .prepare<[], FtsInstanzZeile>(
      `SELECT q.quelle_typ, q.quelle_id, vocab.col, vocab.term
       FROM ${vocabTabelle} AS vocab JOIN suche_fts_quelle q ON q.rowid = vocab.doc
       ORDER BY q.quelle_typ, q.quelle_id, vocab.col, vocab.term`,
    )
    .all()
  return JSON.stringify(zeilen)
}

/**
 * Abzug aller vier abgeleiteten Tabellen. `vocabTabelle` muss vor dem Aufruf bereits als
 * `fts5vocab('suche_fts', 'instance')`-Hilfstabelle angelegt worden sein (der Aufrufer legt sie an
 * und löscht sie wieder — dieses Modul öffnet keine eigene Transaktion und keinen eigenen DDL-Schritt).
 */
export function abgeleiteterAbzug(db: Database.Database, vocabTabelle: string): AbgeleiteterAbzug {
  return {
    person_flach: personFlachAbzug(db),
    name_phonetik: namePhonetikAbzug(db),
    suche_fts_quelle: sucheFtsQuelleAbzug(db),
    suche_fts: sucheFtsInhaltAbzug(db, vocabTabelle),
  }
}
