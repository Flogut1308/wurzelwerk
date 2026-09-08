// §2.1 Person (docs/schema/0002_kern.sql).
import { z } from 'zod'
import { BoolWert } from './gemeinsam'

export const GeschlechtEnum = z.enum(['M', 'F', 'U', 'X'])
export const LebendStatusEnum = z.enum(['lebend', 'verstorben', 'vermutet_verstorben'])
export const PlatzhalterGrundEnum = z.enum(['unbekannt', 'unehelich', 'nicht_identifiziert', 'forschungsluecke'])

export interface Person {
  readonly id: string
  readonly geschlecht?: z.infer<typeof GeschlechtEnum> | undefined
  readonly lebend_status?: z.infer<typeof LebendStatusEnum> | undefined
  readonly privat: 0 | 1
  readonly notiz?: string | undefined
  readonly gesperrt_bis?: number | undefined
  readonly ist_platzhalter: 0 | 1
  readonly platzhalter_grund?: z.infer<typeof PlatzhalterGrundEnum> | undefined
}

export const personSchema: z.ZodType<Person> = z.object({
  id: z.string(),
  geschlecht: GeschlechtEnum.optional(),
  lebend_status: LebendStatusEnum.optional(),
  privat: BoolWert,
  notiz: z.string().optional(),
  gesperrt_bis: z.number().int().optional(),
  ist_platzhalter: BoolWert,
  platzhalter_grund: PlatzhalterGrundEnum.optional(),
})
