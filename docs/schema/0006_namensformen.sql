-- Migration 0006 (AP-1.33): das flache `name` (eine Zeile = eine Namensform MIT eingebetteten
-- Bestandteilen) wird in zwei Tabellen zerlegt:
--   * `name_form`  — die Form/Rolle eines Namens (geburtsname, ehename, …), Sprache/Schrift,
--                    Umschrift-Bezug, Gültigkeit, `original_text`, „genau ein Hauptname je Person".
--   * `name_part`  — die einzelnen Bestandteile (Vornamen einzeln, Nachname, Präfix, Titel, Suffix,
--                    Vatersname), je mit `sortier_index` und Rufname-Markierung.
--
-- HARTER SCHNITT (beschlossen): `name` wird nach dem verlustfreien Datenumzug per DROP entfernt.
-- `name_form.id` = alte `name.id` — damit bleiben die polymorphen Verweise gültig, die auf eine
-- name-id zeigen (aussage/medium_zuordnung mit subjekt_typ='name' sowie name.umschrift_von, jetzt
-- name_form.umschrift_von). Der Umzug ist verlustfrei: jede alte Spalte jeder alten Zeile ist an
-- ihrem Zielort wiederfindbar (Oracle: test/migration/namensformen.test.ts).
--
-- name_phonetik bindet ab hier an den Nachnamens-`name_part` (Entscheidung E): die Tabelle wird neu
-- gebaut mit FK `name_id REFERENCES name_part(id) ON DELETE CASCADE` und aus den Nachnamens-Teilen
-- repopuliert. Kein RENAME (vermeidet das stille Trigger-/FK-Nachziehen von SQLite) — DROP alt +
-- CREATE mit finalem Namen.
--
-- FK-REIHENFOLGE: `PRAGMA defer_foreign_keys = ON` verschiebt die FK-Prüfung ans Transaktionsende
-- (laeufer.ts COMMIT). Das ist nötig, weil `name_form.umschrift_von` ein Selbstverweis ist: eine
-- Umschrift-Form verweist auf ihre Ursprungsform, die im selben INSERT…SELECT evtl. erst später
-- eingefügt wird. Am COMMIT existieren alle Zeilen — `PRAGMA foreign_key_check` bleibt sauber.
PRAGMA defer_foreign_keys = ON;

-- ================================================================================================
-- 1. Zieltabellen
-- ================================================================================================

-- JOURNALISIERT
CREATE TABLE name_form (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE, -- Komposition (personengebunden) -> CASCADE
  sprache TEXT,
  schrift TEXT CHECK (schrift IN ('latn','cyrl')),
  reihenfolge TEXT CHECK (reihenfolge IN ('vorname_zuerst','nachname_zuerst')),
  rolle TEXT CHECK (rolle IN ('geburtsname','ehename','vulgo','latinisiert','ordensname','aka','beruf','sonstiges')), -- OHNE 'transliteriert' (Umschrift -> rolle IS NULL, ausgedrückt über umschrift_von/umschrift_norm)
  rollen_notiz TEXT,
  ist_bevorzugt INTEGER NOT NULL CHECK (ist_bevorzugt IN (0,1)),
  umschrift_von TEXT REFERENCES name_form(id) ON DELETE SET NULL, -- Selbstverweis, optional -> SET NULL
  umschrift_norm TEXT CHECK (umschrift_norm IN ('iso9','din1460','manuell')),
  konfidenz INTEGER CHECK (konfidenz BETWEEN 1 AND 4), -- neu ggü. name (N.1); NULL erlaubt (NULL BETWEEN … ist nicht false), default NULL
  sortier_index INTEGER,
  gueltig_von INTEGER,
  gueltig_bis INTEGER,
  original_text TEXT,
  erstellt_am INTEGER,
  geaendert_am INTEGER
) STRICT;

-- JOURNALISIERT
CREATE TABLE name_part (
  id TEXT PRIMARY KEY,
  name_form_id TEXT NOT NULL REFERENCES name_form(id) ON DELETE CASCADE, -- Komposition -> CASCADE
  art TEXT NOT NULL CHECK (art IN ('vorname','praefix','nachname','suffix','titel','vatersname')),
  wert TEXT NOT NULL,
  ist_rufname INTEGER NOT NULL CHECK (ist_rufname IN (0,1)),
  sortier_index INTEGER NOT NULL,
  feminine_variante TEXT,
  erstellt_am INTEGER,
  geaendert_am INTEGER,
  CHECK (ist_rufname = 0 OR art = 'vorname') -- Rufname nur bei einem Vornamen
) STRICT;

CREATE INDEX idx_name_form_person_id ON name_form(person_id);
CREATE INDEX idx_name_form_umschrift_von ON name_form(umschrift_von);
CREATE INDEX idx_name_part_name_form_id ON name_part(name_form_id);
-- „Genau ein Hauptname je Person": höchstens eine bevorzugte Form je Person.
CREATE UNIQUE INDEX idx_name_form_ein_hauptname ON name_form(person_id) WHERE ist_bevorzugt = 1;
-- „Höchstens ein Rufname je Form".
CREATE UNIQUE INDEX idx_name_part_ein_rufname ON name_part(name_form_id) WHERE ist_rufname = 1;

