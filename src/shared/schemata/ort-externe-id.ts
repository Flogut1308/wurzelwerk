// §2.4 ort_externe_id (docs/schema/0002_kern.sql).
import { z } from 'zod'

export const ExterneIdSystemEnum = z.enum(['gov', 'geonames', 'wikidata'])

export interface OrtExterneId {
  readonly ort_id: string
  readonly system: z.infer<typeof ExterneIdSystemEnum>
  readonly wert: string
}

export const ortExterneIdSchema: z.ZodType<OrtExterneId> = z.object({
  ort_id: z.string(),
  system: ExterneIdSystemEnum,
  wert: z.string(),
})
