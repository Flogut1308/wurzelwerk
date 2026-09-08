// §2.5 Ereignis (docs/schema/0002_kern.sql).
import { z } from 'zod'
import { DatumModifikatorEnum, DatumPraezisionEnum, KalenderEnum } from './gemeinsam'

export const EreignisTypEnum = z.enum(['geburt', 'taufe', 'konfirmation', 'trauung', 'kirchl_trauung', 'verlobung', 'scheidung', 'tod', 'beerdigung', 'auswanderung', 'einwanderung', 'umzug', 'beruf', 'militaerdienst', 'volkszaehlung', 'testament', 'sonstiges'])

export interface Ereignis {
  readonly id: string
  readonly typ: z.infer<typeof EreignisTypEnum>
  readonly ort_id?: string | undefined
  readonly datum_kalender?: z.infer<typeof KalenderEnum> | undefined
  readonly datum_modifikator?: z.infer<typeof DatumModifikatorEnum> | undefined
  readonly datum_praezision?: z.infer<typeof DatumPraezisionEnum> | undefined
  readonly datum_wert1?: string | undefined
  readonly datum_wert2?: string | undefined
  readonly datum_originaltext?: string | undefined
  readonly datum_sort_von?: number | undefined
  readonly datum_sort_bis?: number | undefined
  readonly datum_zweitkalender?: z.infer<typeof KalenderEnum> | undefined
  readonly datum_zweitwert?: string | undefined
  readonly datum_doppeljahr?: string | undefined
  readonly beschreibung?: string | undefined
  readonly notiz?: string | undefined
}

export const ereignisSchema: z.ZodType<Ereignis> = z.object({
  id: z.string(),
  typ: EreignisTypEnum,
  ort_id: z.string().optional(),
  datum_kalender: KalenderEnum.optional(),
  datum_modifikator: DatumModifikatorEnum.optional(),
  datum_praezision: DatumPraezisionEnum.optional(),
  datum_wert1: z.string().optional(),
  datum_wert2: z.string().optional(),
  datum_originaltext: z.string().optional(),
  datum_sort_von: z.number().int().optional(),
  datum_sort_bis: z.number().int().optional(),
  datum_zweitkalender: KalenderEnum.optional(),
  datum_zweitwert: z.string().optional(),
  datum_doppeljahr: z.string().optional(),
  beschreibung: z.string().optional(),
  notiz: z.string().optional(),
})
