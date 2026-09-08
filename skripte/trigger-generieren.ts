// `pnpm trigger` (AP-0.7/AP-0.8, 55_Architektur.md §5.2, §4.4 "Trigger werden erzeugt, nicht
// geschrieben"): erzeugt in einem Lauf ZWEI Trigger-Familien:
//   1. `abl_*` (abgeleitete Daten, AP-0.7) - schreibt zwischen die Markierungskommentare in
//      `docs/schema/0003_abgeleitet.sql`.
//   2. `jrn_*` (Änderungsjournal, AP-0.8, ADR-017) - schreibt die vollständige Datei
//      `docs/schema/trigger_generiert.sql` neu.
//
// Jeder `abl_*`-Trigger-Body benutzt exakt dieselben SQL-Textbausteine wie
// `src/main/datenbank/trigger.ts` (`alleAbgeleitetenNeuAufbauen`) - beide importieren aus
// `src/main/datenbank/abgeleitet-projektion.ts`. Das ist die Bitgleichheits-Garantie aus dem
// AP-0.7-Auftrag: der einzige Unterschied ist der WHERE-Filter (eine Person vs. alle).
import Database from 'better-sqlite3'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  nameFtsNormalformSql,
  nameFtsOriginalSql,
  nameFtsUmschriftSql,
  namePhonetikCodeSql,
  personFlachProjektionSql,
  personNotizFtsSql,
  zitatTranskriptFtsSql,
} from '../src/main/datenbank/abgeleitet-projektion'
import { migrieren } from '../src/main/datenbank/migration/laeufer'
import { JOURNALISIERT } from '../src/main/journal/journalisierung'

const MARKER_ANFANG = '-- @generierte-trigger-anfang'
const MARKER_ENDE = '-- @generierte-trigger-ende'

/** Baut ein `INSERT INTO person_flach (...) <projektion>`-Statement für den gegebenen Filter. */
function personFlachEinfuegenSql(filterSql: string): string {
  return `INSERT INTO person_flach (person_id, anzeigename, sortier_nachname, sortier_vornamen, geburt_jahr, geburt_sort_von, geburt_ort_name, tod_jahr, tod_sort_von, konfidenz_min, hat_widerspruch)\n  ${personFlachProjektionSql(filterSql)};`
}

/** `DELETE` + Neuaufbau von `person_flach` für die von `personIdFilterSql` beschriebenen Personen. */
function personFlachNeuBerechnenSql(personIdFilterSql: string): string {
  return [
    `  DELETE FROM person_flach WHERE person_id IN (${personIdFilterSql});`,
    `  ${personFlachEinfuegenSql(`p.id IN (${personIdFilterSql})`)}`,
  ].join('\n')
}

/**
 * Die fünf `suche_fts`-Spalten für eine `name`-Zeile (Original/Umschrift/Normalform, keine
 * Notiz/Transkript). `umschriftSql` kommt vom Aufrufer, weil die Fan-out-Fälle (siehe
 * `nameFtsUmschriftSql`-Dokumentation) unterschiedliche Rekonstruktionen brauchen - hier wird nur
 * noch zusammengesetzt, nicht mehr entschieden.
 */
function nameFtsSpaltenwerteSql(zeile: string, umschriftSql: string): string {
  return [nameFtsOriginalSql(zeile), umschriftSql, nameFtsNormalformSql(zeile), "''", "''"].join(', ')
}

/** `suche_fts`-Spaltenwerte für eine `name`-Zeile mit ihrer LIVE (aktuellen) Umschrift - der Normalfall für "neuer Wert". */
function nameFtsSpaltenwerteLiveSql(zeile: string): string {
  return nameFtsSpaltenwerteSql(zeile, nameFtsUmschriftSql(`${zeile}.id`))
}

