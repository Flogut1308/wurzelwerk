// §2.9 medium_region (docs/schema/0002_kern.sql).
import { z } from 'zod'

export interface MediumRegion {
  readonly id: string
  readonly medium_id: string
  readonly person_id?: string | undefined
  readonly x?: number | undefined
  readonly y?: number | undefined
  readonly w?: number | undefined
  readonly h?: number | undefined
}

export const mediumRegionSchema: z.ZodType<MediumRegion> = z.object({
  id: z.string(),
  medium_id: z.string(),
  person_id: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().optional(),
  h: z.number().optional(),
})
