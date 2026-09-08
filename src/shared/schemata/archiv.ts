// §2.7 Archiv (docs/schema/0002_kern.sql).
import { z } from 'zod'

export interface Archiv {
  readonly id: string
  readonly name?: string | undefined
  readonly ort_id?: string | undefined
  readonly kontakt?: string | undefined
  readonly url?: string | undefined
  readonly notiz?: string | undefined
}

export const archivSchema: z.ZodType<Archiv> = z.object({
  id: z.string(),
  name: z.string().optional(),
  ort_id: z.string().optional(),
  kontakt: z.string().optional(),
  url: z.string().optional(),
  notiz: z.string().optional(),
})
