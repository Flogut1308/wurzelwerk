// AP-0.8, 55_Architektur.md §4.5-Vorlage (`fuehreAus`): minimales Journal-Repository. AP-0.9
// ergänzt `naechsteLfd`/`transaktionVerwerfen`/`status` für den echten Befehlsbus
// (`src/main/befehle/bus.ts`) - `undoZiel`/Wiederholen bleiben AP-0.10 (CLAUDE.md §10: nicht
// vorgreifen).
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { JournalStatusNutzlast } from '../../shared/ipc/vertrag'
import type { Tx } from './basis'

/** Deckt `transaktion.art` (`docs/schema/0001_grundgeruest.sql`-CHECK) als geschlossene Union ab. */
export type TransaktionArt = 'nutzer' | 'import' | 'merge' | 'migration' | 'wartung' | 'platzhalter_aufgeloest'

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

interface UndoKandidatZeile {
  readonly beschreibung: string | null
}

/** Journalstatus für `ereignis:journalStatus` (AP-0.9) - Grundlage für Undo/Redo-Menüzustand (AP-0.10). */
export function status(tx: Tx): JournalStatusNutzlast {
  const undoKandidat = tx
    .prepare<[], UndoKandidatZeile>(
      `SELECT beschreibung FROM transaktion
       WHERE status = 'angewendet' AND rueckgaengig_moeglich = 1
       ORDER BY lfd DESC LIMIT 1`,
    )
    .get()
  const redoKandidat = tx
    .prepare<[], UndoKandidatZeile>(
      `SELECT beschreibung FROM transaktion
       WHERE status = 'zurueckgenommen'
       ORDER BY lfd ASC LIMIT 1`,
    )
    .get()

  return {
    undoMoeglich: undoKandidat !== undefined,
    redoMoeglich: redoKandidat !== undefined,
    undoBeschreibung: undoKandidat?.beschreibung ?? null,
    redoBeschreibung: redoKandidat?.beschreibung ?? null,
  }
}
