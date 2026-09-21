// AP-1.11 (72_Screens_und_Flows.md S-19): die EINZIGE Wahrheit darüber, welche Bausteine die
// Zustandsbibliothek zeigt — `zustandsbibliothek.tsx` (die Seite) und
// `test/gestaltung/bibliothek-vollstaendig.test.ts` (der Wächter) teilen diese Liste. Ein neuer
// Baustein unter `src/renderer/bausteine/*.tsx` ohne Eintrag hier ist im Test rot — „Jedes folgende
// Oberflächenpaket trägt seine Zustände hier ein" (Auftragstext AP-1.11).
//
// Reihenfolge = Anzeigereihenfolge auf der Seite: erst die Atome (§2.1-Tabellenreihenfolge), dann
// die Moleküle/Organismen in der Reihenfolge ihrer Entstehung.
export const ZUSTANDSBIBLIOTHEK_EINTRAEGE: readonly string[] = [
  // Atome (docs/71_Designsystem.md §2.1)
  'text',
  'symbol',
  'schaltflaeche',
  'schaltflaeche-symbol',
  'eingabekoerper',
  'abzeichen',
  'konfidenz-punkt',
  'widerspruch-zeichen',
  'trennlinie',
  'fokusring',
  'ladeschimmer',
  'tastenkappe',
  'zaehler',
  'umschalter',
  'kontrollkaestchen',
  'optionsfeld',
  'fortschritt',
  // Moleküle/Organismen (docs/71_Designsystem.md §2.2/§2.3)
  'formularfeld',
  'textfeld',
  'zahlfeld',
  'langtextfeld',
  'konfidenzwaehler',
  'datumsfeld',
  'auswahlfeld',
  'beleg-abzeichen',
  'blaetterleiste',
  'feld-konfidenz',
  'filterleiste',
  'suchfeld',
  'tabellenzeile',
  'leerzustand-block',
  'schrittleiste',
  'seitenschublade',
  'fehlerliste-import',
  'trockenlauf-bericht',
  'datentabelle',
  'vorschlagskarte',
  'personenwaehler',
  'ortsfeld',
  'archivfeld',
]
