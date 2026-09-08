// §2.12 Diagnose (docs/schema/0002_kern.sql). M-08: aus jedem Export ausgeschlossen.
import { z } from 'zod'
import { DatumModifikatorEnum, DatumPraezisionEnum, KalenderEnum, KonfidenzSchema } from './gemeinsam'

export const DiagnoseKategorieEnum = z.enum(['herz_kreislauf', 'krebs', 'stoffwechsel', 'neuro_psych', 'atemwege', 'nieren', 'autoimmun', 'angeboren_genetisch', 'infektion', 'unfall', 'sonstiges'])
export const DiagnoseStatusEnum = z.enum(['bestehend', 'geheilt', 'todesursache', 'unbekannt'])

export interface Diagnose {
  readonly id: string
  readonly person_id: string
  readonly kategorie?: z.infer<typeof DiagnoseKategorieEnum> | undefined
  readonly organ?: string | undefined
  readonly bezeichnung?: string | undefined
  readonly icd10?: string | undefined
  readonly erstdiagnose_kalender?: z.infer<typeof KalenderEnum> | undefined
  readonly erstdiagnose_modifikator?: z.infer<typeof DatumModifikatorEnum> | undefined
  readonly erstdiagnose_praezision?: z.infer<typeof DatumPraezisionEnum> | undefined
  readonly erstdiagnose_wert1?: string | undefined
  readonly erstdiagnose_wert2?: string | undefined
  readonly erstdiagnose_originaltext?: string | undefined
  readonly erstdiagnose_sort_von?: number | undefined
  readonly erstdiagnose_sort_bis?: number | undefined
  readonly erstdiagnose_zweitkalender?: z.infer<typeof KalenderEnum> | undefined
  readonly erstdiagnose_zweitwert?: string | undefined
  readonly erstdiagnose_doppeljahr?: string | undefined
  readonly alter_bei_diagnose?: number | undefined
  readonly status?: z.infer<typeof DiagnoseStatusEnum> | undefined
  readonly konfidenz?: number | undefined
  readonly notiz?: string | undefined
}

export const diagnoseSchema: z.ZodType<Diagnose> = z.object({
  id: z.string(),
  person_id: z.string(),
  kategorie: DiagnoseKategorieEnum.optional(),
  organ: z.string().optional(),
  bezeichnung: z.string().optional(),
  icd10: z.string().optional(),
  erstdiagnose_kalender: KalenderEnum.optional(),
  erstdiagnose_modifikator: DatumModifikatorEnum.optional(),
  erstdiagnose_praezision: DatumPraezisionEnum.optional(),
  erstdiagnose_wert1: z.string().optional(),
  erstdiagnose_wert2: z.string().optional(),
  erstdiagnose_originaltext: z.string().optional(),
  erstdiagnose_sort_von: z.number().int().optional(),
  erstdiagnose_sort_bis: z.number().int().optional(),
  erstdiagnose_zweitkalender: KalenderEnum.optional(),
  erstdiagnose_zweitwert: z.string().optional(),
  erstdiagnose_doppeljahr: z.string().optional(),
  alter_bei_diagnose: z.number().int().optional(),
  status: DiagnoseStatusEnum.optional(),
  konfidenz: KonfidenzSchema.optional(),
  notiz: z.string().optional(),
})
