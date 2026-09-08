// §2.4 Ort (docs/schema/0002_kern.sql).
import { z } from 'zod'

export const OrtTypEnum = z.enum(['dorf', 'stadt', 'gemeinde', 'kirchspiel', 'amt', 'kreis', 'provinz', 'staat', 'hof', 'friedhof', 'kirche'])

export interface Ort {
  readonly id: string
  readonly typ?: z.infer<typeof OrtTypEnum> | undefined
  readonly koordinaten_lat?: number | undefined
  readonly koordinaten_lon?: number | undefined
  readonly existiert_von?: number | undefined
  readonly existiert_bis?: number | undefined
  readonly nachfolger_ort_id?: string | undefined
  readonly notiz?: string | undefined
}

export const ortSchema: z.ZodType<Ort> = z.object({
  id: z.string(),
  typ: OrtTypEnum.optional(),
  koordinaten_lat: z.number().optional(),
  koordinaten_lon: z.number().optional(),
  existiert_von: z.number().int().optional(),
  existiert_bis: z.number().int().optional(),
  nachfolger_ort_id: z.string().optional(),
  notiz: z.string().optional(),
})
