// AP-0.8, 55_Architektur.md §4.5-Vorlage (`fuehreAus`): minimales Journal-Repository. AP-0.9
// ergänzt `naechsteLfd`/`transaktionVerwerfen`/`status` für den echten Befehlsbus
// (`src/main/befehle/bus.ts`). AP-0.10 ergänzt `undoZiel`/`redoZiel`/`statusSetzen`/
// `redoStapelVerwerfen`/`aenderungen` für den Undo-Algorithmus (`src/main/journal/undo.ts`,
// 55_Architektur.md §4.7/§4.9).
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { JournalStatusNutzlast, TransaktionArt, TransaktionStatus } from '../../shared/ipc/vertrag'
import type { Tx } from './basis'

// `TransaktionArt`/`TransaktionStatus` stehen seit AP-0.10 PR-A2 in `src/shared/ipc/vertrag.ts`
// (dort begründet) — hier nur re-exportiert, damit bestehende Importe (`src/main/befehle/
// registrierung.ts`) unverändert bleiben.
export type { TransaktionArt, TransaktionStatus }

export interface TransaktionAnlegenEin {
  readonly id: string
  readonly zeitpunkt: number
  readonly art: TransaktionArt
  readonly lfd: number
  readonly bearbeiter?: string | null
  readonly beschreibung?: string | null
  readonly koaleszenzSchluessel?: string | null
}

/** Legt eine `transaktion`-Zeile an (benannte Parameter, CLAUDE.md §6). Öffnet selbst keine Transaktion (CLAUDE.md §2 gilt für `src/main/befehle/`). */
export function transaktionAnlegen(tx: Tx, ein: TransaktionAnlegenEin): void {
  tx.prepare(
    `INSERT INTO transaktion (id, zeitpunkt, bearbeiter, beschreibung, art, lfd, koaleszenz_schluessel)
     VALUES (@id, @zeitpunkt, @bearbeiter, @beschreibung, @art, @lfd, @koaleszenzSchluessel)`,
  ).run({
    id: ein.id,
    zeitpunkt: ein.zeitpunkt,
    bearbeiter: ein.bearbeiter ?? null,
    beschreibung: ein.beschreibung ?? null,
    art: ein.art,
    lfd: ein.lfd,
    koaleszenzSchluessel: ein.koaleszenzSchluessel ?? null,
  })
}

interface BetroffeneZeile {
  readonly anzahl: number
}

/** Anzahl der `aenderung`-Zeilen einer Transaktion — Grundlage für "eine Transaktion ohne aenderung-Zeilen wird verworfen" (AP-0.9, hier nur die Abfrage). */
export function betroffene(tx: Tx, transaktionId: string): number {
  const zeile = tx
    .prepare<{ readonly transaktionId: string }, BetroffeneZeile>(
      'SELECT COUNT(*) AS anzahl FROM aenderung WHERE transaktion_id = @transaktionId',
    )
    .get({ transaktionId })
  if (zeile === undefined) {
    // COUNT(*) liefert immer genau eine Zeile — dieser Zweig ist defensiv (CLAUDE.md §4: kein `!`).
    throw new WurzelFehler('INTERN_UNERWARTET', 'betroffene(): COUNT(*)-Abfrage lieferte unerwartet keine Zeile.')
  }
  return zeile.anzahl
}

interface LfdZeile {
  readonly naechste: number
}

/** Nächste laufende Nummer für `transaktion.lfd` (AP-0.9): `MAX(lfd)+1`, oder `1` in einer leeren Tabelle. */
export function naechsteLfd(tx: Tx): number {
  const zeile = tx.prepare<[], LfdZeile>('SELECT COALESCE(MAX(lfd), 0) + 1 AS naechste FROM transaktion').get()
  if (zeile === undefined) {
    // COALESCE(MAX(...), 0) + 1 liefert immer genau eine Zeile — dieser Zweig ist defensiv (CLAUDE.md §4: kein `!`).
    throw new WurzelFehler('INTERN_UNERWARTET', 'naechsteLfd(): Abfrage lieferte unerwartet keine Zeile.')
  }
  return zeile.naechste
}

/**
 * Verwirft eine `transaktion`-Zeile wieder (AP-0.9): der Befehlsbus ruft dies auf, wenn ein Befehl
 * keine einzige `aenderung`-Zeile erzeugt hat - innerhalb derselben Transaktionsklammer, bevor
 * `COMMIT` läuft, damit keine leere Transaktionszeile im Journal übrig bleibt.
 */
export function transaktionVerwerfen(tx: Tx, transaktionId: string): void {
  tx.prepare('DELETE FROM transaktion WHERE id = @id').run({ id: transaktionId })
}

interface TransaktionZielRow {
  readonly id: string
  readonly art: string
  readonly beschreibung: string | null
  readonly snapshot_pfad: string | null
}

