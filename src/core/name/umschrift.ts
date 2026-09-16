// Umschrift Kyrillisch <-> Latein (AP-1.2, ADR-014). Reine, deterministische Funktionen
// (CLAUDE.md §4). `iso9()`/`iso9Zurueck()` bauen ihre Maps aus DERSELBEN ISO9_TABELLE
// (umschrift-tabellen.ts) — eine vorwärts, eine zur Ladezeit invertiert — damit beide
// Richtungen garantiert zueinander passen. `din1460()` ist bewusst NUR vorwärts (Digraphen,
// nicht eindeutig umkehrbar, siehe umschrift-tabellen.ts).
import { DIN1460_VORWAERTS_TABELLE, ISO9_TABELLE } from './umschrift-tabellen'
import type { Namensbestandteile, UmschriftNorm } from './typen'

const ISO9_VOR_MAP: ReadonlyMap<string, string> = new Map(ISO9_TABELLE)
const ISO9_ZURUECK_MAP: ReadonlyMap<string, string> = new Map(ISO9_TABELLE.map(([kyrillisch, lateinisch]) => [lateinisch, kyrillisch]))
const DIN1460_VOR_MAP: ReadonlyMap<string, string> = new Map(DIN1460_VORWAERTS_TABELLE)

/** Wendet `zeichenMap` zeichenweise auf `text` an, nach NFC-Normalisierung. Unbekannte Zeichen werden 1:1 durchgereicht. */
function abbilden(text: string, zeichenMap: ReadonlyMap<string, string>): string {
  const normalisiert = text.normalize('NFC')
  let ergebnis = ''
  for (const zeichen of normalisiert) {
    ergebnis += zeichenMap.get(zeichen) ?? zeichen
  }
  return ergebnis
}

/** ISO 9:1995, kyrillisch -> lateinisch. Eindeutig umkehrbar über `iso9Zurueck()`. */
export function iso9(text: string): string {
  return abbilden(text, ISO9_VOR_MAP)
}

/** ISO 9:1995, lateinisch -> kyrillisch. Inverse von `iso9()`, aus derselben Tabelle gebaut. */
export function iso9Zurueck(text: string): string {
  return abbilden(text, ISO9_ZURUECK_MAP)
}

/** DIN 1460, kyrillisch -> lateinisch. NUR vorwärts — keine Rückfunktion (siehe umschrift-tabellen.ts). */
export function din1460(text: string): string {
  return abbilden(text, DIN1460_VOR_MAP)
}

/**
 * `true`, wenn eine automatische Umschrift (neu) erzeugt werden darf. Eine manuell korrigierte
 * Umschrift (`'manuell'`) wird nie automatisch überschrieben (ADR-014).
 */
export function sollUmschriftNeuErzeugen(vorhandeneNorm: UmschriftNorm | undefined): boolean {
  return vorhandeneNorm !== 'manuell'
}

/** Normen, die automatisch erzeugt werden dürfen — `'manuell'` ist ausgeschlossen (siehe `sollUmschriftNeuErzeugen`). */
export type UmschriftAutoNorm = Exclude<UmschriftNorm, 'manuell'>

const TRANSFORMATIONEN: Readonly<Record<UmschriftAutoNorm, (text: string) => string>> = {
  iso9,
  din1460,
}

function transliteriertesFeld(transformiere: (text: string) => string, wert: string | undefined): string | undefined {
  return wert === undefined ? undefined : transformiere(wert)
}

export interface UmschriftBestandteileErgebnis {
  readonly bestandteile: Namensbestandteile
  readonly umschriftNorm: UmschriftAutoNorm
}

/**
 * Transliteriert alle Textfelder von `quelle` nach `norm` (`rufnameIndex` bleibt unverändert —
 * Wortanzahl und -reihenfolge ändern sich durch Umschrift nicht). OHNE DB-Felder, ohne
 * Transaktion — der Kern bleibt rein (CLAUDE.md §2).
 */
export function umschriftBestandteile(quelle: Namensbestandteile, norm: UmschriftAutoNorm): UmschriftBestandteileErgebnis {
  const transformiere = TRANSFORMATIONEN[norm]
  const vornamen = transliteriertesFeld(transformiere, quelle.vornamen)
  const rufnameText = transliteriertesFeld(transformiere, quelle.rufnameText)
  const nachname = transliteriertesFeld(transformiere, quelle.nachname)
  const praefix = transliteriertesFeld(transformiere, quelle.praefix)
  const titelVor = transliteriertesFeld(transformiere, quelle.titelVor)
  const zusatzNach = transliteriertesFeld(transformiere, quelle.zusatzNach)

  const bestandteile: Namensbestandteile = {
    ...(vornamen !== undefined ? { vornamen } : {}),
    ...(quelle.rufnameIndex !== undefined ? { rufnameIndex: quelle.rufnameIndex } : {}),
    ...(rufnameText !== undefined ? { rufnameText } : {}),
    ...(nachname !== undefined ? { nachname } : {}),
    ...(praefix !== undefined ? { praefix } : {}),
    ...(titelVor !== undefined ? { titelVor } : {}),
    ...(zusatzNach !== undefined ? { zusatzNach } : {}),
  }

  return { bestandteile, umschriftNorm: norm }
}