function ablPersonTrigger(): string {
  return `CREATE TRIGGER abl_person_ai AFTER INSERT ON person
BEGIN
${personFlachEinfuegenSql('p.id = NEW.id')}
  INSERT INTO suche_fts_quelle (quelle_typ, quelle_id) VALUES ('person_notiz', NEW.id);
  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    VALUES (last_insert_rowid(), '', '', '', ${personNotizFtsSql('NEW')}, '');
END;

CREATE TRIGGER abl_person_au AFTER UPDATE ON person
BEGIN
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', rowid, '', '', '', ${personNotizFtsSql('OLD')}, ''
    FROM suche_fts_quelle WHERE quelle_typ = 'person_notiz' AND quelle_id = OLD.id;
  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    SELECT rowid, '', '', '', ${personNotizFtsSql('NEW')}, ''
    FROM suche_fts_quelle WHERE quelle_typ = 'person_notiz' AND quelle_id = NEW.id;
END;

CREATE TRIGGER abl_person_ad AFTER DELETE ON person
BEGIN
  -- person_flach räumt sich selbst über ON DELETE CASCADE ab (kein Trigger nötig) - aber
  -- suche_fts/suche_fts_quelle für die person_notiz-Zeile kennen keinen Fremdschlüssel
  -- (polymorphe Quelle) und müssen hier aufgeräumt werden.
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', rowid, '', '', '', ${personNotizFtsSql('OLD')}, ''
    FROM suche_fts_quelle WHERE quelle_typ = 'person_notiz' AND quelle_id = OLD.id;
  DELETE FROM suche_fts_quelle WHERE quelle_typ = 'person_notiz' AND quelle_id = OLD.id;
END;`
}

/**
 * Fan-out-Baustein: aktualisiert die `suche_fts`-Zeile von `ziel` (der `name`-Zeile, deren
 * `umschrift`-Spalte vom hier bearbeiteten Eintrag abhängt), inklusive korrekt rekonstruiertem
 * Vorher-Wert für den `'delete'`-Sonderbefehl. `wennSql` ist die Trigger-`WHERE`-Bedingung, unter
 * der dieser Block überhaupt greift; `umschriftVorherSql` ist die Rekonstruktion des Vorher-Werts
 * (siehe `nameFtsUmschriftSql`-Dokumentation für die drei verschiedenen Fälle INSERT/UPDATE/DELETE).
 */
function zielFtsAuffrischenSql(zielIdSql: string, wennSql: string, umschriftVorherSql: string): string {
  return [
    `  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)`,
    `    SELECT 'delete', q.rowid, ${nameFtsSpaltenwerteSql('ziel', umschriftVorherSql)}`,
    `    FROM name ziel JOIN suche_fts_quelle q ON q.quelle_typ = 'name' AND q.quelle_id = ziel.id`,
    `    WHERE ${wennSql} AND ziel.id = ${zielIdSql};`,
    `  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)`,
    `    SELECT q.rowid, ${nameFtsSpaltenwerteLiveSql('ziel')}`,
    `    FROM name ziel JOIN suche_fts_quelle q ON q.quelle_typ = 'name' AND q.quelle_id = ziel.id`,
    `    WHERE ${wennSql} AND ziel.id = ${zielIdSql};`,
  ].join('\n')
}

