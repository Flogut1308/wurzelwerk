// §2.9 Medium (docs/schema/0002_kern.sql).
import { z } from 'zod'
import { DatumModifikatorEnum, DatumPraezisionEnum, KalenderEnum } from './gemeinsam'

export interface Medium {
  readonly id: string
  readonly dateiname?: string | undefined
  readonly relativer_pfad?: string | undefined
  readonly hash?: string | undefined
  readonly mime_typ?: string | undefined
  readonly groesse?: number | undefined
  readonly titel?: string | undefined
  readonly beschreibung?: string | undefined
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
  readonly ort_id?: string | undefined
}

export const mediumSchema: z.ZodType<Medium> = z.object({
  id: z.string(),
  dateiname: z.string().optional(),
  relativer_pfad: z.string().optional(),
  hash: z.string().optional(),
  mime_typ: z.string().optional(),
  groesse: z.number().int().optional(),
  titel: z.string().optional(),
  beschreibung: z.string().optional(),
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
  ort_id: z.string().optional(),
})
