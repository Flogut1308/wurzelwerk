// §2.7 Quelle + §2.15 Ergänzung "mündlich" (docs/schema/0002_kern.sql).
import { z } from 'zod'
import { DatumModifikatorEnum, DatumPraezisionEnum, KalenderEnum } from './gemeinsam'

export const QuelleTypEnum = z.enum(['kirchenbuch', 'standesamt', 'volkszaehlung', 'zeitung', 'grabstein', 'familienbesitz', 'literatur', 'website', 'muendlich', 'sonstiges'])
export const QuelleArtEnum = z.enum(['original', 'derivat', 'verfasst'])
export const InformationsartEnum = z.enum(['primaer', 'sekundaer', 'unbestimmt'])
export const QuelleFormEnum = z.enum(['gespraech', 'telefonat', 'brief', 'email', 'audio', 'video'])
export const UnmittelbarkeitEnum = z.enum(['selbst_erlebt', 'vom_hoerensagen', 'unbekannt'])

export interface Quelle {
  readonly id: string
  readonly typ: z.infer<typeof QuelleTypEnum>
  readonly titel?: string | undefined
  readonly autor?: string | undefined
  readonly verlag?: string | undefined
  readonly jahr?: number | undefined
  readonly art?: z.infer<typeof QuelleArtEnum> | undefined
  readonly informationsart?: z.infer<typeof InformationsartEnum> | undefined
  readonly archiv_id?: string | undefined
  readonly signatur?: string | undefined
  readonly notiz?: string | undefined
  readonly informant_person_id?: string | undefined
  readonly gespraechsdatum_kalender?: z.infer<typeof KalenderEnum> | undefined
  readonly gespraechsdatum_modifikator?: z.infer<typeof DatumModifikatorEnum> | undefined
  readonly gespraechsdatum_praezision?: z.infer<typeof DatumPraezisionEnum> | undefined
  readonly gespraechsdatum_wert1?: string | undefined
  readonly gespraechsdatum_wert2?: string | undefined
  readonly gespraechsdatum_originaltext?: string | undefined
  readonly gespraechsdatum_sort_von?: number | undefined
  readonly gespraechsdatum_sort_bis?: number | undefined
  readonly gespraechsdatum_zweitkalender?: z.infer<typeof KalenderEnum> | undefined
  readonly gespraechsdatum_zweitwert?: string | undefined
  readonly gespraechsdatum_doppeljahr?: string | undefined
  readonly form?: z.infer<typeof QuelleFormEnum> | undefined
  readonly unmittelbarkeit?: z.infer<typeof UnmittelbarkeitEnum> | undefined
  readonly audio_medium_id?: string | undefined
}

export const quelleSchema: z.ZodType<Quelle> = z.object({
  id: z.string(),
  typ: QuelleTypEnum,
  titel: z.string().optional(),
  autor: z.string().optional(),
  verlag: z.string().optional(),
  jahr: z.number().int().optional(),
  art: QuelleArtEnum.optional(),
  informationsart: InformationsartEnum.optional(),
  archiv_id: z.string().optional(),
  signatur: z.string().optional(),
  notiz: z.string().optional(),
  informant_person_id: z.string().optional(),
  gespraechsdatum_kalender: KalenderEnum.optional(),
  gespraechsdatum_modifikator: DatumModifikatorEnum.optional(),
  gespraechsdatum_praezision: DatumPraezisionEnum.optional(),
  gespraechsdatum_wert1: z.string().optional(),
  gespraechsdatum_wert2: z.string().optional(),
  gespraechsdatum_originaltext: z.string().optional(),
  gespraechsdatum_sort_von: z.number().int().optional(),
  gespraechsdatum_sort_bis: z.number().int().optional(),
  gespraechsdatum_zweitkalender: KalenderEnum.optional(),
  gespraechsdatum_zweitwert: z.string().optional(),
  gespraechsdatum_doppeljahr: z.string().optional(),
  form: QuelleFormEnum.optional(),
  unmittelbarkeit: UnmittelbarkeitEnum.optional(),
  audio_medium_id: z.string().optional(),
})
