-- Abgeleitet-Migration 0003 (AP-0.7). Materialisierte Ansicht + Suchindex aus 55_Architektur.md §5.
-- HARTE REGEL (§5.2): Abgeleitete Tabellen tragen keine Wahrheit. Sie sind jederzeit vollständig
-- aus den Basistabellen neu berechenbar (src/main/datenbank/trigger.ts,
-- `alleAbgeleitetenNeuAufbauen`), sie werden nie journalisiert, und kein Befehl schreibt jemals
-- direkt in sie - nur die generierten `abl_*`-Trigger unten tun das.
--
-- NICHT_JOURNALISIERT (E-3, abgeleitete Suchindizes/Ansichten, analog name_phonetik in
-- 0002_kern.sql): person_flach, suche_fts, suche_fts_quelle. Die physische
-- JOURNALISIERT/NICHT_JOURNALISIERT-Liste + jrn_*-Trigger folgen in AP-0.8.

-- §5.1: Materialisierte Ansicht auf Person - Anzeigename, Sortiernamen (Suchnormalform),
-- Geburts-/Todesjahr, Geburtsortsname, Konfidenz-Untergrenze, abgeleiteter Widerspruchs-Zustand
-- (E21). Feldliste und -typen exakt nach 55_Architektur.md §5.1.
CREATE TABLE person_flach (
  person_id        TEXT PRIMARY KEY REFERENCES person(id) ON DELETE CASCADE,
  anzeigename       TEXT NOT NULL,
  sortier_nachname  TEXT NOT NULL,
  sortier_vornamen  TEXT NOT NULL,
  geburt_jahr       INTEGER,
  geburt_sort_von   INTEGER,
  geburt_ort_name   TEXT,
  tod_jahr          INTEGER,
  tod_sort_von      INTEGER,
  konfidenz_min     INTEGER,
  hat_widerspruch   INTEGER NOT NULL DEFAULT 0 CHECK (hat_widerspruch IN (0,1))
) STRICT;
CREATE INDEX idx_person_flach_sortier_nachname ON person_flach(sortier_nachname);
CREATE INDEX idx_person_flach_sortier_vornamen ON person_flach(sortier_vornamen);

-- Mapping-Tabelle für die contentless FTS5-Tabelle `suche_fts` (Variante 1 der freigegebenen
-- Entscheidung): eine Zeile je Quell-Datensatz, deren `rowid` zugleich der `rowid` in `suche_fts`
-- ist. `INTEGER PRIMARY KEY AUTOINCREMENT` ist hier bewusst wie bei `journal_kontext`/
-- `schema_migration` in 0001_grundgeruest.sql - keine UUID-fähige Entität, sondern eine
-- durchlaufende Ganzzahl, die die FTS5-Tabelle als Zeilenkennung braucht (CLAUDE.md §6 gilt
-- ausdrücklich für journalisierte Tabellen; diese hier ist NICHT_JOURNALISIERT).
CREATE TABLE suche_fts_quelle (
  rowid       INTEGER PRIMARY KEY AUTOINCREMENT,
  quelle_typ  TEXT NOT NULL CHECK (quelle_typ IN ('name', 'person_notiz', 'zitat_transkript')),
  quelle_id   TEXT NOT NULL,
  UNIQUE (quelle_typ, quelle_id)
) STRICT;

-- §5.2: FTS5-Index mit den drei ADR-014-Ebenen (Original, Umschrift, Suchnormalform) plus den
-- durchsuchbaren Freitextfeldern. `content=''` (contentless) - der eigentliche Text steht in den
-- Basistabellen, hier nur der Index. Virtualtabellen sind naturgemäß nicht STRICT.
CREATE VIRTUAL TABLE suche_fts USING fts5(
  original, umschrift, normalform, notiz, transkript,
  content='', tokenize='unicode61 remove_diacritics 2'
);

-- @generierte-trigger-anfang
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

