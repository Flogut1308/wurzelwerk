// §2.6 Elternschaft (docs/schema/0002_kern.sql).
import { z } from 'zod'
import { KonfidenzSchema } from './gemeinsam'

export const ElternschaftTypEnum = z.enum(['biologisch', 'adoptiv', 'stief', 'pflege', 'zieh', 'anerkannt', 'leihmutter', 'unbekannt'])

export interface Elternschaft {
  readonly id: string
  readonly elternteil_id: string
  readonly kind_id: string
  readonly typ: z.infer<typeof ElternschaftTypEnum>
  readonly konfidenz?: number | undefined
  readonly notiz?: string | undefined
}

export const elternschaftSchema: z.ZodType<Elternschaft> = z.object({
  id: z.string(),
  elternteil_id: z.string(),
  kind_id: z.string(),
  typ: ElternschaftTypEnum,
  konfidenz: KonfidenzSchema.optional(),
  notiz: z.string().optional(),
})
