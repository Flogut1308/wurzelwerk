// Core-lokale Typen für unscharfe genealogische Datumsangaben (AP-1.1, 50_Datenmodell.md §2.3).
// Reines TypeScript: KEIN Import aus src/shared — src/core darf src/shared nicht importieren
// (CLAUDE.md §2). Die Literale hier spiegeln KalenderEnum/DatumModifikatorEnum/
// DatumPraezisionEnum aus src/shared/schemata/gemeinsam.ts; Drift zwischen beiden Schichten
// bricht test/einheit/datum-parser.test.ts (der Test darf core+shared importieren — er ist
// Prüfmaterial, keine Produktionsgrenzverletzung).

/** Deckt sich mit `KalenderEnum` (src/shared/schemata/gemeinsam.ts). */
export type Kalender = 'gregorian' | 'julian' | 'hebrew' | 'french_r'

/** Deckt sich mit `DatumPraezisionEnum`. */
export type Praezision = 'tag' | 'monat' | 'jahr' | 'jahrzehnt'

/** Deckt sich mit `DatumModifikatorEnum`. */
export type Modifikator = 'exakt' | 'etwa' | 'vor' | 'nach' | 'zwischen' | 'von_bis' | 'geschaetzt' | 'berechnet'

/**
 * Ein unscharfer genealogischer Datumswert, wie er als Spaltengruppe eingebettet wird
 * (50_Datenmodell.md §2.3). `wert1` ist immer das Originaldatum in seinem Originalkalender,
 * ISO-artig mit erlaubten Teilangaben ('1750'|'1750-03'|'1750-03-14'). `sortVon`/`sortBis` sind
 * julianische Tageszahlen (JDN) und garantieren `sortVon <= sortBis`
 * (siehe sortierschluessel.ts).
 */
export interface Datumswert {
  readonly kalender: Kalender
  readonly modifikator: Modifikator
  readonly praezision: Praezision
  readonly wert1: string
  readonly wert2?: string
  readonly originaltext?: string
  readonly sortVon: number
  readonly sortBis: number
  readonly zweitkalender?: Kalender
  readonly zweitwert?: string
  readonly doppeljahr?: string
}

/** Fehlergründe von `parse()` (parser.ts) — geschlossene Union, kein `code: string` (CLAUDE.md §7). */
export type ParseGrund = 'leer' | 'unbekanntes_format' | 'ungueltiger_tag' | 'ungueltiger_monat'

/** `parse()` wirft nie — jedes Ergebnis ist entweder ein gültiger Datumswert oder ein `ParseGrund`. */
export type ParseErgebnis = { readonly ok: true; readonly wert: Datumswert } | { readonly ok: false; readonly grund: ParseGrund }

/** i18n-Schlüssel + Platzhalterwerte für die Anzeige. KEIN i18next/`t()` in src/core (CLAUDE.md §4). */
export interface Formatergebnis {
  readonly schluessel: string
  readonly werte: Readonly<Record<string, string | number>>
}

/**
 * Sentinel-JDN für die offene untere Grenze eines `vor`-Intervalls: proleptisch-gregorianischer
 * Jahresanfang des Jahres -4712 (astronomische Zählung, entspricht 4713 v. Chr.) — nahe am
 * klassischen Epochenjahr der julianischen Tageszahl selbst (JDN 0 = 1. Januar 4713 v. Chr.,
 * proleptisch julianisch), hier als praktische "unendlich früh"-Grenze für Sortierzwecke von
 * Hand berechnet (Richards-Algorithmus, gregorianischer Zweig; siehe kalender.ts) und als
 * Literal hinterlegt — NICHT über kalender.ts erzeugt, sonst hinge typen.ts zyklisch von
 * kalender.ts ab (kalender.ts importiert umgekehrt `Kalender` von hier).
 */
export const SENTINEL_JDN_MIN = 38

/**
 * Sentinel-JDN für die offene obere Grenze eines `nach`-Intervalls: proleptisch-gregorianisches
 * Jahresende des Jahres 9999 (31. Dezember 9999) — als praktische "unendlich spät"-Grenze.
 * Gleiche Herleitung/Einschränkung wie `SENTINEL_JDN_MIN`.
 */
export const SENTINEL_JDN_MAX = 5373484
