import type { AppFehler } from '../fehler/app-fehler'

/**
 * Über IPC fliegen keine Ausnahmen (§7, ADR-016). Jeder Kanal liefert dieses Ergebnis, nie einen
 * geworfenen Fehler — `ok` ist die diskriminierende Eigenschaft.
 */
export type Ergebnis<T> = { readonly ok: true; readonly daten: T } | { readonly ok: false; readonly fehler: AppFehler }
