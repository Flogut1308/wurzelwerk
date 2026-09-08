-- Erzeugt von `pnpm trigger` (skripte/trigger-generieren.ts) — NICHT von Hand ändern.
-- jrn_*-Journal-Trigger je journalisierter Tabelle (55_Architektur.md §4.2-§4.4, ADR-017,
-- AP-0.8), Tabellenliste aus src/main/journal/journalisierung.ts (JOURNALISIERT).
-- Angewendet von src/main/datenbank/journal-trigger-anwenden.ts nach jeder abgeschlossenen
-- Migrationsschleife (src/main/datenbank/migration/laeufer.ts) - diese Datei ist selbst KEINE
-- Migration (keine Prüfsummen-Registrierung in registrierung.ts) und trägt deshalb keine
-- "00NN_"-Nummer.

CREATE TRIGGER jrn_ansicht_zustand_ai AFTER INSERT ON ansicht_zustand
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'ansicht_zustand', NEW.id, NULL, json_object('id', NEW.id, 'name', NEW.name, 'zentrumsperson_id', NEW.zentrumsperson_id, 'filter_json', NEW.filter_json, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_ansicht_zustand_au AFTER UPDATE ON ansicht_zustand
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'ansicht_zustand', OLD.id, json_object('id', OLD.id, 'name', OLD.name, 'zentrumsperson_id', OLD.zentrumsperson_id, 'filter_json', OLD.filter_json, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'name', NEW.name, 'zentrumsperson_id', NEW.zentrumsperson_id, 'filter_json', NEW.filter_json, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_ansicht_zustand_ad AFTER DELETE ON ansicht_zustand
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'ansicht_zustand', OLD.id, json_object('id', OLD.id, 'name', OLD.name, 'zentrumsperson_id', OLD.zentrumsperson_id, 'filter_json', OLD.filter_json, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_archiv_ai AFTER INSERT ON archiv
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'archiv', NEW.id, NULL, json_object('id', NEW.id, 'name', NEW.name, 'ort_id', NEW.ort_id, 'kontakt', NEW.kontakt, 'url', NEW.url, 'notiz', NEW.notiz, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_archiv_au AFTER UPDATE ON archiv
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'archiv', OLD.id, json_object('id', OLD.id, 'name', OLD.name, 'ort_id', OLD.ort_id, 'kontakt', OLD.kontakt, 'url', OLD.url, 'notiz', OLD.notiz, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'name', NEW.name, 'ort_id', NEW.ort_id, 'kontakt', NEW.kontakt, 'url', NEW.url, 'notiz', NEW.notiz, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_archiv_ad AFTER DELETE ON archiv
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'archiv', OLD.id, json_object('id', OLD.id, 'name', OLD.name, 'ort_id', OLD.ort_id, 'kontakt', OLD.kontakt, 'url', OLD.url, 'notiz', OLD.notiz, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_assoziation_ai AFTER INSERT ON assoziation
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'assoziation', NEW.id, NULL, json_object('id', NEW.id, 'person_a_id', NEW.person_a_id, 'person_b_id', NEW.person_b_id, 'art', NEW.art, 'notiz', NEW.notiz, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_assoziation_au AFTER UPDATE ON assoziation
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'assoziation', OLD.id, json_object('id', OLD.id, 'person_a_id', OLD.person_a_id, 'person_b_id', OLD.person_b_id, 'art', OLD.art, 'notiz', OLD.notiz, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'person_a_id', NEW.person_a_id, 'person_b_id', NEW.person_b_id, 'art', NEW.art, 'notiz', NEW.notiz, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_assoziation_ad AFTER DELETE ON assoziation
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'assoziation', OLD.id, json_object('id', OLD.id, 'person_a_id', OLD.person_a_id, 'person_b_id', OLD.person_b_id, 'art', OLD.art, 'notiz', OLD.notiz, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_aufgabe_ai AFTER INSERT ON aufgabe
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'aufgabe', NEW.id, NULL, json_object('id', NEW.id, 'person_id', NEW.person_id, 'ort_id', NEW.ort_id, 'quelle_id', NEW.quelle_id, 'titel', NEW.titel, 'beschreibung', NEW.beschreibung, 'prioritaet', NEW.prioritaet, 'status', NEW.status, 'faellig_am', NEW.faellig_am, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_aufgabe_au AFTER UPDATE ON aufgabe
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'aufgabe', OLD.id, json_object('id', OLD.id, 'person_id', OLD.person_id, 'ort_id', OLD.ort_id, 'quelle_id', OLD.quelle_id, 'titel', OLD.titel, 'beschreibung', OLD.beschreibung, 'prioritaet', OLD.prioritaet, 'status', OLD.status, 'faellig_am', OLD.faellig_am, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'person_id', NEW.person_id, 'ort_id', NEW.ort_id, 'quelle_id', NEW.quelle_id, 'titel', NEW.titel, 'beschreibung', NEW.beschreibung, 'prioritaet', NEW.prioritaet, 'status', NEW.status, 'faellig_am', NEW.faellig_am, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_aufgabe_ad AFTER DELETE ON aufgabe
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'aufgabe', OLD.id, json_object('id', OLD.id, 'person_id', OLD.person_id, 'ort_id', OLD.ort_id, 'quelle_id', OLD.quelle_id, 'titel', OLD.titel, 'beschreibung', OLD.beschreibung, 'prioritaet', OLD.prioritaet, 'status', OLD.status, 'faellig_am', OLD.faellig_am, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_aussage_ai AFTER INSERT ON aussage
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'aussage', NEW.id, NULL, json_object('id', NEW.id, 'subjekt_typ', NEW.subjekt_typ, 'subjekt_id', NEW.subjekt_id, 'praedikat', NEW.praedikat, 'wert_text', NEW.wert_text, 'wert_zahl', NEW.wert_zahl, 'wert_ref_id', NEW.wert_ref_id, 'datum_kalender', NEW.datum_kalender, 'datum_modifikator', NEW.datum_modifikator, 'datum_praezision', NEW.datum_praezision, 'datum_wert1', NEW.datum_wert1, 'datum_wert2', NEW.datum_wert2, 'datum_originaltext', NEW.datum_originaltext, 'datum_sort_von', NEW.datum_sort_von, 'datum_sort_bis', NEW.datum_sort_bis, 'datum_zweitkalender', NEW.datum_zweitkalender, 'datum_zweitwert', NEW.datum_zweitwert, 'datum_doppeljahr', NEW.datum_doppeljahr, 'konfidenz', NEW.konfidenz, 'ist_bevorzugt', NEW.ist_bevorzugt, 'begruendung', NEW.begruendung, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_aussage_au AFTER UPDATE ON aussage
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'aussage', OLD.id, json_object('id', OLD.id, 'subjekt_typ', OLD.subjekt_typ, 'subjekt_id', OLD.subjekt_id, 'praedikat', OLD.praedikat, 'wert_text', OLD.wert_text, 'wert_zahl', OLD.wert_zahl, 'wert_ref_id', OLD.wert_ref_id, 'datum_kalender', OLD.datum_kalender, 'datum_modifikator', OLD.datum_modifikator, 'datum_praezision', OLD.datum_praezision, 'datum_wert1', OLD.datum_wert1, 'datum_wert2', OLD.datum_wert2, 'datum_originaltext', OLD.datum_originaltext, 'datum_sort_von', OLD.datum_sort_von, 'datum_sort_bis', OLD.datum_sort_bis, 'datum_zweitkalender', OLD.datum_zweitkalender, 'datum_zweitwert', OLD.datum_zweitwert, 'datum_doppeljahr', OLD.datum_doppeljahr, 'konfidenz', OLD.konfidenz, 'ist_bevorzugt', OLD.ist_bevorzugt, 'begruendung', OLD.begruendung, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'subjekt_typ', NEW.subjekt_typ, 'subjekt_id', NEW.subjekt_id, 'praedikat', NEW.praedikat, 'wert_text', NEW.wert_text, 'wert_zahl', NEW.wert_zahl, 'wert_ref_id', NEW.wert_ref_id, 'datum_kalender', NEW.datum_kalender, 'datum_modifikator', NEW.datum_modifikator, 'datum_praezision', NEW.datum_praezision, 'datum_wert1', NEW.datum_wert1, 'datum_wert2', NEW.datum_wert2, 'datum_originaltext', NEW.datum_originaltext, 'datum_sort_von', NEW.datum_sort_von, 'datum_sort_bis', NEW.datum_sort_bis, 'datum_zweitkalender', NEW.datum_zweitkalender, 'datum_zweitwert', NEW.datum_zweitwert, 'datum_doppeljahr', NEW.datum_doppeljahr, 'konfidenz', NEW.konfidenz, 'ist_bevorzugt', NEW.ist_bevorzugt, 'begruendung', NEW.begruendung, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_aussage_ad AFTER DELETE ON aussage
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'aussage', OLD.id, json_object('id', OLD.id, 'subjekt_typ', OLD.subjekt_typ, 'subjekt_id', OLD.subjekt_id, 'praedikat', OLD.praedikat, 'wert_text', OLD.wert_text, 'wert_zahl', OLD.wert_zahl, 'wert_ref_id', OLD.wert_ref_id, 'datum_kalender', OLD.datum_kalender, 'datum_modifikator', OLD.datum_modifikator, 'datum_praezision', OLD.datum_praezision, 'datum_wert1', OLD.datum_wert1, 'datum_wert2', OLD.datum_wert2, 'datum_originaltext', OLD.datum_originaltext, 'datum_sort_von', OLD.datum_sort_von, 'datum_sort_bis', OLD.datum_sort_bis, 'datum_zweitkalender', OLD.datum_zweitkalender, 'datum_zweitwert', OLD.datum_zweitwert, 'datum_doppeljahr', OLD.datum_doppeljahr, 'konfidenz', OLD.konfidenz, 'ist_bevorzugt', OLD.ist_bevorzugt, 'begruendung', OLD.begruendung, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_aussage_zitat_ai AFTER INSERT ON aussage_zitat
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'aussage_zitat', NEW.aussage_id || '|' || NEW.zitat_id, NULL, json_object('aussage_id', NEW.aussage_id, 'zitat_id', NEW.zitat_id, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_aussage_zitat_au AFTER UPDATE ON aussage_zitat
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'aussage_zitat', OLD.aussage_id || '|' || OLD.zitat_id, json_object('aussage_id', OLD.aussage_id, 'zitat_id', OLD.zitat_id, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('aussage_id', NEW.aussage_id, 'zitat_id', NEW.zitat_id, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_aussage_zitat_ad AFTER DELETE ON aussage_zitat
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'aussage_zitat', OLD.aussage_id || '|' || OLD.zitat_id, json_object('aussage_id', OLD.aussage_id, 'zitat_id', OLD.zitat_id, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_beteiligung_ai AFTER INSERT ON beteiligung
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'beteiligung', NEW.id, NULL, json_object('id', NEW.id, 'ereignis_id', NEW.ereignis_id, 'person_id', NEW.person_id, 'rolle', NEW.rolle, 'reihenfolge', NEW.reihenfolge, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_beteiligung_au AFTER UPDATE ON beteiligung
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'beteiligung', OLD.id, json_object('id', OLD.id, 'ereignis_id', OLD.ereignis_id, 'person_id', OLD.person_id, 'rolle', OLD.rolle, 'reihenfolge', OLD.reihenfolge, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'ereignis_id', NEW.ereignis_id, 'person_id', NEW.person_id, 'rolle', NEW.rolle, 'reihenfolge', NEW.reihenfolge, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_beteiligung_ad AFTER DELETE ON beteiligung
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'beteiligung', OLD.id, json_object('id', OLD.id, 'ereignis_id', OLD.ereignis_id, 'person_id', OLD.person_id, 'rolle', OLD.rolle, 'reihenfolge', OLD.reihenfolge, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_diagnose_ai AFTER INSERT ON diagnose
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'diagnose', NEW.id, NULL, json_object('id', NEW.id, 'person_id', NEW.person_id, 'kategorie', NEW.kategorie, 'organ', NEW.organ, 'bezeichnung', NEW.bezeichnung, 'icd10', NEW.icd10, 'erstdiagnose_kalender', NEW.erstdiagnose_kalender, 'erstdiagnose_modifikator', NEW.erstdiagnose_modifikator, 'erstdiagnose_praezision', NEW.erstdiagnose_praezision, 'erstdiagnose_wert1', NEW.erstdiagnose_wert1, 'erstdiagnose_wert2', NEW.erstdiagnose_wert2, 'erstdiagnose_originaltext', NEW.erstdiagnose_originaltext, 'erstdiagnose_sort_von', NEW.erstdiagnose_sort_von, 'erstdiagnose_sort_bis', NEW.erstdiagnose_sort_bis, 'erstdiagnose_zweitkalender', NEW.erstdiagnose_zweitkalender, 'erstdiagnose_zweitwert', NEW.erstdiagnose_zweitwert, 'erstdiagnose_doppeljahr', NEW.erstdiagnose_doppeljahr, 'alter_bei_diagnose', NEW.alter_bei_diagnose, 'status', NEW.status, 'konfidenz', NEW.konfidenz, 'notiz', NEW.notiz, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_diagnose_au AFTER UPDATE ON diagnose
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'diagnose', OLD.id, json_object('id', OLD.id, 'person_id', OLD.person_id, 'kategorie', OLD.kategorie, 'organ', OLD.organ, 'bezeichnung', OLD.bezeichnung, 'icd10', OLD.icd10, 'erstdiagnose_kalender', OLD.erstdiagnose_kalender, 'erstdiagnose_modifikator', OLD.erstdiagnose_modifikator, 'erstdiagnose_praezision', OLD.erstdiagnose_praezision, 'erstdiagnose_wert1', OLD.erstdiagnose_wert1, 'erstdiagnose_wert2', OLD.erstdiagnose_wert2, 'erstdiagnose_originaltext', OLD.erstdiagnose_originaltext, 'erstdiagnose_sort_von', OLD.erstdiagnose_sort_von, 'erstdiagnose_sort_bis', OLD.erstdiagnose_sort_bis, 'erstdiagnose_zweitkalender', OLD.erstdiagnose_zweitkalender, 'erstdiagnose_zweitwert', OLD.erstdiagnose_zweitwert, 'erstdiagnose_doppeljahr', OLD.erstdiagnose_doppeljahr, 'alter_bei_diagnose', OLD.alter_bei_diagnose, 'status', OLD.status, 'konfidenz', OLD.konfidenz, 'notiz', OLD.notiz, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'person_id', NEW.person_id, 'kategorie', NEW.kategorie, 'organ', NEW.organ, 'bezeichnung', NEW.bezeichnung, 'icd10', NEW.icd10, 'erstdiagnose_kalender', NEW.erstdiagnose_kalender, 'erstdiagnose_modifikator', NEW.erstdiagnose_modifikator, 'erstdiagnose_praezision', NEW.erstdiagnose_praezision, 'erstdiagnose_wert1', NEW.erstdiagnose_wert1, 'erstdiagnose_wert2', NEW.erstdiagnose_wert2, 'erstdiagnose_originaltext', NEW.erstdiagnose_originaltext, 'erstdiagnose_sort_von', NEW.erstdiagnose_sort_von, 'erstdiagnose_sort_bis', NEW.erstdiagnose_sort_bis, 'erstdiagnose_zweitkalender', NEW.erstdiagnose_zweitkalender, 'erstdiagnose_zweitwert', NEW.erstdiagnose_zweitwert, 'erstdiagnose_doppeljahr', NEW.erstdiagnose_doppeljahr, 'alter_bei_diagnose', NEW.alter_bei_diagnose, 'status', NEW.status, 'konfidenz', NEW.konfidenz, 'notiz', NEW.notiz, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_diagnose_ad AFTER DELETE ON diagnose
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'diagnose', OLD.id, json_object('id', OLD.id, 'person_id', OLD.person_id, 'kategorie', OLD.kategorie, 'organ', OLD.organ, 'bezeichnung', OLD.bezeichnung, 'icd10', OLD.icd10, 'erstdiagnose_kalender', OLD.erstdiagnose_kalender, 'erstdiagnose_modifikator', OLD.erstdiagnose_modifikator, 'erstdiagnose_praezision', OLD.erstdiagnose_praezision, 'erstdiagnose_wert1', OLD.erstdiagnose_wert1, 'erstdiagnose_wert2', OLD.erstdiagnose_wert2, 'erstdiagnose_originaltext', OLD.erstdiagnose_originaltext, 'erstdiagnose_sort_von', OLD.erstdiagnose_sort_von, 'erstdiagnose_sort_bis', OLD.erstdiagnose_sort_bis, 'erstdiagnose_zweitkalender', OLD.erstdiagnose_zweitkalender, 'erstdiagnose_zweitwert', OLD.erstdiagnose_zweitwert, 'erstdiagnose_doppeljahr', OLD.erstdiagnose_doppeljahr, 'alter_bei_diagnose', OLD.alter_bei_diagnose, 'status', OLD.status, 'konfidenz', OLD.konfidenz, 'notiz', OLD.notiz, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_elternschaft_ai AFTER INSERT ON elternschaft
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'elternschaft', NEW.id, NULL, json_object('id', NEW.id, 'elternteil_id', NEW.elternteil_id, 'kind_id', NEW.kind_id, 'typ', NEW.typ, 'konfidenz', NEW.konfidenz, 'notiz', NEW.notiz, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_elternschaft_au AFTER UPDATE ON elternschaft
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'elternschaft', OLD.id, json_object('id', OLD.id, 'elternteil_id', OLD.elternteil_id, 'kind_id', OLD.kind_id, 'typ', OLD.typ, 'konfidenz', OLD.konfidenz, 'notiz', OLD.notiz, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'elternteil_id', NEW.elternteil_id, 'kind_id', NEW.kind_id, 'typ', NEW.typ, 'konfidenz', NEW.konfidenz, 'notiz', NEW.notiz, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_elternschaft_ad AFTER DELETE ON elternschaft
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'elternschaft', OLD.id, json_object('id', OLD.id, 'elternteil_id', OLD.elternteil_id, 'kind_id', OLD.kind_id, 'typ', OLD.typ, 'konfidenz', OLD.konfidenz, 'notiz', OLD.notiz, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_ereignis_ai AFTER INSERT ON ereignis
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'ereignis', NEW.id, NULL, json_object('id', NEW.id, 'typ', NEW.typ, 'ort_id', NEW.ort_id, 'datum_kalender', NEW.datum_kalender, 'datum_modifikator', NEW.datum_modifikator, 'datum_praezision', NEW.datum_praezision, 'datum_wert1', NEW.datum_wert1, 'datum_wert2', NEW.datum_wert2, 'datum_originaltext', NEW.datum_originaltext, 'datum_sort_von', NEW.datum_sort_von, 'datum_sort_bis', NEW.datum_sort_bis, 'datum_zweitkalender', NEW.datum_zweitkalender, 'datum_zweitwert', NEW.datum_zweitwert, 'datum_doppeljahr', NEW.datum_doppeljahr, 'beschreibung', NEW.beschreibung, 'notiz', NEW.notiz, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_ereignis_au AFTER UPDATE ON ereignis
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'ereignis', OLD.id, json_object('id', OLD.id, 'typ', OLD.typ, 'ort_id', OLD.ort_id, 'datum_kalender', OLD.datum_kalender, 'datum_modifikator', OLD.datum_modifikator, 'datum_praezision', OLD.datum_praezision, 'datum_wert1', OLD.datum_wert1, 'datum_wert2', OLD.datum_wert2, 'datum_originaltext', OLD.datum_originaltext, 'datum_sort_von', OLD.datum_sort_von, 'datum_sort_bis', OLD.datum_sort_bis, 'datum_zweitkalender', OLD.datum_zweitkalender, 'datum_zweitwert', OLD.datum_zweitwert, 'datum_doppeljahr', OLD.datum_doppeljahr, 'beschreibung', OLD.beschreibung, 'notiz', OLD.notiz, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'typ', NEW.typ, 'ort_id', NEW.ort_id, 'datum_kalender', NEW.datum_kalender, 'datum_modifikator', NEW.datum_modifikator, 'datum_praezision', NEW.datum_praezision, 'datum_wert1', NEW.datum_wert1, 'datum_wert2', NEW.datum_wert2, 'datum_originaltext', NEW.datum_originaltext, 'datum_sort_von', NEW.datum_sort_von, 'datum_sort_bis', NEW.datum_sort_bis, 'datum_zweitkalender', NEW.datum_zweitkalender, 'datum_zweitwert', NEW.datum_zweitwert, 'datum_doppeljahr', NEW.datum_doppeljahr, 'beschreibung', NEW.beschreibung, 'notiz', NEW.notiz, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_ereignis_ad AFTER DELETE ON ereignis
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'ereignis', OLD.id, json_object('id', OLD.id, 'typ', OLD.typ, 'ort_id', OLD.ort_id, 'datum_kalender', OLD.datum_kalender, 'datum_modifikator', OLD.datum_modifikator, 'datum_praezision', OLD.datum_praezision, 'datum_wert1', OLD.datum_wert1, 'datum_wert2', OLD.datum_wert2, 'datum_originaltext', OLD.datum_originaltext, 'datum_sort_von', OLD.datum_sort_von, 'datum_sort_bis', OLD.datum_sort_bis, 'datum_zweitkalender', OLD.datum_zweitkalender, 'datum_zweitwert', OLD.datum_zweitwert, 'datum_doppeljahr', OLD.datum_doppeljahr, 'beschreibung', OLD.beschreibung, 'notiz', OLD.notiz, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_feld_auswahloption_ai AFTER INSERT ON feld_auswahloption
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'feld_auswahloption', NEW.id, NULL, json_object('id', NEW.id, 'feld_definition_id', NEW.feld_definition_id, 'wert', NEW.wert, 'bezeichnung', NEW.bezeichnung, 'reihenfolge', NEW.reihenfolge, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_feld_auswahloption_au AFTER UPDATE ON feld_auswahloption
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'feld_auswahloption', OLD.id, json_object('id', OLD.id, 'feld_definition_id', OLD.feld_definition_id, 'wert', OLD.wert, 'bezeichnung', OLD.bezeichnung, 'reihenfolge', OLD.reihenfolge, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'feld_definition_id', NEW.feld_definition_id, 'wert', NEW.wert, 'bezeichnung', NEW.bezeichnung, 'reihenfolge', NEW.reihenfolge, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_feld_auswahloption_ad AFTER DELETE ON feld_auswahloption
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'feld_auswahloption', OLD.id, json_object('id', OLD.id, 'feld_definition_id', OLD.feld_definition_id, 'wert', OLD.wert, 'bezeichnung', OLD.bezeichnung, 'reihenfolge', OLD.reihenfolge, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_feld_definition_ai AFTER INSERT ON feld_definition
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'feld_definition', NEW.id, NULL, json_object('id', NEW.id, 'schluessel', NEW.schluessel, 'bezeichnung', NEW.bezeichnung, 'beschreibung', NEW.beschreibung, 'gilt_fuer', NEW.gilt_fuer, 'datentyp', NEW.datentyp, 'ist_mehrfach', NEW.ist_mehrfach, 'hat_zeitraum', NEW.hat_zeitraum, 'gruppe', NEW.gruppe, 'reihenfolge', NEW.reihenfolge, 'ist_system', NEW.ist_system, 'ist_sensibel', NEW.ist_sensibel, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_feld_definition_au AFTER UPDATE ON feld_definition
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'feld_definition', OLD.id, json_object('id', OLD.id, 'schluessel', OLD.schluessel, 'bezeichnung', OLD.bezeichnung, 'beschreibung', OLD.beschreibung, 'gilt_fuer', OLD.gilt_fuer, 'datentyp', OLD.datentyp, 'ist_mehrfach', OLD.ist_mehrfach, 'hat_zeitraum', OLD.hat_zeitraum, 'gruppe', OLD.gruppe, 'reihenfolge', OLD.reihenfolge, 'ist_system', OLD.ist_system, 'ist_sensibel', OLD.ist_sensibel, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'schluessel', NEW.schluessel, 'bezeichnung', NEW.bezeichnung, 'beschreibung', NEW.beschreibung, 'gilt_fuer', NEW.gilt_fuer, 'datentyp', NEW.datentyp, 'ist_mehrfach', NEW.ist_mehrfach, 'hat_zeitraum', NEW.hat_zeitraum, 'gruppe', NEW.gruppe, 'reihenfolge', NEW.reihenfolge, 'ist_system', NEW.ist_system, 'ist_sensibel', NEW.ist_sensibel, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_feld_definition_ad AFTER DELETE ON feld_definition
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'feld_definition', OLD.id, json_object('id', OLD.id, 'schluessel', OLD.schluessel, 'bezeichnung', OLD.bezeichnung, 'beschreibung', OLD.beschreibung, 'gilt_fuer', OLD.gilt_fuer, 'datentyp', OLD.datentyp, 'ist_mehrfach', OLD.ist_mehrfach, 'hat_zeitraum', OLD.hat_zeitraum, 'gruppe', OLD.gruppe, 'reihenfolge', OLD.reihenfolge, 'ist_system', OLD.ist_system, 'ist_sensibel', OLD.ist_sensibel, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_feld_wert_ai AFTER INSERT ON feld_wert
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'feld_wert', NEW.id, NULL, json_object('id', NEW.id, 'feld_definition_id', NEW.feld_definition_id, 'subjekt_typ', NEW.subjekt_typ, 'subjekt_id', NEW.subjekt_id, 'wert_text', NEW.wert_text, 'wert_zahl', NEW.wert_zahl, 'wert_ref_id', NEW.wert_ref_id, 'wert_datum_kalender', NEW.wert_datum_kalender, 'wert_datum_modifikator', NEW.wert_datum_modifikator, 'wert_datum_praezision', NEW.wert_datum_praezision, 'wert_datum_wert1', NEW.wert_datum_wert1, 'wert_datum_wert2', NEW.wert_datum_wert2, 'wert_datum_originaltext', NEW.wert_datum_originaltext, 'wert_datum_sort_von', NEW.wert_datum_sort_von, 'wert_datum_sort_bis', NEW.wert_datum_sort_bis, 'wert_datum_zweitkalender', NEW.wert_datum_zweitkalender, 'wert_datum_zweitwert', NEW.wert_datum_zweitwert, 'wert_datum_doppeljahr', NEW.wert_datum_doppeljahr, 'gueltig_von', NEW.gueltig_von, 'gueltig_bis', NEW.gueltig_bis, 'reihenfolge', NEW.reihenfolge, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_feld_wert_au AFTER UPDATE ON feld_wert
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'feld_wert', OLD.id, json_object('id', OLD.id, 'feld_definition_id', OLD.feld_definition_id, 'subjekt_typ', OLD.subjekt_typ, 'subjekt_id', OLD.subjekt_id, 'wert_text', OLD.wert_text, 'wert_zahl', OLD.wert_zahl, 'wert_ref_id', OLD.wert_ref_id, 'wert_datum_kalender', OLD.wert_datum_kalender, 'wert_datum_modifikator', OLD.wert_datum_modifikator, 'wert_datum_praezision', OLD.wert_datum_praezision, 'wert_datum_wert1', OLD.wert_datum_wert1, 'wert_datum_wert2', OLD.wert_datum_wert2, 'wert_datum_originaltext', OLD.wert_datum_originaltext, 'wert_datum_sort_von', OLD.wert_datum_sort_von, 'wert_datum_sort_bis', OLD.wert_datum_sort_bis, 'wert_datum_zweitkalender', OLD.wert_datum_zweitkalender, 'wert_datum_zweitwert', OLD.wert_datum_zweitwert, 'wert_datum_doppeljahr', OLD.wert_datum_doppeljahr, 'gueltig_von', OLD.gueltig_von, 'gueltig_bis', OLD.gueltig_bis, 'reihenfolge', OLD.reihenfolge, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'feld_definition_id', NEW.feld_definition_id, 'subjekt_typ', NEW.subjekt_typ, 'subjekt_id', NEW.subjekt_id, 'wert_text', NEW.wert_text, 'wert_zahl', NEW.wert_zahl, 'wert_ref_id', NEW.wert_ref_id, 'wert_datum_kalender', NEW.wert_datum_kalender, 'wert_datum_modifikator', NEW.wert_datum_modifikator, 'wert_datum_praezision', NEW.wert_datum_praezision, 'wert_datum_wert1', NEW.wert_datum_wert1, 'wert_datum_wert2', NEW.wert_datum_wert2, 'wert_datum_originaltext', NEW.wert_datum_originaltext, 'wert_datum_sort_von', NEW.wert_datum_sort_von, 'wert_datum_sort_bis', NEW.wert_datum_sort_bis, 'wert_datum_zweitkalender', NEW.wert_datum_zweitkalender, 'wert_datum_zweitwert', NEW.wert_datum_zweitwert, 'wert_datum_doppeljahr', NEW.wert_datum_doppeljahr, 'gueltig_von', NEW.gueltig_von, 'gueltig_bis', NEW.gueltig_bis, 'reihenfolge', NEW.reihenfolge, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_feld_wert_ad AFTER DELETE ON feld_wert
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'feld_wert', OLD.id, json_object('id', OLD.id, 'feld_definition_id', OLD.feld_definition_id, 'subjekt_typ', OLD.subjekt_typ, 'subjekt_id', OLD.subjekt_id, 'wert_text', OLD.wert_text, 'wert_zahl', OLD.wert_zahl, 'wert_ref_id', OLD.wert_ref_id, 'wert_datum_kalender', OLD.wert_datum_kalender, 'wert_datum_modifikator', OLD.wert_datum_modifikator, 'wert_datum_praezision', OLD.wert_datum_praezision, 'wert_datum_wert1', OLD.wert_datum_wert1, 'wert_datum_wert2', OLD.wert_datum_wert2, 'wert_datum_originaltext', OLD.wert_datum_originaltext, 'wert_datum_sort_von', OLD.wert_datum_sort_von, 'wert_datum_sort_bis', OLD.wert_datum_sort_bis, 'wert_datum_zweitkalender', OLD.wert_datum_zweitkalender, 'wert_datum_zweitwert', OLD.wert_datum_zweitwert, 'wert_datum_doppeljahr', OLD.wert_datum_doppeljahr, 'gueltig_von', OLD.gueltig_von, 'gueltig_bis', OLD.gueltig_bis, 'reihenfolge', OLD.reihenfolge, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_import_herkunft_ai AFTER INSERT ON import_herkunft
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'import_herkunft', NEW.id, NULL, json_object('id', NEW.id, 'import_lauf_id', NEW.import_lauf_id, 'datensatz_id', NEW.datensatz_id, 'datensatz_typ', NEW.datensatz_typ, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_import_herkunft_au AFTER UPDATE ON import_herkunft
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'import_herkunft', OLD.id, json_object('id', OLD.id, 'import_lauf_id', OLD.import_lauf_id, 'datensatz_id', OLD.datensatz_id, 'datensatz_typ', OLD.datensatz_typ, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'import_lauf_id', NEW.import_lauf_id, 'datensatz_id', NEW.datensatz_id, 'datensatz_typ', NEW.datensatz_typ, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_import_herkunft_ad AFTER DELETE ON import_herkunft
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'import_herkunft', OLD.id, json_object('id', OLD.id, 'import_lauf_id', OLD.import_lauf_id, 'datensatz_id', OLD.datensatz_id, 'datensatz_typ', OLD.datensatz_typ, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_import_lauf_ai AFTER INSERT ON import_lauf
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'import_lauf', NEW.id, NULL, json_object('id', NEW.id, 'datei', NEW.datei, 'pruefsumme', NEW.pruefsumme, 'vertragsversion', NEW.vertragsversion, 'zeitpunkt', NEW.zeitpunkt, 'transaktion_id', NEW.transaktion_id, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_import_lauf_au AFTER UPDATE ON import_lauf
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'import_lauf', OLD.id, json_object('id', OLD.id, 'datei', OLD.datei, 'pruefsumme', OLD.pruefsumme, 'vertragsversion', OLD.vertragsversion, 'zeitpunkt', OLD.zeitpunkt, 'transaktion_id', OLD.transaktion_id, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'datei', NEW.datei, 'pruefsumme', NEW.pruefsumme, 'vertragsversion', NEW.vertragsversion, 'zeitpunkt', NEW.zeitpunkt, 'transaktion_id', NEW.transaktion_id, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_import_lauf_ad AFTER DELETE ON import_lauf
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'import_lauf', OLD.id, json_object('id', OLD.id, 'datei', OLD.datei, 'pruefsumme', OLD.pruefsumme, 'vertragsversion', OLD.vertragsversion, 'zeitpunkt', OLD.zeitpunkt, 'transaktion_id', OLD.transaktion_id, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_interview_sitzung_ai AFTER INSERT ON interview_sitzung
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'interview_sitzung', NEW.id, NULL, json_object('id', NEW.id, 'informant_person_id', NEW.informant_person_id, 'datum_kalender', NEW.datum_kalender, 'datum_modifikator', NEW.datum_modifikator, 'datum_praezision', NEW.datum_praezision, 'datum_wert1', NEW.datum_wert1, 'datum_wert2', NEW.datum_wert2, 'datum_originaltext', NEW.datum_originaltext, 'datum_sort_von', NEW.datum_sort_von, 'datum_sort_bis', NEW.datum_sort_bis, 'datum_zweitkalender', NEW.datum_zweitkalender, 'datum_zweitwert', NEW.datum_zweitwert, 'datum_doppeljahr', NEW.datum_doppeljahr, 'ort_id', NEW.ort_id, 'audio_medium_id', NEW.audio_medium_id, 'notizen', NEW.notizen, 'status', NEW.status, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_interview_sitzung_au AFTER UPDATE ON interview_sitzung
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'interview_sitzung', OLD.id, json_object('id', OLD.id, 'informant_person_id', OLD.informant_person_id, 'datum_kalender', OLD.datum_kalender, 'datum_modifikator', OLD.datum_modifikator, 'datum_praezision', OLD.datum_praezision, 'datum_wert1', OLD.datum_wert1, 'datum_wert2', OLD.datum_wert2, 'datum_originaltext', OLD.datum_originaltext, 'datum_sort_von', OLD.datum_sort_von, 'datum_sort_bis', OLD.datum_sort_bis, 'datum_zweitkalender', OLD.datum_zweitkalender, 'datum_zweitwert', OLD.datum_zweitwert, 'datum_doppeljahr', OLD.datum_doppeljahr, 'ort_id', OLD.ort_id, 'audio_medium_id', OLD.audio_medium_id, 'notizen', OLD.notizen, 'status', OLD.status, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'informant_person_id', NEW.informant_person_id, 'datum_kalender', NEW.datum_kalender, 'datum_modifikator', NEW.datum_modifikator, 'datum_praezision', NEW.datum_praezision, 'datum_wert1', NEW.datum_wert1, 'datum_wert2', NEW.datum_wert2, 'datum_originaltext', NEW.datum_originaltext, 'datum_sort_von', NEW.datum_sort_von, 'datum_sort_bis', NEW.datum_sort_bis, 'datum_zweitkalender', NEW.datum_zweitkalender, 'datum_zweitwert', NEW.datum_zweitwert, 'datum_doppeljahr', NEW.datum_doppeljahr, 'ort_id', NEW.ort_id, 'audio_medium_id', NEW.audio_medium_id, 'notizen', NEW.notizen, 'status', NEW.status, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_interview_sitzung_ad AFTER DELETE ON interview_sitzung
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'interview_sitzung', OLD.id, json_object('id', OLD.id, 'informant_person_id', OLD.informant_person_id, 'datum_kalender', OLD.datum_kalender, 'datum_modifikator', OLD.datum_modifikator, 'datum_praezision', OLD.datum_praezision, 'datum_wert1', OLD.datum_wert1, 'datum_wert2', OLD.datum_wert2, 'datum_originaltext', OLD.datum_originaltext, 'datum_sort_von', OLD.datum_sort_von, 'datum_sort_bis', OLD.datum_sort_bis, 'datum_zweitkalender', OLD.datum_zweitkalender, 'datum_zweitwert', OLD.datum_zweitwert, 'datum_doppeljahr', OLD.datum_doppeljahr, 'ort_id', OLD.ort_id, 'audio_medium_id', OLD.audio_medium_id, 'notizen', OLD.notizen, 'status', OLD.status, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_medium_ai AFTER INSERT ON medium
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'medium', NEW.id, NULL, json_object('id', NEW.id, 'dateiname', NEW.dateiname, 'relativer_pfad', NEW.relativer_pfad, 'hash', NEW.hash, 'mime_typ', NEW.mime_typ, 'groesse', NEW.groesse, 'titel', NEW.titel, 'beschreibung', NEW.beschreibung, 'datum_kalender', NEW.datum_kalender, 'datum_modifikator', NEW.datum_modifikator, 'datum_praezision', NEW.datum_praezision, 'datum_wert1', NEW.datum_wert1, 'datum_wert2', NEW.datum_wert2, 'datum_originaltext', NEW.datum_originaltext, 'datum_sort_von', NEW.datum_sort_von, 'datum_sort_bis', NEW.datum_sort_bis, 'datum_zweitkalender', NEW.datum_zweitkalender, 'datum_zweitwert', NEW.datum_zweitwert, 'datum_doppeljahr', NEW.datum_doppeljahr, 'ort_id', NEW.ort_id, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_medium_au AFTER UPDATE ON medium
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'medium', OLD.id, json_object('id', OLD.id, 'dateiname', OLD.dateiname, 'relativer_pfad', OLD.relativer_pfad, 'hash', OLD.hash, 'mime_typ', OLD.mime_typ, 'groesse', OLD.groesse, 'titel', OLD.titel, 'beschreibung', OLD.beschreibung, 'datum_kalender', OLD.datum_kalender, 'datum_modifikator', OLD.datum_modifikator, 'datum_praezision', OLD.datum_praezision, 'datum_wert1', OLD.datum_wert1, 'datum_wert2', OLD.datum_wert2, 'datum_originaltext', OLD.datum_originaltext, 'datum_sort_von', OLD.datum_sort_von, 'datum_sort_bis', OLD.datum_sort_bis, 'datum_zweitkalender', OLD.datum_zweitkalender, 'datum_zweitwert', OLD.datum_zweitwert, 'datum_doppeljahr', OLD.datum_doppeljahr, 'ort_id', OLD.ort_id, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'dateiname', NEW.dateiname, 'relativer_pfad', NEW.relativer_pfad, 'hash', NEW.hash, 'mime_typ', NEW.mime_typ, 'groesse', NEW.groesse, 'titel', NEW.titel, 'beschreibung', NEW.beschreibung, 'datum_kalender', NEW.datum_kalender, 'datum_modifikator', NEW.datum_modifikator, 'datum_praezision', NEW.datum_praezision, 'datum_wert1', NEW.datum_wert1, 'datum_wert2', NEW.datum_wert2, 'datum_originaltext', NEW.datum_originaltext, 'datum_sort_von', NEW.datum_sort_von, 'datum_sort_bis', NEW.datum_sort_bis, 'datum_zweitkalender', NEW.datum_zweitkalender, 'datum_zweitwert', NEW.datum_zweitwert, 'datum_doppeljahr', NEW.datum_doppeljahr, 'ort_id', NEW.ort_id, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_medium_ad AFTER DELETE ON medium
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'medium', OLD.id, json_object('id', OLD.id, 'dateiname', OLD.dateiname, 'relativer_pfad', OLD.relativer_pfad, 'hash', OLD.hash, 'mime_typ', OLD.mime_typ, 'groesse', OLD.groesse, 'titel', OLD.titel, 'beschreibung', OLD.beschreibung, 'datum_kalender', OLD.datum_kalender, 'datum_modifikator', OLD.datum_modifikator, 'datum_praezision', OLD.datum_praezision, 'datum_wert1', OLD.datum_wert1, 'datum_wert2', OLD.datum_wert2, 'datum_originaltext', OLD.datum_originaltext, 'datum_sort_von', OLD.datum_sort_von, 'datum_sort_bis', OLD.datum_sort_bis, 'datum_zweitkalender', OLD.datum_zweitkalender, 'datum_zweitwert', OLD.datum_zweitwert, 'datum_doppeljahr', OLD.datum_doppeljahr, 'ort_id', OLD.ort_id, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_medium_region_ai AFTER INSERT ON medium_region
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'medium_region', NEW.id, NULL, json_object('id', NEW.id, 'medium_id', NEW.medium_id, 'person_id', NEW.person_id, 'x', NEW.x, 'y', NEW.y, 'w', NEW.w, 'h', NEW.h, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_medium_region_au AFTER UPDATE ON medium_region
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'medium_region', OLD.id, json_object('id', OLD.id, 'medium_id', OLD.medium_id, 'person_id', OLD.person_id, 'x', OLD.x, 'y', OLD.y, 'w', OLD.w, 'h', OLD.h, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'medium_id', NEW.medium_id, 'person_id', NEW.person_id, 'x', NEW.x, 'y', NEW.y, 'w', NEW.w, 'h', NEW.h, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_medium_region_ad AFTER DELETE ON medium_region
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'medium_region', OLD.id, json_object('id', OLD.id, 'medium_id', OLD.medium_id, 'person_id', OLD.person_id, 'x', OLD.x, 'y', OLD.y, 'w', OLD.w, 'h', OLD.h, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_medium_zuordnung_ai AFTER INSERT ON medium_zuordnung
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'medium_zuordnung', NEW.medium_id || '|' || NEW.subjekt_typ || '|' || NEW.subjekt_id, NULL, json_object('medium_id', NEW.medium_id, 'subjekt_typ', NEW.subjekt_typ, 'subjekt_id', NEW.subjekt_id, 'ist_titelbild', NEW.ist_titelbild, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_medium_zuordnung_au AFTER UPDATE ON medium_zuordnung
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'medium_zuordnung', OLD.medium_id || '|' || OLD.subjekt_typ || '|' || OLD.subjekt_id, json_object('medium_id', OLD.medium_id, 'subjekt_typ', OLD.subjekt_typ, 'subjekt_id', OLD.subjekt_id, 'ist_titelbild', OLD.ist_titelbild, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('medium_id', NEW.medium_id, 'subjekt_typ', NEW.subjekt_typ, 'subjekt_id', NEW.subjekt_id, 'ist_titelbild', NEW.ist_titelbild, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_medium_zuordnung_ad AFTER DELETE ON medium_zuordnung
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'medium_zuordnung', OLD.medium_id || '|' || OLD.subjekt_typ || '|' || OLD.subjekt_id, json_object('medium_id', OLD.medium_id, 'subjekt_typ', OLD.subjekt_typ, 'subjekt_id', OLD.subjekt_id, 'ist_titelbild', OLD.ist_titelbild, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_name_ai AFTER INSERT ON name
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'name', NEW.id, NULL, json_object('id', NEW.id, 'person_id', NEW.person_id, 'typ', NEW.typ, 'schrift', NEW.schrift, 'umschrift_von', NEW.umschrift_von, 'umschrift_norm', NEW.umschrift_norm, 'vornamen', NEW.vornamen, 'rufname_index', NEW.rufname_index, 'rufname_text', NEW.rufname_text, 'nachname', NEW.nachname, 'praefix', NEW.praefix, 'titel_vor', NEW.titel_vor, 'zusatz_nach', NEW.zusatz_nach, 'original_text', NEW.original_text, 'sprache', NEW.sprache, 'ist_bevorzugt', NEW.ist_bevorzugt, 'gueltig_von', NEW.gueltig_von, 'gueltig_bis', NEW.gueltig_bis, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_name_au AFTER UPDATE ON name
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'name', OLD.id, json_object('id', OLD.id, 'person_id', OLD.person_id, 'typ', OLD.typ, 'schrift', OLD.schrift, 'umschrift_von', OLD.umschrift_von, 'umschrift_norm', OLD.umschrift_norm, 'vornamen', OLD.vornamen, 'rufname_index', OLD.rufname_index, 'rufname_text', OLD.rufname_text, 'nachname', OLD.nachname, 'praefix', OLD.praefix, 'titel_vor', OLD.titel_vor, 'zusatz_nach', OLD.zusatz_nach, 'original_text', OLD.original_text, 'sprache', OLD.sprache, 'ist_bevorzugt', OLD.ist_bevorzugt, 'gueltig_von', OLD.gueltig_von, 'gueltig_bis', OLD.gueltig_bis, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'person_id', NEW.person_id, 'typ', NEW.typ, 'schrift', NEW.schrift, 'umschrift_von', NEW.umschrift_von, 'umschrift_norm', NEW.umschrift_norm, 'vornamen', NEW.vornamen, 'rufname_index', NEW.rufname_index, 'rufname_text', NEW.rufname_text, 'nachname', NEW.nachname, 'praefix', NEW.praefix, 'titel_vor', NEW.titel_vor, 'zusatz_nach', NEW.zusatz_nach, 'original_text', NEW.original_text, 'sprache', NEW.sprache, 'ist_bevorzugt', NEW.ist_bevorzugt, 'gueltig_von', NEW.gueltig_von, 'gueltig_bis', NEW.gueltig_bis, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_name_ad AFTER DELETE ON name
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'name', OLD.id, json_object('id', OLD.id, 'person_id', OLD.person_id, 'typ', OLD.typ, 'schrift', OLD.schrift, 'umschrift_von', OLD.umschrift_von, 'umschrift_norm', OLD.umschrift_norm, 'vornamen', OLD.vornamen, 'rufname_index', OLD.rufname_index, 'rufname_text', OLD.rufname_text, 'nachname', OLD.nachname, 'praefix', OLD.praefix, 'titel_vor', OLD.titel_vor, 'zusatz_nach', OLD.zusatz_nach, 'original_text', OLD.original_text, 'sprache', OLD.sprache, 'ist_bevorzugt', OLD.ist_bevorzugt, 'gueltig_von', OLD.gueltig_von, 'gueltig_bis', OLD.gueltig_bis, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_negativbefund_ai AFTER INSERT ON negativbefund
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'negativbefund', NEW.id, NULL, json_object('id', NEW.id, 'quelle_id', NEW.quelle_id, 'gesuchte_person_id', NEW.gesuchte_person_id, 'gesuchtes_praedikat', NEW.gesuchtes_praedikat, 'zeitraum_von', NEW.zeitraum_von, 'zeitraum_bis', NEW.zeitraum_bis, 'beschreibung', NEW.beschreibung, 'datum_der_pruefung', NEW.datum_der_pruefung, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_negativbefund_au AFTER UPDATE ON negativbefund
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'negativbefund', OLD.id, json_object('id', OLD.id, 'quelle_id', OLD.quelle_id, 'gesuchte_person_id', OLD.gesuchte_person_id, 'gesuchtes_praedikat', OLD.gesuchtes_praedikat, 'zeitraum_von', OLD.zeitraum_von, 'zeitraum_bis', OLD.zeitraum_bis, 'beschreibung', OLD.beschreibung, 'datum_der_pruefung', OLD.datum_der_pruefung, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'quelle_id', NEW.quelle_id, 'gesuchte_person_id', NEW.gesuchte_person_id, 'gesuchtes_praedikat', NEW.gesuchtes_praedikat, 'zeitraum_von', NEW.zeitraum_von, 'zeitraum_bis', NEW.zeitraum_bis, 'beschreibung', NEW.beschreibung, 'datum_der_pruefung', NEW.datum_der_pruefung, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_negativbefund_ad AFTER DELETE ON negativbefund
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'negativbefund', OLD.id, json_object('id', OLD.id, 'quelle_id', OLD.quelle_id, 'gesuchte_person_id', OLD.gesuchte_person_id, 'gesuchtes_praedikat', OLD.gesuchtes_praedikat, 'zeitraum_von', OLD.zeitraum_von, 'zeitraum_bis', OLD.zeitraum_bis, 'beschreibung', OLD.beschreibung, 'datum_der_pruefung', OLD.datum_der_pruefung, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_ort_ai AFTER INSERT ON ort
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'ort', NEW.id, NULL, json_object('id', NEW.id, 'typ', NEW.typ, 'koordinaten_lat', NEW.koordinaten_lat, 'koordinaten_lon', NEW.koordinaten_lon, 'existiert_von', NEW.existiert_von, 'existiert_bis', NEW.existiert_bis, 'nachfolger_ort_id', NEW.nachfolger_ort_id, 'notiz', NEW.notiz, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_ort_au AFTER UPDATE ON ort
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'ort', OLD.id, json_object('id', OLD.id, 'typ', OLD.typ, 'koordinaten_lat', OLD.koordinaten_lat, 'koordinaten_lon', OLD.koordinaten_lon, 'existiert_von', OLD.existiert_von, 'existiert_bis', OLD.existiert_bis, 'nachfolger_ort_id', OLD.nachfolger_ort_id, 'notiz', OLD.notiz, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'typ', NEW.typ, 'koordinaten_lat', NEW.koordinaten_lat, 'koordinaten_lon', NEW.koordinaten_lon, 'existiert_von', NEW.existiert_von, 'existiert_bis', NEW.existiert_bis, 'nachfolger_ort_id', NEW.nachfolger_ort_id, 'notiz', NEW.notiz, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_ort_ad AFTER DELETE ON ort
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'ort', OLD.id, json_object('id', OLD.id, 'typ', OLD.typ, 'koordinaten_lat', OLD.koordinaten_lat, 'koordinaten_lon', OLD.koordinaten_lon, 'existiert_von', OLD.existiert_von, 'existiert_bis', OLD.existiert_bis, 'nachfolger_ort_id', OLD.nachfolger_ort_id, 'notiz', OLD.notiz, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_ort_externe_id_ai AFTER INSERT ON ort_externe_id
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'ort_externe_id', NEW.ort_id || '|' || NEW.system, NULL, json_object('ort_id', NEW.ort_id, 'system', NEW.system, 'wert', NEW.wert, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_ort_externe_id_au AFTER UPDATE ON ort_externe_id
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'ort_externe_id', OLD.ort_id || '|' || OLD.system, json_object('ort_id', OLD.ort_id, 'system', OLD.system, 'wert', OLD.wert, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('ort_id', NEW.ort_id, 'system', NEW.system, 'wert', NEW.wert, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_ort_externe_id_ad AFTER DELETE ON ort_externe_id
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'ort_externe_id', OLD.ort_id || '|' || OLD.system, json_object('ort_id', OLD.ort_id, 'system', OLD.system, 'wert', OLD.wert, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_ortsname_ai AFTER INSERT ON ortsname
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'ortsname', NEW.id, NULL, json_object('id', NEW.id, 'ort_id', NEW.ort_id, 'name', NEW.name, 'sprache', NEW.sprache, 'gueltig_von', NEW.gueltig_von, 'gueltig_bis', NEW.gueltig_bis, 'ist_bevorzugt', NEW.ist_bevorzugt, 'original_text', NEW.original_text, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_ortsname_au AFTER UPDATE ON ortsname
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'ortsname', OLD.id, json_object('id', OLD.id, 'ort_id', OLD.ort_id, 'name', OLD.name, 'sprache', OLD.sprache, 'gueltig_von', OLD.gueltig_von, 'gueltig_bis', OLD.gueltig_bis, 'ist_bevorzugt', OLD.ist_bevorzugt, 'original_text', OLD.original_text, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'ort_id', NEW.ort_id, 'name', NEW.name, 'sprache', NEW.sprache, 'gueltig_von', NEW.gueltig_von, 'gueltig_bis', NEW.gueltig_bis, 'ist_bevorzugt', NEW.ist_bevorzugt, 'original_text', NEW.original_text, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_ortsname_ad AFTER DELETE ON ortsname
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'ortsname', OLD.id, json_object('id', OLD.id, 'ort_id', OLD.ort_id, 'name', OLD.name, 'sprache', OLD.sprache, 'gueltig_von', OLD.gueltig_von, 'gueltig_bis', OLD.gueltig_bis, 'ist_bevorzugt', OLD.ist_bevorzugt, 'original_text', OLD.original_text, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_ortszugehoerigkeit_ai AFTER INSERT ON ortszugehoerigkeit
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'ortszugehoerigkeit', NEW.id, NULL, json_object('id', NEW.id, 'ort_id', NEW.ort_id, 'uebergeordnet_id', NEW.uebergeordnet_id, 'art', NEW.art, 'gueltig_von', NEW.gueltig_von, 'gueltig_bis', NEW.gueltig_bis, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_ortszugehoerigkeit_au AFTER UPDATE ON ortszugehoerigkeit
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'ortszugehoerigkeit', OLD.id, json_object('id', OLD.id, 'ort_id', OLD.ort_id, 'uebergeordnet_id', OLD.uebergeordnet_id, 'art', OLD.art, 'gueltig_von', OLD.gueltig_von, 'gueltig_bis', OLD.gueltig_bis, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'ort_id', NEW.ort_id, 'uebergeordnet_id', NEW.uebergeordnet_id, 'art', NEW.art, 'gueltig_von', NEW.gueltig_von, 'gueltig_bis', NEW.gueltig_bis, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_ortszugehoerigkeit_ad AFTER DELETE ON ortszugehoerigkeit
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'ortszugehoerigkeit', OLD.id, json_object('id', OLD.id, 'ort_id', OLD.ort_id, 'uebergeordnet_id', OLD.uebergeordnet_id, 'art', OLD.art, 'gueltig_von', OLD.gueltig_von, 'gueltig_bis', OLD.gueltig_bis, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_partnerschaft_ai AFTER INSERT ON partnerschaft
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'partnerschaft', NEW.id, NULL, json_object('id', NEW.id, 'typ', NEW.typ, 'beginn_kalender', NEW.beginn_kalender, 'beginn_modifikator', NEW.beginn_modifikator, 'beginn_praezision', NEW.beginn_praezision, 'beginn_wert1', NEW.beginn_wert1, 'beginn_wert2', NEW.beginn_wert2, 'beginn_originaltext', NEW.beginn_originaltext, 'beginn_sort_von', NEW.beginn_sort_von, 'beginn_sort_bis', NEW.beginn_sort_bis, 'beginn_zweitkalender', NEW.beginn_zweitkalender, 'beginn_zweitwert', NEW.beginn_zweitwert, 'beginn_doppeljahr', NEW.beginn_doppeljahr, 'ende_kalender', NEW.ende_kalender, 'ende_modifikator', NEW.ende_modifikator, 'ende_praezision', NEW.ende_praezision, 'ende_wert1', NEW.ende_wert1, 'ende_wert2', NEW.ende_wert2, 'ende_originaltext', NEW.ende_originaltext, 'ende_sort_von', NEW.ende_sort_von, 'ende_sort_bis', NEW.ende_sort_bis, 'ende_zweitkalender', NEW.ende_zweitkalender, 'ende_zweitwert', NEW.ende_zweitwert, 'ende_doppeljahr', NEW.ende_doppeljahr, 'ende_grund', NEW.ende_grund, 'reihenfolge', NEW.reihenfolge, 'notiz', NEW.notiz, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_partnerschaft_au AFTER UPDATE ON partnerschaft
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'partnerschaft', OLD.id, json_object('id', OLD.id, 'typ', OLD.typ, 'beginn_kalender', OLD.beginn_kalender, 'beginn_modifikator', OLD.beginn_modifikator, 'beginn_praezision', OLD.beginn_praezision, 'beginn_wert1', OLD.beginn_wert1, 'beginn_wert2', OLD.beginn_wert2, 'beginn_originaltext', OLD.beginn_originaltext, 'beginn_sort_von', OLD.beginn_sort_von, 'beginn_sort_bis', OLD.beginn_sort_bis, 'beginn_zweitkalender', OLD.beginn_zweitkalender, 'beginn_zweitwert', OLD.beginn_zweitwert, 'beginn_doppeljahr', OLD.beginn_doppeljahr, 'ende_kalender', OLD.ende_kalender, 'ende_modifikator', OLD.ende_modifikator, 'ende_praezision', OLD.ende_praezision, 'ende_wert1', OLD.ende_wert1, 'ende_wert2', OLD.ende_wert2, 'ende_originaltext', OLD.ende_originaltext, 'ende_sort_von', OLD.ende_sort_von, 'ende_sort_bis', OLD.ende_sort_bis, 'ende_zweitkalender', OLD.ende_zweitkalender, 'ende_zweitwert', OLD.ende_zweitwert, 'ende_doppeljahr', OLD.ende_doppeljahr, 'ende_grund', OLD.ende_grund, 'reihenfolge', OLD.reihenfolge, 'notiz', OLD.notiz, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'typ', NEW.typ, 'beginn_kalender', NEW.beginn_kalender, 'beginn_modifikator', NEW.beginn_modifikator, 'beginn_praezision', NEW.beginn_praezision, 'beginn_wert1', NEW.beginn_wert1, 'beginn_wert2', NEW.beginn_wert2, 'beginn_originaltext', NEW.beginn_originaltext, 'beginn_sort_von', NEW.beginn_sort_von, 'beginn_sort_bis', NEW.beginn_sort_bis, 'beginn_zweitkalender', NEW.beginn_zweitkalender, 'beginn_zweitwert', NEW.beginn_zweitwert, 'beginn_doppeljahr', NEW.beginn_doppeljahr, 'ende_kalender', NEW.ende_kalender, 'ende_modifikator', NEW.ende_modifikator, 'ende_praezision', NEW.ende_praezision, 'ende_wert1', NEW.ende_wert1, 'ende_wert2', NEW.ende_wert2, 'ende_originaltext', NEW.ende_originaltext, 'ende_sort_von', NEW.ende_sort_von, 'ende_sort_bis', NEW.ende_sort_bis, 'ende_zweitkalender', NEW.ende_zweitkalender, 'ende_zweitwert', NEW.ende_zweitwert, 'ende_doppeljahr', NEW.ende_doppeljahr, 'ende_grund', NEW.ende_grund, 'reihenfolge', NEW.reihenfolge, 'notiz', NEW.notiz, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_partnerschaft_ad AFTER DELETE ON partnerschaft
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'partnerschaft', OLD.id, json_object('id', OLD.id, 'typ', OLD.typ, 'beginn_kalender', OLD.beginn_kalender, 'beginn_modifikator', OLD.beginn_modifikator, 'beginn_praezision', OLD.beginn_praezision, 'beginn_wert1', OLD.beginn_wert1, 'beginn_wert2', OLD.beginn_wert2, 'beginn_originaltext', OLD.beginn_originaltext, 'beginn_sort_von', OLD.beginn_sort_von, 'beginn_sort_bis', OLD.beginn_sort_bis, 'beginn_zweitkalender', OLD.beginn_zweitkalender, 'beginn_zweitwert', OLD.beginn_zweitwert, 'beginn_doppeljahr', OLD.beginn_doppeljahr, 'ende_kalender', OLD.ende_kalender, 'ende_modifikator', OLD.ende_modifikator, 'ende_praezision', OLD.ende_praezision, 'ende_wert1', OLD.ende_wert1, 'ende_wert2', OLD.ende_wert2, 'ende_originaltext', OLD.ende_originaltext, 'ende_sort_von', OLD.ende_sort_von, 'ende_sort_bis', OLD.ende_sort_bis, 'ende_zweitkalender', OLD.ende_zweitkalender, 'ende_zweitwert', OLD.ende_zweitwert, 'ende_doppeljahr', OLD.ende_doppeljahr, 'ende_grund', OLD.ende_grund, 'reihenfolge', OLD.reihenfolge, 'notiz', OLD.notiz, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_partnerschaft_person_ai AFTER INSERT ON partnerschaft_person
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'partnerschaft_person', NEW.partnerschaft_id || '|' || NEW.person_id, NULL, json_object('partnerschaft_id', NEW.partnerschaft_id, 'person_id', NEW.person_id, 'rolle', NEW.rolle, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_partnerschaft_person_au AFTER UPDATE ON partnerschaft_person
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'partnerschaft_person', OLD.partnerschaft_id || '|' || OLD.person_id, json_object('partnerschaft_id', OLD.partnerschaft_id, 'person_id', OLD.person_id, 'rolle', OLD.rolle, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('partnerschaft_id', NEW.partnerschaft_id, 'person_id', NEW.person_id, 'rolle', NEW.rolle, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_partnerschaft_person_ad AFTER DELETE ON partnerschaft_person
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'partnerschaft_person', OLD.partnerschaft_id || '|' || OLD.person_id, json_object('partnerschaft_id', OLD.partnerschaft_id, 'person_id', OLD.person_id, 'rolle', OLD.rolle, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_person_ai AFTER INSERT ON person
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'person', NEW.id, NULL, json_object('id', NEW.id, 'geschlecht', NEW.geschlecht, 'lebend_status', NEW.lebend_status, 'privat', NEW.privat, 'notiz', NEW.notiz, 'gesperrt_bis', NEW.gesperrt_bis, 'ist_platzhalter', NEW.ist_platzhalter, 'platzhalter_grund', NEW.platzhalter_grund, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_person_au AFTER UPDATE ON person
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'person', OLD.id, json_object('id', OLD.id, 'geschlecht', OLD.geschlecht, 'lebend_status', OLD.lebend_status, 'privat', OLD.privat, 'notiz', OLD.notiz, 'gesperrt_bis', OLD.gesperrt_bis, 'ist_platzhalter', OLD.ist_platzhalter, 'platzhalter_grund', OLD.platzhalter_grund, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'geschlecht', NEW.geschlecht, 'lebend_status', NEW.lebend_status, 'privat', NEW.privat, 'notiz', NEW.notiz, 'gesperrt_bis', NEW.gesperrt_bis, 'ist_platzhalter', NEW.ist_platzhalter, 'platzhalter_grund', NEW.platzhalter_grund, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_person_ad AFTER DELETE ON person
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'person', OLD.id, json_object('id', OLD.id, 'geschlecht', OLD.geschlecht, 'lebend_status', OLD.lebend_status, 'privat', OLD.privat, 'notiz', OLD.notiz, 'gesperrt_bis', OLD.gesperrt_bis, 'ist_platzhalter', OLD.ist_platzhalter, 'platzhalter_grund', OLD.platzhalter_grund, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_persona_ai AFTER INSERT ON persona
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'persona', NEW.id, NULL, json_object('id', NEW.id, 'zitat_id', NEW.zitat_id, 'rohdaten_json', NEW.rohdaten_json, 'person_id', NEW.person_id, 'zuordnung_konfidenz', NEW.zuordnung_konfidenz, 'zuordnung_begruendung', NEW.zuordnung_begruendung, 'zuordnung_datum', NEW.zuordnung_datum, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_persona_au AFTER UPDATE ON persona
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'persona', OLD.id, json_object('id', OLD.id, 'zitat_id', OLD.zitat_id, 'rohdaten_json', OLD.rohdaten_json, 'person_id', OLD.person_id, 'zuordnung_konfidenz', OLD.zuordnung_konfidenz, 'zuordnung_begruendung', OLD.zuordnung_begruendung, 'zuordnung_datum', OLD.zuordnung_datum, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'zitat_id', NEW.zitat_id, 'rohdaten_json', NEW.rohdaten_json, 'person_id', NEW.person_id, 'zuordnung_konfidenz', NEW.zuordnung_konfidenz, 'zuordnung_begruendung', NEW.zuordnung_begruendung, 'zuordnung_datum', NEW.zuordnung_datum, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_persona_ad AFTER DELETE ON persona
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'persona', OLD.id, json_object('id', OLD.id, 'zitat_id', OLD.zitat_id, 'rohdaten_json', OLD.rohdaten_json, 'person_id', OLD.person_id, 'zuordnung_konfidenz', OLD.zuordnung_konfidenz, 'zuordnung_begruendung', OLD.zuordnung_begruendung, 'zuordnung_datum', OLD.zuordnung_datum, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_quelle_ai AFTER INSERT ON quelle
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'quelle', NEW.id, NULL, json_object('id', NEW.id, 'typ', NEW.typ, 'titel', NEW.titel, 'autor', NEW.autor, 'verlag', NEW.verlag, 'jahr', NEW.jahr, 'art', NEW.art, 'informationsart', NEW.informationsart, 'archiv_id', NEW.archiv_id, 'signatur', NEW.signatur, 'notiz', NEW.notiz, 'informant_person_id', NEW.informant_person_id, 'gespraechsdatum_kalender', NEW.gespraechsdatum_kalender, 'gespraechsdatum_modifikator', NEW.gespraechsdatum_modifikator, 'gespraechsdatum_praezision', NEW.gespraechsdatum_praezision, 'gespraechsdatum_wert1', NEW.gespraechsdatum_wert1, 'gespraechsdatum_wert2', NEW.gespraechsdatum_wert2, 'gespraechsdatum_originaltext', NEW.gespraechsdatum_originaltext, 'gespraechsdatum_sort_von', NEW.gespraechsdatum_sort_von, 'gespraechsdatum_sort_bis', NEW.gespraechsdatum_sort_bis, 'gespraechsdatum_zweitkalender', NEW.gespraechsdatum_zweitkalender, 'gespraechsdatum_zweitwert', NEW.gespraechsdatum_zweitwert, 'gespraechsdatum_doppeljahr', NEW.gespraechsdatum_doppeljahr, 'form', NEW.form, 'unmittelbarkeit', NEW.unmittelbarkeit, 'audio_medium_id', NEW.audio_medium_id, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_quelle_au AFTER UPDATE ON quelle
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'quelle', OLD.id, json_object('id', OLD.id, 'typ', OLD.typ, 'titel', OLD.titel, 'autor', OLD.autor, 'verlag', OLD.verlag, 'jahr', OLD.jahr, 'art', OLD.art, 'informationsart', OLD.informationsart, 'archiv_id', OLD.archiv_id, 'signatur', OLD.signatur, 'notiz', OLD.notiz, 'informant_person_id', OLD.informant_person_id, 'gespraechsdatum_kalender', OLD.gespraechsdatum_kalender, 'gespraechsdatum_modifikator', OLD.gespraechsdatum_modifikator, 'gespraechsdatum_praezision', OLD.gespraechsdatum_praezision, 'gespraechsdatum_wert1', OLD.gespraechsdatum_wert1, 'gespraechsdatum_wert2', OLD.gespraechsdatum_wert2, 'gespraechsdatum_originaltext', OLD.gespraechsdatum_originaltext, 'gespraechsdatum_sort_von', OLD.gespraechsdatum_sort_von, 'gespraechsdatum_sort_bis', OLD.gespraechsdatum_sort_bis, 'gespraechsdatum_zweitkalender', OLD.gespraechsdatum_zweitkalender, 'gespraechsdatum_zweitwert', OLD.gespraechsdatum_zweitwert, 'gespraechsdatum_doppeljahr', OLD.gespraechsdatum_doppeljahr, 'form', OLD.form, 'unmittelbarkeit', OLD.unmittelbarkeit, 'audio_medium_id', OLD.audio_medium_id, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'typ', NEW.typ, 'titel', NEW.titel, 'autor', NEW.autor, 'verlag', NEW.verlag, 'jahr', NEW.jahr, 'art', NEW.art, 'informationsart', NEW.informationsart, 'archiv_id', NEW.archiv_id, 'signatur', NEW.signatur, 'notiz', NEW.notiz, 'informant_person_id', NEW.informant_person_id, 'gespraechsdatum_kalender', NEW.gespraechsdatum_kalender, 'gespraechsdatum_modifikator', NEW.gespraechsdatum_modifikator, 'gespraechsdatum_praezision', NEW.gespraechsdatum_praezision, 'gespraechsdatum_wert1', NEW.gespraechsdatum_wert1, 'gespraechsdatum_wert2', NEW.gespraechsdatum_wert2, 'gespraechsdatum_originaltext', NEW.gespraechsdatum_originaltext, 'gespraechsdatum_sort_von', NEW.gespraechsdatum_sort_von, 'gespraechsdatum_sort_bis', NEW.gespraechsdatum_sort_bis, 'gespraechsdatum_zweitkalender', NEW.gespraechsdatum_zweitkalender, 'gespraechsdatum_zweitwert', NEW.gespraechsdatum_zweitwert, 'gespraechsdatum_doppeljahr', NEW.gespraechsdatum_doppeljahr, 'form', NEW.form, 'unmittelbarkeit', NEW.unmittelbarkeit, 'audio_medium_id', NEW.audio_medium_id, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_quelle_ad AFTER DELETE ON quelle
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'quelle', OLD.id, json_object('id', OLD.id, 'typ', OLD.typ, 'titel', OLD.titel, 'autor', OLD.autor, 'verlag', OLD.verlag, 'jahr', OLD.jahr, 'art', OLD.art, 'informationsart', OLD.informationsart, 'archiv_id', OLD.archiv_id, 'signatur', OLD.signatur, 'notiz', OLD.notiz, 'informant_person_id', OLD.informant_person_id, 'gespraechsdatum_kalender', OLD.gespraechsdatum_kalender, 'gespraechsdatum_modifikator', OLD.gespraechsdatum_modifikator, 'gespraechsdatum_praezision', OLD.gespraechsdatum_praezision, 'gespraechsdatum_wert1', OLD.gespraechsdatum_wert1, 'gespraechsdatum_wert2', OLD.gespraechsdatum_wert2, 'gespraechsdatum_originaltext', OLD.gespraechsdatum_originaltext, 'gespraechsdatum_sort_von', OLD.gespraechsdatum_sort_von, 'gespraechsdatum_sort_bis', OLD.gespraechsdatum_sort_bis, 'gespraechsdatum_zweitkalender', OLD.gespraechsdatum_zweitkalender, 'gespraechsdatum_zweitwert', OLD.gespraechsdatum_zweitwert, 'gespraechsdatum_doppeljahr', OLD.gespraechsdatum_doppeljahr, 'form', OLD.form, 'unmittelbarkeit', OLD.unmittelbarkeit, 'audio_medium_id', OLD.audio_medium_id, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_risikofaktor_ai AFTER INSERT ON risikofaktor
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'risikofaktor', NEW.id, NULL, json_object('id', NEW.id, 'person_id', NEW.person_id, 'art', NEW.art, 'detail', NEW.detail, 'intensitaet', NEW.intensitaet, 'beginn_kalender', NEW.beginn_kalender, 'beginn_modifikator', NEW.beginn_modifikator, 'beginn_praezision', NEW.beginn_praezision, 'beginn_wert1', NEW.beginn_wert1, 'beginn_wert2', NEW.beginn_wert2, 'beginn_originaltext', NEW.beginn_originaltext, 'beginn_sort_von', NEW.beginn_sort_von, 'beginn_sort_bis', NEW.beginn_sort_bis, 'beginn_zweitkalender', NEW.beginn_zweitkalender, 'beginn_zweitwert', NEW.beginn_zweitwert, 'beginn_doppeljahr', NEW.beginn_doppeljahr, 'ende_kalender', NEW.ende_kalender, 'ende_modifikator', NEW.ende_modifikator, 'ende_praezision', NEW.ende_praezision, 'ende_wert1', NEW.ende_wert1, 'ende_wert2', NEW.ende_wert2, 'ende_originaltext', NEW.ende_originaltext, 'ende_sort_von', NEW.ende_sort_von, 'ende_sort_bis', NEW.ende_sort_bis, 'ende_zweitkalender', NEW.ende_zweitkalender, 'ende_zweitwert', NEW.ende_zweitwert, 'ende_doppeljahr', NEW.ende_doppeljahr, 'quelle_beruf_id', NEW.quelle_beruf_id, 'konfidenz', NEW.konfidenz, 'notiz', NEW.notiz, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_risikofaktor_au AFTER UPDATE ON risikofaktor
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'risikofaktor', OLD.id, json_object('id', OLD.id, 'person_id', OLD.person_id, 'art', OLD.art, 'detail', OLD.detail, 'intensitaet', OLD.intensitaet, 'beginn_kalender', OLD.beginn_kalender, 'beginn_modifikator', OLD.beginn_modifikator, 'beginn_praezision', OLD.beginn_praezision, 'beginn_wert1', OLD.beginn_wert1, 'beginn_wert2', OLD.beginn_wert2, 'beginn_originaltext', OLD.beginn_originaltext, 'beginn_sort_von', OLD.beginn_sort_von, 'beginn_sort_bis', OLD.beginn_sort_bis, 'beginn_zweitkalender', OLD.beginn_zweitkalender, 'beginn_zweitwert', OLD.beginn_zweitwert, 'beginn_doppeljahr', OLD.beginn_doppeljahr, 'ende_kalender', OLD.ende_kalender, 'ende_modifikator', OLD.ende_modifikator, 'ende_praezision', OLD.ende_praezision, 'ende_wert1', OLD.ende_wert1, 'ende_wert2', OLD.ende_wert2, 'ende_originaltext', OLD.ende_originaltext, 'ende_sort_von', OLD.ende_sort_von, 'ende_sort_bis', OLD.ende_sort_bis, 'ende_zweitkalender', OLD.ende_zweitkalender, 'ende_zweitwert', OLD.ende_zweitwert, 'ende_doppeljahr', OLD.ende_doppeljahr, 'quelle_beruf_id', OLD.quelle_beruf_id, 'konfidenz', OLD.konfidenz, 'notiz', OLD.notiz, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'person_id', NEW.person_id, 'art', NEW.art, 'detail', NEW.detail, 'intensitaet', NEW.intensitaet, 'beginn_kalender', NEW.beginn_kalender, 'beginn_modifikator', NEW.beginn_modifikator, 'beginn_praezision', NEW.beginn_praezision, 'beginn_wert1', NEW.beginn_wert1, 'beginn_wert2', NEW.beginn_wert2, 'beginn_originaltext', NEW.beginn_originaltext, 'beginn_sort_von', NEW.beginn_sort_von, 'beginn_sort_bis', NEW.beginn_sort_bis, 'beginn_zweitkalender', NEW.beginn_zweitkalender, 'beginn_zweitwert', NEW.beginn_zweitwert, 'beginn_doppeljahr', NEW.beginn_doppeljahr, 'ende_kalender', NEW.ende_kalender, 'ende_modifikator', NEW.ende_modifikator, 'ende_praezision', NEW.ende_praezision, 'ende_wert1', NEW.ende_wert1, 'ende_wert2', NEW.ende_wert2, 'ende_originaltext', NEW.ende_originaltext, 'ende_sort_von', NEW.ende_sort_von, 'ende_sort_bis', NEW.ende_sort_bis, 'ende_zweitkalender', NEW.ende_zweitkalender, 'ende_zweitwert', NEW.ende_zweitwert, 'ende_doppeljahr', NEW.ende_doppeljahr, 'quelle_beruf_id', NEW.quelle_beruf_id, 'konfidenz', NEW.konfidenz, 'notiz', NEW.notiz, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_risikofaktor_ad AFTER DELETE ON risikofaktor
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'risikofaktor', OLD.id, json_object('id', OLD.id, 'person_id', OLD.person_id, 'art', OLD.art, 'detail', OLD.detail, 'intensitaet', OLD.intensitaet, 'beginn_kalender', OLD.beginn_kalender, 'beginn_modifikator', OLD.beginn_modifikator, 'beginn_praezision', OLD.beginn_praezision, 'beginn_wert1', OLD.beginn_wert1, 'beginn_wert2', OLD.beginn_wert2, 'beginn_originaltext', OLD.beginn_originaltext, 'beginn_sort_von', OLD.beginn_sort_von, 'beginn_sort_bis', OLD.beginn_sort_bis, 'beginn_zweitkalender', OLD.beginn_zweitkalender, 'beginn_zweitwert', OLD.beginn_zweitwert, 'beginn_doppeljahr', OLD.beginn_doppeljahr, 'ende_kalender', OLD.ende_kalender, 'ende_modifikator', OLD.ende_modifikator, 'ende_praezision', OLD.ende_praezision, 'ende_wert1', OLD.ende_wert1, 'ende_wert2', OLD.ende_wert2, 'ende_originaltext', OLD.ende_originaltext, 'ende_sort_von', OLD.ende_sort_von, 'ende_sort_bis', OLD.ende_sort_bis, 'ende_zweitkalender', OLD.ende_zweitkalender, 'ende_zweitwert', OLD.ende_zweitwert, 'ende_doppeljahr', OLD.ende_doppeljahr, 'quelle_beruf_id', OLD.quelle_beruf_id, 'konfidenz', OLD.konfidenz, 'notiz', OLD.notiz, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;

CREATE TRIGGER jrn_zitat_ai AFTER INSERT ON zitat
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'zitat', NEW.id, NULL, json_object('id', NEW.id, 'quelle_id', NEW.quelle_id, 'seite', NEW.seite, 'eintragsnummer', NEW.eintragsnummer, 'band', NEW.band, 'jahr', NEW.jahr, 'zugriffsdatum_kalender', NEW.zugriffsdatum_kalender, 'zugriffsdatum_modifikator', NEW.zugriffsdatum_modifikator, 'zugriffsdatum_praezision', NEW.zugriffsdatum_praezision, 'zugriffsdatum_wert1', NEW.zugriffsdatum_wert1, 'zugriffsdatum_wert2', NEW.zugriffsdatum_wert2, 'zugriffsdatum_originaltext', NEW.zugriffsdatum_originaltext, 'zugriffsdatum_sort_von', NEW.zugriffsdatum_sort_von, 'zugriffsdatum_sort_bis', NEW.zugriffsdatum_sort_bis, 'zugriffsdatum_zweitkalender', NEW.zugriffsdatum_zweitkalender, 'zugriffsdatum_zweitwert', NEW.zugriffsdatum_zweitwert, 'zugriffsdatum_doppeljahr', NEW.zugriffsdatum_doppeljahr, 'digitalisat_url', NEW.digitalisat_url, 'transkript', NEW.transkript, 'uebersetzung', NEW.uebersetzung, 'konfidenz', NEW.konfidenz, 'medium_id', NEW.medium_id, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'insert');
END;

CREATE TRIGGER jrn_zitat_au AFTER UPDATE ON zitat
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'zitat', OLD.id, json_object('id', OLD.id, 'quelle_id', OLD.quelle_id, 'seite', OLD.seite, 'eintragsnummer', OLD.eintragsnummer, 'band', OLD.band, 'jahr', OLD.jahr, 'zugriffsdatum_kalender', OLD.zugriffsdatum_kalender, 'zugriffsdatum_modifikator', OLD.zugriffsdatum_modifikator, 'zugriffsdatum_praezision', OLD.zugriffsdatum_praezision, 'zugriffsdatum_wert1', OLD.zugriffsdatum_wert1, 'zugriffsdatum_wert2', OLD.zugriffsdatum_wert2, 'zugriffsdatum_originaltext', OLD.zugriffsdatum_originaltext, 'zugriffsdatum_sort_von', OLD.zugriffsdatum_sort_von, 'zugriffsdatum_sort_bis', OLD.zugriffsdatum_sort_bis, 'zugriffsdatum_zweitkalender', OLD.zugriffsdatum_zweitkalender, 'zugriffsdatum_zweitwert', OLD.zugriffsdatum_zweitwert, 'zugriffsdatum_doppeljahr', OLD.zugriffsdatum_doppeljahr, 'digitalisat_url', OLD.digitalisat_url, 'transkript', OLD.transkript, 'uebersetzung', OLD.uebersetzung, 'konfidenz', OLD.konfidenz, 'medium_id', OLD.medium_id, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), json_object('id', NEW.id, 'quelle_id', NEW.quelle_id, 'seite', NEW.seite, 'eintragsnummer', NEW.eintragsnummer, 'band', NEW.band, 'jahr', NEW.jahr, 'zugriffsdatum_kalender', NEW.zugriffsdatum_kalender, 'zugriffsdatum_modifikator', NEW.zugriffsdatum_modifikator, 'zugriffsdatum_praezision', NEW.zugriffsdatum_praezision, 'zugriffsdatum_wert1', NEW.zugriffsdatum_wert1, 'zugriffsdatum_wert2', NEW.zugriffsdatum_wert2, 'zugriffsdatum_originaltext', NEW.zugriffsdatum_originaltext, 'zugriffsdatum_sort_von', NEW.zugriffsdatum_sort_von, 'zugriffsdatum_sort_bis', NEW.zugriffsdatum_sort_bis, 'zugriffsdatum_zweitkalender', NEW.zugriffsdatum_zweitkalender, 'zugriffsdatum_zweitwert', NEW.zugriffsdatum_zweitwert, 'zugriffsdatum_doppeljahr', NEW.zugriffsdatum_doppeljahr, 'digitalisat_url', NEW.digitalisat_url, 'transkript', NEW.transkript, 'uebersetzung', NEW.uebersetzung, 'konfidenz', NEW.konfidenz, 'medium_id', NEW.medium_id, 'erstellt_am', NEW.erstellt_am, 'geaendert_am', NEW.geaendert_am), 'update');
END;

CREATE TRIGGER jrn_zitat_ad AFTER DELETE ON zitat
WHEN (SELECT aktiv FROM journal_kontext WHERE id = 1) = 1
BEGIN
  INSERT INTO aenderung (id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation)
  VALUES (uuid7(), (SELECT transaktion_id FROM journal_kontext WHERE id = 1), (SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = (SELECT transaktion_id FROM journal_kontext WHERE id = 1)), 'zitat', OLD.id, json_object('id', OLD.id, 'quelle_id', OLD.quelle_id, 'seite', OLD.seite, 'eintragsnummer', OLD.eintragsnummer, 'band', OLD.band, 'jahr', OLD.jahr, 'zugriffsdatum_kalender', OLD.zugriffsdatum_kalender, 'zugriffsdatum_modifikator', OLD.zugriffsdatum_modifikator, 'zugriffsdatum_praezision', OLD.zugriffsdatum_praezision, 'zugriffsdatum_wert1', OLD.zugriffsdatum_wert1, 'zugriffsdatum_wert2', OLD.zugriffsdatum_wert2, 'zugriffsdatum_originaltext', OLD.zugriffsdatum_originaltext, 'zugriffsdatum_sort_von', OLD.zugriffsdatum_sort_von, 'zugriffsdatum_sort_bis', OLD.zugriffsdatum_sort_bis, 'zugriffsdatum_zweitkalender', OLD.zugriffsdatum_zweitkalender, 'zugriffsdatum_zweitwert', OLD.zugriffsdatum_zweitwert, 'zugriffsdatum_doppeljahr', OLD.zugriffsdatum_doppeljahr, 'digitalisat_url', OLD.digitalisat_url, 'transkript', OLD.transkript, 'uebersetzung', OLD.uebersetzung, 'konfidenz', OLD.konfidenz, 'medium_id', OLD.medium_id, 'erstellt_am', OLD.erstellt_am, 'geaendert_am', OLD.geaendert_am), NULL, 'delete');
END;
