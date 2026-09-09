import type Database from 'better-sqlite3'
import { z } from 'zod'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'

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

/**
 * Prüft `tabelle` (ein roher `string`, z. B. aus `aenderung.tabelle`) gegen `ALLE_TABELLEN` und
 * liefert sie als `Tabelle` zurück. Anders als bei `datensatzExistiert` (Aufrufer kennt die
 * Tabelle als Compile-Zeit-Literal) kommt `tabelle` hier aus einer Datenbankzeile - AP-0.10
 * (`src/main/journal/undo.ts`) braucht darum eine Laufzeitprüfung, bevor sie an `rohLoeschen`/
 * `rohEinfuegen`/`rohErsetzen` weitergereicht wird.
 */
export function alsBekannteTabelle(tabelle: string): Tabelle {
  if (!(ALLE_TABELLEN as readonly string[]).includes(tabelle)) { // Breiterer Vergleichstyp nötig, weil `tabelle` hier ein Laufzeit-`string` ist (CLAUDE.md §4: `as` mit Begründung)
    throw new WurzelFehler('INTERN_UNERWARTET', `Unbekannte Tabelle "${tabelle}" (rohes Undo/Redo-Zurückschreiben, AP-0.10).`)
  }
  return tabelle as Tabelle // geprüft gegen ALLE_TABELLEN direkt oberhalb (CLAUDE.md §4: `as` mit Begründung)
}

interface TabelleInfoZeile {
  readonly cid: number
  readonly name: string
  readonly pk: number
}

/**
 * Primärschlüsselspalten einer Tabelle, in `PRAGMA table_info`-`pk`-Reihenfolge (aufsteigend) -
 * dieselbe Regel wie `skripte/trigger-generieren.ts` (`spaltenUndPrimaerschluessel`, D-2/AP-0.8
 * Planungsnotiz: `aenderung.datensatz_id` verkettet mehrere PK-Spaltenwerte mit `|`, in genau
 * dieser Reihenfolge). Hier unabhängig nachgebaut, weil `skripte/` kein Bestandteil der
 * Architekturschichten aus CLAUDE.md §2 ist und nicht von `src/main/` importiert wird.
 */