/** Ziel eines Undo- oder Redo-Schritts (55_Architektur.md §4.7/§4.9, AP-0.10). */
export interface JournalTransaktionZiel {
  readonly id: string
  readonly art: string
  readonly beschreibung: string | null
  readonly snapshotPfad: string | null
}

function transaktionZielLesen(tx: Tx, sql: string): JournalTransaktionZiel | undefined {
  const zeile = tx.prepare<[], TransaktionZielRow>(sql).get()
  if (zeile === undefined) {
    return undefined
  }
  return { id: zeile.id, art: zeile.art, beschreibung: zeile.beschreibung, snapshotPfad: zeile.snapshot_pfad }
}

const UNDO_ZIEL_SQL = `SELECT id, art, beschreibung, snapshot_pfad FROM transaktion
   WHERE status = 'angewendet' AND rueckgaengig_moeglich = 1
   ORDER BY lfd DESC LIMIT 1`

const REDO_ZIEL_SQL = `SELECT id, art, beschreibung, snapshot_pfad FROM transaktion
   WHERE status = 'zurueckgenommen'
   ORDER BY lfd ASC LIMIT 1`

/**
 * Undo-Ziel (55_Architektur.md §4.7): neueste Transaktion mit `status = 'angewendet'` UND
 * `rueckgaengig_moeglich = 1`. Verwendet von `src/main/journal/undo.ts` UND von `status()` unten
 * (Menü-Anzeige) - dieselbe Abfrage an beiden Stellen, damit Menü-Anzeige und tatsächliches Undo
 * nie auseinanderlaufen (AP-0.10-Auftrag).
 */
export function undoZiel(tx: Tx): JournalTransaktionZiel | undefined {
  return transaktionZielLesen(tx, UNDO_ZIEL_SQL)
}

/** Redo-Ziel (55_Architektur.md §4.7): älteste Transaktion mit `status = 'zurueckgenommen'`. */
export function redoZiel(tx: Tx): JournalTransaktionZiel | undefined {
  return transaktionZielLesen(tx, REDO_ZIEL_SQL)
}

/** Journalstatus für `ereignis:journalStatus` (AP-0.9) - baut auf `undoZiel()`/`redoZiel()` auf (s. dort). */
export function status(tx: Tx): JournalStatusNutzlast {
  const undoKandidat = undoZiel(tx)
  const redoKandidat = redoZiel(tx)

  return {
    undoMoeglich: undoKandidat !== undefined,
    redoMoeglich: redoKandidat !== undefined,
    undoBeschreibung: undoKandidat?.beschreibung ?? null,
    redoBeschreibung: redoKandidat?.beschreibung ?? null,
  }
}

/** Setzt `transaktion.status` (AP-0.10, 55_Architektur.md §4.7/§4.9) - benannte Parameter (CLAUDE.md §6). */
export function statusSetzen(tx: Tx, transaktionId: string, status: TransaktionStatus): void {
  tx.prepare('UPDATE transaktion SET status = @status WHERE id = @id').run({ id: transaktionId, status })
}

/**
 * Verwirft den kompletten Redo-Stapel (55_Architektur.md §4.7): sobald ein neuer Befehl läuft,
 * werden alle `zurueckgenommen`-Transaktionen auf `verworfen` gesetzt - das lineare Undo-Modell.
 * Aufgerufen vom Befehlsbus (`src/main/befehle/bus.ts`), NICHT für eine leere (verworfene)
 * Transaktion.
 */
export function redoStapelVerwerfen(tx: Tx): void {
  tx.prepare(`UPDATE transaktion SET status = 'verworfen' WHERE status = 'zurueckgenommen'`).run()
}

/** Eine `aenderung`-Zeile, roh für den Undo-Algorithmus (55_Architektur.md §4.9, AP-0.10). */
export interface AenderungZeileFuerUndo {
  readonly operation: string
  readonly tabelle: string
  readonly datensatzId: string
  readonly wertAltJson: string | null
  readonly wertNeuJson: string | null
}

interface AenderungRow {
  readonly operation: string
  readonly tabelle: string
  readonly datensatz_id: string
  readonly wert_alt_json: string | null
  readonly wert_neu_json: string | null
}

/**
 * `aenderung`-Zeilen einer Transaktion, sortiert nach `reihenfolge` (55_Architektur.md §4.9,
 * AP-0.10): `richtung = 'DESC'` für Undo (rückwärts), `'ASC'` für Redo (vorwärts). Spalten
 * explizit aufgezählt (CLAUDE.md §6: kein `SELECT *`). `operation`/`tabelle` bleiben als `string`
 * typisiert statt auf eine engere Union verengt (analog zu `TransaktionZeile.status` in
 * `test/einheit/befehl-bus.test.ts`) - so bleibt `src/main/journal/undo.ts` ohne ein
 * unbegründetes `as` lesbar (CLAUDE.md §4).
 */
