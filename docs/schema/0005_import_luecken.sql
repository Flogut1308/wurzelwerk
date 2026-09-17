-- Migration 0005 (AP-1.3c, ADR-026). Schließt die fünf Schemalücken des Importvertrags, die bei
-- der Prüfung des ADR-026-Befunds übrig blieben (siehe ADR-026 "Was das ausdrücklich nicht
-- heißt"): zwei einfache ADD COLUMN, dazu drei neue Spalten und ein um 'diagnose'/'risikofaktor'
-- erweiterter subjekt_typ-CHECK an `aussage` (6 -> 8 Werte), die einen Tabellenneubau erzwingen
-- (CHECK-Klauseln lassen sich in SQLite nicht per ALTER TABLE ändern). AP-0.17-Klasse: ein Fehler
-- hier macht bestehende Projektdateien unöffenbar, und keine CI sieht es (sie kennt nur frische
-- Datenbanken).
--
-- DATENZERSTÖRUNGS-FALLE UND WARUM DIESE REIHENFOLGE (Prüfbericht 17.09.2026): ein naives
-- "CREATE aussage_neu -> DROP aussage" würde beim DROP mit foreign_keys=ON (pro Verbindung fest,
-- src/main/datenbank/verbindung.ts) implizite FK-Cascades auf ANDEREN Tabellen auslösen -
-- aussage_zitat.aussage_id (ON DELETE CASCADE) liefe leer, risikofaktor.quelle_beruf_id
-- (ON DELETE SET NULL) würde genullt. Ein ursprünglich erwogener Ausweg über
-- `PRAGMA legacy_alter_table = ON` vor einem simplen RENAME wurde in einer Probe VERWORFEN: er
-- verhindert (empirisch geprüft gegen die hier gebundelte SQLite-Version) zwar das Nachziehen von
-- Trigger-/View-KÖRPERN, NICHT aber das Nachziehen von Fremdschlüssel-DEFINITIONEN anderer
-- Tabellen - `risikofaktor.quelle_beruf_id` zeigte danach so oder so auf den umbenannten Namen,
-- ein anschließendes DROP TABLE hätte weiterhin kaskadiert. `PRAGMA foreign_keys = OFF` ist
-- innerhalb einer Transaktion außerdem ein dokumentierter No-op (ebenfalls geprüft) - die einzige
-- verbliebene, tatsächlich sichere Reihenfolge INNERHALB der einen Migrations-Transaktion
-- (`src/main/datenbank/migration/laeufer.ts`, `einzelneMigrationAnwenden`) ist darum:
--
--   Phase 1: die BEIDEN eingehenden Fremdschlüssel auf `aussage` (aussage_zitat.aussage_id,
--            risikofaktor.quelle_beruf_id) durch einen Tabellenneubau OHNE diesen Fremdschlüssel
--            neutralisieren. `aussage` hat danach 0 eingehende Fremdschlüssel mehr.
--   Phase 2: `aussage` gefahrlos neu bauen (kein Fremdschlüssel zeigt mehr auf sie -> kein
--            Cascade beim Entfernen der alten Tabelle).
--   Phase 3: `aussage_zitat` und `risikofaktor` ein zweites Mal neu bauen, diesmal MIT
--            Fremdschlüssel auf die NEUE `aussage` - plus ihre vier Indizes wiederherstellen (sie
--            gehören physisch zur jeweiligen Tabelle und werden mit ihr gelöscht).
--
-- `PRAGMA foreign_key_check` am Ende bestätigt referenzielle Integrität über die gesamte Sequenz.
--
-- ZWEITER, ERST BEIM ROTEN TESTLAUF GEFUNDENER STOLPERSTEIN (nicht dieselbe Falle wie oben): das
-- `ALTER TABLE aussage RENAME TO aussage_alt` in Phase 2 lässt SQLite (Standardverhalten seit
-- 3.25.0, `legacy_alter_table` steht dabei auf `OFF`) nicht nur Fremdschlüssel-DEFINITIONEN
-- anderer Tabellen nachziehen (das oben beschriebene, verworfene Problem - hier durch Phase 1
-- bereits gegenstandslos, da 0 eingehende FKs), sondern AUCH die SQL-KÖRPER völlig unbeteiligter
-- Trigger, die `aussage` nur in einer Unterabfrage erwähnen: `abl_person_ai/au/ad`,
-- `abl_name_ai/au/bd/ad` und `abl_ortsname_ai/au/ad` (alle drei aus 0003_abgeleitet.sql, alle
-- lesen `person_flach`-Werte über `FROM aussage ...`-Unterabfragen) werden dabei still auf
-- `FROM "aussage_alt" ...` umgeschrieben - reproduziert im roten Testlauf als
-- "error in trigger abl_person_ai: no such table: main.aussage_alt", sobald `aussage_alt` weiter
-- unten gelöscht ist. Diese zehn Trigger werden in dieser Migration NICHT neu gebaut (nur
-- `abl_aussage_*` unten) - sie müssen also unverändert `aussage` referenzieren, wenn die
-- `ALTER TABLE ... RENAME`-Anweisung darüber hinweggeht. `PRAGMA legacy_alter_table = ON`
-- schaltet GENAU dieses Nachziehen von Trigger-/View-KÖRPERN ab (empirisch erneut geprüft) - anders
-- als beim oben verworfenen Ansatz wird es hier NICHT gebraucht, um Fremdschlüssel-Definitionen zu
-- schützen (das leistet bereits Phase 1), sondern ausschließlich, um die zehn unbeteiligten
-- `abl_person_*`/`abl_name_*`/`abl_ortsname_*`-Trigger vor dem stillen Umschreiben zu bewahren. Der
-- Wirkbereich ist auf die eine RENAME-Anweisung begrenzt (sofort danach wieder OFF).

-- Lücke 1: $defs/Beleg.zeitmarke_sekunden (A-16, 8x in beispiel-3-interview.json).
ALTER TABLE zitat ADD COLUMN zeitmarke_sekunden REAL;

-- Lücke 2: $defs/Person.unsicherheit, Pflicht bei konfidenz <= 2 (IMP-206).
ALTER TABLE person ADD COLUMN unsicherheit TEXT;

-- ================================================================================================
-- Phase 1: aussage_zitat und risikofaktor OHNE ihren Fremdschlüssel auf aussage neu bauen.
-- ================================================================================================

-- aussage_zitat (0002_kern.sql:344-350) — zitat_id-FK, PRIMARY KEY, erstellt_am/geaendert_am
-- VERBATIM; aussage_id verliert vorübergehend ihr REFERENCES aussage(id) ON DELETE CASCADE.
CREATE TABLE aussage_zitat_tmp (
  aussage_id TEXT NOT NULL,
  zitat_id TEXT NOT NULL REFERENCES zitat(id) ON DELETE CASCADE, -- E-4/E-5 explizit (aussage_zitat.*): CASCADE
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER,
  PRIMARY KEY (aussage_id, zitat_id)
) STRICT;
INSERT INTO aussage_zitat_tmp (aussage_id, zitat_id, erstellt_am, geaendert_am)
  SELECT aussage_id, zitat_id, erstellt_am, geaendert_am FROM aussage_zitat;
DROP TABLE aussage_zitat;
ALTER TABLE aussage_zitat_tmp RENAME TO aussage_zitat;

-- risikofaktor (0002_kern.sql:521-554) — ALLE Spalten und CHECKs VERBATIM außer
-- quelle_beruf_id: verliert vorübergehend ihr REFERENCES aussage(id) ON DELETE SET NULL
-- (person_id-FK auf person bleibt unverändert bestehen).
CREATE TABLE risikofaktor_tmp (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE, -- E-4/E-5 explizit: CASCADE
  art TEXT CHECK (art IN ('rauchen','alkohol','beruf_exposition','umwelt','uebergewicht','bewegungsmangel','ernaehrung','sonstiges')),
  detail TEXT, -- freier Text laut Modell, kein CHECK
  intensitaet TEXT CHECK (intensitaet IN ('gering','mittel','hoch','unbekannt')),
  beginn_kalender TEXT CHECK (beginn_kalender IN ('gregorian','julian','hebrew','french_r')),
  beginn_modifikator TEXT CHECK (beginn_modifikator IN ('exakt','etwa','vor','nach','zwischen','von_bis','geschaetzt','berechnet')),
  beginn_praezision TEXT CHECK (beginn_praezision IN ('tag','monat','jahr','jahrzehnt')),
  beginn_wert1 TEXT,
  beginn_wert2 TEXT,
  beginn_originaltext TEXT,
  beginn_sort_von INTEGER,
  beginn_sort_bis INTEGER,
  beginn_zweitkalender TEXT CHECK (beginn_zweitkalender IN ('gregorian','julian','hebrew','french_r')),
  beginn_zweitwert TEXT,
  beginn_doppeljahr TEXT,
  ende_kalender TEXT CHECK (ende_kalender IN ('gregorian','julian','hebrew','french_r')),
  ende_modifikator TEXT CHECK (ende_modifikator IN ('exakt','etwa','vor','nach','zwischen','von_bis','geschaetzt','berechnet')),
  ende_praezision TEXT CHECK (ende_praezision IN ('tag','monat','jahr','jahrzehnt')),
  ende_wert1 TEXT,
  ende_wert2 TEXT,
  ende_originaltext TEXT,
  ende_sort_von INTEGER,
  ende_sort_bis INTEGER,
  ende_zweitkalender TEXT CHECK (ende_zweitkalender IN ('gregorian','julian','hebrew','french_r')),
  ende_zweitwert TEXT,
  ende_doppeljahr TEXT,
  quelle_beruf_id TEXT, -- vorübergehend OHNE REFERENCES aussage(id) — Phase 3 stellt sie wieder her
  konfidenz INTEGER CHECK (konfidenz BETWEEN 1 AND 4),
  notiz TEXT,
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
INSERT INTO risikofaktor_tmp (
  id, person_id, art, detail, intensitaet,
  beginn_kalender, beginn_modifikator, beginn_praezision, beginn_wert1, beginn_wert2, beginn_originaltext,
  beginn_sort_von, beginn_sort_bis, beginn_zweitkalender, beginn_zweitwert, beginn_doppeljahr,
  ende_kalender, ende_modifikator, ende_praezision, ende_wert1, ende_wert2, ende_originaltext,
  ende_sort_von, ende_sort_bis, ende_zweitkalender, ende_zweitwert, ende_doppeljahr,
  quelle_beruf_id, konfidenz, notiz, erstellt_am, geaendert_am
)
SELECT
  id, person_id, art, detail, intensitaet,
  beginn_kalender, beginn_modifikator, beginn_praezision, beginn_wert1, beginn_wert2, beginn_originaltext,
  beginn_sort_von, beginn_sort_bis, beginn_zweitkalender, beginn_zweitwert, beginn_doppeljahr,
  ende_kalender, ende_modifikator, ende_praezision, ende_wert1, ende_wert2, ende_originaltext,
  ende_sort_von, ende_sort_bis, ende_zweitkalender, ende_zweitwert, ende_doppeljahr,
  quelle_beruf_id, konfidenz, notiz, erstellt_am, geaendert_am
FROM risikofaktor;
DROP TABLE risikofaktor;
ALTER TABLE risikofaktor_tmp RENAME TO risikofaktor;

-- ================================================================================================
-- Phase 2: aussage neu bauen. Sie hat jetzt 0 eingehende Fremdschlüssel — das folgende DROP TABLE
-- kaskadiert nichts mehr.
-- ================================================================================================

-- Nur für diese eine Anweisung scharf (s. Kopfkommentar "ZWEITER ... STOLPERSTEIN") - schützt
-- abl_person_*/abl_name_*/abl_ortsname_* vor stillem Umschreiben ihrer aussage-Unterabfragen.
PRAGMA legacy_alter_table = ON;
ALTER TABLE aussage RENAME TO aussage_alt;
PRAGMA legacy_alter_table = OFF;

CREATE TABLE aussage (
  id TEXT PRIMARY KEY,
  subjekt_typ TEXT NOT NULL CHECK (subjekt_typ IN ('person','ereignis','elternschaft','partnerschaft','ort','name','diagnose','risikofaktor')), -- E-7 Diskriminator zu subjekt_id; um 'diagnose'/'risikofaktor' erweitert (ADR-026, AP-1.3c: 56 §2.3 verlangt belege für beide)
  subjekt_id TEXT NOT NULL, -- E-7: polymorph, bewusst kein FK
  praedikat TEXT NOT NULL, -- E-6: freier TEXT, KEIN CHECK (offene Menge)
  wert_text TEXT,
  wert_zahl REAL,
  wert_ref_id TEXT, -- E-7: polymorph, bewusst kein FK; Verweisziel variabel (z.B. ort) - kein _typ nötig laut Modell
  datum_kalender TEXT CHECK (datum_kalender IN ('gregorian','julian','hebrew','french_r')),
  datum_modifikator TEXT CHECK (datum_modifikator IN ('exakt','etwa','vor','nach','zwischen','von_bis','geschaetzt','berechnet')),
  datum_praezision TEXT CHECK (datum_praezision IN ('tag','monat','jahr','jahrzehnt')),
  datum_wert1 TEXT,
  datum_wert2 TEXT,
  datum_originaltext TEXT,
  datum_sort_von INTEGER,
  datum_sort_bis INTEGER,
  datum_zweitkalender TEXT CHECK (datum_zweitkalender IN ('gregorian','julian','hebrew','french_r')),
  datum_zweitwert TEXT,
  datum_doppeljahr TEXT,
  konfidenz INTEGER CHECK (konfidenz BETWEEN 1 AND 4),
  ist_bevorzugt INTEGER CHECK (ist_bevorzugt IS NULL OR ist_bevorzugt IN (0,1)),
  begruendung TEXT,
  unsicherheit TEXT, -- Lücke 3: $defs/Aussage.unsicherheit (!= begruendung, IMP-207)
  gueltig_von INTEGER, -- Lücke 4: $defs/Aussage.gueltig_von (A-08)
  gueltig_bis INTEGER, -- Lücke 4: $defs/Aussage.gueltig_bis (A-08)
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;

INSERT INTO aussage (
  id, subjekt_typ, subjekt_id, praedikat, wert_text, wert_zahl, wert_ref_id,
  datum_kalender, datum_modifikator, datum_praezision, datum_wert1, datum_wert2, datum_originaltext,
  datum_sort_von, datum_sort_bis, datum_zweitkalender, datum_zweitwert, datum_doppeljahr,
  konfidenz, ist_bevorzugt, begruendung, erstellt_am, geaendert_am
)
SELECT
  id, subjekt_typ, subjekt_id, praedikat, wert_text, wert_zahl, wert_ref_id,
  datum_kalender, datum_modifikator, datum_praezision, datum_wert1, datum_wert2, datum_originaltext,
  datum_sort_von, datum_sort_bis, datum_zweitkalender, datum_zweitwert, datum_doppeljahr,
  konfidenz, ist_bevorzugt, begruendung, erstellt_am, geaendert_am
FROM aussage_alt;

DROP TABLE aussage_alt;

-- abl_aussage_ai/au/ad (55_Architektur.md §5.2, AP-0.7) gehören physisch zur Tabelle, auf der sie
-- definiert sind — sie wurden mit aussage_alt gelöscht und werden hier VERBATIM aus
-- docs/schema/0003_abgeleitet.sql wieder angelegt. jrn_aussage_* brauchen HIER keine manuelle
-- Wiederherstellung: generierteTriggerAnwenden() (src/main/datenbank/migration/trigger-anwenden.ts)
-- löscht ohnehin ALLE jrn_*-Trigger und wendet docs/schema/trigger_generiert.sql als letzten
-- Schritt JEDER Migrationsschleife neu an (src/main/datenbank/migration/laeufer.ts) — das erreicht
-- aussage, aussage_zitat UND risikofaktor gleichermaßen.
CREATE TRIGGER abl_aussage_ai AFTER INSERT ON aussage
WHEN NEW.subjekt_typ = 'person'
BEGIN
  DELETE FROM person_flach WHERE person_id = NEW.subjekt_id;
INSERT INTO person_flach (person_id, anzeigename, sortier_nachname, sortier_vornamen, geburt_jahr, geburt_sort_von, geburt_ort_name, tod_jahr, tod_sort_von, konfidenz_min, hat_widerspruch)
  SELECT
  p.id AS person_id,
  TRIM(COALESCE(bn.vornamen, '') || ' ' || COALESCE(bn.nachname, '')) AS anzeigename,
  suchnormalform(COALESCE(bn.nachname, '')) AS sortier_nachname,
  suchnormalform(COALESCE(bn.vornamen, '')) AS sortier_vornamen,
  gb.jahr AS geburt_jahr,
  gb.sort_von AS geburt_sort_von,
  go.name AS geburt_ort_name,
  td.jahr AS tod_jahr,
  td.sort_von AS tod_sort_von,
  (SELECT MIN(a.konfidenz) FROM aussage a WHERE a.subjekt_typ = 'person' AND a.subjekt_id = p.id) AS konfidenz_min,
  (CASE WHEN EXISTS (
    SELECT 1 FROM aussage a1
    WHERE a1.subjekt_typ = 'person' AND a1.subjekt_id = p.id
    GROUP BY a1.praedikat
    HAVING COUNT(DISTINCT
      COALESCE(a1.wert_text, '') || '|' || COALESCE(CAST(a1.wert_zahl AS TEXT), '') || '|' ||
      COALESCE(a1.wert_ref_id, '') || '|' || COALESCE(a1.datum_wert1, '') || '|' || COALESCE(a1.datum_wert2, '')
    ) >= 2
    AND SUM(CASE WHEN a1.ist_bevorzugt = 1 THEN 1 ELSE 0 END) = 0
  ) THEN 1 ELSE 0 END) AS hat_widerspruch
FROM person p
LEFT JOIN (
  SELECT person_id, vornamen, nachname,
    ROW_NUMBER() OVER (PARTITION BY person_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
  FROM name
) bn ON bn.person_id = p.id AND bn.rang = 1
LEFT JOIN (
  SELECT subjekt_id AS person_id,
    CASE WHEN datum_wert1 GLOB '[0-9][0-9][0-9][0-9]*' THEN CAST(SUBSTR(datum_wert1, 1, 4) AS INTEGER) ELSE NULL END AS jahr,
    datum_sort_von AS sort_von,
    ROW_NUMBER() OVER (PARTITION BY subjekt_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
  FROM aussage
  WHERE subjekt_typ = 'person' AND praedikat = 'geburtsdatum'
) gb ON gb.person_id = p.id AND gb.rang = 1
LEFT JOIN (
  SELECT subjekt_id AS person_id,
    CASE WHEN datum_wert1 GLOB '[0-9][0-9][0-9][0-9]*' THEN CAST(SUBSTR(datum_wert1, 1, 4) AS INTEGER) ELSE NULL END AS jahr,
    datum_sort_von AS sort_von,
    ROW_NUMBER() OVER (PARTITION BY subjekt_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
  FROM aussage
  WHERE subjekt_typ = 'person' AND praedikat = 'todesdatum'
) td ON td.person_id = p.id AND td.rang = 1
LEFT JOIN (
  SELECT subjekt_id AS person_id, wert_ref_id AS ort_id,
    ROW_NUMBER() OVER (PARTITION BY subjekt_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
  FROM aussage
  WHERE subjekt_typ = 'person' AND praedikat = 'geburtsort'
) go_a ON go_a.person_id = p.id AND go_a.rang = 1
LEFT JOIN (
  SELECT ort_id, name,
    ROW_NUMBER() OVER (PARTITION BY ort_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
  FROM ortsname
) go ON go.ort_id = go_a.ort_id AND go.rang = 1
WHERE p.id = NEW.subjekt_id;
END;

CREATE TRIGGER abl_aussage_au AFTER UPDATE ON aussage
WHEN NEW.subjekt_typ = 'person' OR OLD.subjekt_typ = 'person'
BEGIN
  DELETE FROM person_flach WHERE OLD.subjekt_typ = 'person' AND person_id = OLD.subjekt_id;
INSERT INTO person_flach (person_id, anzeigename, sortier_nachname, sortier_vornamen, geburt_jahr, geburt_sort_von, geburt_ort_name, tod_jahr, tod_sort_von, konfidenz_min, hat_widerspruch)
  SELECT
  p.id AS person_id,
  TRIM(COALESCE(bn.vornamen, '') || ' ' || COALESCE(bn.nachname, '')) AS anzeigename,
  suchnormalform(COALESCE(bn.nachname, '')) AS sortier_nachname,
  suchnormalform(COALESCE(bn.vornamen, '')) AS sortier_vornamen,
  gb.jahr AS geburt_jahr,
  gb.sort_von AS geburt_sort_von,
  go.name AS geburt_ort_name,
  td.jahr AS tod_jahr,
  td.sort_von AS tod_sort_von,
  (SELECT MIN(a.konfidenz) FROM aussage a WHERE a.subjekt_typ = 'person' AND a.subjekt_id = p.id) AS konfidenz_min,
  (CASE WHEN EXISTS (
    SELECT 1 FROM aussage a1
    WHERE a1.subjekt_typ = 'person' AND a1.subjekt_id = p.id
    GROUP BY a1.praedikat
    HAVING COUNT(DISTINCT
      COALESCE(a1.wert_text, '') || '|' || COALESCE(CAST(a1.wert_zahl AS TEXT), '') || '|' ||
      COALESCE(a1.wert_ref_id, '') || '|' || COALESCE(a1.datum_wert1, '') || '|' || COALESCE(a1.datum_wert2, '')
    ) >= 2
    AND SUM(CASE WHEN a1.ist_bevorzugt = 1 THEN 1 ELSE 0 END) = 0
  ) THEN 1 ELSE 0 END) AS hat_widerspruch
FROM person p
LEFT JOIN (
  SELECT person_id, vornamen, nachname,
    ROW_NUMBER() OVER (PARTITION BY person_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
  FROM name
) bn ON bn.person_id = p.id AND bn.rang = 1
LEFT JOIN (
  SELECT subjekt_id AS person_id,
    CASE WHEN datum_wert1 GLOB '[0-9][0-9][0-9][0-9]*' THEN CAST(SUBSTR(datum_wert1, 1, 4) AS INTEGER) ELSE NULL END AS jahr,
    datum_sort_von AS sort_von,
    ROW_NUMBER() OVER (PARTITION BY subjekt_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
  FROM aussage
  WHERE subjekt_typ = 'person' AND praedikat = 'geburtsdatum'
) gb ON gb.person_id = p.id AND gb.rang = 1
LEFT JOIN (
  SELECT subjekt_id AS person_id,
    CASE WHEN datum_wert1 GLOB '[0-9][0-9][0-9][0-9]*' THEN CAST(SUBSTR(datum_wert1, 1, 4) AS INTEGER) ELSE NULL END AS jahr,
    datum_sort_von AS sort_von,
    ROW_NUMBER() OVER (PARTITION BY subjekt_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
  FROM aussage
  WHERE subjekt_typ = 'person' AND praedikat = 'todesdatum'
) td ON td.person_id = p.id AND td.rang = 1
LEFT JOIN (
  SELECT subjekt_id AS person_id, wert_ref_id AS ort_id,
    ROW_NUMBER() OVER (PARTITION BY subjekt_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
  FROM aussage
  WHERE subjekt_typ = 'person' AND praedikat = 'geburtsort'
) go_a ON go_a.person_id = p.id AND go_a.rang = 1
LEFT JOIN (
  SELECT ort_id, name,
    ROW_NUMBER() OVER (PARTITION BY ort_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
  FROM ortsname
) go ON go.ort_id = go_a.ort_id AND go.rang = 1
WHERE OLD.subjekt_typ = 'person' AND p.id = OLD.subjekt_id;
  DELETE FROM person_flach WHERE NEW.subjekt_typ = 'person' AND person_id = NEW.subjekt_id;
INSERT INTO person_flach (person_id, anzeigename, sortier_nachname, sortier_vornamen, geburt_jahr, geburt_sort_von, geburt_ort_name, tod_jahr, tod_sort_von, konfidenz_min, hat_widerspruch)
  SELECT
  p.id AS person_id,
  TRIM(COALESCE(bn.vornamen, '') || ' ' || COALESCE(bn.nachname, '')) AS anzeigename,
  suchnormalform(COALESCE(bn.nachname, '')) AS sortier_nachname,
  suchnormalform(COALESCE(bn.vornamen, '')) AS sortier_vornamen,
  gb.jahr AS geburt_jahr,
  gb.sort_von AS geburt_sort_von,
  go.name AS geburt_ort_name,
  td.jahr AS tod_jahr,
  td.sort_von AS tod_sort_von,
  (SELECT MIN(a.konfidenz) FROM aussage a WHERE a.subjekt_typ = 'person' AND a.subjekt_id = p.id) AS konfidenz_min,
  (CASE WHEN EXISTS (
    SELECT 1 FROM aussage a1
    WHERE a1.subjekt_typ = 'person' AND a1.subjekt_id = p.id
    GROUP BY a1.praedikat
    HAVING COUNT(DISTINCT
      COALESCE(a1.wert_text, '') || '|' || COALESCE(CAST(a1.wert_zahl AS TEXT), '') || '|' ||
      COALESCE(a1.wert_ref_id, '') || '|' || COALESCE(a1.datum_wert1, '') || '|' || COALESCE(a1.datum_wert2, '')
    ) >= 2
    AND SUM(CASE WHEN a1.ist_bevorzugt = 1 THEN 1 ELSE 0 END) = 0
  ) THEN 1 ELSE 0 END) AS hat_widerspruch
FROM person p
LEFT JOIN (
  SELECT person_id, vornamen, nachname,
    ROW_NUMBER() OVER (PARTITION BY person_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
  FROM name
) bn ON bn.person_id = p.id AND bn.rang = 1
LEFT JOIN (
  SELECT subjekt_id AS person_id,
    CASE WHEN datum_wert1 GLOB '[0-9][0-9][0-9][0-9]*' THEN CAST(SUBSTR(datum_wert1, 1, 4) AS INTEGER) ELSE NULL END AS jahr,
    datum_sort_von AS sort_von,
    ROW_NUMBER() OVER (PARTITION BY subjekt_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
  FROM aussage
  WHERE subjekt_typ = 'person' AND praedikat = 'geburtsdatum'
) gb ON gb.person_id = p.id AND gb.rang = 1
LEFT JOIN (
  SELECT subjekt_id AS person_id,
    CASE WHEN datum_wert1 GLOB '[0-9][0-9][0-9][0-9]*' THEN CAST(SUBSTR(datum_wert1, 1, 4) AS INTEGER) ELSE NULL END AS jahr,
    datum_sort_von AS sort_von,
    ROW_NUMBER() OVER (PARTITION BY subjekt_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
  FROM aussage
  WHERE subjekt_typ = 'person' AND praedikat = 'todesdatum'
) td ON td.person_id = p.id AND td.rang = 1
LEFT JOIN (
  SELECT subjekt_id AS person_id, wert_ref_id AS ort_id,
    ROW_NUMBER() OVER (PARTITION BY subjekt_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
  FROM aussage
  WHERE subjekt_typ = 'person' AND praedikat = 'geburtsort'
) go_a ON go_a.person_id = p.id AND go_a.rang = 1
LEFT JOIN (
  SELECT ort_id, name,
    ROW_NUMBER() OVER (PARTITION BY ort_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
  FROM ortsname
) go ON go.ort_id = go_a.ort_id AND go.rang = 1
WHERE NEW.subjekt_typ = 'person' AND p.id = NEW.subjekt_id;
END;

CREATE TRIGGER abl_aussage_ad AFTER DELETE ON aussage
WHEN OLD.subjekt_typ = 'person'
BEGIN
  DELETE FROM person_flach WHERE person_id = OLD.subjekt_id;
INSERT INTO person_flach (person_id, anzeigename, sortier_nachname, sortier_vornamen, geburt_jahr, geburt_sort_von, geburt_ort_name, tod_jahr, tod_sort_von, konfidenz_min, hat_widerspruch)
  SELECT
  p.id AS person_id,
  TRIM(COALESCE(bn.vornamen, '') || ' ' || COALESCE(bn.nachname, '')) AS anzeigename,
  suchnormalform(COALESCE(bn.nachname, '')) AS sortier_nachname,
  suchnormalform(COALESCE(bn.vornamen, '')) AS sortier_vornamen,
  gb.jahr AS geburt_jahr,
  gb.sort_von AS geburt_sort_von,
  go.name AS geburt_ort_name,
  td.jahr AS tod_jahr,
  td.sort_von AS tod_sort_von,
  (SELECT MIN(a.konfidenz) FROM aussage a WHERE a.subjekt_typ = 'person' AND a.subjekt_id = p.id) AS konfidenz_min,
  (CASE WHEN EXISTS (
    SELECT 1 FROM aussage a1
    WHERE a1.subjekt_typ = 'person' AND a1.subjekt_id = p.id
    GROUP BY a1.praedikat
    HAVING COUNT(DISTINCT
      COALESCE(a1.wert_text, '') || '|' || COALESCE(CAST(a1.wert_zahl AS TEXT), '') || '|' ||
      COALESCE(a1.wert_ref_id, '') || '|' || COALESCE(a1.datum_wert1, '') || '|' || COALESCE(a1.datum_wert2, '')
    ) >= 2
    AND SUM(CASE WHEN a1.ist_bevorzugt = 1 THEN 1 ELSE 0 END) = 0
  ) THEN 1 ELSE 0 END) AS hat_widerspruch
FROM person p
LEFT JOIN (
  SELECT person_id, vornamen, nachname,
    ROW_NUMBER() OVER (PARTITION BY person_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
  FROM name
) bn ON bn.person_id = p.id AND bn.rang = 1
LEFT JOIN (
  SELECT subjekt_id AS person_id,
    CASE WHEN datum_wert1 GLOB '[0-9][0-9][0-9][0-9]*' THEN CAST(SUBSTR(datum_wert1, 1, 4) AS INTEGER) ELSE NULL END AS jahr,
    datum_sort_von AS sort_von,
    ROW_NUMBER() OVER (PARTITION BY subjekt_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
  FROM aussage
  WHERE subjekt_typ = 'person' AND praedikat = 'geburtsdatum'
) gb ON gb.person_id = p.id AND gb.rang = 1
LEFT JOIN (
  SELECT subjekt_id AS person_id,
    CASE WHEN datum_wert1 GLOB '[0-9][0-9][0-9][0-9]*' THEN CAST(SUBSTR(datum_wert1, 1, 4) AS INTEGER) ELSE NULL END AS jahr,
    datum_sort_von AS sort_von,
    ROW_NUMBER() OVER (PARTITION BY subjekt_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
  FROM aussage
  WHERE subjekt_typ = 'person' AND praedikat = 'todesdatum'
) td ON td.person_id = p.id AND td.rang = 1
LEFT JOIN (
  SELECT subjekt_id AS person_id, wert_ref_id AS ort_id,
    ROW_NUMBER() OVER (PARTITION BY subjekt_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
  FROM aussage
  WHERE subjekt_typ = 'person' AND praedikat = 'geburtsort'
) go_a ON go_a.person_id = p.id AND go_a.rang = 1
LEFT JOIN (
  SELECT ort_id, name,
    ROW_NUMBER() OVER (PARTITION BY ort_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
  FROM ortsname
) go ON go.ort_id = go_a.ort_id AND go.rang = 1
WHERE p.id = OLD.subjekt_id;
END;

-- ================================================================================================
-- Phase 3: aussage_zitat und risikofaktor ein zweites Mal neu bauen — jetzt MIT Fremdschlüssel auf
-- die NEUE aussage — und ihre vier Indizes (0002_kern.sql:351-352, :555-556) wiederherstellen.
-- ================================================================================================

CREATE TABLE aussage_zitat_tmp2 (
  aussage_id TEXT NOT NULL REFERENCES aussage(id) ON DELETE CASCADE, -- E-4/E-5 explizit (aussage_zitat.*): CASCADE
  zitat_id TEXT NOT NULL REFERENCES zitat(id) ON DELETE CASCADE, -- E-4/E-5 explizit (aussage_zitat.*): CASCADE
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER,
  PRIMARY KEY (aussage_id, zitat_id)
) STRICT;
INSERT INTO aussage_zitat_tmp2 (aussage_id, zitat_id, erstellt_am, geaendert_am)
  SELECT aussage_id, zitat_id, erstellt_am, geaendert_am FROM aussage_zitat;
DROP TABLE aussage_zitat;
ALTER TABLE aussage_zitat_tmp2 RENAME TO aussage_zitat;
CREATE INDEX idx_aussage_zitat_aussage_id ON aussage_zitat(aussage_id);
CREATE INDEX idx_aussage_zitat_zitat_id ON aussage_zitat(zitat_id);

CREATE TABLE risikofaktor_tmp2 (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE, -- E-4/E-5 explizit: CASCADE
  art TEXT CHECK (art IN ('rauchen','alkohol','beruf_exposition','umwelt','uebergewicht','bewegungsmangel','ernaehrung','sonstiges')),
  detail TEXT, -- freier Text laut Modell, kein CHECK
  intensitaet TEXT CHECK (intensitaet IN ('gering','mittel','hoch','unbekannt')),
  beginn_kalender TEXT CHECK (beginn_kalender IN ('gregorian','julian','hebrew','french_r')),
  beginn_modifikator TEXT CHECK (beginn_modifikator IN ('exakt','etwa','vor','nach','zwischen','von_bis','geschaetzt','berechnet')),
  beginn_praezision TEXT CHECK (beginn_praezision IN ('tag','monat','jahr','jahrzehnt')),
  beginn_wert1 TEXT,
  beginn_wert2 TEXT,
  beginn_originaltext TEXT,
  beginn_sort_von INTEGER,
  beginn_sort_bis INTEGER,
  beginn_zweitkalender TEXT CHECK (beginn_zweitkalender IN ('gregorian','julian','hebrew','french_r')),
  beginn_zweitwert TEXT,
  beginn_doppeljahr TEXT,
  ende_kalender TEXT CHECK (ende_kalender IN ('gregorian','julian','hebrew','french_r')),
  ende_modifikator TEXT CHECK (ende_modifikator IN ('exakt','etwa','vor','nach','zwischen','von_bis','geschaetzt','berechnet')),
  ende_praezision TEXT CHECK (ende_praezision IN ('tag','monat','jahr','jahrzehnt')),
  ende_wert1 TEXT,
  ende_wert2 TEXT,
  ende_originaltext TEXT,
  ende_sort_von INTEGER,
  ende_sort_bis INTEGER,
  ende_zweitkalender TEXT CHECK (ende_zweitkalender IN ('gregorian','julian','hebrew','french_r')),
  ende_zweitwert TEXT,
  ende_doppeljahr TEXT,
  quelle_beruf_id TEXT REFERENCES aussage(id) ON DELETE SET NULL, -- E-10 explizit: FK auf aussage(id), SET NULL, kein polymorpher Fall — jetzt gegen die neue aussage wiederhergestellt
  konfidenz INTEGER CHECK (konfidenz BETWEEN 1 AND 4),
  notiz TEXT,
  erstellt_am INTEGER, -- Zeitstempel (unix epoch); Befüllung per Trigger AP-0.8
  geaendert_am INTEGER
) STRICT;
INSERT INTO risikofaktor_tmp2 (
  id, person_id, art, detail, intensitaet,
  beginn_kalender, beginn_modifikator, beginn_praezision, beginn_wert1, beginn_wert2, beginn_originaltext,
  beginn_sort_von, beginn_sort_bis, beginn_zweitkalender, beginn_zweitwert, beginn_doppeljahr,
  ende_kalender, ende_modifikator, ende_praezision, ende_wert1, ende_wert2, ende_originaltext,
  ende_sort_von, ende_sort_bis, ende_zweitkalender, ende_zweitwert, ende_doppeljahr,
  quelle_beruf_id, konfidenz, notiz, erstellt_am, geaendert_am
)
SELECT
  id, person_id, art, detail, intensitaet,
  beginn_kalender, beginn_modifikator, beginn_praezision, beginn_wert1, beginn_wert2, beginn_originaltext,
  beginn_sort_von, beginn_sort_bis, beginn_zweitkalender, beginn_zweitwert, beginn_doppeljahr,
  ende_kalender, ende_modifikator, ende_praezision, ende_wert1, ende_wert2, ende_originaltext,
  ende_sort_von, ende_sort_bis, ende_zweitkalender, ende_zweitwert, ende_doppeljahr,
  quelle_beruf_id, konfidenz, notiz, erstellt_am, geaendert_am
FROM risikofaktor;
DROP TABLE risikofaktor;
ALTER TABLE risikofaktor_tmp2 RENAME TO risikofaktor;
CREATE INDEX idx_risikofaktor_person_id ON risikofaktor(person_id);
CREATE INDEX idx_risikofaktor_quelle_beruf_id ON risikofaktor(quelle_beruf_id);

PRAGMA foreign_key_check;
