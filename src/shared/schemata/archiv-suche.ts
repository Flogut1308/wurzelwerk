// AP-1.17 PR-A1 (B-07): Nutzlast-/Ergebnistyp von `abfrage:archiv.suche` (55_Architektur.md §5).
// Reine Zod-Schemata + abgeleitete `readonly`-Typen, kein Node/Electron/SQL — `src/shared` bleibt
// Electron-/SQL-frei (CLAUDE.md §2). Muster identisch zu `src/shared/schemata/ort-suche.ts`, ohne
// die dortige zeitabhängige Namensgeschichte/politische Kette — `archiv` hat nur EINEN Namen.
import { z } from 'zod'

/** Nutzlast von `abfrage:archiv.suche`. Leerer `text` liefert bewusst KEINE Treffer (s.
 * `src/main/abfragen/archiv-suche.ts`-Kopfkommentar, analog `ort-suche.ts`). */
export interface ArchivSucheEin {
  readonly text: string
  readonly grenze?: number | undefined
}

export const archivSucheEinSchema: z.ZodType<ArchivSucheEin> = z.object({
  text: z.string(),
  grenze: z.number().int().min(1).max(200).optional(),
})

/** Ein Suchtreffer — `name` UND das optionale `ortId` (FK, `docs/schema/0002_kern.sql` §2.7), damit
 * ein Aufrufer bei Bedarf den zugehörigen Ort nachschlagen kann (analog `OrtTreffer.id`). */
export interface ArchivTreffer {
  readonly id: string
  readonly name: string
  readonly ortId?: string | undefined
}

export interface ArchivSucheAus {
  readonly treffer: readonly ArchivTreffer[]
}
