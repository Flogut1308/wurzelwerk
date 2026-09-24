-- Migration 0007 (AP-1.34, Querschnitt des Editors; Vorgaben §2.2/§5.5, B-01). Zwei unabhängige,
-- rein additive Schemateile — kein Tabellenneubau, kein DROP:
--
--   1. Fortlaufende Personen-Kennung (`person.kennung`, Anzeige „P-0142" im Kern) aus einem
--      eigenen Zähler `kennung_zaehler`. Der Zähler ist NICHT_JOURNALISIERT
--      (src/main/journal/journalisierung.ts): Undo nimmt eine Person zurück, lässt den Zähler aber
--      stehen — eine einmal vergebene Nummer wird nie neu vergeben (E12, ausnahmslos). Drei
--      Trigger erzwingen das auf DB-Ebene: der Zähler läuft nur vorwärts, wird nie gelöscht und nie
--      per REPLACE/INSERT ersetzt.
--      `person.kennung` bleibt nullable (B2): kein NOT NULL per ALTER (in SQLite nur mit Default
--      möglich), kein Tabellenneubau, kein NOT-NULL-Trigger — ein Undo alter Journaleinträge über
--      `rohEinfuegen` (src/main/repositories/basis.ts) setzt Zeilen ohne `kennung` wieder ein
--      (E13, UI zeigt „–"). Die Garantie „jede neue Person hat eine Kennung" liegt im einzigen
--      Schreibweg `personRepo.einfuegen` -> `kennungZiehen` (src/main/repositories/kennung-repo.ts).
--      Nachtrag für den Bestand: lückenlos 1..n in `ORDER BY id` (E2; UUID v7 -> Anlagereihenfolge).
--
--   2. Feldbezug und Textanker eines Belegs (`aussage_zitat.feld`, `textanker_von`,
--      `textanker_bis`, B-01). `feld` NULL = die ganze Aussage; bewusst OHNE DB-CHECK (E3, die
--      Wertliste ist ein Zod-Enum im Code). Der Anker ist ein halboffenes Intervall [von, bis) in
--      UTF-16-Codeeinheiten des Transkripts; beide Grenzen oder keine, und bis > von. Die CHECK-Form
--      auf `textanker_bis` ist die korrigierte: eine Form „(von IS NULL AND bis IS NULL) OR bis > von"
--      ließe (3, NULL) und (NULL, 5) durch, weil `NULL > x` NULL ist und NULL einen CHECK besteht.
--      Ein CHECK über zwei Spalten per ADD COLUMN ist gegen die gebündelte SQLite (3.53) geprüft (R3).
--
-- Die Journal-Trigger `jrn_person_*`/`jrn_aussage_zitat_*` kennen die neuen Spalten automatisch:
-- `pnpm trigger` liest die Spalten aus dem migrierten Schema, laeufer.ts wendet
-- docs/schema/trigger_generiert.sql nach der Migrationsschleife neu an. Die `abl_*`-Trigger sind
-- unverändert (weder `kennung` noch die Anker fließen in person_flach/Suche, E9).
-- Das Nachtrags-UPDATE unten läuft mit ausgeschaltetem Journal (laeufer.ts, journalAus) — es feuert
-- aber `abl_person_au` je Zeile (FTS-Pflege der Personennotiz); Laufzeit gemessen in R4.

-- ================================================================================================
-- 1. Personen-Kennung
-- ================================================================================================

-- NICHT_JOURNALISIERT
CREATE TABLE kennung_zaehler (
  bereich TEXT PRIMARY KEY CHECK (bereich IN ('person')),
  naechste INTEGER NOT NULL CHECK (naechste >= 1)
) STRICT;

CREATE TRIGGER chk_kennung_zaehler_vorwaerts BEFORE UPDATE ON kennung_zaehler
  WHEN NEW.naechste <= OLD.naechste OR NEW.bereich <> OLD.bereich
BEGIN
  SELECT RAISE(ABORT, 'kennung_zaehler laeuft nur vorwaerts');
END;

CREATE TRIGGER chk_kennung_zaehler_kein_loeschen BEFORE DELETE ON kennung_zaehler
BEGIN
  SELECT RAISE(ABORT, 'kennung_zaehler wird nie geloescht');
END;

-- REPLACE (`INSERT OR REPLACE`, `REPLACE INTO`) löst den PK-Konflikt durch Löschen der alten Zeile —
-- ohne DELETE-Trigger (recursive_triggers ist aus) — und setzte den Zähler so an beiden Triggern
-- vorbei zurück. Darum: für einen bestehenden `bereich` gibt es kein INSERT. BEFORE INSERT feuert
-- vor der Konfliktprüfung, trifft also auch ein UPSERT (`ON CONFLICT DO UPDATE`); der einzige
-- Schreibweg bleibt `UPDATE` (kennungZiehen/zaehlerMindestensSetzen). Der Seed-INSERT unten läuft
-- auf der leeren Tabelle und besteht die Bedingung.
CREATE TRIGGER chk_kennung_zaehler_kein_ersetzen BEFORE INSERT ON kennung_zaehler
  WHEN EXISTS (SELECT 1 FROM kennung_zaehler WHERE bereich = NEW.bereich)
BEGIN
  SELECT RAISE(ABORT, 'kennung_zaehler wird nie ersetzt');
END;

ALTER TABLE person ADD COLUMN kennung INTEGER CHECK (kennung IS NULL OR kennung >= 1);

UPDATE person SET kennung = r.nr
  FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS nr FROM person) AS r
  WHERE r.id = person.id;

CREATE UNIQUE INDEX idx_person_kennung ON person(kennung);

INSERT INTO kennung_zaehler (bereich, naechste)
  VALUES ('person', (SELECT COALESCE(MAX(kennung), 0) + 1 FROM person));

-- ================================================================================================
-- 2. Feldbezug und Textanker eines Belegs
-- ================================================================================================

ALTER TABLE aussage_zitat ADD COLUMN feld TEXT;
ALTER TABLE aussage_zitat ADD COLUMN textanker_von INTEGER CHECK (textanker_von IS NULL OR textanker_von >= 0);
ALTER TABLE aussage_zitat ADD COLUMN textanker_bis INTEGER
  CHECK ((textanker_von IS NULL) = (textanker_bis IS NULL)
         AND (textanker_bis IS NULL OR textanker_bis > textanker_von));
