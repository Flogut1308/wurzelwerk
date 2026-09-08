// §2.5 Beteiligung (docs/schema/0002_kern.sql).
import { z } from 'zod'

export const BeteiligungRolleEnum = z.enum(['hauptperson', 'kind', 'vater', 'mutter', 'braeutigam', 'braut', 'pate', 'patenvertreter', 'trauzeuge', 'verstorbener', 'ehepartner', 'informant', 'pfarrer', 'hebamme', 'dienstherr'])

export interface Beteiligung {
  readonly id: string
  readonly ereignis_id: string
  readonly person_id: string
  readonly rolle: z.infer<typeof BeteiligungRolleEnum>
  readonly reihenfolge?: number | undefined
}

export const beteiligungSchema: z.ZodType<Beteiligung> = z.object({
  id: z.string(),
  ereignis_id: z.string(),
  person_id: z.string(),
  rolle: BeteiligungRolleEnum,
  reihenfolge: z.number().int().optional(),
})