function ablNameTrigger(): string {
  return `CREATE TRIGGER abl_name_ai AFTER INSERT ON name
BEGIN
  DELETE FROM person_flach WHERE person_id = NEW.person_id;
${personFlachEinfuegenSql('p.id = NEW.person_id')}
  INSERT INTO name_phonetik (name_id, verfahren, code)
    SELECT NEW.id, 'koelner', ${namePhonetikCodeSql('NEW')}
    WHERE NEW.nachname IS NOT NULL AND NEW.nachname <> '';
  INSERT INTO suche_fts_quelle (quelle_typ, quelle_id) VALUES ('name', NEW.id);
  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    VALUES (last_insert_rowid(), ${nameFtsSpaltenwerteLiveSql('NEW')});
  -- Fan-out: dieser Eintrag ist selbst die Umschrift eines anderen - dessen FTS-Zeile auffrischen.
  -- Vorher-Wert = Live-Abfrage ohne NEW (das existiert in der Tabelle schon, muss für den
  -- "davor"-Zustand aber ausgeschlossen werden).
${zielFtsAuffrischenSql(
    'NEW.umschrift_von',
    'NEW.umschrift_von IS NOT NULL',
    nameFtsUmschriftSql('ziel.id', { ausschlussIdSql: 'NEW.id' }),
  )}
END;

CREATE TRIGGER abl_name_au AFTER UPDATE ON name
BEGIN
  DELETE FROM person_flach WHERE person_id IN (OLD.person_id, NEW.person_id);
${personFlachEinfuegenSql('p.id IN (OLD.person_id, NEW.person_id)')}
  DELETE FROM name_phonetik WHERE name_id = NEW.id AND verfahren = 'koelner';
  INSERT INTO name_phonetik (name_id, verfahren, code)
    SELECT NEW.id, 'koelner', ${namePhonetikCodeSql('NEW')}
    WHERE NEW.nachname IS NOT NULL AND NEW.nachname <> '';
  -- Eigene FTS-Zeile: alten Stand (OLD-Werte, Umschrift live - unabhängig von dieser Zeile selbst)
  -- löschen, dann mit den neuen Werten (Umschrift live mit dem neuen Stand) neu einfügen.
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', rowid, ${nameFtsSpaltenwerteLiveSql('OLD')}
    FROM suche_fts_quelle WHERE quelle_typ = 'name' AND quelle_id = OLD.id;
  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    SELECT rowid, ${nameFtsSpaltenwerteLiveSql('NEW')}
    FROM suche_fts_quelle WHERE quelle_typ = 'name' AND quelle_id = NEW.id;
  -- Fan-out beim alten Umschrift-Ziel (ziel = OLD.umschrift_von): läuft IMMER, wenn OLD überhaupt
  -- ein Ziel hatte - deckt sowohl "Ziel geändert" als auch "Ziel gleich geblieben, aber
  -- original_text dieser Zeile geändert" ab. Vorher-Wert: Live-Geschwistersuche ohne die (bereits
  -- aktualisierte) eigene Zeile, dafür mit einem virtuellen Kandidaten aus OLD.* - das rekonstruiert
  -- exakt den Stand vor diesem UPDATE.
${zielFtsAuffrischenSql(
    'OLD.umschrift_von',
    'OLD.umschrift_von IS NOT NULL',
    nameFtsUmschriftSql('ziel.id', {
      ausschlussIdSql: 'NEW.id',
      virtuellerKandidat: { idSql: 'OLD.id', originalTextSql: 'OLD.original_text' },
    }),
  )}
  -- Fan-out beim neuen Umschrift-Ziel (ziel = NEW.umschrift_von): nur wenn sich das Ziel
  -- tatsächlich geändert hat - bei unverändertem Ziel deckt der Block oben denselben Fall schon ab
  -- (zweimal denselben rowid löschen+einfügen würde den contentless-Index mit falschen
  -- "Vorher"-Werten füttern, siehe Modul-Doku zu nameFtsUmschriftSql).
${zielFtsAuffrischenSql(
    'NEW.umschrift_von',
    "NEW.umschrift_von IS NOT NULL AND NEW.umschrift_von IS NOT OLD.umschrift_von",
    nameFtsUmschriftSql('ziel.id', { ausschlussIdSql: 'NEW.id' }),
  )}
END;

CREATE TRIGGER abl_name_bd BEFORE DELETE ON name
BEGIN
  -- Eigene FTS-Zeile abräumen: MUSS in BEFORE DELETE laufen, nicht in AFTER DELETE (hueter-Review
  -- AP-0.7 PR-A, verifizierter Fund). Grund: docs/schema/0002_kern.sql deklariert
  -- "umschrift_von TEXT REFERENCES name(id) ON DELETE SET NULL" - wenn OLD (dieser Eintrag) das
  -- Ziel eines Umschrift-Geschwisters war, kappt SQLite dessen umschrift_von per Fremdschlüssel-
  -- Aktion VOR dem AFTER-DELETE-Trigger von OLD (empirisch geprüft: die Aktion feuert sogar noch
  -- vor der eigentlichen Entfernung von OLD aus der Tabelle). Eine Live-Geschwistersuche in AFTER
  -- DELETE sähe die Beziehung dann bereits gekappt und läse fälschlich '' statt des tatsächlich
  -- indizierten Werts - das echte Posting würde nie aus dem contentless-FTS5-Index subtrahiert
  -- (Karteileiche). In BEFORE DELETE ist die Tabelle noch unangetastet: eine Live-Abfrage liefert
  -- hier den korrekten, zuletzt indizierten Wert, ganz ohne virtuellen Kandidaten.
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', rowid, ${nameFtsSpaltenwerteLiveSql('OLD')}
    FROM suche_fts_quelle WHERE quelle_typ = 'name' AND quelle_id = OLD.id;
  DELETE FROM suche_fts_quelle WHERE quelle_typ = 'name' AND quelle_id = OLD.id;
END;

CREATE TRIGGER abl_name_ad AFTER DELETE ON name
BEGIN
  DELETE FROM person_flach WHERE person_id = OLD.person_id;
${personFlachEinfuegenSql('p.id = OLD.person_id')}
  -- name_phonetik räumt sich selbst über ON DELETE CASCADE ab (0002_kern.sql). Die eigene
  -- suche_fts/suche_fts_quelle-Zeile ist bereits in abl_name_bd abgeräumt (siehe dort).
  -- Fan-out: OLD war Umschrift-Geschwister eines anderen Originals. OLD existiert zum Zeitpunkt
  -- dieses AFTER-DELETE-Triggers nicht mehr in der Tabelle - der virtuelle Kandidat aus OLD.*
  -- rekonstruiert, was vorher indiziert war (keine Live-Ausschluss-Klausel nötig, OLD ist ja schon weg).
  -- Läuft ins Leere (0 Zeilen), falls das Ziel selbst schon vorher gelöscht wurde (z. B. CASCADE
  -- beim Löschen der ganzen Person) - dessen eigene FTS-Zeile ist dann bereits über dessen eigenen
  -- abl_name_bd-Aufruf abgeräumt, dort ist nichts mehr aufzufrischen.
${zielFtsAuffrischenSql(
    'OLD.umschrift_von',
    'OLD.umschrift_von IS NOT NULL',
    nameFtsUmschriftSql('ziel.id', { virtuellerKandidat: { idSql: 'OLD.id', originalTextSql: 'OLD.original_text' } }),
  )}
END;`
}