-- ================================================================================================
-- 2. Datenumzug name -> name_form (id erhalten, typ -> rolle, genau eine bevorzugte Form je Person)
-- ================================================================================================
INSERT INTO name_form (
  id, person_id, sprache, schrift, reihenfolge, rolle, rollen_notiz, ist_bevorzugt,
  umschrift_von, umschrift_norm, konfidenz, sortier_index, gueltig_von, gueltig_bis,
  original_text, erstellt_am, geaendert_am
)
SELECT
  n.id,
  n.person_id,
  n.sprache,
  n.schrift,
  NULL,
  CASE WHEN n.typ = 'transliteriert' THEN NULL ELSE n.typ END,
  NULL,
  CASE WHEN n.id = (
    SELECT n2.id FROM name n2
    WHERE n2.person_id = n.person_id
    ORDER BY (CASE WHEN n2.ist_bevorzugt = 1 THEN 0 ELSE 1 END), n2.id
    LIMIT 1
  ) THEN 1 ELSE 0 END,
  n.umschrift_von,
  n.umschrift_norm,
  NULL,
  NULL,
  n.gueltig_von,
  n.gueltig_bis,
  n.original_text,
  n.erstellt_am,
  n.geaendert_am
FROM name n;

-- ================================================================================================
-- 3. Datenumzug name -> name_part
-- ================================================================================================

-- (a) Vornamen an Leerzeichen zerlegen: je Token eine Zeile art='vorname', 0-basierter
--     sortier_index, ist_rufname = (Position == rufname_index).
INSERT INTO name_part (id, name_form_id, art, wert, ist_rufname, sortier_index)
WITH RECURSIVE zerlegung(id, person_id, rufname_index, wort, rest, pos) AS (
  SELECT
    n.id, n.person_id, n.rufname_index,
    CASE WHEN instr(TRIM(n.vornamen), ' ') = 0 THEN TRIM(n.vornamen)
         ELSE substr(TRIM(n.vornamen), 1, instr(TRIM(n.vornamen), ' ') - 1) END,
    CASE WHEN instr(TRIM(n.vornamen), ' ') = 0 THEN ''
         ELSE substr(TRIM(n.vornamen), instr(TRIM(n.vornamen), ' ') + 1) END,
    0
  FROM name n
  WHERE n.vornamen IS NOT NULL AND TRIM(n.vornamen) <> ''
  UNION ALL
  SELECT
    id, person_id, rufname_index,
    CASE WHEN instr(TRIM(rest), ' ') = 0 THEN TRIM(rest)
         ELSE substr(TRIM(rest), 1, instr(TRIM(rest), ' ') - 1) END,
    CASE WHEN instr(TRIM(rest), ' ') = 0 THEN ''
         ELSE substr(TRIM(rest), instr(TRIM(rest), ' ') + 1) END,
    pos + 1
  FROM zerlegung
  WHERE TRIM(rest) <> ''
)
SELECT uuid7(), id, 'vorname', wort,
  CASE WHEN pos = rufname_index THEN 1 ELSE 0 END,
  pos
FROM zerlegung
WHERE wort <> '';

-- (b) Nachname / Präfix / Titel / Suffix: je genau eine Zeile, wenn nicht NULL/leer.
INSERT INTO name_part (id, name_form_id, art, wert, ist_rufname, sortier_index)
  SELECT uuid7(), n.id, 'nachname', n.nachname, 0, 0
  FROM name n WHERE n.nachname IS NOT NULL AND n.nachname <> '';
INSERT INTO name_part (id, name_form_id, art, wert, ist_rufname, sortier_index)
  SELECT uuid7(), n.id, 'praefix', n.praefix, 0, 0
  FROM name n WHERE n.praefix IS NOT NULL AND n.praefix <> '';
INSERT INTO name_part (id, name_form_id, art, wert, ist_rufname, sortier_index)
  SELECT uuid7(), n.id, 'titel', n.titel_vor, 0, 0
  FROM name n WHERE n.titel_vor IS NOT NULL AND n.titel_vor <> '';
INSERT INTO name_part (id, name_form_id, art, wert, ist_rufname, sortier_index)
  SELECT uuid7(), n.id, 'suffix', n.zusatz_nach, 0, 0
  FROM name n WHERE n.zusatz_nach IS NOT NULL AND n.zusatz_nach <> '';

-- (c) rufname_text als zusätzlicher, markierter Vorname — nur wenn er nicht schon als Vorname-Token
--     vorkommt UND die Form noch keinen Rufname trägt (der partielle UNIQUE-Index erlaubt genau
--     einen). sortier_index = hinter dem letzten Vornamen.
INSERT INTO name_part (id, name_form_id, art, wert, ist_rufname, sortier_index)
SELECT uuid7(), n.id, 'vorname', n.rufname_text, 1,
  COALESCE((SELECT MAX(sortier_index) + 1 FROM name_part WHERE name_form_id = n.id AND art = 'vorname'), 0)
