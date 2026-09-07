import type { FehlerCode } from './codes'

/**
 * Domänen-Fehler, den Handler in `src/main/` gezielt werfen, wenn ein konkreter `FehlerCode`
 * feststeht (z. B. `PROJEKT_KEIN_WURZELWERK_ORDNER`). `src/main/ipc/huelle.ts` erkennt diesen Typ
 * vor dem SQLite-Zweig und reicht `code` unverändert durch, statt ihn auf `INTERN_UNERWARTET`
 * abzubilden (§7, ADR-016).
 */
export class WurzelFehler extends Error {
  public readonly code: FehlerCode

  public constructor(code: FehlerCode, message?: string) {
    super(message ?? code)
    this.code = code
    this.name = 'WurzelFehler'
  }
}
