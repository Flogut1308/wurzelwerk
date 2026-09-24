// §2.7 aussage_zitat (docs/schema/0002_kern.sql; `feld`/`textanker_von`/`textanker_bis` aus
// docs/schema/0007_kennung_textanker.sql, AP-1.34). `feld` wird beim Lesen als freier Text
// toleriert — die Wertliste als Zod-Enum folgt mit PR-C1b (§31 U-1.34-E3/F1).
import { z } from 'zod'

export interface AussageZitat {
  readonly aussage_id: string
  readonly zitat_id: string
  readonly feld: string | null
  readonly textanker_von: number | null
  readonly textanker_bis: number | null
}

export const aussageZitatSchema: z.ZodType<AussageZitat> = z.object({
  aussage_id: z.string(),
  zitat_id: z.string(),
  feld: z.string().nullable(),
  textanker_von: z.number().int().min(0).nullable(),
  textanker_bis: z.number().int().nullable(),
})
