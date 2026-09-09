// AP-0.9, 55_Architektur.md §4 (Befehlsbus): Nutzlast-Schemata der ersten echten Befehle
// (`befehl:person.anlegen`, `befehl:person.feldSetzen`, `befehl:person.loeschen`). Reine
// Zod-Schemata + abgeleitete `readonly`-Typen, kein Node/Electron/SQL — `src/shared` bleibt
// Electron-/SQL-frei (CLAUDE.md §2).
import { z } from 'zod'
import { GeschlechtEnum, LebendStatusEnum, PlatzhalterGrundEnum } from './person'
import { BoolWert } from './gemeinsam'

/**
 * Nutzlast von `befehl:person.anlegen` — alle `person`-Spalten aus `docs/schema/0002_kern.sql`
 * außer `id` (wird vom Handler per `neueId()` vergeben, D-3) und `erstellt_am`/`geaendert_am`
 * (werden vom Handler per `Date.now()` gesetzt, D-3 — `Date.now()` steht in `src/main/`, nie in
 * `src/core/`, CLAUDE.md §4).
 */
export interface PersonAnlegenEin {
  readonly geschlecht?: z.infer<typeof GeschlechtEnum> | undefined
  readonly lebend_status?: z.infer<typeof LebendStatusEnum> | undefined
  readonly privat: 0 | 1
  readonly notiz?: string | undefined
  readonly gesperrt_bis?: number | undefined
  readonly ist_platzhalter: 0 | 1
  readonly platzhalter_grund?: z.infer<typeof PlatzhalterGrundEnum> | undefined
}

export const personAnlegenEinSchema: z.ZodType<PersonAnlegenEin> = z.object({
  geschlecht: GeschlechtEnum.optional(),
  lebend_status: LebendStatusEnum.optional(),
  privat: BoolWert,
  notiz: z.string().optional(),
  gesperrt_bis: z.number().int().optional(),
  ist_platzhalter: BoolWert,
  platzhalter_grund: PlatzhalterGrundEnum.optional(),
})

/**
 * Nutzlast von `befehl:person.feldSetzen` — eine diskriminierte Union pro Feld (D-FELD), damit
 * `wert` je Feld exakt typisiert ist (kein `wert: unknown`, kein dynamischer Spaltenname). Der
 * `person-repo` schreibt für jeden Zweig festes SQL (CLAUDE.md §6).
 */
export type PersonFeldSetzenEin =
  | { readonly id: string; readonly feld: 'geschlecht'; readonly wert: z.infer<typeof GeschlechtEnum> }
  | { readonly id: string; readonly feld: 'lebend_status'; readonly wert: z.infer<typeof LebendStatusEnum> }
  | { readonly id: string; readonly feld: 'privat'; readonly wert: 0 | 1 }
  | { readonly id: string; readonly feld: 'notiz'; readonly wert: string }
  | { readonly id: string; readonly feld: 'gesperrt_bis'; readonly wert: number }
  | { readonly id: string; readonly feld: 'ist_platzhalter'; readonly wert: 0 | 1 }
  | { readonly id: string; readonly feld: 'platzhalter_grund'; readonly wert: z.infer<typeof PlatzhalterGrundEnum> }

export const personFeldSetzenEinSchema: z.ZodType<PersonFeldSetzenEin> = z.discriminatedUnion('feld', [
  z.object({ id: z.string(), feld: z.literal('geschlecht'), wert: GeschlechtEnum }),
  z.object({ id: z.string(), feld: z.literal('lebend_status'), wert: LebendStatusEnum }),
  z.object({ id: z.string(), feld: z.literal('privat'), wert: BoolWert }),
  z.object({ id: z.string(), feld: z.literal('notiz'), wert: z.string() }),
  z.object({ id: z.string(), feld: z.literal('gesperrt_bis'), wert: z.number().int() }),
  z.object({ id: z.string(), feld: z.literal('ist_platzhalter'), wert: BoolWert }),
  z.object({ id: z.string(), feld: z.literal('platzhalter_grund'), wert: PlatzhalterGrundEnum }),
])

/** Nutzlast von `befehl:person.loeschen`. */
export interface PersonLoeschenEin {
  readonly id: string
}

export const personLoeschenEinSchema: z.ZodType<PersonLoeschenEin> = z.object({
  id: z.string(),
})
