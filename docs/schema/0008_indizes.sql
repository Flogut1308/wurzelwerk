-- Migration 0008 (Vorarbeiten AP-1.30, PR 6; docs/80_Offene_Fragen.md §31 U-1.34-C2b-aussage-index
-- und U-1.34-C2c-titelbild-index, Eigentümer-Auftrag 25.09.2026). Rein additiv: zwei Indizes, keine
-- Tabelle, keine Spalte, kein Trigger, kein Datenumzug.
--
--   1. `aussage(subjekt_typ, subjekt_id, praedikat)`: `abfrage:person.detail` liest Aussagen je
--      Subjekt (Person, Hauptform, Elternkante, Ereignis) und Prädikat — Grunddaten, Umfeld-Lader
--      der Feldwarnungen, Kernangaben. Ohne Index war jede dieser Anweisungen ein Durchlauf über die
--      ganze Tabelle (U-1.34-C2b-aussage-index). Das Präfix (subjekt_typ, subjekt_id) bedient auch
--      die Abfragen ohne Prädikat.
--   2. `medium_zuordnung(subjekt_typ, subjekt_id)`: das Titelbild einer Person für die Regel
--      `kein_portraet` (inaktiv bis AP-1.31b) — bisher nur `medium_id` und der Primärschlüssel
--      (medium_id, subjekt_typ, subjekt_id) indiziert (U-1.34-C2c-titelbild-index).
--
-- Die Journal- und abl-Trigger sind unberührt (ein Index ändert keine Spalte); `pnpm trigger` erzeugt
-- dieselbe trigger_generiert.sql. Indizes fließen nicht in den Journal-Abzug.
CREATE INDEX idx_aussage_subjekt_praedikat ON aussage(subjekt_typ, subjekt_id, praedikat);
CREATE INDEX idx_medium_zuordnung_subjekt ON medium_zuordnung(subjekt_typ, subjekt_id);