function ablAussageTrigger(): string {
  return `CREATE TRIGGER abl_aussage_ai AFTER INSERT ON aussage
WHEN NEW.subjekt_typ = 'person'
BEGIN
  DELETE FROM person_flach WHERE person_id = NEW.subjekt_id;
${personFlachEinfuegenSql('p.id = NEW.subjekt_id')}
END;

CREATE TRIGGER abl_aussage_au AFTER UPDATE ON aussage
WHEN NEW.subjekt_typ = 'person' OR OLD.subjekt_typ = 'person'
BEGIN
  DELETE FROM person_flach WHERE OLD.subjekt_typ = 'person' AND person_id = OLD.subjekt_id;
${personFlachEinfuegenSql("OLD.subjekt_typ = 'person' AND p.id = OLD.subjekt_id")}
  DELETE FROM person_flach WHERE NEW.subjekt_typ = 'person' AND person_id = NEW.subjekt_id;
${personFlachEinfuegenSql("NEW.subjekt_typ = 'person' AND p.id = NEW.subjekt_id")}
END;

CREATE TRIGGER abl_aussage_ad AFTER DELETE ON aussage
WHEN OLD.subjekt_typ = 'person'
BEGIN
  DELETE FROM person_flach WHERE person_id = OLD.subjekt_id;
${personFlachEinfuegenSql('p.id = OLD.subjekt_id')}
END;`
}

function ablOrtsnameTrigger(): string {
  const betroffeneAus = (ortIdSql: string): string =>
    `SELECT a.subjekt_id FROM aussage a WHERE a.subjekt_typ = 'person' AND a.praedikat = 'geburtsort' AND a.wert_ref_id IN (${ortIdSql})`

  return `CREATE TRIGGER abl_ortsname_ai AFTER INSERT ON ortsname
BEGIN
${personFlachNeuBerechnenSql(betroffeneAus('NEW.ort_id'))}
END;

CREATE TRIGGER abl_ortsname_au AFTER UPDATE ON ortsname
BEGIN
${personFlachNeuBerechnenSql(betroffeneAus('OLD.ort_id, NEW.ort_id'))}
END;

CREATE TRIGGER abl_ortsname_ad AFTER DELETE ON ortsname
BEGIN
${personFlachNeuBerechnenSql(betroffeneAus('OLD.ort_id'))}
END;`
}