FROM name n
WHERE n.rufname_text IS NOT NULL AND n.rufname_text <> ''
  AND NOT EXISTS (SELECT 1 FROM name_part WHERE name_form_id = n.id AND art = 'vorname' AND wert = n.rufname_text)
  AND NOT EXISTS (SELECT 1 FROM name_part WHERE name_form_id = n.id AND art = 'vorname' AND ist_rufname = 1);

-- ================================================================================================
-- 4. name_phonetik auf name_part umstellen (VOR DROP name; alte FK zeigte auf name)
-- ================================================================================================
DROP TABLE name_phonetik;
-- NICHT_JOURNALISIERT (abgeleiteter Suchindex, E-3). Spalten/PK wie 0002_kern.sql, nur FK-Ziel neu.
CREATE TABLE name_phonetik (
  name_id TEXT NOT NULL REFERENCES name_part(id) ON DELETE CASCADE, -- bindet an den Nachnamens-Teil
  verfahren TEXT NOT NULL CHECK (verfahren IN ('koelner','dm_soundex','soundex')),
  code TEXT NOT NULL,
  erstellt_am INTEGER,
  geaendert_am INTEGER,
  PRIMARY KEY (name_id, verfahren)
) STRICT;
CREATE INDEX idx_name_phonetik_name_id ON name_phonetik(name_id);

-- ================================================================================================
-- 5. Harter Schnitt: name entfernen (nimmt automatisch die jrn_name_*/abl_name_*-Trigger mit)
-- ================================================================================================
DROP TABLE name;

-- ================================================================================================
-- 6. Constraint-Trigger „genau ein Hauptname je Person": eine Person mit Formen braucht immer eine
--    bevorzugte. Feuert bei DELETE und beim Herabstufen (UPDATE OF ist_bevorzugt) — NICHT bei INSERT
--    (der Datenumzug oben setzt bereits genau eine bevorzugte Form je Person).
-- ================================================================================================
CREATE TRIGGER chk_name_form_hauptname_ad AFTER DELETE ON name_form
WHEN EXISTS (SELECT 1 FROM name_form WHERE person_id = OLD.person_id)
 AND NOT EXISTS (SELECT 1 FROM name_form WHERE person_id = OLD.person_id AND ist_bevorzugt = 1)
BEGIN
  SELECT RAISE(ABORT, 'Jede Person mit Namensformen braucht genau eine bevorzugte (name_form.ist_bevorzugt = 1).');
END;

CREATE TRIGGER chk_name_form_hauptname_au AFTER UPDATE OF ist_bevorzugt ON name_form
WHEN NOT EXISTS (SELECT 1 FROM name_form WHERE person_id = NEW.person_id AND ist_bevorzugt = 1)
BEGIN
  SELECT RAISE(ABORT, 'Jede Person mit Namensformen braucht genau eine bevorzugte (name_form.ist_bevorzugt = 1).');
END;

-- ================================================================================================
-- 7. Abgeleitet-Trigger (generiert von `pnpm trigger`, skripte/trigger-generieren.ts). Die Präambel
--    ersetzt die aus 0003 stammenden abl_person_*/abl_aussage_*/abl_ortsname_*/abl_zitat_* (deren
--    Rümpfe noch `name` lasen) per DROP/CREATE und legt abl_name_form_*/abl_name_part_* neu an.
-- ================================================================================================
-- @generierte-trigger-anfang
DROP TRIGGER IF EXISTS abl_person_ai;
DROP TRIGGER IF EXISTS abl_person_au;
DROP TRIGGER IF EXISTS abl_person_ad;
DROP TRIGGER IF EXISTS abl_name_form_ai;
DROP TRIGGER IF EXISTS abl_name_form_au;
DROP TRIGGER IF EXISTS abl_name_form_bd;
DROP TRIGGER IF EXISTS abl_name_form_ad;
DROP TRIGGER IF EXISTS abl_name_part_ai;
DROP TRIGGER IF EXISTS abl_name_part_au;
DROP TRIGGER IF EXISTS abl_name_part_ad;
DROP TRIGGER IF EXISTS abl_aussage_ai;
DROP TRIGGER IF EXISTS abl_aussage_au;
DROP TRIGGER IF EXISTS abl_aussage_ad;
DROP TRIGGER IF EXISTS abl_ortsname_ai;
DROP TRIGGER IF EXISTS abl_ortsname_au;
DROP TRIGGER IF EXISTS abl_ortsname_ad;
DROP TRIGGER IF EXISTS abl_zitat_ai;
DROP TRIGGER IF EXISTS abl_zitat_au;
DROP TRIGGER IF EXISTS abl_zitat_ad;

CREATE TRIGGER abl_person_ai AFTER INSERT ON person
BEGIN
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
  SELECT nf.person_id AS person_id,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'vorname' ORDER BY sortier_index)) AS vornamen,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'nachname' ORDER BY sortier_index)) AS nachname,
    ROW_NUMBER() OVER (PARTITION BY nf.person_id ORDER BY (CASE WHEN nf.ist_bevorzugt = 1 THEN 0 ELSE 1 END), nf.id) AS rang
  FROM name_form nf
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
WHERE p.id = NEW.id;
  INSERT INTO suche_fts_quelle (quelle_typ, quelle_id) VALUES ('person_notiz', NEW.id);
  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    VALUES (last_insert_rowid(), '', '', '', COALESCE(NEW.notiz, ''), '');
