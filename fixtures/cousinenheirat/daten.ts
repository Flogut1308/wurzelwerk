// AP-0.12 — Fixture "cousinenheirat". Siehe beschreibung.md.
//
// Struktur (Diamant/Ahnenimplex):
//
//        Großvater ── Großmutter
//         /                  \
//     Vaterlinie          Mutterlinie      (Geschwister, beide Kinder von Großvater+Großmutter)
//        |                     |
//      Cousin ×  Ehepartnerin   Cousine × Ehepartner
//        |                                    |
//        └──────────── Enkelkind ─────────────┘
//
// Cousin und Cousine sind Cousin/Cousine ersten Grades (ihre Eltern sind Geschwister) und
// bekommen gemeinsam ein Kind — das Enkelkind erreicht Großvater/Großmutter über ZWEI
// unabhängige Pfade. Das ist echter Ahnenimplex: der gerichtete Elterngraph bleibt ein
// zyklenfreier DAG (kein Zyklus im Sinn von `hatZyklus`), ist aber KEIN Baum mehr — genau der
// Fall, den die AP-0.12-Abnahme verlangt.
import type { FixtureBeschreibung } from '../../test/hilfsmittel/fixture-bauen'

export const daten: FixtureBeschreibung = {
  personen: [
    { schluessel: 'grossvater', privat: 0, ist_platzhalter: 0, geschlecht: 'M', lebend_status: 'verstorben' },
    { schluessel: 'grossmutter', privat: 0, ist_platzhalter: 0, geschlecht: 'F', lebend_status: 'verstorben' },
    { schluessel: 'vaterlinie', privat: 0, ist_platzhalter: 0, geschlecht: 'M', lebend_status: 'verstorben' },
    { schluessel: 'mutterlinie', privat: 0, ist_platzhalter: 0, geschlecht: 'F', lebend_status: 'verstorben' },
    { schluessel: 'ehepartnerin-cousin', privat: 0, ist_platzhalter: 0, geschlecht: 'F', lebend_status: 'verstorben' },
    { schluessel: 'ehepartner-cousine', privat: 0, ist_platzhalter: 0, geschlecht: 'M', lebend_status: 'verstorben' },
    { schluessel: 'cousin', privat: 0, ist_platzhalter: 0, geschlecht: 'M', lebend_status: 'verstorben' },
    { schluessel: 'cousine', privat: 0, ist_platzhalter: 0, geschlecht: 'F', lebend_status: 'verstorben' },
    { schluessel: 'enkelkind', privat: 0, ist_platzhalter: 0, geschlecht: 'U', lebend_status: 'lebend' },
  ],
  namen: [
    { schluessel: 'grossvater-name', personSchluessel: 'grossvater', typ: 'geburtsname', vornamen: 'Wilhelm', nachname: 'Stamm', ist_bevorzugt: 1 },
    { schluessel: 'grossmutter-name', personSchluessel: 'grossmutter', typ: 'geburtsname', vornamen: 'Auguste', nachname: 'Stamm', ist_bevorzugt: 1 },
    { schluessel: 'vaterlinie-name', personSchluessel: 'vaterlinie', typ: 'geburtsname', vornamen: 'Friedrich', nachname: 'Stamm', ist_bevorzugt: 1 },
    { schluessel: 'mutterlinie-name', personSchluessel: 'mutterlinie', typ: 'geburtsname', vornamen: 'Emilie', nachname: 'Stamm', ist_bevorzugt: 1 },
    { schluessel: 'ehepartnerin-cousin-name', personSchluessel: 'ehepartnerin-cousin', typ: 'geburtsname', vornamen: 'Ida', nachname: 'Fremd', ist_bevorzugt: 1 },
    { schluessel: 'ehepartner-cousine-name', personSchluessel: 'ehepartner-cousine', typ: 'geburtsname', vornamen: 'Hermann', nachname: 'Fremd', ist_bevorzugt: 1 },
    { schluessel: 'cousin-name', personSchluessel: 'cousin', typ: 'geburtsname', vornamen: 'Otto', nachname: 'Stamm', ist_bevorzugt: 1 },
    { schluessel: 'cousine-name', personSchluessel: 'cousine', typ: 'geburtsname', vornamen: 'Clara', nachname: 'Nachbar', ist_bevorzugt: 1 },
    { schluessel: 'enkelkind-name', personSchluessel: 'enkelkind', typ: 'geburtsname', vornamen: 'Paula', nachname: 'Stamm', ist_bevorzugt: 1 },
  ],
  elternschaften: [
    { schluessel: 'gv-vaterlinie', elternteilSchluessel: 'grossvater', kindSchluessel: 'vaterlinie', typ: 'biologisch' },
    { schluessel: 'gm-vaterlinie', elternteilSchluessel: 'grossmutter', kindSchluessel: 'vaterlinie', typ: 'biologisch' },
    { schluessel: 'gv-mutterlinie', elternteilSchluessel: 'grossvater', kindSchluessel: 'mutterlinie', typ: 'biologisch' },
    { schluessel: 'gm-mutterlinie', elternteilSchluessel: 'grossmutter', kindSchluessel: 'mutterlinie', typ: 'biologisch' },
    { schluessel: 'vaterlinie-cousin', elternteilSchluessel: 'vaterlinie', kindSchluessel: 'cousin', typ: 'biologisch' },
    { schluessel: 'ehepartnerin-cousin-eltern', elternteilSchluessel: 'ehepartnerin-cousin', kindSchluessel: 'cousin', typ: 'biologisch' },
    { schluessel: 'mutterlinie-cousine', elternteilSchluessel: 'mutterlinie', kindSchluessel: 'cousine', typ: 'biologisch' },
    { schluessel: 'ehepartner-cousine-eltern', elternteilSchluessel: 'ehepartner-cousine', kindSchluessel: 'cousine', typ: 'biologisch' },
    // Die Cousinenheirat selbst: Cousin und Cousine (Cousin/Cousine ersten Grades) sind gemeinsam
    // Eltern des Enkelkinds — der zweite Pfad zu Großvater/Großmutter entsteht hier.
    { schluessel: 'cousin-enkelkind', elternteilSchluessel: 'cousin', kindSchluessel: 'enkelkind', typ: 'biologisch' },
    { schluessel: 'cousine-enkelkind', elternteilSchluessel: 'cousine', kindSchluessel: 'enkelkind', typ: 'biologisch' },
  ],
}
