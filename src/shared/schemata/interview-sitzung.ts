// §2.15 interview_sitzung (docs/schema/0002_kern.sql). "status" hat im Datenmodell keine Werteliste (Lücke, siehe SQL-Kommentar) - bewusst kein Enum.
import { z } from 'zod'
import { DatumModifikatorEnum, DatumPraezisionEnum, KalenderEnum } from './gemeinsam'

export interface InterviewSitzung {
  readonly id: string
  readonly informant_person_id?: string | undefined
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
  readonly audio_medium_id?: string | undefined
  readonly notizen?: string | undefined
  readonly status?: string | undefined
}

export const interviewSitzungSchema: z.ZodType<InterviewSitzung> = z.object({
  id: z.string(),
  informant_person_id: z.string().optional(),
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
  audio_medium_id: z.string().optional(),
  notizen: z.string().optional(),
  status: z.string().optional(),
})
