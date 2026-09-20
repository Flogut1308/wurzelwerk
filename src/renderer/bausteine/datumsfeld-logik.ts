// AP-1.13 PR-A (docs/71_Designsystem.md §3.1): die Interpretationslogik des `Datumsfeld` — reines
// TypeScript, KEIN i18next/`t()` hier (dasselbe Muster wie `lebensdaten-anzeige.ts`). Ruft
// AUSSCHLIESSLICH `parse()`/`formatiere()` aus src/core/datum auf — keine zweite Parselogik im
// Renderer. Der Aufrufer (`datumsfeld.tsx`) übersetzt die zurückgegebenen Schlüssel mit `t(...)`.
import { formatiere } from '../../core/datum/formatierer'
import { parse } from '../../core/datum/parser'
import type { ParseGrund, Praezision } from '../../core/datum/typen'

/** i18n-Schlüssel je `ParseGrund` (Namensraum `felder`, src/shared/i18n/de/felder.json). */
function grundSchluessel(grund: ParseGrund): string {
  switch (grund) {
    case 'leer':
      return 'datumsfeld_grund_leer'
    case 'unbekanntes_format':
      return 'datumsfeld_grund_unbekanntes_format'
    case 'ungueltiger_tag':
      return 'datumsfeld_grund_ungueltiger_tag'
    case 'ungueltiger_monat':
      return 'datumsfeld_grund_ungueltiger_monat'
  }
}

/** i18n-Schlüssel je `Praezision` (Namensraum `felder`) — die „· Genauigkeit …"-Ergänzung aus dem
 * Entwurf (§3.1: „Verstanden als: etwa 1890 · Genauigkeit Jahr"). */
function genauigkeitSchluessel(praezision: Praezision): string {
  switch (praezision) {
    case 'tag':
      return 'datumsfeld_genauigkeit_tag'
    case 'monat':
      return 'datumsfeld_genauigkeit_monat'
    case 'jahr':
      return 'datumsfeld_genauigkeit_jahr'
    case 'jahrzehnt':
      return 'datumsfeld_genauigkeit_jahrzehnt'
  }
}

/**
 * Vier Arten der Interpretationszeile:
 * - `leer`: noch nichts Sinnvolles getippt — keine Zeile anzeigen (kein „nicht auflösbar" bei
 *   einem gerade erst geöffneten Feld).
 * - `nicht_aufloesbar`: `parse()` ist gescheitert, aber der Nutzer hat etwas getippt.
 * - `originaltext`: `formatiere()` hat `originaltext` gewählt (Doppeljahr, unbekannte Form mit
 *   eingebettetem Jahr) — wird UNVERÄNDERT gezeigt, keine „· Genauigkeit …"-Ergänzung (§3.1 Regel
 *   6: „nicht auf ein Jahr gerundet").
 * - `formatiert`: normaler Fall, inklusive Genauigkeitsangabe.
 */
export type DatumsfeldInterpretation =
  | { readonly art: 'leer' }
  | { readonly art: 'nicht_aufloesbar'; readonly grundSchluessel: string }
  | { readonly art: 'originaltext'; readonly schluessel: string; readonly werte: Readonly<Record<string, string | number>> }
  | {
      readonly art: 'formatiert'
      readonly schluessel: string
      readonly werte: Readonly<Record<string, string | number>>
      readonly genauigkeitSchluessel: string
    }

/** Wirft nie — wie `parse()` selbst (CLAUDE.md §5, dieselbe Zusicherung wie in
 * test/einheit/datum-parser.test.ts). */
export function datumsfeldInterpretation(text: string): DatumsfeldInterpretation {
  const bereinigt = text.trim()
  if (bereinigt.length === 0) {
    return { art: 'leer' }
  }

  const ergebnis = parse(text)
  if (!ergebnis.ok) {
    return { art: 'nicht_aufloesbar', grundSchluessel: grundSchluessel(ergebnis.grund) }
  }

  const formatergebnis = formatiere(ergebnis.wert)
  if (formatergebnis.schluessel === 'datum:originaltext') {
    return { art: 'originaltext', schluessel: formatergebnis.schluessel, werte: formatergebnis.werte }
  }

  return {
    art: 'formatiert',
    schluessel: formatergebnis.schluessel,
    werte: formatergebnis.werte,
    genauigkeitSchluessel: genauigkeitSchluessel(ergebnis.wert.praezision),
  }
}
