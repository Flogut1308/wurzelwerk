// AP-0.11, 55_Architektur.md §6.2 (F-04, ADR-003): einzige SQL-Stelle für `VACUUM INTO` und die
// Integritätsprüfung der entstandenen Kopie (CLAUDE.md §2 Regel 4: `db.prepare`/`db.exec` nur in
// `repositories/`/`abfragen/`). Öffnet KEINE Transaktion (CLAUDE.md §2 Regel 3 bleibt
// `src/main/befehle/` vorbehalten) - `VACUUM INTO` läuft ohnehin außerhalb einer Transaktion
// (SQLite-Einschränkung: `VACUUM` ist innerhalb eines expliziten `BEGIN`/`COMMIT` nicht erlaubt).
import Database from 'better-sqlite3'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from './basis'

/**
 * Erzeugt eine konsistente Kopie der offenen Datenbank per `VACUUM INTO` — lockfrei im laufenden
 * Betrieb (55_Architektur.md §6.2, der Grund, warum SQLite hier die richtige Wahl war, ADR-002).
 * Benannter, gebundener Parameter (CLAUDE.md §6) - Projekt- und Ordnernamen können Apostrophe
 * enthalten (O'Brien, d'Aboville, §11), eine String-Verkettung wäre hier ein Injektionsrisiko.
 */
export function vacuumInto(tx: Tx, zielPfad: string): void {
  tx.prepare('VACUUM INTO @zielPfad').run({ zielPfad })
}

interface IntegritaetZeile {
  readonly integrity_check: string
}

/**
 * Öffnet die soeben erzeugte Kopie schreibgeschützt und prüft `PRAGMA integrity_check`
 * (55_Architektur.md §6.2) — `VACUUM INTO` liefert selten, aber nicht nie, eine beschädigte Kopie
 * (z. B. eine volle Festplatte während des Schreibens). Wirft `DATEI_KEIN_PLATZ`, wenn die Kopie
 * nicht `'ok'` meldet - dieselbe Fehlerklasse wie bei anderen Schreibfehlschlägen dieses Bereichs
 * (CLAUDE.md-Auftrag AP-0.11: keine neuen Fehlercodes).
 */
export function schnappschussIntegritaetPruefen(pfad: string): void {
  const pruefverbindung = new Database(pfad, { readonly: true, fileMustExist: true })
  try {
    const zeile = pruefverbindung.prepare<[], IntegritaetZeile>('PRAGMA integrity_check').get()
    if (zeile === undefined || zeile.integrity_check !== 'ok') {
      throw new WurzelFehler('DATEI_KEIN_PLATZ')
    }
  } finally {
    pruefverbindung.close()
  }
}
