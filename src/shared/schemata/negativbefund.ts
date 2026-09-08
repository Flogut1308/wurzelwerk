// §2.7 Negativbefund (docs/schema/0002_kern.sql). E-8: zeitraum_von/_bis einfache Spalten.
import { z } from 'zod'

export interface Negativbefund {
  readonly id: string
  readonly quelle_id?: string | undefined
  readonly gesuchte_person_id: string
  readonly gesuchtes_praedikat?: string | undefined
  readonly zeitraum_von?: number | undefined
  readonly zeitraum_bis?: number | undefined
  readonly beschreibung?: string | undefined
  readonly datum_der_pruefung?: string | undefined
}

export const negativbefundSchema: z.ZodType<Negativbefund> = z.object({
  id: z.string(),
  quelle_id: z.string().optional(),
  gesuchte_person_id: z.string(),
  gesuchtes_praedikat: z.string().optional(),
  zeitraum_von: z.number().int().optional(),
  zeitraum_bis: z.number().int().optional(),
  beschreibung: z.string().optional(),
  datum_der_pruefung: z.string().optional(),
})
