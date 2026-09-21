// AP-1.17 PR-A4 (docs/schema/0002_kern.sql §2.7). Nutzlast-/Ergebnistyp von
// `abfrage:negativbefund.liste` — alle Negativbefunde einer gesuchten Person (fürs Profil,
// AP-1.17 PR-C). Reine Zod-Schemata + abgeleitete `readonly`-Typen, kein Node/Electron/SQL —
// `src/shared` bleibt Electron-/SQL-frei (CLAUDE.md §2).
import { z } from 'zod'

/** Nutzlast von `abfrage:negativbefund.liste`. */
export interface NegativbefundListeEin {
  readonly gesuchtePersonId: string
}

export const negativbefundListeEinSchema: z.ZodType<NegativbefundListeEin> = z.object({
  gesuchtePersonId: z.string(),
})

/** Ein Eintrag der Liste — die vollständige `negativbefund`-Zeile (docs/schema/0002_kern.sql §2.7)
 * ohne technische Spalten (`erstellt_am`/`geaendert_am`). */
export interface NegativbefundEintrag {
  readonly id: string
  readonly quelleId: string | null
  readonly gesuchtePersonId: string
  readonly gesuchtesPraedikat: string | null
  readonly zeitraumVon: number | null
  readonly zeitraumBis: number | null
  readonly beschreibung: string | null
  readonly datumDerPruefung: string | null
}

export interface NegativbefundListeAus {
  readonly eintraege: readonly NegativbefundEintrag[]
}