CREATE TRIGGER abl_name_ai AFTER INSERT ON name
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
WHERE p.id = NEW.person_id;
  INSERT INTO name_phonetik (name_id, verfahren, code)
    SELECT NEW.id, 'koelner', koelner_phonetik(NEW.nachname)
    WHERE NEW.nachname IS NOT NULL AND NEW.nachname <> '';
  INSERT INTO suche_fts_quelle (quelle_typ, quelle_id) VALUES ('name', NEW.id);
  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    VALUES (last_insert_rowid(), COALESCE(NEW.original_text, ''), COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name sib WHERE sib.umschrift_von = NEW.id) ORDER BY id ASC LIMIT 1), ''), suchnormalform(COALESCE(NEW.original_text, TRIM(COALESCE(NEW.vornamen, '') || ' ' || COALESCE(NEW.nachname, '')))), '', '');
  -- Fan-out: dieser Eintrag ist selbst die Umschrift eines anderen - dessen FTS-Zeile auffrischen.
  -- Vorher-Wert = Live-Abfrage ohne NEW (das existiert in der Tabelle schon, muss für den
  -- "davor"-Zustand aber ausgeschlossen werden).
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', q.rowid, COALESCE(ziel.original_text, ''), COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name sib WHERE sib.umschrift_von = ziel.id AND sib.id <> NEW.id) ORDER BY id ASC LIMIT 1), ''), suchnormalform(COALESCE(ziel.original_text, TRIM(COALESCE(ziel.vornamen, '') || ' ' || COALESCE(ziel.nachname, '')))), '', ''
    FROM name ziel JOIN suche_fts_quelle q ON q.quelle_typ = 'name' AND q.quelle_id = ziel.id
    WHERE NEW.umschrift_von IS NOT NULL AND ziel.id = NEW.umschrift_von;
  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    SELECT q.rowid, COALESCE(ziel.original_text, ''), COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name sib WHERE sib.umschrift_von = ziel.id) ORDER BY id ASC LIMIT 1), ''), suchnormalform(COALESCE(ziel.original_text, TRIM(COALESCE(ziel.vornamen, '') || ' ' || COALESCE(ziel.nachname, '')))), '', ''
    FROM name ziel JOIN suche_fts_quelle q ON q.quelle_typ = 'name' AND q.quelle_id = ziel.id
    WHERE NEW.umschrift_von IS NOT NULL AND ziel.id = NEW.umschrift_von;
END;

CREATE TRIGGER abl_name_au AFTER UPDATE ON name
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
WHERE p.id IN (OLD.person_id, NEW.person_id);
  DELETE FROM name_phonetik WHERE name_id = NEW.id AND verfahren = 'koelner';
  INSERT INTO name_phonetik (name_id, verfahren, code)
    SELECT NEW.id, 'koelner', koelner_phonetik(NEW.nachname)
    WHERE NEW.nachname IS NOT NULL AND NEW.nachname <> '';
  -- Eigene FTS-Zeile: alten Stand (OLD-Werte, Umschrift live - unabhängig von dieser Zeile selbst)
  -- löschen, dann mit den neuen Werten (Umschrift live mit dem neuen Stand) neu einfügen.
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', rowid, COALESCE(OLD.original_text, ''), COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name sib WHERE sib.umschrift_von = OLD.id) ORDER BY id ASC LIMIT 1), ''), suchnormalform(COALESCE(OLD.original_text, TRIM(COALESCE(OLD.vornamen, '') || ' ' || COALESCE(OLD.nachname, '')))), '', ''
    FROM suche_fts_quelle WHERE quelle_typ = 'name' AND quelle_id = OLD.id;
  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    SELECT rowid, COALESCE(NEW.original_text, ''), COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name sib WHERE sib.umschrift_von = NEW.id) ORDER BY id ASC LIMIT 1), ''), suchnormalform(COALESCE(NEW.original_text, TRIM(COALESCE(NEW.vornamen, '') || ' ' || COALESCE(NEW.nachname, '')))), '', ''
    FROM suche_fts_quelle WHERE quelle_typ = 'name' AND quelle_id = NEW.id;
  -- Fan-out beim alten Umschrift-Ziel (ziel = OLD.umschrift_von): läuft IMMER, wenn OLD überhaupt
  -- ein Ziel hatte - deckt sowohl "Ziel geändert" als auch "Ziel gleich geblieben, aber
  -- original_text dieser Zeile geändert" ab. Vorher-Wert: Live-Geschwistersuche ohne die (bereits
  -- aktualisierte) eigene Zeile, dafür mit einem virtuellen Kandidaten aus OLD.* - das rekonstruiert
  -- exakt den Stand vor diesem UPDATE.
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', q.rowid, COALESCE(ziel.original_text, ''), COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name sib WHERE sib.umschrift_von = ziel.id AND sib.id <> NEW.id UNION ALL SELECT OLD.id AS id, OLD.original_text AS original_text) ORDER BY id ASC LIMIT 1), ''), suchnormalform(COALESCE(ziel.original_text, TRIM(COALESCE(ziel.vornamen, '') || ' ' || COALESCE(ziel.nachname, '')))), '', ''
    FROM name ziel JOIN suche_fts_quelle q ON q.quelle_typ = 'name' AND q.quelle_id = ziel.id
    WHERE OLD.umschrift_von IS NOT NULL AND ziel.id = OLD.umschrift_von;
  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    SELECT q.rowid, COALESCE(ziel.original_text, ''), COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name sib WHERE sib.umschrift_von = ziel.id) ORDER BY id ASC LIMIT 1), ''), suchnormalform(COALESCE(ziel.original_text, TRIM(COALESCE(ziel.vornamen, '') || ' ' || COALESCE(ziel.nachname, '')))), '', ''
    FROM name ziel JOIN suche_fts_quelle q ON q.quelle_typ = 'name' AND q.quelle_id = ziel.id
    WHERE OLD.umschrift_von IS NOT NULL AND ziel.id = OLD.umschrift_von;
  -- Fan-out beim neuen Umschrift-Ziel (ziel = NEW.umschrift_von): nur wenn sich das Ziel
  -- tatsächlich geändert hat - bei unverändertem Ziel deckt der Block oben denselben Fall schon ab
  -- (zweimal denselben rowid löschen+einfügen würde den contentless-Index mit falschen
  -- "Vorher"-Werten füttern, siehe Modul-Doku zu nameFtsUmschriftSql).
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', q.rowid, COALESCE(ziel.original_text, ''), COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name sib WHERE sib.umschrift_von = ziel.id AND sib.id <> NEW.id) ORDER BY id ASC LIMIT 1), ''), suchnormalform(COALESCE(ziel.original_text, TRIM(COALESCE(ziel.vornamen, '') || ' ' || COALESCE(ziel.nachname, '')))), '', ''
    FROM name ziel JOIN suche_fts_quelle q ON q.quelle_typ = 'name' AND q.quelle_id = ziel.id
    WHERE NEW.umschrift_von IS NOT NULL AND NEW.umschrift_von IS NOT OLD.umschrift_von AND ziel.id = NEW.umschrift_von;
  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    SELECT q.rowid, COALESCE(ziel.original_text, ''), COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name sib WHERE sib.umschrift_von = ziel.id) ORDER BY id ASC LIMIT 1), ''), suchnormalform(COALESCE(ziel.original_text, TRIM(COALESCE(ziel.vornamen, '') || ' ' || COALESCE(ziel.nachname, '')))), '', ''
    FROM name ziel JOIN suche_fts_quelle q ON q.quelle_typ = 'name' AND q.quelle_id = ziel.id
    WHERE NEW.umschrift_von IS NOT NULL AND NEW.umschrift_von IS NOT OLD.umschrift_von AND ziel.id = NEW.umschrift_von;