END;

CREATE TRIGGER abl_person_au AFTER UPDATE ON person
BEGIN
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', rowid, '', '', '', COALESCE(OLD.notiz, ''), ''
    FROM suche_fts_quelle WHERE quelle_typ = 'person_notiz' AND quelle_id = OLD.id;
  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    SELECT rowid, '', '', '', COALESCE(NEW.notiz, ''), ''
    FROM suche_fts_quelle WHERE quelle_typ = 'person_notiz' AND quelle_id = NEW.id;
END;

CREATE TRIGGER abl_person_ad AFTER DELETE ON person
BEGIN
  -- person_flach räumt sich selbst über ON DELETE CASCADE ab (kein Trigger nötig) - aber
  -- suche_fts/suche_fts_quelle für die person_notiz-Zeile kennen keinen Fremdschlüssel
  -- (polymorphe Quelle) und müssen hier aufgeräumt werden.
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', rowid, '', '', '', COALESCE(OLD.notiz, ''), ''
    FROM suche_fts_quelle WHERE quelle_typ = 'person_notiz' AND quelle_id = OLD.id;
  DELETE FROM suche_fts_quelle WHERE quelle_typ = 'person_notiz' AND quelle_id = OLD.id;
END;

CREATE TRIGGER abl_name_form_ai AFTER INSERT ON name_form
BEGIN
  DELETE FROM person_flach WHERE person_id = NEW.person_id;
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
  SELECT nf.person_id AS person_id,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'vorname' ORDER BY sortier_index)) AS vornamen,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'nachname' ORDER BY sortier_index)) AS nachname,
    ROW_NUMBER() OVER (PARTITION BY nf.person_id ORDER BY (CASE WHEN nf.ist_bevorzugt = 1 THEN 0 ELSE 1 END), nf.id) AS rang
  FROM name_form nf
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
WHERE p.id = NEW.person_id;
  INSERT INTO suche_fts_quelle (quelle_typ, quelle_id) VALUES ('name', NEW.id);
  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    VALUES (last_insert_rowid(), COALESCE(NEW.original_text, ''), COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name_form sib WHERE sib.umschrift_von = NEW.id) ORDER BY id ASC LIMIT 1), ''), suchnormalform(COALESCE(NEW.original_text, TRIM(COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = NEW.id AND art = 'vorname' ORDER BY sortier_index)), '') || ' ' || COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = NEW.id AND art = 'nachname' ORDER BY sortier_index)), '')))), '', '');
  -- Fan-out: diese Form ist selbst die Umschrift einer anderen - deren FTS-Zeile auffrischen.
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', q.rowid, COALESCE(ziel.original_text, ''), COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name_form sib WHERE sib.umschrift_von = ziel.id AND sib.id <> NEW.id) ORDER BY id ASC LIMIT 1), ''), suchnormalform(COALESCE(ziel.original_text, TRIM(COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = ziel.id AND art = 'vorname' ORDER BY sortier_index)), '') || ' ' || COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = ziel.id AND art = 'nachname' ORDER BY sortier_index)), '')))), '', ''
    FROM name_form ziel JOIN suche_fts_quelle q ON q.quelle_typ = 'name' AND q.quelle_id = ziel.id
    WHERE NEW.umschrift_von IS NOT NULL AND ziel.id = NEW.umschrift_von;
  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    SELECT q.rowid, COALESCE(ziel.original_text, ''), COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name_form sib WHERE sib.umschrift_von = ziel.id) ORDER BY id ASC LIMIT 1), ''), suchnormalform(COALESCE(ziel.original_text, TRIM(COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = ziel.id AND art = 'vorname' ORDER BY sortier_index)), '') || ' ' || COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = ziel.id AND art = 'nachname' ORDER BY sortier_index)), '')))), '', ''
    FROM name_form ziel JOIN suche_fts_quelle q ON q.quelle_typ = 'name' AND q.quelle_id = ziel.id
    WHERE NEW.umschrift_von IS NOT NULL AND ziel.id = NEW.umschrift_von;
END;

