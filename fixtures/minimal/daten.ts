// AP-0.12 — Fixture "minimal": der kleinstmögliche gültige Baum. Siehe beschreibung.md.
import type { FixtureBeschreibung } from '../../test/hilfsmittel/fixture-bauen'

export const daten: FixtureBeschreibung = {
  personen: [
    {
      schluessel: 'anna',
      privat: 0,
      ist_platzhalter: 0,
      geschlecht: 'F',
      lebend_status: 'verstorben',
    },
  ],
  namen: [
    {
      schluessel: 'anna-geburtsname',
      personSchluessel: 'anna',
      typ: 'geburtsname',
      schrift: 'latn',
      vornamen: 'Anna',
      nachname: 'Musterfrau',
      ist_bevorzugt: 1,
    },
  ],
}
