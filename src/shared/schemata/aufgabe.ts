// §2.11 Aufgabe (docs/schema/0002_kern.sql). "prioritaet"/"status" haben im Datenmodell keine Werteliste (Lücke, siehe SQL-Kommentar) - bewusst kein Enum.
import { z } from 'zod'

export interface Aufgabe {
  readonly id: string
  readonly person_id?: string | undefined
  readonly ort_id?: string | undefined
  readonly quelle_id?: string | undefined
  readonly titel?: string | undefined
  readonly beschreibung?: string | undefined
  readonly prioritaet?: number | undefined
  readonly status?: string | undefined
  readonly faellig_am?: string | undefined
}

export const aufgabeSchema: z.ZodType<Aufgabe> = z.object({
  id: z.string(),
  person_id: z.string().optional(),
  ort_id: z.string().optional(),
  quelle_id: z.string().optional(),
  titel: z.string().optional(),
  beschreibung: z.string().optional(),
  prioritaet: z.number().int().optional(),
  status: z.string().optional(),
  faellig_am: z.string().optional(),
})