CREATE TRIGGER abl_name_form_au AFTER UPDATE ON name_form
BEGIN
  DELETE FROM person_flach WHERE person_id IN (OLD.person_id, NEW.person_id);
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
  SELECT nf.person_id AS person_id,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'vorname' ORDER BY sortier_index)) AS vornamen,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'nachname' ORDER BY sortier_index)) AS nachname,
    ROW_NUMBER() OVER (PARTITION BY nf.person_id ORDER BY (CASE WHEN nf.ist_bevorzugt = 1 THEN 0 ELSE 1 END), nf.id) AS rang
  FROM name_form nf
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
WHERE p.id IN (OLD.person_id, NEW.person_id);
  -- Eigene FTS-Zeile: alten Stand löschen, neuen einfügen (Umschrift/Normalform live).
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', rowid, COALESCE(OLD.original_text, ''), COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name_form sib WHERE sib.umschrift_von = OLD.id) ORDER BY id ASC LIMIT 1), ''), suchnormalform(COALESCE(OLD.original_text, TRIM(COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = OLD.id AND art = 'vorname' ORDER BY sortier_index)), '') || ' ' || COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = OLD.id AND art = 'nachname' ORDER BY sortier_index)), '')))), '', ''
    FROM suche_fts_quelle WHERE quelle_typ = 'name' AND quelle_id = OLD.id;
  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    SELECT rowid, COALESCE(NEW.original_text, ''), COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name_form sib WHERE sib.umschrift_von = NEW.id) ORDER BY id ASC LIMIT 1), ''), suchnormalform(COALESCE(NEW.original_text, TRIM(COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = NEW.id AND art = 'vorname' ORDER BY sortier_index)), '') || ' ' || COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = NEW.id AND art = 'nachname' ORDER BY sortier_index)), '')))), '', ''
    FROM suche_fts_quelle WHERE quelle_typ = 'name' AND quelle_id = NEW.id;
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', q.rowid, COALESCE(ziel.original_text, ''), COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name_form sib WHERE sib.umschrift_von = ziel.id AND sib.id <> NEW.id UNION ALL SELECT OLD.id AS id, OLD.original_text AS original_text) ORDER BY id ASC LIMIT 1), ''), suchnormalform(COALESCE(ziel.original_text, TRIM(COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = ziel.id AND art = 'vorname' ORDER BY sortier_index)), '') || ' ' || COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = ziel.id AND art = 'nachname' ORDER BY sortier_index)), '')))), '', ''
    FROM name_form ziel JOIN suche_fts_quelle q ON q.quelle_typ = 'name' AND q.quelle_id = ziel.id
    WHERE OLD.umschrift_von IS NOT NULL AND ziel.id = OLD.umschrift_von;
  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    SELECT q.rowid, COALESCE(ziel.original_text, ''), COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name_form sib WHERE sib.umschrift_von = ziel.id) ORDER BY id ASC LIMIT 1), ''), suchnormalform(COALESCE(ziel.original_text, TRIM(COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = ziel.id AND art = 'vorname' ORDER BY sortier_index)), '') || ' ' || COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = ziel.id AND art = 'nachname' ORDER BY sortier_index)), '')))), '', ''
    FROM name_form ziel JOIN suche_fts_quelle q ON q.quelle_typ = 'name' AND q.quelle_id = ziel.id
    WHERE OLD.umschrift_von IS NOT NULL AND ziel.id = OLD.umschrift_von;
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', q.rowid, COALESCE(ziel.original_text, ''), COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name_form sib WHERE sib.umschrift_von = ziel.id AND sib.id <> NEW.id) ORDER BY id ASC LIMIT 1), ''), suchnormalform(COALESCE(ziel.original_text, TRIM(COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = ziel.id AND art = 'vorname' ORDER BY sortier_index)), '') || ' ' || COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = ziel.id AND art = 'nachname' ORDER BY sortier_index)), '')))), '', ''
    FROM name_form ziel JOIN suche_fts_quelle q ON q.quelle_typ = 'name' AND q.quelle_id = ziel.id
    WHERE NEW.umschrift_von IS NOT NULL AND NEW.umschrift_von IS NOT OLD.umschrift_von AND ziel.id = NEW.umschrift_von;
  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    SELECT q.rowid, COALESCE(ziel.original_text, ''), COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name_form sib WHERE sib.umschrift_von = ziel.id) ORDER BY id ASC LIMIT 1), ''), suchnormalform(COALESCE(ziel.original_text, TRIM(COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = ziel.id AND art = 'vorname' ORDER BY sortier_index)), '') || ' ' || COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = ziel.id AND art = 'nachname' ORDER BY sortier_index)), '')))), '', ''
    FROM name_form ziel JOIN suche_fts_quelle q ON q.quelle_typ = 'name' AND q.quelle_id = ziel.id
    WHERE NEW.umschrift_von IS NOT NULL AND NEW.umschrift_von IS NOT OLD.umschrift_von AND ziel.id = NEW.umschrift_von;
END;

CREATE TRIGGER abl_name_form_bd BEFORE DELETE ON name_form
BEGIN
  -- Eigene FTS-Zeile in BEFORE DELETE abräumen (die name_part-Zeilen dieser Form existieren hier
  -- noch, die Normalform-Rekonstruktion liefert also den zuletzt indizierten Wert). Grund für
  -- BEFORE statt AFTER wie beim alten abl_name_bd: umschrift_von REFERENCES name_form(id) ON DELETE
  -- SET NULL würde einen Umschrift-Geschwisterbezug sonst vor dem AFTER-Trigger kappen.
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', rowid, COALESCE(OLD.original_text, ''), COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name_form sib WHERE sib.umschrift_von = OLD.id) ORDER BY id ASC LIMIT 1), ''), suchnormalform(COALESCE(OLD.original_text, TRIM(COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = OLD.id AND art = 'vorname' ORDER BY sortier_index)), '') || ' ' || COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = OLD.id AND art = 'nachname' ORDER BY sortier_index)), '')))), '', ''
    FROM suche_fts_quelle WHERE quelle_typ = 'name' AND quelle_id = OLD.id;
  DELETE FROM suche_fts_quelle WHERE quelle_typ = 'name' AND quelle_id = OLD.id;
