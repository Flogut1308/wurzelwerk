// §2.4 ortszugehoerigkeit (docs/schema/0002_kern.sql).
import { z } from 'zod'

export const OrtszugehoerigkeitArtEnum = z.enum(['politisch', 'kirchlich'])

export interface Ortszugehoerigkeit {
  readonly id: string
  readonly ort_id: string
  readonly uebergeordnet_id: string
  readonly art: z.infer<typeof OrtszugehoerigkeitArtEnum>
  readonly gueltig_von?: number | undefined
  readonly gueltig_bis?: number | undefined
}

export const ortszugehoerigkeitSchema: z.ZodType<Ortszugehoerigkeit> = z.object({
  id: z.string(),
  ort_id: z.string(),
  uebergeordnet_id: z.string(),
  art: OrtszugehoerigkeitArtEnum,
  gueltig_von: z.number().int().optional(),
  gueltig_bis: z.number().int().optional(),
})
