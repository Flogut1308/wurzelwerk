// §2.10 id_alias (docs/schema/0002_kern.sql). NICHT_JOURNALISIERT (E-3). "typ" hat im Datenmodell keine Werteliste (Lücke, siehe SQL-Kommentar) - bewusst kein Enum.
import { z } from 'zod'

export interface IdAlias {
  readonly alte_id: string
  readonly neue_id: string
  readonly typ: string
}

export const idAliasSchema: z.ZodType<IdAlias> = z.object({
  alte_id: z.string(),
  neue_id: z.string(),
  typ: z.string(),
})