function ablZitatTrigger(): string {
  return `CREATE TRIGGER abl_zitat_ai AFTER INSERT ON zitat
BEGIN
  INSERT INTO suche_fts_quelle (quelle_typ, quelle_id) VALUES ('zitat_transkript', NEW.id);
  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    VALUES (last_insert_rowid(), '', '', '', '', ${zitatTranskriptFtsSql('NEW')});
END;

CREATE TRIGGER abl_zitat_au AFTER UPDATE ON zitat
BEGIN
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', rowid, '', '', '', '', ${zitatTranskriptFtsSql('OLD')}
    FROM suche_fts_quelle WHERE quelle_typ = 'zitat_transkript' AND quelle_id = OLD.id;
  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    SELECT rowid, '', '', '', '', ${zitatTranskriptFtsSql('NEW')}
    FROM suche_fts_quelle WHERE quelle_typ = 'zitat_transkript' AND quelle_id = NEW.id;
END;

CREATE TRIGGER abl_zitat_ad AFTER DELETE ON zitat
BEGIN
  -- persona.zitat_id verweist per ON DELETE CASCADE, aussage_zitat.zitat_id ebenso (0002_kern.sql)
  -- - beides ohne Bezug zu suche_fts. Die zitat_transkript-FTS-Zeile kennt keinen Fremdschlüssel.
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', rowid, '', '', '', '', ${zitatTranskriptFtsSql('OLD')}
    FROM suche_fts_quelle WHERE quelle_typ = 'zitat_transkript' AND quelle_id = OLD.id;
  DELETE FROM suche_fts_quelle WHERE quelle_typ = 'zitat_transkript' AND quelle_id = OLD.id;
END;`
}

/** Der vollständige `abl_*`-Triggerblock, wortgleich bei jedem Aufruf (reine Funktion der Bausteine oben). */
export function generierterTriggerBlock(): string {
  return [ablPersonTrigger(), ablNameTrigger(), ablAussageTrigger(), ablOrtsnameTrigger(), ablZitatTrigger()].join(
    '\n\n',
  )
}

/** Ersetzt den Text zwischen den Markierungskommentaren durch `block` (inklusive der Marker selbst). */
export function zwischenMarkierungenErsetzen(inhalt: string, block: string): string {
  const anfangIndex = inhalt.indexOf(MARKER_ANFANG)
  const endeIndex = inhalt.indexOf(MARKER_ENDE)
  if (anfangIndex === -1 || endeIndex === -1 || endeIndex < anfangIndex) {
    throw new Error(`Markierungskommentare "${MARKER_ANFANG}"/"${MARKER_ENDE}" nicht gefunden oder in falscher Reihenfolge.`)
  }
  const vorher = inhalt.slice(0, anfangIndex)
  const nachher = inhalt.slice(endeIndex + MARKER_ENDE.length)
  return `${vorher}${MARKER_ANFANG}\n${block}\n${MARKER_ENDE}${nachher}`
}

const ZIEL_DATEI = join('docs', 'schema', '0003_abgeleitet.sql')

/** Schreibt den generierten Triggerblock in `docs/schema/0003_abgeleitet.sql` (CLI-Kern, testbar). */
export function triggerGenerieren(zielPfad: string = ZIEL_DATEI): void {
  const bisheriger = readFileSync(zielPfad, 'utf8')
  const neuer = zwischenMarkierungenErsetzen(bisheriger, generierterTriggerBlock())
  writeFileSync(zielPfad, neuer, 'utf8')
}

// ---------------------------------------------------------------------------------------------
// jrn_*-Journal-Trigger (AP-0.8, 55_Architektur.md §4.2-§4.4, ADR-017)
// ---------------------------------------------------------------------------------------------

const JOURNAL_TRANSAKTION_ID_SQL = '(SELECT transaktion_id FROM journal_kontext WHERE id = 1)'
const JOURNAL_AKTIV_BEDINGUNG = '(SELECT aktiv FROM journal_kontext WHERE id = 1) = 1'
const JOURNAL_REIHENFOLGE_SQL = `(SELECT COALESCE(MAX(reihenfolge), 0) + 1 FROM aenderung WHERE transaktion_id = ${JOURNAL_TRANSAKTION_ID_SQL})`
const JOURNAL_AENDERUNG_SPALTEN =
  'id, transaktion_id, reihenfolge, tabelle, datensatz_id, wert_alt_json, wert_neu_json, operation'

