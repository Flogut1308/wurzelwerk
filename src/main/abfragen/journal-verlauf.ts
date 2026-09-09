// AP-0.10 PR-A2, 55_Architektur.md §2.3/§4.7: `abfrage:journal.verlauf` - rein lesend, öffnet
// KEINE Transaktion (CLAUDE.md §2 gilt für `src/main/befehle/`). Erste Datei unter
// `src/main/abfragen/` (CLAUDE.md §2 Regel 4: `db.prepare` außerhalb von `repositories/` und
// `abfragen/` ist ein Fehler - hier ist es `abfragen/`).
import type Database from 'better-sqlite3'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { TransaktionArt, TransaktionStatus, VerlaufEintrag } from '../../shared/ipc/vertrag'

const TRANSAKTION_ARTEN: readonly TransaktionArt[] = ['nutzer', 'import', 'merge', 'migration', 'wartung', 'platzhalter_aufgeloest']
const TRANSAKTION_STATUS: readonly TransaktionStatus[] = ['angewendet', 'zurueckgenommen', 'verworfen']

/** Prüft einen rohen `transaktion.art`-Spaltenwert gegen die geschlossene Union (CLAUDE.md §4: kein unbegründetes `as`). */
function alsTransaktionArt(roh: string): TransaktionArt {
  const treffer = TRANSAKTION_ARTEN.find((art) => art === roh)
  if (treffer === undefined) {
    throw new WurzelFehler('INTERN_UNERWARTET', `journalVerlauf(): unbekannte transaktion.art "${roh}".`)
  }
  return treffer
}

/** Prüft einen rohen `transaktion.status`-Spaltenwert gegen die geschlossene Union (s. `alsTransaktionArt`). */
function alsTransaktionStatus(roh: string): TransaktionStatus {
  const treffer = TRANSAKTION_STATUS.find((status) => status === roh)
  if (treffer === undefined) {
    throw new WurzelFehler('INTERN_UNERWARTET', `journalVerlauf(): unbekannter transaktion.status "${roh}".`)
  }
  return treffer
}

interface TransaktionRow {
  readonly id: string
  readonly zeitpunkt: number
  readonly art: string
  readonly status: string
  readonly beschreibung: string | null
  readonly rueckgaengig_moeglich: number
}

/**
 * `abfrage:journal.verlauf` (AP-0.10, 55_Architektur.md §4.7): die letzten `grenze`
 * `transaktion`-Zeilen, neueste zuerst (`ORDER BY lfd DESC`). Spalten explizit aufgezählt
 * (CLAUDE.md §6: kein `SELECT *`), `grenze` als benannter Parameter.
 */
export function journalVerlauf(db: Database.Database, grenze: number): readonly VerlaufEintrag[] {
  const zeilen = db
    .prepare<{ readonly grenze: number }, TransaktionRow>(
      `SELECT id, zeitpunkt, art, status, beschreibung, rueckgaengig_moeglich
       FROM transaktion
       ORDER BY lfd DESC
       LIMIT @grenze`,
    )
    .all({ grenze })
  return zeilen.map((zeile) => ({
    id: zeile.id,
    zeitpunkt: zeile.zeitpunkt,
    art: alsTransaktionArt(zeile.art),
    status: alsTransaktionStatus(zeile.status),
    beschreibung: zeile.beschreibung,
    rueckgaengigMoeglich: zeile.rueckgaengig_moeglich === 1,
  }))
}
