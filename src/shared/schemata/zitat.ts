// §2.7 Zitat (docs/schema/0002_kern.sql).
import { z } from 'zod'
import { DatumModifikatorEnum, DatumPraezisionEnum, KalenderEnum, KonfidenzSchema } from './gemeinsam'

export interface Zitat {
  readonly id: string
  readonly quelle_id: string
  readonly seite?: string | undefined
  readonly eintragsnummer?: string | undefined
  readonly band?: string | undefined
  readonly jahr?: number | undefined
  readonly zugriffsdatum_kalender?: z.infer<typeof KalenderEnum> | undefined
  readonly zugriffsdatum_modifikator?: z.infer<typeof DatumModifikatorEnum> | undefined
  readonly zugriffsdatum_praezision?: z.infer<typeof DatumPraezisionEnum> | undefined
  readonly zugriffsdatum_wert1?: string | undefined
  readonly zugriffsdatum_wert2?: string | undefined
  readonly zugriffsdatum_originaltext?: string | undefined
  readonly zugriffsdatum_sort_von?: number | undefined
  readonly zugriffsdatum_sort_bis?: number | undefined
  readonly zugriffsdatum_zweitkalender?: z.infer<typeof KalenderEnum> | undefined
  readonly zugriffsdatum_zweitwert?: string | undefined
  readonly zugriffsdatum_doppeljahr?: string | undefined
  readonly digitalisat_url?: string | undefined
  readonly transkript?: string | undefined
  readonly uebersetzung?: string | undefined
  readonly konfidenz?: number | undefined
  readonly medium_id?: string | undefined
}

export const zitatSchema: z.ZodType<Zitat> = z.object({
  id: z.string(),
  quelle_id: z.string(),
  seite: z.string().optional(),
  eintragsnummer: z.string().optional(),
  band: z.string().optional(),
  jahr: z.number().int().optional(),
  zugriffsdatum_kalender: KalenderEnum.optional(),
  zugriffsdatum_modifikator: DatumModifikatorEnum.optional(),
  zugriffsdatum_praezision: DatumPraezisionEnum.optional(),
  zugriffsdatum_wert1: z.string().optional(),
  zugriffsdatum_wert2: z.string().optional(),
  zugriffsdatum_originaltext: z.string().optional(),
  zugriffsdatum_sort_von: z.number().int().optional(),
  zugriffsdatum_sort_bis: z.number().int().optional(),
  zugriffsdatum_zweitkalender: KalenderEnum.optional(),
  zugriffsdatum_zweitwert: z.string().optional(),
  zugriffsdatum_doppeljahr: z.string().optional(),
  digitalisat_url: z.string().optional(),
  transkript: z.string().optional(),
  uebersetzung: z.string().optional(),
  konfidenz: KonfidenzSchema.optional(),
  medium_id: z.string().optional(),
})
