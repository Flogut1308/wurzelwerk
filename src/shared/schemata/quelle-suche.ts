// AP-1.29 PR-A (docs/schema/0002_kern.sql §2.7). Nutzlast-/Ergebnistyp von `abfrage:quelle.suche`
// — Muster identisch zu `src/shared/schemata/archiv-suche.ts`, hier über `titel` UND `autor`
// (beides optionale Freitextfelder, s. `./quelle`), damit ein Nutzer eine Quelle sowohl über den
// Titel als auch über den Autorennamen wiederfinden kann. Reine Zod-Schemata + abgeleitete
// `readonly`-Typen, kein Node/Electron/SQL — `src/shared` bleibt Electron-/SQL-frei (CLAUDE.md §2).
import { z } from 'zod'
import { QuelleTypEnum } from './quelle'

/** Nutzlast von `abfrage:quelle.suche`. Leerer/whitespace `text` liefert bewusst KEINE Treffer (s.
 * `src/main/abfragen/quelle-suche.ts`-Kopfkommentar, analog `archiv-suche.ts`/`ort-suche.ts`). */
export interface QuelleSucheEin {
  readonly text: string
  readonly grenze?: number | undefined
}

export const quelleSucheEinSchema: z.ZodType<QuelleSucheEin> = z.object({
  text: z.string(),
  grenze: z.number().int().min(1).max(200).optional(),
})

/** Ein Suchtreffer — `titel`/`autor` bleiben `null`, wenn die jeweilige Spalte in `quelle` nicht
 * gesetzt ist (beide optional, s. `./quelle`); ein Treffer kann über eines von beiden entstanden
 * sein, während das andere Feld leer ist. */
export interface QuelleTreffer {
  readonly id: string
  readonly titel: string | null
  readonly autor: string | null
  readonly typ: z.infer<typeof QuelleTypEnum>
}

export interface QuelleSucheAus {
  readonly treffer: readonly QuelleTreffer[]
}
