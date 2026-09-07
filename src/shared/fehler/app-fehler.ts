import type { FehlerCode } from './codes'

/**
 * Der einzige Fehlertyp, der über die IPC-Grenze reist (55_Architektur.md §2.2, ADR-016).
 * `textSchluessel` ist ein i18n-Schlüssel, nie ein fertiger Satz — die Übersetzung passiert
 * im Renderer (ADR-011).
 */
export interface AppFehler {
  readonly code: FehlerCode
  readonly textSchluessel: string
  readonly vorgangsId: string
  readonly parameter?: Readonly<Record<string, string | number>>
  readonly feld?: string
  readonly details?: string
}
