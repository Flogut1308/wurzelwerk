// AP-0.12 — Fixture "adoption". Siehe beschreibung.md.
import type { FixtureBeschreibung } from '../../test/hilfsmittel/fixture-bauen'

export const daten: FixtureBeschreibung = {
  personen: [
    { schluessel: 'kind', privat: 0, ist_platzhalter: 0, geschlecht: 'F', lebend_status: 'lebend' },
    { schluessel: 'leibliche-mutter', privat: 0, ist_platzhalter: 0, geschlecht: 'F', lebend_status: 'verstorben' },
    { schluessel: 'adoptivvater', privat: 0, ist_platzhalter: 0, geschlecht: 'M', lebend_status: 'verstorben' },
    { schluessel: 'adoptivmutter', privat: 0, ist_platzhalter: 0, geschlecht: 'F', lebend_status: 'verstorben' },
  ],
  namen: [
    { schluessel: 'kind-geburtsname', personSchluessel: 'kind', typ: 'geburtsname', vornamen: 'Erika', nachname: 'Leiblich', ist_bevorzugt: 0 },
    { schluessel: 'kind-adoptivname', personSchluessel: 'kind', typ: 'ehename', vornamen: 'Erika', nachname: 'Adoptiv', ist_bevorzugt: 1 },
    { schluessel: 'leibliche-mutter-name', personSchluessel: 'leibliche-mutter', typ: 'geburtsname', vornamen: 'Gertrud', nachname: 'Leiblich', ist_bevorzugt: 1 },
    { schluessel: 'adoptivvater-name', personSchluessel: 'adoptivvater', typ: 'geburtsname', vornamen: 'Heinrich', nachname: 'Adoptiv', ist_bevorzugt: 1 },
    { schluessel: 'adoptivmutter-name', personSchluessel: 'adoptivmutter', typ: 'geburtsname', vornamen: 'Frieda', nachname: 'Adoptiv', ist_bevorzugt: 1 },
  ],
  elternschaften: [
    // Leibliche Abstammung bleibt dokumentiert (Vater unbekannt — bewusst keine dritte Elternkante).
    { schluessel: 'mutter-kind-biologisch', elternteilSchluessel: 'leibliche-mutter', kindSchluessel: 'kind', typ: 'biologisch', konfidenz: 3 },
    // Zusätzlich zwei adoptive Elternkanten auf dieselbe Person — genau der Fall, der eine
    // "genau ein Vater/eine Mutter"-Annahme in Layout oder Plausibilitätsprüfung widerlegt.
    { schluessel: 'vater-kind-adoptiv', elternteilSchluessel: 'adoptivvater', kindSchluessel: 'kind', typ: 'adoptiv' },
    { schluessel: 'mutter-kind-adoptiv', elternteilSchluessel: 'adoptivmutter', kindSchluessel: 'kind', typ: 'adoptiv' },
  ],
}
