-- Grundgerüst-Migration 0001 (AP-0.5). Nur Journal-Infrastruktur, kein Kernschema (AP-0.6).
-- Journalisierungs-Einordnung (CLAUDE.md §6): alle vier Tabellen sind NICHT_JOURNALISIERT.
-- Die physische JOURNALISIERT/NICHT_JOURNALISIERT-Liste + Trigger folgen in AP-0.8; hier nur als Notiz.

CREATE TABLE transaktion (
  id                     TEXT PRIMARY KEY,
  zeitpunkt              INTEGER NOT NULL,
  bearbeiter             TEXT,
  beschreibung           TEXT,
  art                    TEXT NOT NULL CHECK (art IN ('nutzer','import','merge','migration','wartung','platzhalter_aufgeloest')),
  lfd                    INTEGER NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'angewendet' CHECK (status IN ('angewendet','zurueckgenommen','verworfen')),
  rueckgaengig_moeglich  INTEGER NOT NULL DEFAULT 1,
  snapshot_pfad          TEXT,
  koaleszenz_schluessel  TEXT
) STRICT;

CREATE TABLE aenderung (
  id             TEXT PRIMARY KEY,
  transaktion_id TEXT NOT NULL REFERENCES transaktion(id),
  reihenfolge    INTEGER NOT NULL,
  tabelle        TEXT NOT NULL,
  datensatz_id   TEXT NOT NULL,
  feld           TEXT,
  wert_alt_json  TEXT,
  wert_neu_json  TEXT,
  operation      TEXT NOT NULL CHECK (operation IN ('insert','update','delete'))
) STRICT;

CREATE TABLE journal_kontext (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  transaktion_id TEXT,
  aktiv          INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE schema_migration (
  version       INTEGER PRIMARY KEY,
  datei         TEXT NOT NULL,
  pruefsumme    TEXT NOT NULL,
  angewendet_am INTEGER NOT NULL,
  app_version   TEXT NOT NULL
) STRICT;
