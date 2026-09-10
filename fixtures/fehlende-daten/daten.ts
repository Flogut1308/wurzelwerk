// AP-0.12 — Fixture "fehlende-daten". Siehe beschreibung.md.
import type { FixtureBeschreibung } from '../../test/hilfsmittel/fixture-bauen'

export const daten: FixtureBeschreibung = {
  personen: [
    // Fast jedes optionale Feld bleibt unbelegt (Geschlecht, Lebend-Status unbekannt).
    { schluessel: 'max', privat: 0, ist_platzhalter: 0 },
    // Ein Platzhalter-Vorfahre, komplett ohne eigenen Namenseintrag (unten: keine `namen`-Zeile
    // mit personSchluessel 'unbekannter-vorfahre').
    { schluessel: 'unbekannter-vorfahre', privat: 0, ist_platzhalter: 1, platzhalter_grund: 'nicht_identifiziert' },
  ],
  namen: [
    // Nur Vorname, kein Nachname, keine Schrift — der häufigste "fehlende Daten"-Fall überhaupt.
    { schluessel: 'max-name', personSchluessel: 'max', typ: 'geburtsname', vornamen: 'Max', ist_bevorzugt: 1 },
  ],
  elternschaften: [
    // Elternschaft mit unbekanntem Typ und ohne Konfidenzangabe zu einer namenlosen Person.
    { schluessel: 'unbekannt-max', elternteilSchluessel: 'unbekannter-vorfahre', kindSchluessel: 'max', typ: 'unbekannt' },
  ],
}