END;

CREATE TRIGGER abl_name_form_ad AFTER DELETE ON name_form
BEGIN
  DELETE FROM person_flach WHERE person_id = OLD.person_id;
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
  SELECT nf.person_id AS person_id,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'vorname' ORDER BY sortier_index)) AS vornamen,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'nachname' ORDER BY sortier_index)) AS nachname,
    ROW_NUMBER() OVER (PARTITION BY nf.person_id ORDER BY (CASE WHEN nf.ist_bevorzugt = 1 THEN 0 ELSE 1 END), nf.id) AS rang
  FROM name_form nf
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
WHERE p.id = OLD.person_id;
  -- name_part (und via CASCADE name_phonetik) räumen sich über ON DELETE CASCADE selbst ab; die
  -- eigene suche_fts-Zeile ist bereits in abl_name_form_bd abgeräumt.
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', q.rowid, COALESCE(ziel.original_text, ''), COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name_form sib WHERE sib.umschrift_von = ziel.id UNION ALL SELECT OLD.id AS id, OLD.original_text AS original_text) ORDER BY id ASC LIMIT 1), ''), suchnormalform(COALESCE(ziel.original_text, TRIM(COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = ziel.id AND art = 'vorname' ORDER BY sortier_index)), '') || ' ' || COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = ziel.id AND art = 'nachname' ORDER BY sortier_index)), '')))), '', ''
    FROM name_form ziel JOIN suche_fts_quelle q ON q.quelle_typ = 'name' AND q.quelle_id = ziel.id
    WHERE OLD.umschrift_von IS NOT NULL AND ziel.id = OLD.umschrift_von;
  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    SELECT q.rowid, COALESCE(ziel.original_text, ''), COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name_form sib WHERE sib.umschrift_von = ziel.id) ORDER BY id ASC LIMIT 1), ''), suchnormalform(COALESCE(ziel.original_text, TRIM(COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = ziel.id AND art = 'vorname' ORDER BY sortier_index)), '') || ' ' || COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = ziel.id AND art = 'nachname' ORDER BY sortier_index)), '')))), '', ''
    FROM name_form ziel JOIN suche_fts_quelle q ON q.quelle_typ = 'name' AND q.quelle_id = ziel.id
    WHERE OLD.umschrift_von IS NOT NULL AND ziel.id = OLD.umschrift_von;
END;

CREATE TRIGGER abl_name_part_ai AFTER INSERT ON name_part
BEGIN
  DELETE FROM person_flach WHERE person_id IN (SELECT nf.person_id FROM name_form nf WHERE nf.id IN (NEW.name_form_id));
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
  SELECT nf.person_id AS person_id,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'vorname' ORDER BY sortier_index)) AS vornamen,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'nachname' ORDER BY sortier_index)) AS nachname,
    ROW_NUMBER() OVER (PARTITION BY nf.person_id ORDER BY (CASE WHEN nf.ist_bevorzugt = 1 THEN 0 ELSE 1 END), nf.id) AS rang
  FROM name_form nf
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
WHERE p.id IN (SELECT nf.person_id FROM name_form nf WHERE nf.id IN (NEW.name_form_id));
  INSERT INTO name_phonetik (name_id, verfahren, code)
    SELECT NEW.id, 'koelner', koelner_phonetik(NEW.wert)
    WHERE NEW.art = 'nachname' AND NEW.wert <> '';
END;

CREATE TRIGGER abl_name_part_au AFTER UPDATE ON name_part
BEGIN
  DELETE FROM person_flach WHERE person_id IN (SELECT nf.person_id FROM name_form nf WHERE nf.id IN (OLD.name_form_id, NEW.name_form_id));
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
  SELECT nf.person_id AS person_id,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'vorname' ORDER BY sortier_index)) AS vornamen,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'nachname' ORDER BY sortier_index)) AS nachname,
    ROW_NUMBER() OVER (PARTITION BY nf.person_id ORDER BY (CASE WHEN nf.ist_bevorzugt = 1 THEN 0 ELSE 1 END), nf.id) AS rang
  FROM name_form nf
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
WHERE p.id IN (SELECT nf.person_id FROM name_form nf WHERE nf.id IN (OLD.name_form_id, NEW.name_form_id));
  DELETE FROM name_phonetik WHERE name_id = NEW.id AND verfahren = 'koelner';
  INSERT INTO name_phonetik (name_id, verfahren, code)
    SELECT NEW.id, 'koelner', koelner_phonetik(NEW.wert)
    WHERE NEW.art = 'nachname' AND NEW.wert <> '';
END;

