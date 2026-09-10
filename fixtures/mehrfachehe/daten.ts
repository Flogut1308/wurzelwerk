// AP-0.12 — Fixture "mehrfachehe". Siehe beschreibung.md.
import type { FixtureBeschreibung } from '../../test/hilfsmittel/fixture-bauen'

export const daten: FixtureBeschreibung = {
  personen: [
    { schluessel: 'karl', privat: 0, ist_platzhalter: 0, geschlecht: 'M', lebend_status: 'verstorben' },
    { schluessel: 'maria', privat: 0, ist_platzhalter: 0, geschlecht: 'F', lebend_status: 'verstorben' },
    { schluessel: 'luise', privat: 0, ist_platzhalter: 0, geschlecht: 'F', lebend_status: 'verstorben' },
    { schluessel: 'otto', privat: 0, ist_platzhalter: 0, geschlecht: 'M', lebend_status: 'verstorben' },
    { schluessel: 'paul', privat: 0, ist_platzhalter: 0, geschlecht: 'M', lebend_status: 'verstorben' },
  ],
  namen: [
    { schluessel: 'karl-name', personSchluessel: 'karl', typ: 'geburtsname', vornamen: 'Karl', nachname: 'Beispiel', ist_bevorzugt: 1 },
    { schluessel: 'maria-name', personSchluessel: 'maria', typ: 'geburtsname', vornamen: 'Maria', nachname: 'Erste', ist_bevorzugt: 1 },
    { schluessel: 'luise-name', personSchluessel: 'luise', typ: 'geburtsname', vornamen: 'Luise', nachname: 'Zweite', ist_bevorzugt: 1 },
    { schluessel: 'otto-name', personSchluessel: 'otto', typ: 'geburtsname', vornamen: 'Otto', nachname: 'Beispiel', ist_bevorzugt: 1 },
    { schluessel: 'paul-name', personSchluessel: 'paul', typ: 'geburtsname', vornamen: 'Paul', nachname: 'Beispiel', ist_bevorzugt: 1 },
  ],
  elternschaften: [
    // Otto: Sohn aus Karls erster Verbindung (mit Maria).
    { schluessel: 'karl-otto', elternteilSchluessel: 'karl', kindSchluessel: 'otto', typ: 'biologisch' },
    { schluessel: 'maria-otto', elternteilSchluessel: 'maria', kindSchluessel: 'otto', typ: 'biologisch' },
    // Paul: Sohn aus Karls zweiter Verbindung (mit Luise, nach Marias Tod/Scheidung) — Karl ist
    // Elternteil in zwei Elternschafts-Zeilen mit unterschiedlichen Ko-Eltern.
    { schluessel: 'karl-paul', elternteilSchluessel: 'karl', kindSchluessel: 'paul', typ: 'biologisch' },
    { schluessel: 'luise-paul', elternteilSchluessel: 'luise', kindSchluessel: 'paul', typ: 'biologisch' },
  ],
}
