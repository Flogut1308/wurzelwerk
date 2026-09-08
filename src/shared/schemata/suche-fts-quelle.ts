// §5.2 suche_fts_quelle (docs/schema/0003_abgeleitet.sql, AP-0.7). Mapping-Tabelle für die
// contentless FTS5-Tabelle `suche_fts`: eine Zeile je Quell-Datensatz, deren `rowid` zugleich der
// `rowid` in `suche_fts` ist. NICHT_JOURNALISIERT (E-3, analog name_phonetik in 0002_kern.sql).
import { z } from 'zod'

export const SucheFtsQuelleTypEnum = z.enum(['name', 'person_notiz', 'zitat_transkript'])

export interface SucheFtsQuelle {
  readonly rowid: number
  readonly quelle_typ: z.infer<typeof SucheFtsQuelleTypEnum>
  readonly quelle_id: string
}

export const sucheFtsQuelleSchema: z.ZodType<SucheFtsQuelle> = z.object({
  rowid: z.number().int(),
  quelle_typ: SucheFtsQuelleTypEnum,
  quelle_id: z.string(),
})