END;

CREATE TRIGGER abl_name_ad AFTER DELETE ON name
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
WHERE p.id = OLD.person_id;
  -- name_phonetik räumt sich selbst über ON DELETE CASCADE ab (0002_kern.sql).
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', rowid, COALESCE(OLD.original_text, ''), COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name sib WHERE sib.umschrift_von = OLD.id) ORDER BY id ASC LIMIT 1), ''), suchnormalform(COALESCE(OLD.original_text, TRIM(COALESCE(OLD.vornamen, '') || ' ' || COALESCE(OLD.nachname, '')))), '', ''
    FROM suche_fts_quelle WHERE quelle_typ = 'name' AND quelle_id = OLD.id;
  DELETE FROM suche_fts_quelle WHERE quelle_typ = 'name' AND quelle_id = OLD.id;
  -- Fan-out: OLD war Umschrift-Geschwister eines anderen Originals. OLD existiert zum Zeitpunkt
  -- dieses AFTER-DELETE-Triggers nicht mehr in der Tabelle - der virtuelle Kandidat aus OLD.*
  -- rekonstruiert, was vorher indiziert war (keine Live-Ausschluss-Klausel nötig, OLD ist ja schon weg).
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', q.rowid, COALESCE(ziel.original_text, ''), COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name sib WHERE sib.umschrift_von = ziel.id UNION ALL SELECT OLD.id AS id, OLD.original_text AS original_text) ORDER BY id ASC LIMIT 1), ''), suchnormalform(COALESCE(ziel.original_text, TRIM(COALESCE(ziel.vornamen, '') || ' ' || COALESCE(ziel.nachname, '')))), '', ''
    FROM name ziel JOIN suche_fts_quelle q ON q.quelle_typ = 'name' AND q.quelle_id = ziel.id
    WHERE OLD.umschrift_von IS NOT NULL AND ziel.id = OLD.umschrift_von;
  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    SELECT q.rowid, COALESCE(ziel.original_text, ''), COALESCE((SELECT original_text FROM (SELECT sib.id AS id, sib.original_text AS original_text FROM name sib WHERE sib.umschrift_von = ziel.id) ORDER BY id ASC LIMIT 1), ''), suchnormalform(COALESCE(ziel.original_text, TRIM(COALESCE(ziel.vornamen, '') || ' ' || COALESCE(ziel.nachname, '')))), '', ''
    FROM name ziel JOIN suche_fts_quelle q ON q.quelle_typ = 'name' AND q.quelle_id = ziel.id
    WHERE OLD.umschrift_von IS NOT NULL AND ziel.id = OLD.umschrift_von;
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
