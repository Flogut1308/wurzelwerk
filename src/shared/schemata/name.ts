// §2.2 Name (docs/schema/0002_kern.sql).
import { z } from 'zod'
import { BoolWert } from './gemeinsam'

export const NameTypEnum = z.enum(['geburtsname', 'ehename', 'vulgo', 'latinisiert', 'transliteriert', 'ordensname', 'beruf', 'aka', 'sonstiges'])
export const SchriftEnum = z.enum(['latn', 'cyrl'])
export const UmschriftNormEnum = z.enum(['iso9', 'din1460', 'manuell'])

// AP-1.33 (docs/schema/0006_namensformen.sql): das flache `name` wird in `name_form` (die Form/
// Rolle eines Namens) + `name_part` (die einzelnen Bestandteile) zerlegt. `NameFormRolleEnum` ist
// `NameTypEnum` OHNE 'transliteriert' — eine Umschrift ist in 0006 keine eigene Rolle mehr, sondern
// wird über `umschrift_von`/`umschrift_norm` ausgedrückt (rolle IS NULL).
export const NameFormRolleEnum = z.enum(['geburtsname', 'ehename', 'vulgo', 'latinisiert', 'ordensname', 'aka', 'beruf', 'sonstiges'])
/** Anordnung der Bestandteile in der Anzeige einer Namensform (name_form.reihenfolge). */
export const NameFormReihenfolgeEnum = z.enum(['vorname_zuerst', 'nachname_zuerst'])
/** Art eines Namens-Bestandteils (name_part.art). */
export const NamePartArtEnum = z.enum(['vorname', 'praefix', 'nachname', 'suffix', 'titel', 'vatersname'])

export interface Name {
  readonly id: string
  readonly person_id: string
  readonly typ: z.infer<typeof NameTypEnum>
  readonly schrift?: z.infer<typeof SchriftEnum> | undefined
  readonly umschrift_von?: string | undefined
  readonly umschrift_norm?: z.infer<typeof UmschriftNormEnum> | undefined
  readonly vornamen?: string | undefined
  readonly rufname_index?: number | undefined
  readonly rufname_text?: string | undefined
  readonly nachname?: string | undefined
  readonly praefix?: string | undefined
  readonly titel_vor?: string | undefined
  readonly zusatz_nach?: string | undefined
  readonly original_text?: string | undefined
  readonly sprache?: string | undefined
  readonly ist_bevorzugt?: 0 | 1 | undefined
  readonly gueltig_von?: number | undefined
  readonly gueltig_bis?: number | undefined
}

export const nameSchema: z.ZodType<Name> = z.object({
  id: z.string(),
  person_id: z.string(),
  typ: NameTypEnum,
  schrift: SchriftEnum.optional(),
  umschrift_von: z.string().optional(),
  umschrift_norm: UmschriftNormEnum.optional(),
  vornamen: z.string().optional(),
  rufname_index: z.number().int().optional(),
  rufname_text: z.string().optional(),
  nachname: z.string().optional(),
  praefix: z.string().optional(),
  titel_vor: z.string().optional(),
  zusatz_nach: z.string().optional(),
  original_text: z.string().optional(),
  sprache: z.string().optional(),
  ist_bevorzugt: BoolWert.optional(),
  gueltig_von: z.number().int().optional(),
  gueltig_bis: z.number().int().optional(),
})
