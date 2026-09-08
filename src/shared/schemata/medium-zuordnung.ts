// §2.9 medium_zuordnung (docs/schema/0002_kern.sql).
import { z } from 'zod'
import { BoolWert, SubjektTypEnum } from './gemeinsam'

export interface MediumZuordnung {
  readonly medium_id: string
  readonly subjekt_typ: z.infer<typeof SubjektTypEnum>
  readonly subjekt_id: string
  readonly ist_titelbild?: 0 | 1 | undefined
}

export const mediumZuordnungSchema: z.ZodType<MediumZuordnung> = z.object({
  medium_id: z.string(),
  subjekt_typ: SubjektTypEnum,
  subjekt_id: z.string(),
  ist_titelbild: BoolWert.optional(),
})
