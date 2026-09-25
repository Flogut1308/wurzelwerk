// AP-1.30 (PR 5): die feste Liste „Tabelle → Personenbezug“ für `abfrage:journal.verlauf` mit
// Filter `personId` (rechte Spalte des Personenprofils, später S-16/AP-1.23). Sie beschreibt, an
// welchen Schlüsseln des JSON-Zeilenbilds (`COALESCE(wert_neu_json, wert_alt_json)` einer
// `aenderung`-Zeile, ADR-017 — die Schlüssel sind die Spaltennamen, s. docs/schema/
// trigger_generiert.sql) eine Änderung einer Person zugeordnet wird.
//
// Warum hier und nicht in `src/core`: die Liste ist Schemawissen (Tabellen- und Spaltennamen), aus
// dem `journal-verlauf.ts` konstantes SQL erzeugt, und sie ist an `JournalisierteTabelle`
// (`src/main/journal/journalisierung.ts`) gebunden. `core` kennt kein SQL und keine Tabellen
// (CLAUDE.md §2); ein Fachbegriff ohne Datenbank ist das nicht.
//
// Vollständigkeit: jede Tabelle aus `JOURNALISIERT` steht in `PERSONENBEZUG` ODER ausdrücklich,
// mit Begründung, in `OHNE_PERSONENBEZUG` — geprüft von test/einheit/journal-verlauf-personenbezug.test.ts.
// Eine neue journalisierte Tabelle fällt dort auf, statt stillschweigend aus dem Verlauf zu fallen.
import type { JournalisierteTabelle } from '../journal/journalisierung'

/**
 * Über welche Art Datensatz eine mittelbar betroffene Zeile zur Person findet. Die Werte sind
 * bewusst deckungsgleich mit `aussage.subjekt_typ`/`medium_zuordnung.subjekt_typ`/
 * `feld_wert.subjekt_typ` (docs/schema/0005_import_luecken.sql): eine Aussage über ein Ereignis
 * der Person (z. B. die Existenz-Aussage der Geburt) findet so über denselben Anker zur Person wie
 * eine Änderung der `ereignis`-Zeile selbst.
 */
export type Ankerart = 'name' | 'ereignis' | 'elternschaft' | 'partnerschaft' | 'aussage'

/** Eine personenbezogene Zeile stellt einen Anker bereit: den Wert von `spalte` unter `art`. */
export interface Anker {
  readonly art: Ankerart
  readonly spalte: string
}

export type Personenbezug =
  /** Die Person-ID steht in einer dieser Spalten. */
  | { readonly art: 'spalten'; readonly spalten: readonly [string, ...string[]]; readonly anker?: Anker }
  /** Polymorph (E-7): `typSpalte = 'person'` und `idSpalte` = Person-ID; andere Subjekttypen
   * finden über `Ankerart` zur Person, sofern der Typ eine Ankerart ist. */
  | { readonly art: 'subjekt'; readonly typSpalte: string; readonly idSpalte: string; readonly anker?: Anker }
  /** Mittelbar: `spalte` verweist auf einen Anker der Art `ankerart`. */
  | { readonly art: 'ueber'; readonly ankerart: Ankerart; readonly spalte: string }

/** Gesundheitsdaten (M-08, DSGVO Art. 9): eine Transaktion, die NUR diese Tabellen ändert, erscheint
 * im Verlauf ohne Inhalt (keine Beschreibung) — nur Art, Zeit, Anzahl. */
export const GESUNDHEIT_TABELLEN = ['diagnose', 'risikofaktor'] as const satisfies readonly JournalisierteTabelle[]

export const PERSONENBEZUG: Readonly<Partial<Record<JournalisierteTabelle, Personenbezug>>> = {
  person: { art: 'spalten', spalten: ['id'] },
  name_form: { art: 'spalten', spalten: ['person_id'], anker: { art: 'name', spalte: 'id' } },
  name_part: { art: 'ueber', ankerart: 'name', spalte: 'name_form_id' },
  ereignis: { art: 'ueber', ankerart: 'ereignis', spalte: 'id' },
  beteiligung: { art: 'spalten', spalten: ['person_id'], anker: { art: 'ereignis', spalte: 'ereignis_id' } },
  elternschaft: { art: 'spalten', spalten: ['elternteil_id', 'kind_id'], anker: { art: 'elternschaft', spalte: 'id' } },
  partnerschaft: { art: 'ueber', ankerart: 'partnerschaft', spalte: 'id' },
  partnerschaft_person: { art: 'spalten', spalten: ['person_id'], anker: { art: 'partnerschaft', spalte: 'partnerschaft_id' } },
  assoziation: { art: 'spalten', spalten: ['person_a_id', 'person_b_id'] },
  quelle: { art: 'spalten', spalten: ['informant_person_id'] },
  aussage: { art: 'subjekt', typSpalte: 'subjekt_typ', idSpalte: 'subjekt_id', anker: { art: 'aussage', spalte: 'id' } },
  aussage_zitat: { art: 'ueber', ankerart: 'aussage', spalte: 'aussage_id' },
  negativbefund: { art: 'spalten', spalten: ['gesuchte_person_id'] },
  persona: { art: 'spalten', spalten: ['person_id'] },
  medium_zuordnung: { art: 'subjekt', typSpalte: 'subjekt_typ', idSpalte: 'subjekt_id' },
  medium_region: { art: 'spalten', spalten: ['person_id'] },
  aufgabe: { art: 'spalten', spalten: ['person_id'] },
  diagnose: { art: 'spalten', spalten: ['person_id'] },
  risikofaktor: { art: 'spalten', spalten: ['person_id'] },
  feld_wert: { art: 'subjekt', typSpalte: 'subjekt_typ', idSpalte: 'subjekt_id' },
  interview_sitzung: { art: 'spalten', spalten: ['informant_person_id'] },
  // `datensatz_typ` ist der Zieltabellenname (src/main/import/ausfuehrung.ts); 'person' trifft
  // direkt, 'ereignis'/'elternschaft'/'partnerschaft'/'aussage' über den gleichnamigen Anker.
  import_herkunft: { art: 'subjekt', typSpalte: 'datensatz_typ', idSpalte: 'datensatz_id' },
}

/** Journalisierte Tabellen ohne Personenbezug — jede mit Begründung. */
export const OHNE_PERSONENBEZUG: Readonly<Partial<Record<JournalisierteTabelle, string>>> = {
  ort: 'Ortsstammdaten, von vielen Personen geteilt — eine Ortsänderung ist keine Änderung an der Person.',
  ortsname: 'Name eines geteilten Orts (s. ort).',
  ortszugehoerigkeit: 'Ortshierarchie, personenunabhängig (s. ort).',
  ort_externe_id: 'Externe Kennung eines geteilten Orts (s. ort).',
  archiv: 'Archivstammdaten, von vielen Quellen geteilt.',
  zitat: 'Fundstelle in einer Quelle; der Bezug zur Person läuft über aussage_zitat (gelistet).',
  medium: 'Mediendatei; der Bezug zur Person läuft über medium_zuordnung/medium_region (gelistet).',
  feld_definition: 'Definition eines benutzerdefinierten Felds, personenunabhängig; Werte stehen in feld_wert (gelistet).',
  feld_auswahloption: 'Auswahlliste einer Felddefinition, personenunabhängig.',
  import_lauf: 'Metadaten eines Importlaufs; der Bezug zur Person läuft über import_herkunft (gelistet).',
  ansicht_zustand: 'Gespeicherte Baumansicht; die Zentrumsperson ist ein Blickpunkt, keine Änderung an der Person.',
}
