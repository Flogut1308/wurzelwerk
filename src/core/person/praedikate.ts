// AP-1.30 PR 9c (docs/80 §33 V-130-9-entscheidungen D2, V-130-9c E5): Namen von Aussage-Prädikaten,
// die mehrere Schichten kennen müssen — hier an EINER Stelle, damit kein Aufrufer sie neu schreibt.
// Die Datumsprädikate stehen mit ihrer Wertregel in `datums-wert.ts`. Rein (CLAUDE.md §4).

/** Die Kurzbeschreibung einer Person ist eine Aussage mit diesem Prädikat und einem Textwert
 * (`wertText`) — keine eigene Spalte, keine Migration. */
export const KURZBESCHREIBUNG_PRAEDIKAT = 'kurzbeschreibung'

export type KurzbeschreibungPraedikat = typeof KURZBESCHREIBUNG_PRAEDIKAT
