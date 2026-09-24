// AP-1.34 PR-C1b (docs/80_Offene_Fragen.md §31 U-1.34-E1/E13): Anzeige der Personen-Kennung.
// Gespeichert ist `person.kennung INTEGER` (≥ 1 oder NULL, docs/schema/0007_kennung_textanker.sql);
// das Format „P-0142" ist reine Anzeige und entsteht nur hier — kein Text in der DB, keine Kennung
// in `person_flach`/Suche (E9).
//
// Entscheidung zu ungültigen Eingaben: NULL ist ein erlaubter Zustand (E13: Undo eines Journal-
// eintrags von vor 0007) und wird als „–" gezeigt. Eine Zahl < 1, eine Nicht-Ganzzahl oder eine
// nicht mehr exakt darstellbare Zahl kann aus der Datenbank nicht kommen (CHECK `kennung >= 1`,
// STRICT-Tabelle, `person.detail` prüft beim Lesen) — sie ist ein Programmierfehler und wirft
// `RangeError`. Ein stilles „–" würde sie mit „keine Kennung vergeben" verwechseln.
//
// Rein (CLAUDE.md §4): kein Date/Math.random/process/globalThis.

const PRAEFIX = 'P-'
const MINDESTSTELLEN = 4

/** Anzeige „–" für eine Person ohne Kennung (E13). */
export const KENNUNG_FEHLT = '–'

/** `1` → `P-0001`, `142` → `P-0142`, `10000` → `P-10000`; `null` → `–`. Wirft `RangeError` bei
 * einer Zahl, die keine gültige Kennung ist (s. Kopfkommentar). */
export function kennungAnzeige(kennung: number | null): string {
  if (kennung === null) {
    return KENNUNG_FEHLT
  }
  if (!Number.isSafeInteger(kennung) || kennung < 1) {
    throw new RangeError(`kennungAnzeige: Kennung muss eine Ganzzahl ≥ 1 sein, war ${String(kennung)}.`)
  }
  return `${PRAEFIX}${String(kennung).padStart(MINDESTSTELLEN, '0')}`
}
