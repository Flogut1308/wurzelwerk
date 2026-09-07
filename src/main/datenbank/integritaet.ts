import type Database from 'better-sqlite3'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'

/** Typwächter für eine `PRAGMA quick_check`-Ergebniszeile, ohne `as` auf einen unbekannten Wert. */
function istQuickCheckZeile(wert: unknown): wert is { readonly quick_check: unknown } {
  return typeof wert === 'object' && wert !== null && 'quick_check' in wert
}

/**
 * `PRAGMA quick_check` (55_Architektur.md §9.3) — der erste Schritt beim Öffnen, vor jeder
 * Migration. Eine beschädigte Datei soll auffallen, bevor irgendetwas versucht, sie zu lesen oder
 * zu migrieren. `quick_check` liefert bei einer intakten Datenbank genau eine Zeile mit dem Wert
 * `'ok'`; jede Abweichung (Fehlermeldungszeilen oder mehrere Zeilen) ist ein Integritätsfehler.
 */
export function integritaetPruefen(db: Database.Database): void {
  let ergebnis: unknown
  try {
    // Eine Datei, die gar kein SQLite-Format hat (z. B. Bytes einer anderen Art in eine .sqlite
    // geschrieben), lässt `PRAGMA quick_check` nicht mit einem Ergebnis zurückkehren, sondern
    // wirft selbst (`SQLITE_NOTADB`) — das ist ebenfalls ein Integritätsfehler.
    ergebnis = db.pragma('quick_check')
  } catch {
    throw new WurzelFehler('DATENBANK_INTEGRITAET')
  }
  const zeilen = Array.isArray(ergebnis) ? ergebnis : []
  const ersteZeile: unknown = zeilen.length === 1 ? zeilen[0] : undefined
  const istOk = istQuickCheckZeile(ersteZeile) && ersteZeile.quick_check === 'ok'

  if (!istOk) {
    throw new WurzelFehler('DATENBANK_INTEGRITAET')
  }
}
