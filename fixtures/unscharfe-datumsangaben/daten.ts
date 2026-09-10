// AP-0.12 — Fixture "unscharfe-datumsangaben". Siehe beschreibung.md.
//
// `datum_sort_von`/`datum_sort_bis` sind hier NUR plausible Platzhalter-Ganzzahlen (grobe
// Jahreszahlen), keine echten julianischen Tageszahlen — der Datumsparser/die Sortierschlüssel
// kommen erst mit AP-1.1 (`src/core/datum/`, `40_Anforderungen.md` A-03). Diese Fixture prüft die
// SCHEMASPALTEN (Modifikator/Präzision/Originaltext/Doppeljahr), nicht die Umrechnung.
import type { FixtureBeschreibung } from '../../test/hilfsmittel/fixture-bauen'

export const daten: FixtureBeschreibung = {
  personen: [
    { schluessel: 'johann', privat: 0, ist_platzhalter: 0, geschlecht: 'M', lebend_status: 'verstorben' },
    { schluessel: 'anna', privat: 0, ist_platzhalter: 0, geschlecht: 'F', lebend_status: 'verstorben' },
    { schluessel: 'marie', privat: 0, ist_platzhalter: 0, geschlecht: 'F', lebend_status: 'verstorben' },
  ],
  namen: [
    { schluessel: 'johann-name', personSchluessel: 'johann', typ: 'geburtsname', vornamen: 'Johann', nachname: 'Ungenau', ist_bevorzugt: 1 },
    { schluessel: 'anna-name', personSchluessel: 'anna', typ: 'geburtsname', vornamen: 'Anna', nachname: 'Doppeldatiert', ist_bevorzugt: 1 },
    { schluessel: 'marie-name', personSchluessel: 'marie', typ: 'geburtsname', vornamen: 'Marie', nachname: 'Jahrzehnt', ist_bevorzugt: 1 },
  ],
  ereignisse: [
    {
      // "um 1750": geschätztes Jahr, keine Tages-/Monatsangabe.
      schluessel: 'johann-geburt',
      typ: 'geburt',
      datum_kalender: 'gregorian',
      datum_modifikator: 'etwa',
      datum_praezision: 'jahr',
      datum_wert1: '1750',
      datum_originaltext: 'um 1750',
      datum_sort_von: 1750,
      datum_sort_bis: 1750,
    },
    {
      // "zwischen 1810 und 1815": echtes Intervall, zwei Werte.
      schluessel: 'johann-tod',
      typ: 'tod',
      datum_kalender: 'gregorian',
      datum_modifikator: 'zwischen',
      datum_praezision: 'jahr',
      datum_wert1: '1810',
      datum_wert2: '1815',
      datum_originaltext: 'zwischen 1810 und 1815',
      datum_sort_von: 1810,
      datum_sort_bis: 1815,
    },
    {
      // Doppeldatierung (Julianisch/Gregorianisch, Kongresspolen-Fall aus 50_Datenmodell.md §2.3):
      // Originaldatum im Julianischen Kalender, Zweitkalender Gregorianisch, plus Doppeljahr wegen
      // Jahreswechsel zwischen den beiden Kalendern (a.st./a.n.).
      schluessel: 'anna-geburt',
      typ: 'geburt',
      datum_kalender: 'julian',
      datum_modifikator: 'exakt',
      datum_praezision: 'tag',
      datum_wert1: '1750-02-18',
      datum_zweitkalender: 'gregorian',
      datum_zweitwert: '1750-03-01',
      datum_doppeljahr: '1750/51',
      datum_originaltext: '18. Februar 1750/51 (a.st.)',
      datum_sort_von: 1750,
      datum_sort_bis: 1750,
    },
    {
      // Jahrzehnt-Präzision: "in den 1750er Jahren" — laut Vertrag spannt das Intervall zehn Jahre.
      schluessel: 'marie-geburt',
      typ: 'geburt',
      datum_kalender: 'gregorian',
      datum_modifikator: 'geschaetzt',
      datum_praezision: 'jahrzehnt',
      datum_wert1: '1750',
      datum_originaltext: 'in den 1750er Jahren (geschätzt)',
      datum_sort_von: 1750,
      datum_sort_bis: 1759,
    },
  ],
  beteiligungen: [
    { schluessel: 'johann-geburt-beteiligung', ereignisSchluessel: 'johann-geburt', personSchluessel: 'johann', rolle: 'hauptperson' },
    { schluessel: 'johann-tod-beteiligung', ereignisSchluessel: 'johann-tod', personSchluessel: 'johann', rolle: 'verstorbener' },
    { schluessel: 'anna-geburt-beteiligung', ereignisSchluessel: 'anna-geburt', personSchluessel: 'anna', rolle: 'hauptperson' },
    { schluessel: 'marie-geburt-beteiligung', ereignisSchluessel: 'marie-geburt', personSchluessel: 'marie', rolle: 'hauptperson' },
  ],
}
