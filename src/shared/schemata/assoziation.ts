// §2.6 Assoziation (docs/schema/0002_kern.sql).
import { z } from 'zod'

export interface Assoziation {
  readonly id: string
  readonly person_a_id: string
  readonly person_b_id: string
  readonly art?: string | undefined
  readonly notiz?: string | undefined
}

export const assoziationSchema: z.ZodType<Assoziation> = z.object({
  id: z.string(),
  person_a_id: z.string(),
  person_b_id: z.string(),
  art: z.string().optional(),
  notiz: z.string().optional(),
})