CREATE TRIGGER abl_name_part_ad AFTER DELETE ON name_part
BEGIN
  DELETE FROM person_flach WHERE person_id IN (SELECT nf.person_id FROM name_form nf WHERE nf.id IN (OLD.name_form_id));
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
  SELECT nf.person_id AS person_id,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'vorname' ORDER BY sortier_index)) AS vornamen,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'nachname' ORDER BY sortier_index)) AS nachname,
    ROW_NUMBER() OVER (PARTITION BY nf.person_id ORDER BY (CASE WHEN nf.ist_bevorzugt = 1 THEN 0 ELSE 1 END), nf.id) AS rang
  FROM name_form nf
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
WHERE p.id IN (SELECT nf.person_id FROM name_form nf WHERE nf.id IN (OLD.name_form_id));
  -- name_phonetik räumt sich über ON DELETE CASCADE (FK auf name_part) selbst ab.
END;

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
  SELECT nf.person_id AS person_id,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'vorname' ORDER BY sortier_index)) AS vornamen,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'nachname' ORDER BY sortier_index)) AS nachname,
    ROW_NUMBER() OVER (PARTITION BY nf.person_id ORDER BY (CASE WHEN nf.ist_bevorzugt = 1 THEN 0 ELSE 1 END), nf.id) AS rang
  FROM name_form nf
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
  SELECT nf.person_id AS person_id,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'vorname' ORDER BY sortier_index)) AS vornamen,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'nachname' ORDER BY sortier_index)) AS nachname,
    ROW_NUMBER() OVER (PARTITION BY nf.person_id ORDER BY (CASE WHEN nf.ist_bevorzugt = 1 THEN 0 ELSE 1 END), nf.id) AS rang
  FROM name_form nf
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
  SELECT nf.person_id AS person_id,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'vorname' ORDER BY sortier_index)) AS vornamen,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'nachname' ORDER BY sortier_index)) AS nachname,
    ROW_NUMBER() OVER (PARTITION BY nf.person_id ORDER BY (CASE WHEN nf.ist_bevorzugt = 1 THEN 0 ELSE 1 END), nf.id) AS rang
  FROM name_form nf
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
  SELECT nf.person_id AS person_id,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'vorname' ORDER BY sortier_index)) AS vornamen,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'nachname' ORDER BY sortier_index)) AS nachname,
    ROW_NUMBER() OVER (PARTITION BY nf.person_id ORDER BY (CASE WHEN nf.ist_bevorzugt = 1 THEN 0 ELSE 1 END), nf.id) AS rang
  FROM name_form nf
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

CREATE TRIGGER abl_ortsname_ai AFTER INSERT ON ortsname
BEGIN
  DELETE FROM person_flach WHERE person_id IN (SELECT a.subjekt_id FROM aussage a WHERE a.subjekt_typ = 'person' AND a.praedikat = 'geburtsort' AND a.wert_ref_id IN (NEW.ort_id));
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
  SELECT nf.person_id AS person_id,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'vorname' ORDER BY sortier_index)) AS vornamen,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'nachname' ORDER BY sortier_index)) AS nachname,
    ROW_NUMBER() OVER (PARTITION BY nf.person_id ORDER BY (CASE WHEN nf.ist_bevorzugt = 1 THEN 0 ELSE 1 END), nf.id) AS rang
  FROM name_form nf
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
WHERE p.id IN (SELECT a.subjekt_id FROM aussage a WHERE a.subjekt_typ = 'person' AND a.praedikat = 'geburtsort' AND a.wert_ref_id IN (NEW.ort_id));
END;

CREATE TRIGGER abl_ortsname_au AFTER UPDATE ON ortsname
BEGIN
  DELETE FROM person_flach WHERE person_id IN (SELECT a.subjekt_id FROM aussage a WHERE a.subjekt_typ = 'person' AND a.praedikat = 'geburtsort' AND a.wert_ref_id IN (OLD.ort_id, NEW.ort_id));
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
  SELECT nf.person_id AS person_id,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'vorname' ORDER BY sortier_index)) AS vornamen,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'nachname' ORDER BY sortier_index)) AS nachname,
    ROW_NUMBER() OVER (PARTITION BY nf.person_id ORDER BY (CASE WHEN nf.ist_bevorzugt = 1 THEN 0 ELSE 1 END), nf.id) AS rang
  FROM name_form nf
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
WHERE p.id IN (SELECT a.subjekt_id FROM aussage a WHERE a.subjekt_typ = 'person' AND a.praedikat = 'geburtsort' AND a.wert_ref_id IN (OLD.ort_id, NEW.ort_id));
END;

CREATE TRIGGER abl_ortsname_ad AFTER DELETE ON ortsname
BEGIN
  DELETE FROM person_flach WHERE person_id IN (SELECT a.subjekt_id FROM aussage a WHERE a.subjekt_typ = 'person' AND a.praedikat = 'geburtsort' AND a.wert_ref_id IN (OLD.ort_id));
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
  SELECT nf.person_id AS person_id,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'vorname' ORDER BY sortier_index)) AS vornamen,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'nachname' ORDER BY sortier_index)) AS nachname,
    ROW_NUMBER() OVER (PARTITION BY nf.person_id ORDER BY (CASE WHEN nf.ist_bevorzugt = 1 THEN 0 ELSE 1 END), nf.id) AS rang
  FROM name_form nf
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
WHERE p.id IN (SELECT a.subjekt_id FROM aussage a WHERE a.subjekt_typ = 'person' AND a.praedikat = 'geburtsort' AND a.wert_ref_id IN (OLD.ort_id));
END;

