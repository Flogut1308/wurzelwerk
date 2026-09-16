// Zod-Schema der eingebetteten Datums-Spaltengruppe (50_Datenmodell.md §2.3, AP-1.1). Die
// Spaltengruppe steht als `{feld}_*` überall, wo ein Datum steht; `ereignis.ts` schreibt sie
// bereits (mit dem konkreten Präfix `datum_`) von Hand aus — dieses Modul ist die einzige
// Wahrheit für die WERTE (wiederverwendet `KalenderEnum`/`DatumModifikatorEnum`/
// `DatumPraezisionEnum` aus ./gemeinsam, keine zweite Wahrheit), nicht (noch) eine Umstellung
// bestehender Schemata auf einen gemeinsamen Präfix-Parameter — das bliebe ein eigener,
// architektonisch folgenloser Refactor-PR.
import { z } from 'zod'
import { DatumModifikatorEnum, DatumPraezisionEnum, KalenderEnum } from './gemeinsam'

export interface DatumGruppe {
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
}

export const datumGruppeSchema: z.ZodType<DatumGruppe> = z.object({
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
})
