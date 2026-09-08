// §2.10 merge_protokoll (docs/schema/0002_kern.sql). NICHT_JOURNALISIERT (E-3).
import { z } from 'zod'
import { BoolWert } from './gemeinsam'

export interface MergeProtokoll {
  readonly id: string
  readonly transaktion_id: string
  readonly ziel_person_id: string
  readonly quell_person_id: string
  readonly feldentscheidungen_json?: string | undefined
  readonly begruendung?: string | undefined
  readonly rueckgaengig_moeglich?: 0 | 1 | undefined
}

export const mergeProtokollSchema: z.ZodType<MergeProtokoll> = z.object({
  id: z.string(),
  transaktion_id: z.string(),
  ziel_person_id: z.string(),
  quell_person_id: z.string(),
  feldentscheidungen_json: z.string().optional(),
  begruendung: z.string().optional(),
  rueckgaengig_moeglich: BoolWert.optional(),
})