/** Eine Transaktionszeile für die Journalbegrenzung (55_Architektur.md §4.6, AP-0.11) — unabhängig vom `status`: auch zurückgenommene/verworfene Transaktionen behalten ihre `aenderung`-Zeilen bis zum Aufräumen. */
export interface AlteTransaktionZeile {
  readonly id: string
  readonly zeitpunktMs: number
  readonly lfd: number
}

interface AlteTransaktionRow {
  readonly id: string
  readonly zeitpunkt: number
  readonly lfd: number
}

/** Alle `transaktion`-Zeilen, Grundlage für `zuBegrenzendeTransaktionen()` (`src/core/journal/begrenzung-auswahl.ts`, AP-0.11). */
export function alteTransaktionenLesen(tx: Tx): readonly AlteTransaktionZeile[] {
  return tx
    .prepare<[], AlteTransaktionRow>('SELECT id, zeitpunkt, lfd FROM transaktion ORDER BY lfd')
    .all()
    .map((zeile) => ({ id: zeile.id, zeitpunktMs: zeile.zeitpunkt, lfd: zeile.lfd }))
}

/**
 * Löscht die `aenderung`-Zeilen der übergebenen Transaktionen (55_Architektur.md §4.6, AP-0.11) —
 * die `transaktion`-Zeile selbst bleibt für immer (der Verlauf bleibt lesbar). Ein `IN (...)` mit
 * zusammengesetztem SQL wird bewusst vermieden (CLAUDE.md §6) — stattdessen ein vorbereitetes
 * Statement je Aufruf, einmal pro ID mit benanntem Parameter ausgeführt.
 */
export function aenderungenLoeschen(tx: Tx, transaktionIds: readonly string[]): void {
  if (transaktionIds.length === 0) {
    return
  }
  const anweisung = tx.prepare('DELETE FROM aenderung WHERE transaktion_id = @id')
  for (const id of transaktionIds) {
    anweisung.run({ id })
  }
}

/** Setzt `transaktion.rueckgaengig_moeglich = 0` für die übergebenen IDs (55_Architektur.md §4.6, AP-0.11) — benannter Parameter je Aufruf (s. `aenderungenLoeschen`). */
export function rueckgaengigMoeglichAberkennen(tx: Tx, transaktionIds: readonly string[]): void {
  if (transaktionIds.length === 0) {
    return
  }
  const anweisung = tx.prepare('UPDATE transaktion SET rueckgaengig_moeglich = 0 WHERE id = @id')
  for (const id of transaktionIds) {
    anweisung.run({ id })
  }
}

/** Kandidat für die Koaleszenz (55_Architektur.md §4.8, AP-0.15) — die zuletzt vorangegangene Transaktion (`lfd < neuLfd`), unabhängig von Art/Status/Schlüssel; die Filterung übernimmt `src/main/journal/koaleszenz.ts`. */
export interface KoaleszenzKandidat {
  readonly id: string
  readonly lfd: number
  readonly zeitpunktMs: number
  readonly art: string
  readonly status: string
  readonly koaleszenzSchluessel: string | null
}

interface KoaleszenzKandidatRow {
  readonly id: string
  readonly lfd: number
  readonly zeitpunkt: number
  readonly art: string
  readonly status: string
  readonly koaleszenz_schluessel: string | null
}

/** Die unmittelbar vorangegangene Transaktion (nach `lfd`), Grundlage der Koaleszenz-Entscheidung (55_Architektur.md §4.8, AP-0.15). */
export function koaleszenzKandidat(tx: Tx, neuLfd: number): KoaleszenzKandidat | undefined {
  const zeile = tx
    .prepare<{ readonly neuLfd: number }, KoaleszenzKandidatRow>(
      `SELECT id, lfd, zeitpunkt, art, status, koaleszenz_schluessel
       FROM transaktion WHERE lfd < @neuLfd ORDER BY lfd DESC LIMIT 1`,
    )
    .get({ neuLfd })
  if (zeile === undefined) {
    return undefined
  }
  return {
    id: zeile.id,
    lfd: zeile.lfd,
    zeitpunktMs: zeile.zeitpunkt,
    art: zeile.art,
    status: zeile.status,
    koaleszenzSchluessel: zeile.koaleszenz_schluessel,
  }
}

/** Eine `aenderung`-Zeile, roh für die Koaleszenz-Verdichtung (55_Architektur.md §4.8, AP-0.15) — `operation` bleibt `string` (analog zu `AenderungZeileFuerUndo`), die Verengung auf `JournalOperation` übernimmt der Aufrufer (`src/main/journal/koaleszenz.ts`) ohne `as` (CLAUDE.md §4). */
export interface AenderungRohZeile {
  readonly reihenfolge: number
  readonly tabelle: string
  readonly datensatzId: string
  readonly feld: string | null
  readonly wertAltJson: string | null
  readonly wertNeuJson: string | null
  readonly operation: string
}

