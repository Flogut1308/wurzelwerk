// AP-1.6 PR1, C-16/C-17/A-19: Nutzlast- und Ergebnistypen von `abfrage:person.liste` und
// `abfrage:suche` (55_Architektur.md §5). Reine Zod-Schemata + abgeleitete `readonly`-Typen, kein
// Node/Electron/SQL — `src/shared` bleibt Electron-/SQL-frei (CLAUDE.md §2).
import { z } from 'zod'

export const PersonListeSortierungEnum = z.enum(['nachname', 'vornamen', 'geburt', 'tod'])
export const PersonListeRichtungEnum = z.enum(['auf', 'ab'])

/** Tristate-Filter (Entscheidung B für `platzhalter`: Default `'alle'` — Platzhalterpersonen
 * werden angezeigt, der Renderer setzt sie später nur gestrichelt ab, statt sie zu verstecken). */
export const TristateFilterEnum = z.enum(['nur', 'ohne', 'alle'])

const KonfidenzStufeEnum = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])

export interface PersonListeFilter {
  readonly platzhalter: z.infer<typeof TristateFilterEnum>
  readonly privat: z.infer<typeof TristateFilterEnum>
  /** Nur Personen mit `person_flach.konfidenz_min >= konfidenzMin` (docs/schema/0003_abgeleitet.sql). */
  readonly konfidenzMin?: z.infer<typeof KonfidenzStufeEnum> | undefined
  readonly nurWiderspruch: boolean
}

export const personListeFilterSchema: z.ZodType<PersonListeFilter> = z.object({
  platzhalter: TristateFilterEnum,
  privat: TristateFilterEnum,
  konfidenzMin: KonfidenzStufeEnum.optional(),
  nurWiderspruch: z.boolean(),
})

/** Nutzlast von `abfrage:person.liste`. Entscheidung D: der Renderer setzt `proSeite` standardmäßig
 * auf 100, das Schema selbst erzwingt nur den Wertebereich (1..500). */
export interface PersonListeEin {
  readonly sortierung: z.infer<typeof PersonListeSortierungEnum>
  readonly richtung: z.infer<typeof PersonListeRichtungEnum>
  readonly seite: number
  readonly proSeite: number
  readonly filter: PersonListeFilter
}

export const personListeEinSchema: z.ZodType<PersonListeEin> = z.object({
  sortierung: PersonListeSortierungEnum,
  richtung: PersonListeRichtungEnum,
  seite: z.number().int().min(1),
  proSeite: z.number().int().min(1).max(500),
  filter: personListeFilterSchema,
})

/** Eine Zeile der Personenliste — Feldnamen bewusst wie `person_flach`/`person`
 * (docs/schema/0002_kern.sql, 0003_abgeleitet.sql), analog zu `PersonFlachZeile` in
 * src/main/abfragen/import-kollision.ts. */
export interface PersonListeZeile {
  readonly person_id: string
  readonly anzeigename: string
  readonly geburt_jahr: number | null
  readonly tod_jahr: number | null
  readonly geburt_ort_name: string | null
  readonly konfidenz_min: number | null
  readonly hat_widerspruch: boolean
  readonly ist_platzhalter: boolean
}

export interface PersonListeAus {
  readonly zeilen: readonly PersonListeZeile[]
  readonly gesamt: number
}

/** Nutzlast von `abfrage:suche`. */
export interface SucheEin {
  readonly text: string
  readonly grenze: number
}

export const sucheEinSchema: z.ZodType<SucheEin> = z.object({
  text: z.string(),
  grenze: z.number().int().min(1).max(500),
})

export const SucheQuelleEnum = z.enum(['volltext', 'phonetik'])

/** Ein Suchtreffer — wie `PersonListeZeile`, zusätzlich `quelle`: Volltext (bm25-Rang) gilt als der
 * stärkere Fund, Kölner Phonetik als schwächere zweite Quelle (`src/main/abfragen/suche.ts`). */
export interface SucheTreffer extends PersonListeZeile {
  readonly quelle: z.infer<typeof SucheQuelleEnum>
}

export interface SucheAus {
  readonly treffer: readonly SucheTreffer[]
}
