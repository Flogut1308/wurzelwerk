// AP-1.8, F-07 (57_Phase0_Arbeitspakete.md „AP-1.8"). Ergebnistyp von `abfrage:pruefhinweise`
// (`src/main/abfragen/pruefhinweise.ts`). `BestandHinweisCode` kommt direkt aus
// `src/core/plausibilitaet/regeln.ts` — CLAUDE.md §2 erlaubt `src/shared -> src/core`
// ausdrücklich („Darf src/core."), ein zweites, von Hand gepflegtes Code-Union hier wäre nur eine
// Drift-Quelle gegenüber der Quelle der Wahrheit in `src/core`.
//
// Read-only Abfrage (§11, ADR-016): kein `ein`-Schema nötig, der Kanal nimmt keine Nutzlast
// (analog `abfrage:version`/`abfrage:projekt.zuletzt`, `z.null()` direkt in
// `src/main/ipc/registrierung.ts`).
import type { BestandHinweisCode } from '../../core/plausibilitaet/regeln'

/** Ein Prüfhinweis, angereichert um den Anzeigenamen der betroffenen Person (für die Liste, ohne
 * dass der Renderer selbst nachschlagen muss — er sieht keine Datenbank, CLAUDE.md §2). */
export interface PruefhinweisEintrag {
  readonly code: BestandHinweisCode
  readonly personId: string
  readonly anzeigename: string
}

/** Ergebnis von `abfrage:pruefhinweise` (70_UX_Konzept.md §2, Fußzeile). `anzahl` ist bewusst ein
 * eigenes Feld statt `eintraege.length` im Renderer zu zählen — analog `PersonListeAus.gesamt`
 * (`src/shared/schemata/person-liste.ts`): die Fußzeile braucht nur die Zahl, nicht die volle Liste. */
export interface PruefhinweiseAus {
  readonly eintraege: readonly PruefhinweisEintrag[]
  readonly anzahl: number
}