interface AenderungRohRow {
  readonly reihenfolge: number
  readonly tabelle: string
  readonly datensatz_id: string
  readonly feld: string | null
  readonly wert_alt_json: string | null
  readonly wert_neu_json: string | null
  readonly operation: string
}

/** `aenderung`-Zeilen einer Transaktion, sortiert nach `reihenfolge` (55_Architektur.md §4.8, AP-0.15) — für die Koaleszenz-Verdichtung, unabhängig von der Undo-Richtungsvariante `aenderungen()` oben. */
export function aenderungenRoh(tx: Tx, transaktionId: string): readonly AenderungRohZeile[] {
  return tx
    .prepare<{ readonly transaktionId: string }, AenderungRohRow>(
      `SELECT reihenfolge, tabelle, datensatz_id, feld, wert_alt_json, wert_neu_json, operation
       FROM aenderung WHERE transaktion_id = @transaktionId ORDER BY reihenfolge ASC`,
    )
    .all({ transaktionId })
    .map((zeile) => ({
      reihenfolge: zeile.reihenfolge,
      tabelle: zeile.tabelle,
      datensatzId: zeile.datensatz_id,
      feld: zeile.feld,
      wertAltJson: zeile.wert_alt_json,
      wertNeuJson: zeile.wert_neu_json,
      operation: zeile.operation,
    }))
}

/** Nutzlast für `aenderungEinfuegen()` (55_Architektur.md §4.8, AP-0.15) — benannte Parameter (CLAUDE.md §6). */
export interface AenderungEinfuegenEin {
  readonly id: string
  readonly transaktionId: string
  readonly reihenfolge: number
  readonly tabelle: string
  readonly datensatzId: string
  readonly feld: string | null
  readonly wertAltJson: string | null
  readonly wertNeuJson: string | null
  readonly operation: string
}

/** Fügt eine `aenderung`-Zeile direkt ein (55_Architektur.md §4.8, AP-0.15) — für die verdichteten Zeilen der Koaleszenz, die NICHT über die `jrn_*`-Trigger entstehen (der ursprüngliche Schreibvorgang ist bereits gelaufen, hier wird nur das Journal umgeschrieben). */
export function aenderungEinfuegen(tx: Tx, ein: AenderungEinfuegenEin): void {
  tx.prepare(
    `INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, feld, wert_alt_json, wert_neu_json, operation)
     VALUES (@id, @transaktionId, @reihenfolge, @tabelle, @datensatzId, @feld, @wertAltJson, @wertNeuJson, @operation)`,
  ).run({
    id: ein.id,
    transaktionId: ein.transaktionId,
    reihenfolge: ein.reihenfolge,
    tabelle: ein.tabelle,
    datensatzId: ein.datensatzId,
    feld: ein.feld,
    wertAltJson: ein.wertAltJson,
    wertNeuJson: ein.wertNeuJson,
    operation: ein.operation,
  })
}

/** Setzt `transaktion.zeitpunkt` (55_Architektur.md §4.8, AP-0.15) — das gleitende Koaleszenz-Fenster verschiebt den Zeitpunkt der zusammengefassten Transaktion auf den der jüngsten Änderung. */
export function transaktionZeitpunktSetzen(tx: Tx, transaktionId: string, zeitpunktMs: number): void {
  tx.prepare('UPDATE transaktion SET zeitpunkt = @zeitpunkt WHERE id = @id').run({ id: transaktionId, zeitpunkt: zeitpunktMs })
}

export function aenderungen(tx: Tx, transaktionId: string, richtung: 'ASC' | 'DESC'): readonly AenderungZeileFuerUndo[] {
  // `richtung` ist eine geschlossene Union ('ASC'|'DESC'), kein Bindeparameter möglich (ORDER BY
  // erlaubt in SQLite ohnehin keine Werte-Bindung, CLAUDE.md §6 gilt für Werte, nicht für dieses
  // Schlüsselwort).
  const sql = `SELECT operation, tabelle, datensatz_id, wert_alt_json, wert_neu_json
     FROM aenderung WHERE transaktion_id = @transaktionId
     ORDER BY reihenfolge ${richtung}`
  return tx
    .prepare<{ readonly transaktionId: string }, AenderungRow>(sql)
    .all({ transaktionId })
    .map((zeile) => ({
      operation: zeile.operation,
      tabelle: zeile.tabelle,
      datensatzId: zeile.datensatz_id,
      wertAltJson: zeile.wert_alt_json,
      wertNeuJson: zeile.wert_neu_json,
    }))
}
