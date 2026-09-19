// AP-1.10 PR-A (U-1.6-lebensdaten-unschaerfe): baut aus der vollen Datums-Spaltengruppe
// (`PersonListeZeile.geburt_datum`/`tod_datum`, src/shared/schemata/person-liste.ts) einen
// `Datumswert` (src/core/datum/typen.ts) und ruft `formatiere()` (src/core/datum/formatierer.ts) —
// KEINE eigene Formatierlogik hier (CLAUDE.md §14 Fall 1, jetzt geschlossen: die Zelle zeigt „etwa
// 1890 – 1961" statt nur der Jahreszahl). Reines TypeScript, kein i18next/`t()`: der Aufrufer
// (`tabellenzeile.tsx`) übersetzt das zurückgegebene `Formatergebnis` selbst — hier bleibt nur die
// Umformung plus die Geburt–Tod-Verkettung, damit beides ohne DOM/i18n unit-testbar bleibt. Ersetzt
// die frühere `datentabelle-format.ts` (nur Jahreszahlen, s. Git-Historie).
import { formatiere } from '../../core/datum/formatierer'
import type { Datumswert, Formatergebnis } from '../../core/datum/typen'
import type { PersonListeDatumsgruppe } from '../../shared/schemata/person-liste'

/** `PersonListeDatumsgruppe` (DB-nahe, `null` statt fehlendem Feld) → `Datumswert` (core-Vertrag,
 * `exactOptionalPropertyTypes`: ein fehlendes `wert2`/`originaltext` muss FEHLEN, nicht `undefined`
 * gesetzt sein — CLAUDE.md §4). `null` insgesamt, wenn die Person keine entsprechende Aussage hat. */
export function datumsgruppeZuDatumswert(gruppe: PersonListeDatumsgruppe | null): Datumswert | null {
  if (gruppe === null) return null
  return {
    kalender: gruppe.kalender,
    modifikator: gruppe.modifikator,
    praezision: gruppe.praezision,
    wert1: gruppe.wert1,
    sortVon: gruppe.sortVon,
    sortBis: gruppe.sortBis,
    ...(gruppe.wert2 === null ? {} : { wert2: gruppe.wert2 }),
    ...(gruppe.originaltext === null ? {} : { originaltext: gruppe.originaltext }),
  }
}

/** `null` ohne Datumsgruppe, sonst das `Formatergebnis` aus `formatiere()` — der Aufrufer übersetzt
 * es mit `t(schluessel, werte)` (namespace `datum`, src/shared/i18n/de/datum.json). */
export function lebensdatenFormatergebnis(gruppe: PersonListeDatumsgruppe | null): Formatergebnis | null {
  const wert = datumsgruppeZuDatumswert(gruppe)
  return wert === null ? null : formatiere(wert)
}

/** Verkettet die bereits übersetzten Geburts-/Todestexte zu einer Zelle ("etwa 1890 – 1961").
 * `null`/`null` → leere Zeichenkette (keine Lebensdaten bekannt). Der Bindestrich lebt hier, in
 * einer .ts-Datei, nicht als Zeichenkette in einem JSX-Kindknoten (react/jsx-no-literals,
 * CLAUDE.md §4 — derselbe Grund, aus dem schon die frühere `datentabelle-format.ts` eine eigene
 * Datei war). */
export function lebensdatenAnzeige(geburtText: string | null, todText: string | null): string {
  if (geburtText === null && todText === null) return ''
  return `${geburtText ?? ''} – ${todText ?? ''}`
}
