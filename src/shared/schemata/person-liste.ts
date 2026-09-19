// AP-1.6 PR1, C-16/C-17/A-19: Nutzlast- und Ergebnistypen von `abfrage:person.liste` und
// `abfrage:suche` (55_Architektur.md §5). Reine Zod-Schemata + abgeleitete `readonly`-Typen, kein
// Node/Electron/SQL — `src/shared` bleibt Electron-/SQL-frei (CLAUDE.md §2).
//
// AP-1.10 PR-A (Listen-Vertrag, docs/80_Offene_Fragen.md §16): schließt vier §14-Vermerke der
// Stufe-1-Fassung — Beruf/Belegzahl/Kinderzahl (U-1.6-spalten-datenvertrag), die volle
// Datums-Spaltengruppe für Geburt/Tod (U-1.6-lebensdaten-unschaerfe), Zeitraum/Ort als Filter
// (U-1.6-filterleiste-vier-filter — Strang bleibt zurückgestellt, siehe docs/80_Offene_Fragen.md)
// und Filter/Sortierung/Seite auch für `abfrage:suche` (U-1.6-suche-ohne-filter-sortierung-seite).
import { z } from 'zod'
import { DatumModifikatorEnum, DatumPraezisionEnum, KalenderEnum } from './gemeinsam'

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
  /** AP-1.10 PR-A: Geburtsjahr-Untergrenze (`person_flach.geburt_jahr >= zeitraumVon`). Strang aus
   * S-05 bleibt zurückgestellt (docs/80_Offene_Fragen.md, U-1.6-filterleiste-vier-filter) — er ist
   * proband-relativ und graphabgeleitet, kein Feld, das eine flache Personenzeile trägt. */
  readonly zeitraumVon?: number | undefined
  /** Geburtsjahr-Obergrenze (`person_flach.geburt_jahr <= zeitraumBis`). */
  readonly zeitraumBis?: number | undefined
  /** Freitext-Teilstring, groß-/kleinschreibungsunabhängig gegen `person_flach.geburt_ort_name`. */
  readonly ort?: string | undefined
}

export const personListeFilterSchema: z.ZodType<PersonListeFilter> = z.object({
  platzhalter: TristateFilterEnum,
  privat: TristateFilterEnum,
  konfidenzMin: KonfidenzStufeEnum.optional(),
  nurWiderspruch: z.boolean(),
  zeitraumVon: z.number().int().optional(),
  zeitraumBis: z.number().int().optional(),
  ort: z.string().min(1).optional(),
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

/** Volle Datums-Spaltengruppe (50_Datenmodell.md §2.3) für genau die bevorzugte (oder — ohne
 * Bevorzugung — erste) `geburtsdatum`/`todesdatum`-Aussage einer Person (AP-1.10 PR-A,
 * U-1.6-lebensdaten-unschaerfe). Deckt sich mit den `datum_*`-Spalten von `aussage`
 * (docs/schema/0002_kern.sql §2.7) — der Renderer baut daraus einen `Datumswert`
 * (src/core/datum/typen.ts) und ruft `formatiere()` (src/core/datum/formatierer.ts), statt eine
 * eigene Formatierlogik nachzubauen (CLAUDE.md §14 Fall 1, jetzt geschlossen). `sortVon`/`sortBis`
 * werden von `formatiere()` nicht gelesen, sind aber Teil des vollständigen `Datumswert`-Vertrags. */
export interface PersonListeDatumsgruppe {
  readonly kalender: z.infer<typeof KalenderEnum>
  readonly modifikator: z.infer<typeof DatumModifikatorEnum>
  readonly praezision: z.infer<typeof DatumPraezisionEnum>
  readonly wert1: string
  readonly wert2: string | null
  readonly originaltext: string | null
  readonly sortVon: number
  readonly sortBis: number
}

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
  /** AP-1.10 PR-A (U-1.6-spalten-datenvertrag): `aussage.wert_text` der bevorzugten (oder ersten)
   * `praedikat='beruf'`-Aussage, `null` ohne eine solche Aussage. */
  readonly beruf: string | null
  /** COUNT aller `aussage_zitat`-Zeilen über ALLE Aussagen dieser Person (nicht je Prädikat,
   * analog zur Entscheidung in `src/main/abfragen/person-detail.ts` — dort je Prädikat, weil eine
   * Feldzeile dort Kontext eines einzelnen Prädikats ist; hier eine Personenzeile, darum insgesamt). */
  readonly belegzahl: number
  /** COUNT `elternschaft` mit `elternteil_id = person_id` — Anzahl der Kinder. */
  readonly kinderzahl: number
  /** `null` ohne `geburtsdatum`-Aussage (oder wenn die Kernfelder unvollständig sind). */
  readonly geburt_datum: PersonListeDatumsgruppe | null
  /** `null` ohne `todesdatum`-Aussage (oder wenn die Kernfelder unvollständig sind). */
  readonly tod_datum: PersonListeDatumsgruppe | null
}

export interface PersonListeAus {
  readonly zeilen: readonly PersonListeZeile[]
  readonly gesamt: number
}

/** Nutzlast von `abfrage:suche`. AP-1.10 PR-A (U-1.6-suche-ohne-filter-sortierung-seite): trägt
 * seitdem dieselben Filter-/Sortier-/Seitenfelder wie `PersonListeEin` — die Bedienelemente
 * bleiben während einer aktiven Suche wirksam, statt sichtbar gesperrt zu werden. `grenze` bleibt
 * daneben bestehen: sie begrenzt, wie viele nach Relevanz geordnete Treffer aus Volltext-/
 * Phonetiksuche überhaupt als Kandidaten geladen werden, BEVOR Filter/Sortierung/Seite darauf
 * angewendet werden (src/main/abfragen/suche.ts) — ein Kandidatenfenster, kein Seitenzähler. */
export interface SucheEin {
  readonly text: string
  readonly grenze: number
  readonly filter: PersonListeFilter
  readonly sortierung: z.infer<typeof PersonListeSortierungEnum>
  readonly richtung: z.infer<typeof PersonListeRichtungEnum>
  readonly seite: number
  readonly proSeite: number
}

export const sucheEinSchema: z.ZodType<SucheEin> = z.object({
  text: z.string(),
  grenze: z.number().int().min(1).max(500),
  filter: personListeFilterSchema,
  sortierung: PersonListeSortierungEnum,
  richtung: PersonListeRichtungEnum,
  seite: z.number().int().min(1),
  proSeite: z.number().int().min(1).max(500),
})

export const SucheQuelleEnum = z.enum(['volltext', 'phonetik'])

/** Ein Suchtreffer — wie `PersonListeZeile`, zusätzlich `quelle`: Volltext (bm25-Rang) gilt als der
 * stärkere Fund, Kölner Phonetik als schwächere zweite Quelle (`src/main/abfragen/suche.ts`). */
export interface SucheTreffer extends PersonListeZeile {
  readonly quelle: z.infer<typeof SucheQuelleEnum>
}

export interface SucheAus {
  readonly treffer: readonly SucheTreffer[]
  /** Anzahl der Treffer NACH Filter, aber innerhalb des `grenze`-Kandidatenfensters (s. o.) — vor
   * der Seitenschneidung. Analog `PersonListeAus.gesamt`, mit derselben Einschränkung: bei mehr
   * Rohtreffern als `grenze` ist `gesamt` eine Untergrenze, keine erschöpfende Zählung. */
  readonly gesamt: number
}
