// §2.12 Risikofaktor (docs/schema/0002_kern.sql). M-08: aus jedem Export ausgeschlossen.
import { z } from 'zod'
import { DatumModifikatorEnum, DatumPraezisionEnum, KalenderEnum, KonfidenzSchema } from './gemeinsam'

export const RisikofaktorArtEnum = z.enum(['rauchen', 'alkohol', 'beruf_exposition', 'umwelt', 'uebergewicht', 'bewegungsmangel', 'ernaehrung', 'sonstiges'])
export const IntensitaetEnum = z.enum(['gering', 'mittel', 'hoch', 'unbekannt'])

export interface Risikofaktor {
  readonly id: string
  readonly person_id: string
  readonly art?: z.infer<typeof RisikofaktorArtEnum> | undefined
  readonly detail?: string | undefined
  readonly intensitaet?: z.infer<typeof IntensitaetEnum> | undefined
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
  readonly quelle_beruf_id?: string | undefined
  readonly konfidenz?: number | undefined
  readonly notiz?: string | undefined
}

export const risikofaktorSchema: z.ZodType<Risikofaktor> = z.object({
  id: z.string(),
  person_id: z.string(),
  art: RisikofaktorArtEnum.optional(),
  detail: z.string().optional(),
  intensitaet: IntensitaetEnum.optional(),
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
  quelle_beruf_id: z.string().optional(),
  konfidenz: KonfidenzSchema.optional(),
  notiz: z.string().optional(),
})