function pkSpalten(db: Tx, tabelle: Tabelle): readonly string[] {
  return db
    .prepare<[], TabelleInfoZeile>(`PRAGMA table_info(${tabelle})`)
    .all()
    .filter((zeile) => zeile.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((zeile) => zeile.name)
}

/**
 * Zerlegt `aenderung.datensatz_id` wieder in die einzelnen Primärschlüsselwerte - Gegenstück zu
 * `datensatzIdSql()` in `skripte/trigger-generieren.ts` (`|`-verkettet, in `pkSpalten`-Reihenfolge).
 */
function datensatzIdZerlegen(datensatzId: string, spalten: readonly string[]): readonly string[] {
  const werte = datensatzId.split('|')
  if (werte.length !== spalten.length) {
    throw new WurzelFehler(
      'INTERN_UNERWARTET',
      `datensatz_id "${datensatzId}" passt nicht zur Anzahl der Primärschlüsselspalten (${spalten.length}).`,
    )
  }
  return werte
}

/**
 * Erlaubte Wertetypen einer rohen Zeile: `STRICT`-Tabellen (`docs/schema/`) kennen nur
 * TEXT/INTEGER/REAL/NULL - `boolean` kommt in diesem Schema nicht vor (CHECK-Spalten wie
 * `person.privat` sind `INTEGER` mit `CHECK (... IN (0,1))`).
 */
const zeileWertSchema = z.union([z.string(), z.number(), z.null()])

/** Eine rohe Zeile, wie sie `wert_alt_json`/`wert_neu_json` (AP-0.8 `jsonObjectSql()`) enthalten - ALLE Spalten der Tabelle, inklusive Primärschlüssel. */
export type ZeileWerte = Readonly<Record<string, string | number | null>>

/** Zod-Schema für `ZeileWerte` (AP-0.10) - `src/main/journal/undo.ts` validiert damit `JSON.parse(...)` der Journalspalten, statt einem unbegründeten `as`. */
export const zeileSchema: z.ZodType<ZeileWerte> = z.record(z.string(), zeileWertSchema)

/**
 * Löscht eine Zeile roh, OHNE Journal (läuft unter `journalAus`, s. `src/main/journal/undo.ts`) -
 * Gegenstück zu einem journalisierten `insert` beim Zurücknehmen bzw. einem `delete` beim
 * Wiederholen (55_Architektur.md §4.9). `datensatzId` ist `aenderung.datensatz_id` (bei einer
 * einzelnen PK-Spalte deren Wert unverändert, bei mehreren mit `|` verknüpft, s.
 * `datensatzIdZerlegen`). `tabelle` kommt ausschließlich aus `ALLE_TABELLEN` (nie aus einer
 * Nutzereingabe, s. `alsBekannteTabelle`) - SQLite erlaubt kein Parameter-Binding für Bezeichner,
 * darum steht der Tabellenname direkt im SQL-Text, während jeder PK-Wert als benannter Parameter
 * gebunden bleibt (CLAUDE.md §6: kein zusammengesetztes SQL für Werte, nur für Bezeichner).
 */
export function rohLoeschen(db: Tx, tabelle: Tabelle, datensatzId: string): void {
  const spalten = pkSpalten(db, tabelle)
  const werte = datensatzIdZerlegen(datensatzId, spalten)
  const wo = spalten.map((spalte, index) => `${spalte} = @p${index}`).join(' AND ')
  const params: Record<string, string> = {}
  spalten.forEach((_, index) => {
    const wert = werte[index]
    if (wert === undefined) {
      // defensiv (CLAUDE.md §4: kein `!`) - datensatzIdZerlegen garantiert bereits werte.length === spalten.length.
      throw new WurzelFehler('INTERN_UNERWARTET', `rohLoeschen(): fehlender PK-Wert an Index ${index} für Tabelle "${tabelle}".`)
    }
    params[`p${index}`] = wert
  })
  db.prepare<Record<string, string>>(`DELETE FROM ${tabelle} WHERE ${wo}`).run(params)
}

/**
 * Fügt eine Zeile roh ein, OHNE Journal - Gegenstück zu einem journalisierten `delete` beim
 * Zurücknehmen bzw. einem `insert` beim Wiederholen (55_Architektur.md §4.9). `zeile` enthält ALLE
 * Spalten (inklusive Primärschlüssel), so wie `jsonObjectSql()` (`skripte/trigger-generieren.ts`)
 * sie in `wert_alt_json`/`wert_neu_json` geschrieben hat. Spalten-Identifier werden dynamisch aus
 * den Schlüsseln von `zeile` gebildet (Herkunft: Trigger-JSON, keine Nutzereingabe) - Werte bleiben
 * benannt gebunden (CLAUDE.md §6).
 */
export function rohEinfuegen(db: Tx, tabelle: Tabelle, zeile: ZeileWerte): void {
  const spalten = Object.keys(zeile)
  if (spalten.length === 0) {
    throw new WurzelFehler('INTERN_UNERWARTET', `rohEinfuegen(): Zeile ohne Spalten für Tabelle "${tabelle}".`)
  }
  const spaltenListe = spalten.join(', ')
  const platzhalterListe = spalten.map((spalte) => `@${spalte}`).join(', ')
  db.prepare<ZeileWerte>(`INSERT INTO ${tabelle} (${spaltenListe}) VALUES (${platzhalterListe})`).run(zeile)
}

/**
 * Ersetzt eine Zeile roh, OHNE Journal - Gegenstück zu einem journalisierten `update` beim
 * Zurücknehmen UND beim Wiederholen (55_Architektur.md §4.9). Bewusst ein `UPDATE` aller Spalten,
 * NICHT `DELETE` + `INSERT` (CASCADE-Fremdschlüssel würden sonst abhängige Kinderzeilen mit
 * abräumen). Die Primärschlüsselwerte kommen aus `zeile` selbst (sie enthält ALLE Spalten,
 * inklusive PK) - das setzt voraus, dass sich Primärschlüsselwerte nie ändern (F-05: UUID v7,
 * §6), was für jede Tabelle in diesem Schema gilt.
 */
export function rohErsetzen(db: Tx, tabelle: Tabelle, zeile: ZeileWerte): void {
  const spalten = Object.keys(zeile)
  if (spalten.length === 0) {
    throw new WurzelFehler('INTERN_UNERWARTET', `rohErsetzen(): Zeile ohne Spalten für Tabelle "${tabelle}".`)
  }
  const spaltenPk = pkSpalten(db, tabelle)
  for (const spalte of spaltenPk) {
    if (!(spalte in zeile)) {
      throw new WurzelFehler('INTERN_UNERWARTET', `rohErsetzen(): Primärschlüsselspalte "${spalte}" fehlt in der Zeile für Tabelle "${tabelle}".`)
    }
  }
  const setListe = spalten.map((spalte) => `${spalte} = @${spalte}`).join(', ')
  const wo = spaltenPk.map((spalte) => `${spalte} = @${spalte}`).join(' AND ')
  db.prepare<ZeileWerte>(`UPDATE ${tabelle} SET ${setListe} WHERE ${wo}`).run(zeile)
}
