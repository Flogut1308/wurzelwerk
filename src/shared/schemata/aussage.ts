// §2.7 Aussage (docs/schema/0002_kern.sql).
import { z } from 'zod'
import { BoolWert, DatumModifikatorEnum, DatumPraezisionEnum, KalenderEnum, KonfidenzSchema, SubjektTypEnum } from './gemeinsam'

export interface Aussage {
  readonly id: string
  readonly subjekt_typ: z.infer<typeof SubjektTypEnum>
  readonly subjekt_id: string
  readonly praedikat: string
  readonly wert_text?: string | undefined
  readonly wert_zahl?: number | undefined
  readonly wert_ref_id?: string | undefined
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
  readonly konfidenz?: number | undefined
  readonly ist_bevorzugt?: 0 | 1 | undefined
  readonly begruendung?: string | undefined
}

export const aussageSchema: z.ZodType<Aussage> = z.object({
  id: z.string(),
  subjekt_typ: SubjektTypEnum,
  subjekt_id: z.string(),
  praedikat: z.string(),
  wert_text: z.string().optional(),
  wert_zahl: z.number().optional(),
  wert_ref_id: z.string().optional(),
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
  konfidenz: KonfidenzSchema.optional(),
  ist_bevorzugt: BoolWert.optional(),
  begruendung: z.string().optional(),
})
