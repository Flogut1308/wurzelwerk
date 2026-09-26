// AP-1.13 PR-A (docs/71_Designsystem.md §3.1): die Interpretationslogik des `Datumsfeld` — reines
// TypeScript, KEIN i18next/`t()` hier (dasselbe Muster wie `lebensdaten-anzeige.ts`). Ruft
// AUSSCHLIESSLICH `parse()`/`formatiere()` aus src/core/datum auf — keine zweite Parselogik im
// Renderer. Der Aufrufer (`datumsfeld.tsx`) übersetzt die zurückgegebenen Schlüssel mit `t(...)`.
import { formatiere } from '../../core/datum/formatierer'
import { parse } from '../../core/datum/parser'
import type { Kalender, ParseGrund, Praezision } from '../../core/datum/typen'
import { modifikatorBrauchtOriginalText, type Datumswert as VertragsDatumswert } from '../../shared/schemata/import-v1'

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

/** Die EINE Stelle, an der der Renderer aus einer Freitext-Datumseingabe einen Vertrags-`Datumswert`
 * (`src/shared/schemata/import-v1.ts`) baut — genutzt vom Ereignisformular
 * (`ereignisDatumwertAusEntwurf`), vom Gesprächsdatum (`gespraechsdatumAusEntwurf`) und von den
 * Datums-Aussagen im Reiter Person (`reiter-person.tsx`).
 * `undefined` bei leerem/nicht auflösbarem Text.
 *
 * AP-1.30 Bugfix U-130-9b: `parse()` setzt `originaltext` nur für Doppeljahr/eingebettetes Jahr,
 * NICHT für „um/etwa/vor/nach 1890" oder „zwischen 1750 und 1760". Der Vertrag verlangt
 * `original_text`, sobald `modifikator ≠ exakt` (IMP-106) — sonst lehnt `befehl:ereignis.anlegen`
 * das Datum ab. Darum hier: fehlt `originaltext` und verlangt der Modifikator ihn, wird der getippte
 * (getrimmte) Text übernommen. Exakte Daten bleiben ohne `original_text`, damit ihre Anzeige
 * weiter formatiert statt wörtlich erscheint (`formatiere()` bevorzugt `originaltext`).
 * `kalender` markiert das Ergebnis nur als „in diesem Kalender gemeint" — `parse()` löst
 * ausschließlich gregorianische Schreibweisen auf, die Ziffern werden nicht umgerechnet. */
export function datumswertAusText(text: string, kalender: Kalender): VertragsDatumswert | undefined {
  const bereinigt = text.trim()
  if (bereinigt === '') return undefined
  const ergebnis = parse(bereinigt)
  if (!ergebnis.ok) return undefined
  const { wert } = ergebnis
  const originalText = wert.originaltext ?? (modifikatorBrauchtOriginalText(wert.modifikator) ? bereinigt : undefined)
  // Nicht gesetzte Felder fehlen ganz (statt `undefined`-Schlüssel) — Fassung aus dem Reiter
  // Person (PR #165), die hier aufgegangen ist.
  return {
    kalender,
    modifikator: wert.modifikator,
    praezision: wert.praezision,
    wert1: wert.wert1,
    ...(wert.wert2 === undefined ? {} : { wert2: wert.wert2 }),
    ...(originalText === undefined ? {} : { original_text: originalText }),
    ...(wert.doppeljahr === undefined ? {} : { doppeljahr: wert.doppeljahr }),
  }
}
