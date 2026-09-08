// N.4 import_lauf (docs/schema/0002_kern.sql).
import { z } from 'zod'

export interface ImportLauf {
  readonly id: string
  readonly datei?: string | undefined
  readonly pruefsumme?: string | undefined
  readonly vertragsversion?: string | undefined
  readonly zeitpunkt?: number | undefined
  readonly transaktion_id: string
}

export const importLaufSchema: z.ZodType<ImportLauf> = z.object({
  id: z.string(),
  datei: z.string().optional(),
  pruefsumme: z.string().optional(),
  vertragsversion: z.string().optional(),
  zeitpunkt: z.number().int().optional(),
  transaktion_id: z.string(),
})
