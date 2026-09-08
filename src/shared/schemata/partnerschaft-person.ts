// §2.6 partnerschaft_person (docs/schema/0002_kern.sql). "rolle" hat im Datenmodell keine Werteliste (Lücke, siehe SQL-Kommentar) - bewusst kein Enum.
import { z } from 'zod'

export interface PartnerschaftPerson {
  readonly partnerschaft_id: string
  readonly person_id: string
  readonly rolle?: string | undefined
}

export const partnerschaftPersonSchema: z.ZodType<PartnerschaftPerson> = z.object({
  partnerschaft_id: z.string(),
  person_id: z.string(),
  rolle: z.string().optional(),
})