/**
 * `aenderung.datensatz_id` aus den Primärschlüsselspalten einer Zeile (D-2, AP-0.8 Planungsnotiz).
 * Bei genau einer PK-Spalte deren Wert unverändert; bei mehreren Spalten (`ort_externe_id`,
 * `partnerschaft_person`, `aussage_zitat`, `medium_zuordnung`) werden die Werte mit `|` verknüpft,
 * in der Reihenfolge von `PRAGMA table_info` (aufsteigendes `pk`-Feld). AP-0.10 (Undo) muss diese
 * Regel kennen, um `datensatz_id` wieder in die einzelnen PK-Werte zu zerlegen.
 */
function datensatzIdSql(praefix: 'NEW' | 'OLD', pkSpalten: readonly string[]): string {
  if (pkSpalten.length === 0) {
    throw new Error('jrnTriggerFuerTabelle: Tabelle ohne Primärschlüsselspalte kann nicht journalisiert werden.')
  }
  return pkSpalten.map((spalte) => `${praefix}.${spalte}`).join(" || '|' || ")
}

/** `json_object('spalte1', PRAEFIX.spalte1, …)` über alle Spalten, in `PRAGMA table_info`-Reihenfolge. */
function jsonObjectSql(praefix: 'NEW' | 'OLD', spalten: readonly string[]): string {
  return `json_object(${spalten.map((spalte) => `'${spalte}', ${praefix}.${spalte}`).join(', ')})`
}

/**
 * Erzeugt die drei `jrn_*`-Trigger (INSERT/UPDATE/DELETE) für eine journalisierte Tabelle
 * (55_Architektur.md §4.3-Vorlage, ADR-017). Reine Funktion: Tabellenname, Spaltenliste
 * (`PRAGMA table_info`-cid-Reihenfolge) und Primärschlüsselspalten (`pk`-Feld-Reihenfolge) sind
 * Eingaben, kein Datenbankzugriff hier - das übernimmt `generierterJournalTriggerBlock()`.
 * `datensatz_id` kommt beim INSERT-Trigger aus `NEW`, bei UPDATE/DELETE aus `OLD`
 * (55_Architektur.md §4.3-Beispiel).
 */
export function jrnTriggerFuerTabelle(tabelle: string, spalten: readonly string[], pkSpalten: readonly string[]): string {
  const datensatzIdNeu = datensatzIdSql('NEW', pkSpalten)
  const datensatzIdAlt = datensatzIdSql('OLD', pkSpalten)
  const jsonNeu = jsonObjectSql('NEW', spalten)
  const jsonAlt = jsonObjectSql('OLD', spalten)

  return `CREATE TRIGGER jrn_${tabelle}_ai AFTER INSERT ON ${tabelle}
WHEN ${JOURNAL_AKTIV_BEDINGUNG}
BEGIN
  INSERT INTO aenderung (${JOURNAL_AENDERUNG_SPALTEN})
  VALUES (uuid7(), ${JOURNAL_TRANSAKTION_ID_SQL}, ${JOURNAL_REIHENFOLGE_SQL}, '${tabelle}', ${datensatzIdNeu}, NULL, ${jsonNeu}, 'insert');
END;

CREATE TRIGGER jrn_${tabelle}_au AFTER UPDATE ON ${tabelle}
WHEN ${JOURNAL_AKTIV_BEDINGUNG}
BEGIN
  INSERT INTO aenderung (${JOURNAL_AENDERUNG_SPALTEN})
  VALUES (uuid7(), ${JOURNAL_TRANSAKTION_ID_SQL}, ${JOURNAL_REIHENFOLGE_SQL}, '${tabelle}', ${datensatzIdAlt}, ${jsonAlt}, ${jsonNeu}, 'update');
END;

CREATE TRIGGER jrn_${tabelle}_ad AFTER DELETE ON ${tabelle}
WHEN ${JOURNAL_AKTIV_BEDINGUNG}
BEGIN
  INSERT INTO aenderung (${JOURNAL_AENDERUNG_SPALTEN})
  VALUES (uuid7(), ${JOURNAL_TRANSAKTION_ID_SQL}, ${JOURNAL_REIHENFOLGE_SQL}, '${tabelle}', ${datensatzIdAlt}, ${jsonAlt}, NULL, 'delete');
END;`
}

