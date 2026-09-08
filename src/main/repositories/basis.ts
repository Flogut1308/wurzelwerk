import type Database from 'better-sqlite3'

/**
 * Ein Datenbank-Handle innerhalb einer bereits offenen Transaktion (55_Architektur.md §1.2).
 * Repositories nehmen `Tx` entgegen, kennen aber keine Transaktionsgrenze — `BEGIN`/`COMMIT`/
 * `ROLLBACK` bleibt ausschließlich `src/main/befehle/` vorbehalten (CLAUDE.md §2, §4.2). Ein
 * Repository, das selbst eine Transaktion öffnet, ist ein Fehler, kein Sonderfall.
 */
export type Tx = Database.Database

/**
 * Alle Tabellen aus `docs/schema/0001_grundgeruest.sql` + `docs/schema/0002_kern.sql` (AP-0.5,
 * AP-0.6) + `docs/schema/0003_abgeleitet.sql` (AP-0.7). Geschlossene Union statt `string`
 * (CLAUDE.md §4) — ein Tippfehler im Tabellennamen fällt damit beim Kompilieren auf, nicht erst
 * zur Laufzeit als leeres Ergebnis. Die drei 0003-Tabellen sind zum Zeitpunkt von AP-0.7 PR-A noch
 * nicht als Migration v3 registriert (SCHEMA_VERSION bleibt 2, siehe Kopfkommentar von
 * `0003_abgeleitet.sql`) — sie stehen hier trotzdem schon, weil die Union nur Bezeichner benennt,
 * keine Tabellen erzeugt; `datensatzExistiert` liefe für sie erst ins Leere, sobald PR-B die
 * Migration scharf schaltet, nicht vorher.
 */
export const ALLE_TABELLEN = [
  // 0001_grundgeruest.sql
  'transaktion',
  'aenderung',
  'journal_kontext',
  'schema_migration',
  // 0002_kern.sql
  'person',
  'name',
  'name_phonetik',
  'ort',
  'ortsname',
  'ortszugehoerigkeit',
  'ort_externe_id',
  'ereignis',
  'beteiligung',
  'elternschaft',
  'partnerschaft',
  'partnerschaft_person',
  'assoziation',
  'archiv',
  'quelle',
  'zitat',
  'aussage',
  'aussage_zitat',
  'negativbefund',
  'persona',
  'medium',
  'medium_zuordnung',
  'medium_region',
  'merge_protokoll',
  'id_alias',
  'aufgabe',
  'diagnose',
  'risikofaktor',
  'feld_definition',
  'feld_auswahloption',
  'feld_wert',
  'interview_sitzung',
  'import_lauf',
  'import_herkunft',
  'ansicht_zustand',
  // 0003_abgeleitet.sql (AP-0.7) — noch nicht als Migration registriert, siehe Kommentar oben.
  'person_flach',
  'suche_fts',
  'suche_fts_quelle',
] as const

export type Tabelle = (typeof ALLE_TABELLEN)[number]

interface ExistenzZeile {
  readonly vorhanden: number
}

/**
 * Prüft, ob in `tabelle` eine Zeile mit Primärschlüssel `id` existiert. `tabelle` ist immer ein
 * Literal aus `ALLE_TABELLEN` (nie eine Nutzereingabe) — SQLite erlaubt keine Parameterbindung
 * für Bezeichner, darum steht der Tabellenname direkt im SQL-Text, während `id` als benannter
 * Parameter gebunden bleibt (CLAUDE.md §6: immer benannte Parameter, kein zusammengesetztes SQL
 * für Werte).
 */
export function datensatzExistiert(tx: Tx, tabelle: Tabelle, id: string): boolean {
  const zeile = tx
    .prepare<{ readonly id: string }, ExistenzZeile>(`SELECT 1 AS vorhanden FROM ${tabelle} WHERE id = @id LIMIT 1`)
    .get({ id })
  return zeile !== undefined
}
