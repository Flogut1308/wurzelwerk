// §2.6 Partnerschaft (docs/schema/0002_kern.sql).
import { z } from 'zod'
import { DatumModifikatorEnum, DatumPraezisionEnum, KalenderEnum } from './gemeinsam'

export const PartnerschaftTypEnum = z.enum(['ehe_zivil', 'ehe_kirchlich', 'verlobung', 'lebensgemeinschaft', 'eingetr_lebenspartnerschaft', 'unbekannt'])
export const EndeGrundEnum = z.enum(['scheidung', 'annullierung', 'tod', 'trennung', 'unbekannt'])

export interface Partnerschaft {
  readonly id: string
  readonly typ: z.infer<typeof PartnerschaftTypEnum>
  readonly beginn_kalender?: z.infer<typeof KalenderEnum> | undefined
  readonly beginn_modifikator?: z.infer<typeof DatumModifikatorEnum> | undefined
  readonly beginn_praezision?: z.infer<typeof DatumPraezisionEnum> | undefined
  readonly beginn_wert1?: string | undefined
  readonly beginn_wert2?: string | undefined
  readonly beginn_originaltext?: string | undefined
  readonly beginn_sort_von?: number | undefined
  readonly beginn_sort_bis?: number | undefined
  readonly beginn_zweitkalender?: z.infer<typeof KalenderEnum> | undefined
  readonly beginn_zweitwert?: string | undefined
  readonly beginn_doppeljahr?: string | undefined
  readonly ende_kalender?: z.infer<typeof KalenderEnum> | undefined
  readonly ende_modifikator?: z.infer<typeof DatumModifikatorEnum> | undefined
  readonly ende_praezision?: z.infer<typeof DatumPraezisionEnum> | undefined
  readonly ende_wert1?: string | undefined
  readonly ende_wert2?: string | undefined
  readonly ende_originaltext?: string | undefined
  readonly ende_sort_von?: number | undefined
  readonly ende_sort_bis?: number | undefined
  readonly ende_zweitkalender?: z.infer<typeof KalenderEnum> | undefined
  readonly ende_zweitwert?: string | undefined
  readonly ende_doppeljahr?: string | undefined
  readonly ende_grund?: z.infer<typeof EndeGrundEnum> | undefined
  readonly reihenfolge?: number | undefined
  readonly notiz?: string | undefined
}

export const partnerschaftSchema: z.ZodType<Partnerschaft> = z.object({
  id: z.string(),
  typ: PartnerschaftTypEnum,
  beginn_kalender: KalenderEnum.optional(),
  beginn_modifikator: DatumModifikatorEnum.optional(),
  beginn_praezision: DatumPraezisionEnum.optional(),
  beginn_wert1: z.string().optional(),
  beginn_wert2: z.string().optional(),
  beginn_originaltext: z.string().optional(),
  beginn_sort_von: z.number().int().optional(),
  beginn_sort_bis: z.number().int().optional(),
  beginn_zweitkalender: KalenderEnum.optional(),
  beginn_zweitwert: z.string().optional(),
  beginn_doppeljahr: z.string().optional(),
  ende_kalender: KalenderEnum.optional(),
  ende_modifikator: DatumModifikatorEnum.optional(),
  ende_praezision: DatumPraezisionEnum.optional(),
  ende_wert1: z.string().optional(),
  ende_wert2: z.string().optional(),
  ende_originaltext: z.string().optional(),
  ende_sort_von: z.number().int().optional(),
  ende_sort_bis: z.number().int().optional(),
  ende_zweitkalender: KalenderEnum.optional(),
  ende_zweitwert: z.string().optional(),
  ende_doppeljahr: z.string().optional(),
  ende_grund: EndeGrundEnum.optional(),
  reihenfolge: z.number().int().optional(),
  notiz: z.string().optional(),
})
