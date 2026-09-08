// §2.4 ortsname (docs/schema/0002_kern.sql).
import { z } from 'zod'
import { BoolWert } from './gemeinsam'

export interface Ortsname {
  readonly id: string
  readonly ort_id: string
  readonly name?: string | undefined
  readonly sprache?: string | undefined
  readonly gueltig_von?: number | undefined
  readonly gueltig_bis?: number | undefined
  readonly ist_bevorzugt?: 0 | 1 | undefined
  readonly original_text?: string | undefined
}

export const ortsnameSchema: z.ZodType<Ortsname> = z.object({
  id: z.string(),
  ort_id: z.string(),
  name: z.string().optional(),
  sprache: z.string().optional(),
  gueltig_von: z.number().int().optional(),
  gueltig_bis: z.number().int().optional(),
  ist_bevorzugt: BoolWert.optional(),
  original_text: z.string().optional(),
})
