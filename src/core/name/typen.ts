// Core-lokale Typen für Namen, Umschrift und Anzeige (AP-1.2, ADR-014, 50_Datenmodell.md §2.2).
// Reines TypeScript: KEIN Import aus src/shared — src/core darf src/shared nicht importieren
// (CLAUDE.md §2). Die Literale hier spiegeln NameTypEnum/SchriftEnum/UmschriftNormEnum aus
// src/shared/schemata/name.ts; Drift zwischen beiden Schichten bricht
// test/einheit/name-anzeige.test.ts (der Test darf core+shared importieren — er ist
// Prüfmaterial, keine Produktionsgrenzverletzung).

/** Deckt sich mit `SchriftEnum` (src/shared/schemata/name.ts). */
export type Schrift = 'latn' | 'cyrl'

/** Deckt sich mit `UmschriftNormEnum`. */
export type UmschriftNorm = 'iso9' | 'din1460' | 'manuell'

/** Deckt sich mit `NameTypEnum`. */
export type NameTyp =
  | 'geburtsname'
  | 'ehename'
  | 'vulgo'
  | 'latinisiert'
  | 'transliteriert'
  | 'ordensname'
  | 'beruf'
  | 'aka'
  | 'sonstiges'

/**
 * Zerlegte Namensbestandteile, wie sie in einer `name`-Zeile eingebettet sind
 * (50_Datenmodell.md §2.2) — bewusst OHNE DB-Felder (keine `id`, kein `person_id`): der Kern
 * bleibt frei von Datenbank-Konzepten (CLAUDE.md §2).
 */
export interface Namensbestandteile {
  /** Alle Vornamen als ein durch Leerzeichen getrennter Text, in Reihenfolge. */
  readonly vornamen?: string
  /** 0-basierter Index in `vornamen` (durch Leerzeichen getrennt), welcher Vorname Rufname ist. */
  readonly rufnameIndex?: number
  /** Freitext-Rufname — gewinnt gegenüber `rufnameIndex`, falls beide gesetzt sind. */
  readonly rufnameText?: string
  readonly nachname?: string
  readonly praefix?: string
  readonly titelVor?: string
  readonly zusatzNach?: string
}

/** Ein einzelner Vorname innerhalb der Anzeige-Kette, mit Rufname-Markierung. */
export interface AnzeigenameVorname {
  readonly text: string
  readonly istRufname: boolean
}

/**
 * Ergebnis von `anzeigename()` (anzeige.ts): strukturierte Segmente, KEIN fertiger String und
 * KEIN i18n im Kern (CLAUDE.md §4) — das Zusammensetzen zu sichtbarem Text ist Sache des
 * Renderers (src/renderer/i18n/de/).
 */
export interface Anzeigename {
  readonly titelVor?: string
  readonly vornamen: readonly AnzeigenameVorname[]
  readonly praefix?: string
  readonly nachname?: string
  readonly zusatzNach?: string
}