CREATE TRIGGER abl_zitat_ai AFTER INSERT ON zitat
BEGIN
  INSERT INTO suche_fts_quelle (quelle_typ, quelle_id) VALUES ('zitat_transkript', NEW.id);
  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    VALUES (last_insert_rowid(), '', '', '', '', COALESCE(NEW.transkript, ''));
END;

CREATE TRIGGER abl_zitat_au AFTER UPDATE ON zitat
BEGIN
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', rowid, '', '', '', '', COALESCE(OLD.transkript, '')
    FROM suche_fts_quelle WHERE quelle_typ = 'zitat_transkript' AND quelle_id = OLD.id;
  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    SELECT rowid, '', '', '', '', COALESCE(NEW.transkript, '')
    FROM suche_fts_quelle WHERE quelle_typ = 'zitat_transkript' AND quelle_id = NEW.id;
END;

CREATE TRIGGER abl_zitat_ad AFTER DELETE ON zitat
BEGIN
  -- persona.zitat_id verweist per ON DELETE CASCADE, aussage_zitat.zitat_id ebenso (0002_kern.sql)
  -- - beides ohne Bezug zu suche_fts. Die zitat_transkript-FTS-Zeile kennt keinen Fremdschlüssel.
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', rowid, '', '', '', '', COALESCE(OLD.transkript, '')
    FROM suche_fts_quelle WHERE quelle_typ = 'zitat_transkript' AND quelle_id = OLD.id;
  DELETE FROM suche_fts_quelle WHERE quelle_typ = 'zitat_transkript' AND quelle_id = OLD.id;
END;
-- @generierte-trigger-ende

-- ================================================================================================
-- 8. Vollständiger Neuaufbau der abgeleiteten Tabellen (person_flach, name_phonetik, suche_fts,
--    suche_fts_quelle) auf Basis des neuen Modells — dieselbe kanonische Projektion wie
--    src/main/datenbank/trigger.ts (`alleAbgeleitetenNeuAufbauen`). Läuft NACH dem abl-Block; er
--    feuert dabei nicht (kein Schreibzugriff auf name_form/name_part/person/aussage/ortsname/zitat).
-- ================================================================================================
DELETE FROM person_flach;
DELETE FROM name_phonetik;
DELETE FROM suche_fts_quelle;
INSERT INTO suche_fts (suche_fts) VALUES ('delete-all');

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
  SELECT nf.person_id AS person_id,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'vorname' ORDER BY sortier_index)) AS vornamen,
    (SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'nachname' ORDER BY sortier_index)) AS nachname,
    ROW_NUMBER() OVER (PARTITION BY nf.person_id ORDER BY (CASE WHEN nf.ist_bevorzugt = 1 THEN 0 ELSE 1 END), nf.id) AS rang
  FROM name_form nf
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
WHERE 1 = 1;

INSERT INTO name_phonetik (name_id, verfahren, code)
  SELECT n.id, 'koelner', koelner_phonetik(n.wert)
  FROM name_part AS n
  WHERE n.art = 'nachname' AND n.wert <> '';

INSERT INTO suche_fts_quelle (quelle_typ, quelle_id) SELECT 'person_notiz', id FROM person;
INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
  SELECT q.rowid, '', '', '', COALESCE(p.notiz, ''), ''
  FROM person AS p JOIN suche_fts_quelle q ON q.quelle_typ = 'person_notiz' AND q.quelle_id = p.id;

INSERT INTO suche_fts_quelle (quelle_typ, quelle_id) SELECT 'name', id FROM name_form;
INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
  SELECT q.rowid,
    COALESCE(nf.original_text, ''),
    COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name_form sib WHERE sib.umschrift_von = nf.id) ORDER BY id ASC LIMIT 1), ''),
    suchnormalform(COALESCE(nf.original_text, TRIM(
      COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'vorname' ORDER BY sortier_index)), '') || ' ' ||
      COALESCE((SELECT group_concat(wert, ' ') FROM (SELECT wert FROM name_part WHERE name_form_id = nf.id AND art = 'nachname' ORDER BY sortier_index)), '')
    ))),
    '', ''
  FROM name_form AS nf JOIN suche_fts_quelle q ON q.quelle_typ = 'name' AND q.quelle_id = nf.id;

INSERT INTO suche_fts_quelle (quelle_typ, quelle_id) SELECT 'zitat_transkript', id FROM zitat;
INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
  SELECT q.rowid, '', '', '', '', COALESCE(z.transkript, '')
  FROM zitat AS z JOIN suche_fts_quelle q ON q.quelle_typ = 'zitat_transkript' AND q.quelle_id = z.id;
