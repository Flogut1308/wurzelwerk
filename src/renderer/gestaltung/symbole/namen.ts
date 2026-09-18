// AP-1.11 (ADR-027, docs/71_Designsystem.md §6): die typisierte Namensliste des Symbolsatzes — ein
// Tippfehler in einem Symbolnamen ist damit ein Typfehler, kein leeres Kästchen zur Laufzeit. Diese
// Datei wird von Hand geführt (der Vertrag), NICHT von `skripte/symbole-holen.ts` überschrieben —
// das Skript LIEST `ALLE_SYMBOLE` (was zu beschaffen ist) und SCHREIBT nur die SVG-Dateien und
// `registrierung.generiert.ts`.
//
// Zwei Gruppen:
// 1. Fachsymbole (72_Screens_und_Flows.md §6, deutsche Fachbegriffe — CLAUDE.md §4 „Fachbegriffe
//    deutsch"): Geburt, Taufe, Trauung, Tod, Beerdigung, Auswanderung, Beruf, Militär, Quelle,
//    Zitat, Archiv, Platzhalter, Implex, Widerspruch, Interview, Audio. Ihre Phosphor-Quellnamen
//    (z. B. `militaer` → `medal-military`) stehen NICHT hier, sondern in
//    `skripte/symbole-holen.ts` (Beschaffung ist Sache des Skripts, nicht des Vertrags).
// 2. UI-Chrome (dieselbe Liste wie ihr Phosphor-Quellname, keine Übersetzung nötig): caret-up,
//    caret-down, tray, funnel, warning-circle, x.
export type SymbolName =
  | 'geburt'
  | 'taufe'
  | 'trauung'
  | 'tod'
  | 'beerdigung'
  | 'auswanderung'
  | 'beruf'
  | 'militaer'
  | 'quelle'
  | 'zitat'
  | 'archiv'
  | 'platzhalter'
  | 'implex'
  | 'widerspruch'
  | 'interview'
  | 'audio'
  | 'caret-up'
  | 'caret-down'
  | 'tray'
  | 'funnel'
  | 'warning-circle'
  | 'x'

export const ALLE_SYMBOLE: readonly SymbolName[] = [
  'geburt',
  'taufe',
  'trauung',
  'tod',
  'beerdigung',
  'auswanderung',
  'beruf',
  'militaer',
  'quelle',
  'zitat',
  'archiv',
  'platzhalter',
  'implex',
  'widerspruch',
  'interview',
  'audio',
  'caret-up',
  'caret-down',
  'tray',
  'funnel',
  'warning-circle',
  'x',
]
