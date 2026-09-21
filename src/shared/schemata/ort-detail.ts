// AP-1.16 PR-C (docs/71_Designsystem.md §3.2, docs/arbeitspakete.md AP-1.16): Nutzlast-/
// Ergebnistyp von `abfrage:ort.detail` — die lesende Grundlage der Orte-Pflege-Ansicht
// (`src/renderer/ansichten/orte/ort-bearbeiten.tsx`). Reine Zod-Schemata + abgeleitete `readonly`-
// Typen, kein Node/Electron/SQL — `src/shared` bleibt Electron-/SQL-frei (CLAUDE.md §2).
//
// Bewusst ROH (keine Datumsauflösung hier): die Pflege-Ansicht zeigt/editiert JEDE bestehende
// `ortsname`-/`ortszugehoerigkeit`-Zeile einzeln (mit ihrem eigenen Gültigkeitszeitraum), nicht
// einen bereits zum Datum aufgelösten Anzeigewert — das bleibt `abfrage:ort.suche`
// (`src/shared/schemata/ort-suche.ts`, `src/core/ort/zeitbezug.ts::gueltigerOrtsname`/
// `zugehoerigkeitsketteZuDatum`) vorbehalten. `uebergeordnet_anzeigename` unten ist KEINE
// Datumsauflösung, sondern nur der bevorzugte (`ist_bevorzugt`) Name des übergeordneten Orts, rein
// zur Lesbarkeit der Zugehörigkeits-Liste — dieselbe unmarkierte Vorschau wie `OrtTreffer.
// anzeigename` ohne `jdn` (s. Kopfkommentar dort).
import { z } from 'zod'
import { ExterneIdSystemEnum } from './ort-externe-id'
import { OrtTypEnum } from './ort'
import { OrtszugehoerigkeitArtEnum } from './ortszugehoerigkeit'

/** Nutzlast von `abfrage:ort.detail`. */
export interface OrtDetailEin {
  readonly ortId: string
}

export const ortDetailEinSchema: z.ZodType<OrtDetailEin> = z.object({
  ortId: z.string(),
})

/** Stammfelder von `ort` (docs/schema/0002_kern.sql §2.4) — read-only Spiegel, dieselben Spalten
 * wie `src/main/repositories/ort-repo.ts::OrtZeile` (kein `nachfolger_ort_id`, kein Vertragsfeld
 * dafür, s. Kommentar dort). */
export interface OrtDetailKopf {
  readonly id: string
  readonly typ: z.infer<typeof OrtTypEnum> | null
  readonly koordinaten_lat: number | null
  readonly koordinaten_lon: number | null
  readonly existiert_von: number | null
  readonly existiert_bis: number | null
  readonly notiz: string | null
}

/** Eine `ortsname`-Zeile, ALLE editierbaren Spalten (docs/schema/0002_kern.sql §2.4) — Grundlage
 * für Inline-Bearbeiten/Entfernen in der Pflege-Ansicht. */
export interface OrtDetailName {
  readonly id: string
  readonly name: string | null
  readonly sprache: string | null
  readonly gueltig_von: number | null
  readonly gueltig_bis: number | null
  readonly ist_bevorzugt: boolean
  readonly original_text: string | null
}

/** Eine `ortszugehoerigkeit`-Zeile (politisch ODER kirchlich, s. Modulkommentar
 * `src/core/ort/zeitbezug.ts` — nie gemischt). `uebergeordnet_anzeigename` s. Kopfkommentar oben. */
export interface OrtDetailZugehoerigkeit {
  readonly id: string
  readonly uebergeordnet_id: string
  readonly uebergeordnet_anzeigename: string | null
  readonly art: z.infer<typeof OrtszugehoerigkeitArtEnum>
  readonly gueltig_von: number | null
  readonly gueltig_bis: number | null
}

/** Eine `ort_externe_id`-Zeile (kein eigenes `id`, Primärschlüssel `(ort_id, system)`, s.
 * `src/shared/schemata/ort-externe-id.ts`). */
export interface OrtDetailExterneId {
  readonly system: z.infer<typeof ExterneIdSystemEnum>
  readonly wert: string
}

/** Antwort von `abfrage:ort.detail`. */
export interface OrtDetailAus {
  readonly kopf: OrtDetailKopf
  readonly namen: readonly OrtDetailName[]
  readonly zugehoerigkeiten: readonly OrtDetailZugehoerigkeit[]
  readonly externeIds: readonly OrtDetailExterneId[]
}
