// AP-0.8, 55_Architektur.md §4.5-Vorlage (`fuehreAus`): minimales Journal-Repository. Nur das, was
// AP-0.8 selbst braucht - `undoZiel`/Wiederholen/etc. sind AP-0.9/AP-0.10 (CLAUDE.md §10: nicht
// vorgreifen).
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
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
