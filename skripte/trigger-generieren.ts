// `pnpm trigger` (AP-0.7, 55_Architektur.md §5.2, §4.4 "Trigger werden erzeugt, nicht
// geschrieben"): erzeugt NUR den `abl_*`-Triggerblock (die zweite Trigger-Familie für abgeleitete
// Daten) und schreibt ihn zwischen den Markierungskommentaren in `docs/schema/0003_abgeleitet.sql`.
// Die `jrn_*`-Journal-Trigger sind AP-0.8 und nicht Teil dieses Skripts.
//
// Jeder Trigger-Body benutzt exakt dieselben SQL-Textbausteine wie
// `src/main/datenbank/trigger.ts` (`alleAbgeleitetenNeuAufbauen`) - beide importieren aus
// `src/main/datenbank/abgeleitet-projektion.ts`. Das ist die Bitgleichheits-Garantie aus dem
// AP-0.7-Auftrag: der einzige Unterschied ist der WHERE-Filter (eine Person vs. alle).
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

CREATE TRIGGER abl_name_ad AFTER DELETE ON name
BEGIN
  DELETE FROM person_flach WHERE person_id = OLD.person_id;
${personFlachEinfuegenSql('p.id = OLD.person_id')}
  -- name_phonetik räumt sich selbst über ON DELETE CASCADE ab (0002_kern.sql).
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', rowid, ${nameFtsSpaltenwerteLiveSql('OLD')}
    FROM suche_fts_quelle WHERE quelle_typ = 'name' AND quelle_id = OLD.id;
  DELETE FROM suche_fts_quelle WHERE quelle_typ = 'name' AND quelle_id = OLD.id;
  -- Fan-out: OLD war Umschrift-Geschwister eines anderen Originals. OLD existiert zum Zeitpunkt
  -- dieses AFTER-DELETE-Triggers nicht mehr in der Tabelle - der virtuelle Kandidat aus OLD.*
  -- rekonstruiert, was vorher indiziert war (keine Live-Ausschluss-Klausel nötig, OLD ist ja schon weg).
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

// CLI-Einstieg, analog zu skripte/schema-dump.ts / skripte/fixture-datenbank-bauen.ts.
const direktAufgerufen = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (direktAufgerufen) {
  triggerGenerieren()
  console.log(`Generierter Triggerblock geschrieben: ${ZIEL_DATEI}`)
}
