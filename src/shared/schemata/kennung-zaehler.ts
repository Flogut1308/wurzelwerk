// kennung_zaehler (docs/schema/0007_kennung_textanker.sql, AP-1.34): Zähler für die fortlaufende
// Personen-Kennung (`person.kennung`). NICHT_JOURNALISIERT (Undo lässt ihn stehen, eine Nummer wird
// nie neu vergeben), läuft per Trigger nur vorwärts. `bereich` spiegelt `CHECK (bereich IN (…))`.
import { z } from 'zod'

export const KennungBereichEnum = z.enum(['person'])

export type KennungBereich = z.infer<typeof KennungBereichEnum>

export interface KennungZaehler {
  readonly bereich: KennungBereich
  readonly naechste: number
}

export const kennungZaehlerSchema: z.ZodType<KennungZaehler> = z.object({
  bereich: KennungBereichEnum,
  naechste: z.number().int().min(1),
})
