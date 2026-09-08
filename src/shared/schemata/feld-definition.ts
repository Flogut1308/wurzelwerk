// §2.13 feld_definition (docs/schema/0002_kern.sql).
import { z } from 'zod'
import { BoolWert, FeldGiltFuerEnum } from './gemeinsam'

export const FeldDatentypEnum = z.enum(['text', 'langtext', 'zahl', 'datum', 'auswahl', 'mehrfachauswahl', 'ja_nein', 'ort_ref', 'person_ref', 'url', 'medium_ref'])

export interface FeldDefinition {
  readonly id: string
  readonly schluessel: string
  readonly bezeichnung?: string | undefined
  readonly beschreibung?: string | undefined
  readonly gilt_fuer?: z.infer<typeof FeldGiltFuerEnum> | undefined
  readonly datentyp?: z.infer<typeof FeldDatentypEnum> | undefined
  readonly ist_mehrfach?: 0 | 1 | undefined
  readonly hat_zeitraum?: 0 | 1 | undefined
  readonly gruppe?: string | undefined
  readonly reihenfolge?: number | undefined
  readonly ist_system?: 0 | 1 | undefined
  readonly ist_sensibel?: 0 | 1 | undefined
}

export const feldDefinitionSchema: z.ZodType<FeldDefinition> = z.object({
  id: z.string(),
  schluessel: z.string(),
  bezeichnung: z.string().optional(),
  beschreibung: z.string().optional(),
  gilt_fuer: FeldGiltFuerEnum.optional(),
  datentyp: FeldDatentypEnum.optional(),
  ist_mehrfach: BoolWert.optional(),
  hat_zeitraum: BoolWert.optional(),
  gruppe: z.string().optional(),
  reihenfolge: z.number().int().optional(),
  ist_system: BoolWert.optional(),
  ist_sensibel: BoolWert.optional(),
})
