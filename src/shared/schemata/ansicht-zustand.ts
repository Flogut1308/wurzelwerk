// N.4 ansicht_zustand (docs/schema/0002_kern.sql).
import { z } from 'zod'

export interface AnsichtZustand {
  readonly id: string
  readonly name?: string | undefined
  readonly zentrumsperson_id?: string | undefined
  readonly filter_json?: string | undefined
}

export const ansichtZustandSchema: z.ZodType<AnsichtZustand> = z.object({
  id: z.string(),
  name: z.string().optional(),
  zentrumsperson_id: z.string().optional(),
  filter_json: z.string().optional(),
})
