// §2.6 Assoziation (docs/schema/0002_kern.sql).
import { z } from 'zod'

export const AssoziationArtEnum = z.enum(['nachbar', 'dienstherr', 'geschaeftspartner', 'zwilling'])

export interface Assoziation {
  readonly id: string
  readonly person_a_id: string
  readonly person_b_id: string
  readonly art?: z.infer<typeof AssoziationArtEnum> | undefined
  readonly notiz?: string | undefined
}

export const assoziationSchema: z.ZodType<Assoziation> = z.object({
  id: z.string(),
  person_a_id: z.string(),
  person_b_id: z.string(),
  art: AssoziationArtEnum.optional(),
  notiz: z.string().optional(),
})
