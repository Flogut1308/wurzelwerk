// AP-1.13 PR-C (docs/71_Designsystem.md §3.2, A-04): Nutzlast-/Ergebnistyp von `abfrage:ort.suche`
// (55_Architektur.md §5). Reine Zod-Schemata + abgeleitete `readonly`-Typen, kein Node/Electron/SQL
// — `src/shared` bleibt Electron-/SQL-frei (CLAUDE.md §2).
//
// SCOPE (CLAUDE.md §10, nicht vorgreifen): dies ist die MINIMALE Ortssuche fürs `Ortsfeld`
// (Tippsuche + datumsgültiger Name). Die volle Ortsverwaltung — zeitabhängige Namensgeschichte als
// Liste, politisch/kirchlich getrennte Zugehörigkeitsketten — bleibt AP-1.16 vorbehalten
// (docs/80_Offene_Fragen.md).
import { z } from 'zod'
import { OrtTypEnum } from './ort'

/** Nutzlast von `abfrage:ort.suche`. `jdn` (julianische Tageszahl) ist optional — ohne ihn liefert
 * der Hauptprozess den als `ist_bevorzugt` markierten Namen (`src/core/ort/zeitbezug.ts::
 * gueltigerOrtsname`), mit ihm den zu diesem Datum gültigen historischen Namen. */
export interface OrtSucheEin {
  readonly text: string
  readonly grenze?: number | undefined
  readonly jdn?: number | undefined
}

export const ortSucheEinSchema: z.ZodType<OrtSucheEin> = z.object({
  text: z.string(),
  grenze: z.number().int().min(1).max(200).optional(),
  jdn: z.number().int().optional(),
})

/** Ein Suchtreffer — bewusst minimal (nur was zum Unterscheiden zweier gleichnamiger Orte in
 * einer Tippsuche nötig ist, s. Kopfkommentar). `anzeigename` ist bereits der zu `OrtSucheEin.jdn`
 * datumsgültige (oder ohne `jdn` der bevorzugte) Name — der Renderer berechnet nichts nach. `typ`
 * steht als zusätzliches, schwaches Unterscheidungsmerkmal bereit (z. B. Dorf vs. Kirchspiel bei
 * gleichem Namen), wird vom `Ortsfeld`-Baustein in PR-C noch nicht angezeigt.
 *
 * `politischeKette` (AP-1.16 PR-C, docs/71_Designsystem.md §3.2: "Kreis Marienwerder ·
 * Westpreußen · Preußen") — die zu `OrtSucheEin.jdn` gültige, mehrstufige POLITISCHE
 * Zugehörigkeitskette (nächster Vorfahre zuerst), bereits als Anzeigenamen aufgelöst
 * (`src/core/ort/zeitbezug.ts::hierarchieZuDatum`/`gueltigerOrtsname`, KEIN zweiter
 * Auflösungsweg im Renderer). IMMER leer OHNE `jdn` — ohne Ereignisdatum gibt es keinen
 * eindeutigen Gültigkeitszeitpunkt, zu dem eine Kette überhaupt sinnvoll wäre (s.
 * `src/main/abfragen/ort-suche.ts`). Die KIRCHLICHE Kette bleibt der Detailansicht
 * (`abfrage:ort.detail`) vorbehalten — der Mock zeigt nur eine Kette je Vorschlag
 * (docs/80_Offene_Fragen.md). */
export interface OrtTreffer {
  readonly id: string
  readonly anzeigename: string
  readonly typ?: z.infer<typeof OrtTypEnum> | undefined
  readonly politischeKette: readonly string[]
  /** Geltungszeitraum von `anzeigename` als Kalenderjahr (AP-1.16 PR-C, docs/71_Designsystem.md
   * §3.2: "Zwingend" — der zeitliche Geltungsbereich steht rechts neben jedem Vorschlag, z. B.
   * "bis 1945"/"ab 1945"). Bereits vom Hauptprozess aus dem gewählten `OrtsnameEintrag` berechnet
   * (`src/core/ort/zeitbezug.ts::geltungszeitraumJahre`, KEIN zweiter Auflösungsweg im Renderer).
   * `undefined` an einer Grenze = offen in diese Richtung (kein Zusatz auf dieser Seite); beide
   * `undefined` = unbegrenzt gültig (keine Geltungszeitraum-Anzeige). */
  readonly gueltigVonJahr?: number | undefined
  readonly gueltigBisJahr?: number | undefined
}

export interface OrtSucheAus {
  readonly treffer: readonly OrtTreffer[]
}
