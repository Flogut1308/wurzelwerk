// AP-1.11 (72_Screens_und_Flows.md S-19): gemeinsame Datenbasis für die vier Bildkombinationen
// (hell/dunkel × Standarddichte/kompakt) der Zustandsbibliothek — geteilt von `skripte/bilder.ts`
// (lokaler `pnpm bilder`-Lauf) und `test/e2e/zustandsbibliothek.spec.ts` (CI-Artefakt), damit beide
// Wege exakt dieselben vier Aufnahmen erzeugen.

export type BilderTheme = 'hell' | 'dunkel'
export type BilderDichte = 'standard' | 'kompakt'

export interface BilderKombination {
  readonly theme: BilderTheme
  readonly dichte: BilderDichte
}

export const VIER_KOMBINATIONEN: readonly BilderKombination[] = [
  { theme: 'hell', dichte: 'standard' },
  { theme: 'hell', dichte: 'kompakt' },
  { theme: 'dunkel', dichte: 'standard' },
  { theme: 'dunkel', dichte: 'kompakt' },
]

export function bilderDateiname(kombination: BilderKombination): string {
  return `zustandsbibliothek-${kombination.theme}-${kombination.dichte}.png`
}

/**
 * Läuft IM Browser-/Renderer-Kontext (als `page.evaluate(kombinationImDomSetzen, kombination)`
 * bzw. `fenster.evaluate(...)` in Playwright) — setzt `data-theme`/`data-dichte` auf `<html>`
 * direkt, ohne einen echten Themen-Umschalter zu brauchen (den gibt es als Bedienelement noch
 * nicht, `tokens.css` liest die Attribute bereits, docs/71_Designsystem.md §1.7). Reines
 * Aufnahme-Werkzeug (CLAUDE.md §11: keine Plattformlogik, keine Fachlogik), kein Feature.
 */
export function kombinationImDomSetzen(kombination: BilderKombination): void {
  document.documentElement.setAttribute('data-theme', kombination.theme === 'hell' ? 'hell' : 'dunkel')
  if (kombination.dichte === 'kompakt') {
    document.documentElement.setAttribute('data-dichte', 'kompakt')
  } else {
    document.documentElement.removeAttribute('data-dichte')
  }
  // Zurück zum Seitenanfang: die eingebettete `Seitenschublade`-Probe fokussiert sich selbst (ihr
  // echtes Verhalten, seitenschublade.tsx) und lässt den Browser sonst mitten in die lange Seite
  // scrollen — ohne diesen Reset zeigte jede Aufnahme zufällig einen mittleren Ausschnitt statt
  // des Bibliothekskopfs.
  window.scrollTo(0, 0)
}
