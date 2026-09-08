// N.4 import_herkunft (docs/schema/0002_kern.sql). "datensatz_typ" hat im Datenmodell keine Werteliste (Lücke, siehe SQL-Kommentar) - bewusst kein Enum.
import { z } from 'zod'

export interface ImportHerkunft {
  readonly id: string
  readonly import_lauf_id: string
  readonly datensatz_id: string
  readonly datensatz_typ: string
}

export const importHerkunftSchema: z.ZodType<ImportHerkunft> = z.object({
  id: z.string(),
  import_lauf_id: z.string(),
  datensatz_id: z.string(),
  datensatz_typ: z.string(),
})
