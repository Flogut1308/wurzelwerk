// §2.13 feld_auswahloption (docs/schema/0002_kern.sql).
import { z } from 'zod'

export interface FeldAuswahloption {
  readonly id: string
  readonly feld_definition_id: string
  readonly wert?: string | undefined
  readonly bezeichnung?: string | undefined
  readonly reihenfolge?: number | undefined
}

export const feldAuswahloptionSchema: z.ZodType<FeldAuswahloption> = z.object({
  id: z.string(),
  feld_definition_id: z.string(),
  wert: z.string().optional(),
  bezeichnung: z.string().optional(),
  reihenfolge: z.number().int().optional(),
})
