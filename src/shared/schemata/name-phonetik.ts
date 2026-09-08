// §2.2 name_phonetik (docs/schema/0002_kern.sql). NICHT_JOURNALISIERT (E-3).
import { z } from 'zod'

export const VerfahrenEnum = z.enum(['koelner', 'dm_soundex', 'soundex'])

export interface NamePhonetik {
  readonly name_id: string
  readonly verfahren: z.infer<typeof VerfahrenEnum>
  readonly code: string
}

export const namePhonetikSchema: z.ZodType<NamePhonetik> = z.object({
  name_id: z.string(),
  verfahren: VerfahrenEnum,
  code: z.string(),
})
