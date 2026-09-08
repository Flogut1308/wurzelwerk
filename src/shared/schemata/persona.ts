// §2.8 Persona (docs/schema/0002_kern.sql, N.6).
import { z } from 'zod'
import { KonfidenzSchema } from './gemeinsam'

export interface Persona {
  readonly id: string
  readonly zitat_id: string
  readonly rohdaten_json?: string | undefined
  readonly person_id?: string | undefined
  readonly zuordnung_konfidenz?: number | undefined
  readonly zuordnung_begruendung?: string | undefined
  readonly zuordnung_datum?: string | undefined
}

export const personaSchema: z.ZodType<Persona> = z.object({
  id: z.string(),
  zitat_id: z.string(),
  rohdaten_json: z.string().optional(),
  person_id: z.string().optional(),
  zuordnung_konfidenz: KonfidenzSchema.optional(),
  zuordnung_begruendung: z.string().optional(),
  zuordnung_datum: z.string().optional(),
})
