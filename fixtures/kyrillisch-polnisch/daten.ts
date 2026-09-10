// AP-0.12 — Fixture "kyrillisch-polnisch". Siehe beschreibung.md.
import type { FixtureBeschreibung } from '../../test/hilfsmittel/fixture-bauen'

export const daten: FixtureBeschreibung = {
  personen: [
    { schluessel: 'ivan', privat: 0, ist_platzhalter: 0, geschlecht: 'M', lebend_status: 'verstorben' },
    { schluessel: 'irina', privat: 0, ist_platzhalter: 0, geschlecht: 'F', lebend_status: 'verstorben' },
    { schluessel: 'lukasz', privat: 0, ist_platzhalter: 0, geschlecht: 'M', lebend_status: 'lebend' },
    { schluessel: 'zofia', privat: 0, ist_platzhalter: 0, geschlecht: 'F', lebend_status: 'lebend' },
  ],
  namen: [
    {
      // Kyrillisches Original — Ausgangspunkt für die spätere ISO-9-Umschrift (AP-1.2, ADR-014).
      schluessel: 'ivan-original',
      personSchluessel: 'ivan',
      typ: 'geburtsname',
      schrift: 'cyrl',
      sprache: 'ru',
      vornamen: 'Иван',
      nachname: 'Иванов',
      ist_bevorzugt: 1,
    },
    {
      // Erzeugter Umschrift-Eintrag (ISO 9, umkehrbar, ADR-014) — verweist auf den Originalnamen und
      // ist NIE `ist_bevorzugt` (57_Phase0_Arbeitspakete.md AP-1.2-Abnahme).
      schluessel: 'ivan-transliteriert',
      personSchluessel: 'ivan',
      typ: 'transliteriert',
      schrift: 'latn',
      sprache: 'ru',
      vornamen: 'Ivan',
      nachname: 'Ivanov',
      umschriftVonSchluessel: 'ivan-original',
      umschrift_norm: 'iso9',
      ist_bevorzugt: 0,
    },
    {
      schluessel: 'irina-name',
      personSchluessel: 'irina',
      typ: 'geburtsname',
      schrift: 'cyrl',
      sprache: 'ru',
      vornamen: 'Ирина',
      nachname: 'Иванова', // weibliche Nachnamensform (kyrillische Patronymik-Flexion)
      ist_bevorzugt: 1,
    },
    {
      // Polnische diakritische Zeichen: Ł, ś — Standard-UTF-8, keine Mojibake (Abgrenzung zur
      // Fixture "kaputte-kodierung").
      schluessel: 'lukasz-name',
      personSchluessel: 'lukasz',
      typ: 'geburtsname',
      schrift: 'latn',
      sprache: 'pl',
      vornamen: 'Łukasz',
      nachname: 'Wiśniewski',
      ist_bevorzugt: 1,
    },
    {
      // Weiterer polnischer Diakritika-Härtefall: Ż, ó, ć in einem einzigen Nachnamen.
      schluessel: 'zofia-name',
      personSchluessel: 'zofia',
      typ: 'geburtsname',
      schrift: 'latn',
      sprache: 'pl',
      vornamen: 'Zofia',
      nachname: 'Żółć',
      ist_bevorzugt: 1,
    },
  ],
  elternschaften: [{ schluessel: 'ivan-irina', elternteilSchluessel: 'ivan', kindSchluessel: 'irina', typ: 'biologisch' }],
}
