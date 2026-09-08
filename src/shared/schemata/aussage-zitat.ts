// §2.7 aussage_zitat (docs/schema/0002_kern.sql).
import { z } from 'zod'

export interface AussageZitat {
  readonly aussage_id: string
  readonly zitat_id: string
}

export const aussageZitatSchema: z.ZodType<AussageZitat> = z.object({
  aussage_id: z.string(),
  zitat_id: z.string(),
})
