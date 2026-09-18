// AP-1.6 PR1, C-16/C-17. Reiner Ergebnistyp von `sucheAnfrageBauen()` (anfrage.ts) — kein
// Datenbankbegriff, kein Node (CLAUDE.md §2).

/**
 * Aus einem rohen Sucheingabetext gebaute FTS5-Anfrage (`src/main/abfragen/suche.ts` benutzt
 * `matchAusdruck` direkt als `MATCH`-Parameter, `koelnerCodes` für die Kölner-Phonetik-Nebensuche).
 */
export interface SucheAnfrage {
  /** Fertiger FTS5-`MATCH`-Ausdruck, jedes Token als eigene, escapte Phrase — leer, wenn `tokens` leer ist. */
  readonly matchAusdruck: string
  /** Die Eingabe, an Leerraum aufgeteilt (getrimmt, ohne leere Segmente). */
  readonly tokens: readonly string[]
  /** Kölner-Phonetik-Code je Token (leere Codes ausgelassen) — Grundlage der schwächeren zweiten Suchquelle. */
  readonly koelnerCodes: readonly string[]
}
