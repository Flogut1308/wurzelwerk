// §2.13 feld_wert (docs/schema/0002_kern.sql).
import { z } from 'zod'
import { DatumModifikatorEnum, DatumPraezisionEnum, FeldGiltFuerEnum, KalenderEnum } from './gemeinsam'

export interface FeldWert {
  readonly id: string
  readonly feld_definition_id: string
  readonly subjekt_typ: z.infer<typeof FeldGiltFuerEnum>
  readonly subjekt_id: string
  readonly wert_text?: string | undefined
  readonly wert_zahl?: number | undefined
  readonly wert_ref_id?: string | undefined
  readonly wert_datum_kalender?: z.infer<typeof KalenderEnum> | undefined
  readonly wert_datum_modifikator?: z.infer<typeof DatumModifikatorEnum> | undefined
  readonly wert_datum_praezision?: z.infer<typeof DatumPraezisionEnum> | undefined
  readonly wert_datum_wert1?: string | undefined
  readonly wert_datum_wert2?: string | undefined
  readonly wert_datum_originaltext?: string | undefined
  readonly wert_datum_sort_von?: number | undefined
  readonly wert_datum_sort_bis?: number | undefined
  readonly wert_datum_zweitkalender?: z.infer<typeof KalenderEnum> | undefined
  readonly wert_datum_zweitwert?: string | undefined
  readonly wert_datum_doppeljahr?: string | undefined
  readonly gueltig_von?: number | undefined
  readonly gueltig_bis?: number | undefined
  readonly reihenfolge?: number | undefined
}

export const feldWertSchema: z.ZodType<FeldWert> = z.object({
  id: z.string(),
  feld_definition_id: z.string(),
  subjekt_typ: FeldGiltFuerEnum,
  subjekt_id: z.string(),
  wert_text: z.string().optional(),
  wert_zahl: z.number().optional(),
  wert_ref_id: z.string().optional(),
  wert_datum_kalender: KalenderEnum.optional(),
  wert_datum_modifikator: DatumModifikatorEnum.optional(),
  wert_datum_praezision: DatumPraezisionEnum.optional(),
  wert_datum_wert1: z.string().optional(),
  wert_datum_wert2: z.string().optional(),
  wert_datum_originaltext: z.string().optional(),
  wert_datum_sort_von: z.number().int().optional(),
  wert_datum_sort_bis: z.number().int().optional(),
  wert_datum_zweitkalender: KalenderEnum.optional(),
  wert_datum_zweitwert: z.string().optional(),
  wert_datum_doppeljahr: z.string().optional(),
  gueltig_von: z.number().int().optional(),
  gueltig_bis: z.number().int().optional(),
  reihenfolge: z.number().int().optional(),
})
