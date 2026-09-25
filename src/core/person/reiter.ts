// AP-1.34 PR-C2b (Entwicklungsvorgaben „Person bearbeiten" §3.1): die acht Reiter der
// Bearbeitungsansicht in fester Reihenfolge (Tasten 1…8). Technische IDs, keine Texte — die
// Beschriftungen liegen in `src/renderer/i18n/de/` (ADR-011). Sprungziel für Feldwarnungen und
// offene Punkte (§5.5: `tab`).
export const REITER = ['person', 'namen', 'leben', 'beziehungen', 'belege_medien', 'gesundheit', 'notizen', 'verwaltung'] as const

export type ReiterId = (typeof REITER)[number]