interface TabelleInfoZeile {
  readonly cid: number
  readonly name: string
  readonly pk: number
}

/** Spalten (cid-Reihenfolge) und Primärschlüsselspalten (pk-Reihenfolge) einer Tabelle. `tabelle` kommt ausschließlich aus `JOURNALISIERT`, nie aus einer Nutzereingabe - PRAGMA erlaubt ohnehin kein Parameter-Binding auf Bezeichner. */
function spaltenUndPrimaerschluessel(
  db: Database.Database,
  tabelle: string,
): { readonly spalten: readonly string[]; readonly pkSpalten: readonly string[] } {
  const zeilen = db.prepare<[], TabelleInfoZeile>(`PRAGMA table_info(${tabelle})`).all()
  const spalten = zeilen
    .slice()
    .sort((a, b) => a.cid - b.cid)
    .map((zeile) => zeile.name)
  const pkSpalten = zeilen
    .filter((zeile) => zeile.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((zeile) => zeile.name)
  return { spalten, pkSpalten }
}

/**
 * Der vollständige `jrn_*`-Triggerblock über alle Tabellen aus `JOURNALISIERT` (alphabetisch
 * sortiert, für Reproduzierbarkeit unabhängig von einer künftigen Umsortierung der Konstante).
 * Öffnet eine frische In-Memory-Datenbank und migriert sie (analog `skripte/schema-dump.ts`) - nur
 * um `PRAGMA table_info` je Tabelle zu lesen; `CREATE TRIGGER` ist reine DDL, dafür müssen `uuid7`
 * & Co. zum Erzeugungszeitpunkt nicht als SQL-Funktion registriert sein.
 */
export function generierterJournalTriggerBlock(): string {
  const db = new Database(':memory:')
  try {
    migrieren(db)
    return JOURNALISIERT.slice()
      .sort((a, b) => a.localeCompare(b))
      .map((tabelle) => {
        const { spalten, pkSpalten } = spaltenUndPrimaerschluessel(db, tabelle)
        return jrnTriggerFuerTabelle(tabelle, spalten, pkSpalten)
      })
      .join('\n\n')
  } finally {
    db.close()
  }
}

const JRN_ZIEL_DATEI = join('docs', 'schema', 'trigger_generiert.sql')

const JRN_KOPF_KOMMENTAR = `-- Erzeugt von \`pnpm trigger\` (skripte/trigger-generieren.ts) — NICHT von Hand ändern.
-- jrn_*-Journal-Trigger je journalisierter Tabelle (55_Architektur.md §4.2-§4.4, ADR-017,
-- AP-0.8), Tabellenliste aus src/main/journal/journalisierung.ts (JOURNALISIERT).
-- Angewendet von src/main/datenbank/journal-trigger-anwenden.ts nach jeder abgeschlossenen
-- Migrationsschleife (src/main/datenbank/migration/laeufer.ts) - diese Datei ist selbst KEINE
-- Migration (keine Prüfsummen-Registrierung in registrierung.ts) und trägt deshalb keine
-- "00NN_"-Nummer.`

/** Schreibt den vollständigen `jrn_*`-Triggerblock nach `docs/schema/trigger_generiert.sql` (CLI-Kern, testbar). */
export function jrnTriggerDateiSchreiben(zielPfad: string = JRN_ZIEL_DATEI): void {
  const inhalt = `${JRN_KOPF_KOMMENTAR}\n\n${generierterJournalTriggerBlock()}\n`
  writeFileSync(zielPfad, inhalt, 'utf8')
}

// CLI-Einstieg, analog zu skripte/schema-dump.ts / skripte/fixture-datenbank-bauen.ts.
const direktAufgerufen = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (direktAufgerufen) {
  triggerGenerieren()
  jrnTriggerDateiSchreiben()
  console.log(`Generierter Triggerblock geschrieben: ${ZIEL_DATEI}`)
  console.log(`Generierte Journal-Trigger geschrieben: ${JRN_ZIEL_DATEI}`)
}
