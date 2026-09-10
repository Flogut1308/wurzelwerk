// AP-0.12 — Fixture "kaputte-kodierung". Siehe beschreibung.md.
//
// Alle Zeichenketten hier sind ABSICHTLICH kaputt — keine Tippfehler dieser Datei. Herkunft je
// String steht im Kommentar daneben. Das Ziel: Suchnormalform, Kölner Phonetik und spätere
// Anzeige-/Importcode-Pfade dürfen an solchen Zeichenketten weder abstürzen noch sie stillschweigend
// "reparieren" (eine echte Reparatur ist ohne Kenntnis der Original-Quellkodierung nicht möglich).
import type { FixtureBeschreibung } from '../../test/hilfsmittel/fixture-bauen'

export const daten: FixtureBeschreibung = {
  personen: [
    { schluessel: 'hans', privat: 0, ist_platzhalter: 0, geschlecht: 'M' },
    { schluessel: 'greta', privat: 0, ist_platzhalter: 0, geschlecht: 'F' },
    { schluessel: 'ersatzzeichen', privat: 0, ist_platzhalter: 0, geschlecht: 'U' },
    { schluessel: 'mischschrift', privat: 0, ist_platzhalter: 0, geschlecht: 'U' },
  ],
  namen: [
    {
      // UTF-8-Bytes von "Müller", fälschlich als Windows-1252/Latin-1 dekodiert — der klassische
      // Mojibake-Fall bei GEDCOM-Dateien mit falsch erkannter Kodierung.
      schluessel: 'hans-name',
      personSchluessel: 'hans',
      typ: 'geburtsname',
      vornamen: 'Hans',
      nachname: 'MÃ¼ller',
      original_text: 'MÃ¼ller',
      ist_bevorzugt: 1,
    },
    {
      // UTF-8-Bytes von "Schröder", fälschlich als Latin-1 dekodiert.
      schluessel: 'greta-name',
      personSchluessel: 'greta',
      typ: 'geburtsname',
      vornamen: 'Greta',
      nachname: 'SchrÃ¶der',
      original_text: 'SchrÃ¶der',
      ist_bevorzugt: 1,
    },
    {
      // Nicht mehr rekonstruierbarer Bytefehler: das Unicode-Ersatzzeichen U+FFFD anstelle eines
      // nicht dekodierbaren Bytes mitten im Namen ("M?ller" mit Fragezeichen-Symbol statt "ü").
      schluessel: 'ersatzzeichen-name',
      personSchluessel: 'ersatzzeichen',
      typ: 'geburtsname',
      vornamen: 'Wa�lter',
      nachname: 'M�ller',
      original_text: 'M�ller',
      ist_bevorzugt: 1,
    },
    {
      // Gemischtes Schriftsystem INNERHALB eines Tokens: kyrillische Homoglyphen (Р U+0420, а
      // U+0430) vermischt mit lateinischen Buchstaben — sieht aus wie "Paul", ist es zeichengenau
      // nicht. Simuliert einen Copy-&-Paste-Import aus einer kyrillischen Quelle ohne Umschrift.
      schluessel: 'mischschrift-name',
      personSchluessel: 'mischschrift',
      typ: 'sonstiges',
      vornamen: 'Раul', // "Раul": Cyrillic Р, а + lateinisches u, l
      nachname: 'Ми́ller', // kyrillisches М, и + Combining Acute + lateinisches ller
      original_text: 'Раul Ми́ller',
      ist_bevorzugt: 0,
    },
  ],
}
