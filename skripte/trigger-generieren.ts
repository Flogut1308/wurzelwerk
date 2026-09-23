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
import type Database from 'better-sqlite3'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { oeffnen } from '../src/main/datenbank/verbindung'
import {
  nameFtsNormalformSql,
  nameFtsOriginalSql,
  nameFtsUmschriftSql,
  namePhonetikCodeSql,
  personFlachNamensSpaltenSetSql,
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
 * AP-1.33 (Perf): Aktualisiert NUR die drei namensabgeleiteten `person_flach`-Spalten
 * (`anzeigename`/`sortier_nachname`/`sortier_vornamen`) der von `personIdFilterSql` beschriebenen
 * Personen — statt `person_flach` per DELETE + voller Projektion (mit aussage-/ortsname-JOINs)
 * neu zu bauen. Die `person_flach`-Zeile existiert zu diesem Zeitpunkt bereits (`abl_person_ai`
 * legt sie beim Person-Insert an); eine Namensänderung berührt keine der übrigen Spalten, darum
 * ein gezieltes UPDATE (bitgleich zur vollen Projektion: `personFlachNamensSpaltenSetSql`).
 */
function personFlachNamensSpaltenAktualisierenSql(personIdFilterSql: string): string {
  return `  UPDATE person_flach SET\n    ${personFlachNamensSpaltenSetSql('person_flach.person_id')}\n  WHERE person_id IN (${personIdFilterSql});`
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
    `    FROM name_form ziel JOIN suche_fts_quelle q ON q.quelle_typ = 'name' AND q.quelle_id = ziel.id`,
    `    WHERE ${wennSql} AND ziel.id = ${zielIdSql};`,
    `  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)`,
    `    SELECT q.rowid, ${nameFtsSpaltenwerteLiveSql('ziel')}`,
    `    FROM name_form ziel JOIN suche_fts_quelle q ON q.quelle_typ = 'name' AND q.quelle_id = ziel.id`,
    `    WHERE ${wennSql} AND ziel.id = ${zielIdSql};`,
  ].join('\n')
}

/**
 * `abl_name_form_*` (AP-1.33): die Namensform trägt `original_text`, `umschrift_von` und die
 * Person-Bindung. Vor-/Nachname für `person_flach`/`suche_fts.normalform` werden aus den
 * zugehörigen `name_part`-Zeilen rekonstruiert (nameFtsNormalformSql / personFlachProjektionSql).
 * Die `name_phonetik`-Pflege wandert in `abl_name_part_*` (Phonetik hängt am Nachnamens-Bestandteil).
 * FTS-Normalform-Drift bei einer isolierten `name_part`-Änderung wird über den vollständigen
 * Neuaufbau (src/main/datenbank/trigger.ts) bzw. eine spätere Stufe geschlossen.
 */
function ablNameFormTrigger(): string {
  return `CREATE TRIGGER abl_name_form_ai AFTER INSERT ON name_form
BEGIN
${personFlachNamensSpaltenAktualisierenSql('NEW.person_id')}
  INSERT INTO suche_fts_quelle (quelle_typ, quelle_id) VALUES ('name', NEW.id);
  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    VALUES (last_insert_rowid(), ${nameFtsSpaltenwerteLiveSql('NEW')});
  -- Fan-out: diese Form ist selbst die Umschrift einer anderen - deren FTS-Zeile auffrischen.
${zielFtsAuffrischenSql(
    'NEW.umschrift_von',
    'NEW.umschrift_von IS NOT NULL',
    nameFtsUmschriftSql('ziel.id', { ausschlussIdSql: 'NEW.id' }),
  )}
END;

CREATE TRIGGER abl_name_form_au AFTER UPDATE ON name_form
BEGIN
${personFlachNamensSpaltenAktualisierenSql('OLD.person_id, NEW.person_id')}
  -- Eigene FTS-Zeile: alten Stand löschen, neuen einfügen (Umschrift/Normalform live).
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', rowid, ${nameFtsSpaltenwerteLiveSql('OLD')}
    FROM suche_fts_quelle WHERE quelle_typ = 'name' AND quelle_id = OLD.id;
  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)
    SELECT rowid, ${nameFtsSpaltenwerteLiveSql('NEW')}
    FROM suche_fts_quelle WHERE quelle_typ = 'name' AND quelle_id = NEW.id;
${zielFtsAuffrischenSql(
    'OLD.umschrift_von',
    'OLD.umschrift_von IS NOT NULL',
    nameFtsUmschriftSql('ziel.id', {
      ausschlussIdSql: 'NEW.id',
      virtuellerKandidat: { idSql: 'OLD.id', originalTextSql: 'OLD.original_text' },
    }),
  )}
${zielFtsAuffrischenSql(
    'NEW.umschrift_von',
    "NEW.umschrift_von IS NOT NULL AND NEW.umschrift_von IS NOT OLD.umschrift_von",
    nameFtsUmschriftSql('ziel.id', { ausschlussIdSql: 'NEW.id' }),
  )}
END;

CREATE TRIGGER abl_name_form_bd BEFORE DELETE ON name_form
BEGIN
  -- Eigene FTS-Zeile in BEFORE DELETE abräumen (die name_part-Zeilen dieser Form existieren hier
  -- noch, die Normalform-Rekonstruktion liefert also den zuletzt indizierten Wert). Grund für
  -- BEFORE statt AFTER wie beim alten abl_name_bd: umschrift_von REFERENCES name_form(id) ON DELETE
  -- SET NULL würde einen Umschrift-Geschwisterbezug sonst vor dem AFTER-Trigger kappen.
  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)
    SELECT 'delete', rowid, ${nameFtsSpaltenwerteLiveSql('OLD')}
    FROM suche_fts_quelle WHERE quelle_typ = 'name' AND quelle_id = OLD.id;
  DELETE FROM suche_fts_quelle WHERE quelle_typ = 'name' AND quelle_id = OLD.id;
END;

CREATE TRIGGER abl_name_form_ad AFTER DELETE ON name_form
BEGIN
${personFlachNamensSpaltenAktualisierenSql('OLD.person_id')}
  -- name_part (und via CASCADE name_phonetik) räumen sich über ON DELETE CASCADE selbst ab; die
  -- eigene suche_fts-Zeile ist bereits in abl_name_form_bd abgeräumt.
${zielFtsAuffrischenSql(
    'OLD.umschrift_von',
    'OLD.umschrift_von IS NOT NULL',
    nameFtsUmschriftSql('ziel.id', { virtuellerKandidat: { idSql: 'OLD.id', originalTextSql: 'OLD.original_text' } }),
  )}
END;`
}

/**
 * Rekonstruiert einen Teil-`group_concat(wert, ' ')` über eine EXPLIZIT angegebene Zeilenquelle statt
 * über die Live-`name_part`-Tabelle. Gebraucht in den `abl_name_part_*`-Triggern für die VORHER-
 * Normalform: die Live-Zeilen tragen dort bereits den Nachher-Zustand, der für den `'delete'`-
 * Sonderbefehl der contentless-FTS5-Tabelle nötige Vorher-Wert muss also rechnerisch gebildet werden.
 * `zeilenSql` liefert die Spalten `wert` und `sortier_index` (die Ordnung entscheidet die Reihenfolge).
 */
function teilConcatAusQuelleSql(zeilenSql: string): string {
  return `(SELECT group_concat(wert, ' ') FROM (SELECT wert FROM (${zeilenSql}) ORDER BY sortier_index))`
}

/**
 * `suche_fts.normalform` einer Form aus EXPLIZITEN Vor-/Nachnamen-Zeilenquellen (statt Live). Sonst
 * identisch zu `nameFtsNormalformSql` — dieselbe COALESCE(original_text, TRIM(vornamen ' ' nachname))-
 * Regel, damit VORHER-Rekonstruktion und Live-Neuberechnung bitgleich zusammenpassen.
 */
function formNormalformAusQuelleSql(formAlias: string, vornamenQuelleSql: string, nachnameQuelleSql: string): string {
  return (
    `suchnormalform(COALESCE(${formAlias}.original_text, ` +
    `TRIM(COALESCE(${teilConcatAusQuelleSql(vornamenQuelleSql)}, '') || ' ' || COALESCE(${teilConcatAusQuelleSql(nachnameQuelleSql)}, ''))))`
  )
}

/**
 * FTS-Auffrischung der von einer `name_part`-Änderung betroffenen Form(en): eigene `suche_fts`-Zeile
 * mit VORHER-Werten löschen (contentless FTS5 verlangt den exakten alten Inhalt), mit Live-Werten neu
 * einfügen. `original`/`umschrift` hängen nicht an `name_part` (unverändert -> Live = alt); nur die aus
 * den Bestandteilen rekonstruierte `normalform` driftet. `affectedFilterSql` wählt die Form(en) über den
 * Alias `nf`; `vornamenVorherSql`/`nachnameVorherSql` liefern die Zeilenquelle des VORHER-Zustands.
 * Existiert die Form nicht mehr (z. B. `name_part`-CASCADE beim Löschen der Form, deren eigene FTS-Zeile
 * schon `abl_name_form_bd` abgeräumt hat), liefert der JOIN keine Zeile — der Block ist dann ein No-op.
 */
function namePartFtsAuffrischenSql(affectedFilterSql: string, vornamenVorherSql: string, nachnameVorherSql: string): string {
  return [
    `  INSERT INTO suche_fts (suche_fts, rowid, original, umschrift, normalform, notiz, transkript)`,
    `    SELECT 'delete', q.rowid, ${nameFtsOriginalSql('nf')}, ${nameFtsUmschriftSql('nf.id')}, ${formNormalformAusQuelleSql('nf', vornamenVorherSql, nachnameVorherSql)}, '', ''`,
    `    FROM name_form nf JOIN suche_fts_quelle q ON q.quelle_typ = 'name' AND q.quelle_id = nf.id`,
    `    WHERE ${affectedFilterSql};`,
    `  INSERT INTO suche_fts (rowid, original, umschrift, normalform, notiz, transkript)`,
    `    SELECT q.rowid, ${nameFtsOriginalSql('nf')}, ${nameFtsUmschriftSql('nf.id')}, ${nameFtsNormalformSql('nf')}, '', ''`,
    `    FROM name_form nf JOIN suche_fts_quelle q ON q.quelle_typ = 'name' AND q.quelle_id = nf.id`,
    `    WHERE ${affectedFilterSql};`,
  ].join('\n')
}

/** Live-Zeilenquelle (`wert`, `sortier_index`) der Bestandteile einer Art (`vorname`/`nachname`) einer Form `nf`. */
function partLiveQuelleSql(art: 'vorname' | 'nachname'): string {
  return `SELECT wert, sortier_index FROM name_part WHERE name_form_id = nf.id AND art = '${art}'`
}

/**
 * `abl_name_part_*` (AP-1.33): ein Bestandteil bestimmt die aus `name_part` rekonstruierten Vor-/
 * Nachnamen der besitzenden Person (person_flach), deren `suche_fts.normalform` (die Form-Zeile trägt
 * die aus den Bestandteilen rekonstruierte Normalform, sofern `original_text IS NULL`) und - für
 * `art='nachname'` - deren `name_phonetik`. Die betroffene Person/Form ergibt sich über name_part ->
 * name_form (-> person). Die VORHER-Normalform (für den FTS-`'delete'`) wird aus einer expliziten
 * Zeilenquelle gebildet, weil die Live-`name_part`-Zeilen schon den Nachher-Zustand tragen:
 *   - INSERT: Live OHNE die neue Zeile (`id <> NEW.id`).
 *   - UPDATE: Live OHNE die neue Zeile, VEREINT mit der alten Zeile (falls sie zu dieser Form gehörte).
 *   - DELETE: Live (die Zeile ist schon weg), VEREINT mit der gelöschten Zeile.
 */
function ablNamePartTrigger(): string {
  const besitzerPerson = (nameFormIdSql: string): string =>
    `SELECT nf.person_id FROM name_form nf WHERE nf.id IN (${nameFormIdSql})`

  // VORHER-Zeilenquellen je Trigger. Der virtuelle „alte" Datensatz (SELECT ohne FROM + WHERE) zählt
  // nur, wenn er zu der gerade betrachteten Form `nf` gehörte (`OLD.name_form_id = nf.id`).
  const altVirtuell = (art: 'vorname' | 'nachname'): string =>
    `SELECT OLD.wert AS wert, OLD.sortier_index AS sortier_index WHERE OLD.art = '${art}' AND OLD.name_form_id = nf.id`
  const vorherAi = (art: 'vorname' | 'nachname'): string =>
    `SELECT wert, sortier_index FROM name_part WHERE name_form_id = nf.id AND art = '${art}' AND id <> NEW.id`
  const vorherAu = (art: 'vorname' | 'nachname'): string =>
    `SELECT wert, sortier_index FROM name_part WHERE name_form_id = nf.id AND art = '${art}' AND id <> NEW.id UNION ALL ${altVirtuell(art)}`
  const vorherAd = (art: 'vorname' | 'nachname'): string =>
    `${partLiveQuelleSql(art)} UNION ALL ${altVirtuell(art)}`

  return `CREATE TRIGGER abl_name_part_ai AFTER INSERT ON name_part
BEGIN
${personFlachNamensSpaltenAktualisierenSql(besitzerPerson('NEW.name_form_id'))}
${namePartFtsAuffrischenSql('nf.id = NEW.name_form_id', vorherAi('vorname'), vorherAi('nachname'))}
  INSERT INTO name_phonetik (name_id, verfahren, code)
    SELECT NEW.id, 'koelner', ${namePhonetikCodeSql('NEW')}
    WHERE NEW.art = 'nachname' AND NEW.wert <> '';
END;

CREATE TRIGGER abl_name_part_au AFTER UPDATE ON name_part
BEGIN
${personFlachNamensSpaltenAktualisierenSql(besitzerPerson('OLD.name_form_id, NEW.name_form_id'))}
${namePartFtsAuffrischenSql('nf.id IN (OLD.name_form_id, NEW.name_form_id)', vorherAu('vorname'), vorherAu('nachname'))}
  DELETE FROM name_phonetik WHERE name_id = NEW.id AND verfahren = 'koelner';
  INSERT INTO name_phonetik (name_id, verfahren, code)
    SELECT NEW.id, 'koelner', ${namePhonetikCodeSql('NEW')}
    WHERE NEW.art = 'nachname' AND NEW.wert <> '';
END;

CREATE TRIGGER abl_name_part_ad AFTER DELETE ON name_part
BEGIN
${personFlachNamensSpaltenAktualisierenSql(besitzerPerson('OLD.name_form_id'))}
${namePartFtsAuffrischenSql('nf.id = OLD.name_form_id', vorherAd('vorname'), vorherAd('nachname'))}
  -- name_phonetik räumt sich über ON DELETE CASCADE (FK auf name_part) selbst ab.
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

/**
 * Alle vom Block erzeugten `abl_*`-Trigger, in Erzeugungsreihenfolge - Grundlage der
 * `DROP TRIGGER IF EXISTS`-Präambel (s. u.).
 */
const ABL_TRIGGER_NAMEN = [
  'abl_person_ai',
  'abl_person_au',
  'abl_person_ad',
  'abl_name_form_ai',
  'abl_name_form_au',
  'abl_name_form_bd',
  'abl_name_form_ad',
  'abl_name_part_ai',
  'abl_name_part_au',
  'abl_name_part_ad',
  'abl_aussage_ai',
  'abl_aussage_au',
  'abl_aussage_ad',
  'abl_ortsname_ai',
  'abl_ortsname_au',
  'abl_ortsname_ad',
  'abl_zitat_ai',
  'abl_zitat_au',
  'abl_zitat_ad',
] as const

/**
 * Der vollständige `abl_*`-Triggerblock, wortgleich bei jedem Aufruf (reine Funktion der Bausteine
 * oben). Seit AP-1.33 wird er in die JÜNGSTE Migration (`docs/schema/0006_namensformen.sql`)
 * geschrieben, nicht mehr in `0003_abgeleitet.sql` (die eingefrorene, prüfsummen-registrierte
 * Migration darf nicht mehr regeneriert werden). Die `DROP TRIGGER IF EXISTS`-Präambel ersetzt die
 * in `0003` bereits angelegten `abl_person_*`/`abl_aussage_*`/`abl_ortsname_*`/`abl_zitat_*`-Trigger
 * (deren Rümpfe noch das entfernte `name` lesen); `abl_name_*` sind schon durch `DROP TABLE name`
 * in `0006` verschwunden, `abl_name_form_*`/`abl_name_part_*` sind neu.
 */
export function generierterTriggerBlock(): string {
  const praeambel = ABL_TRIGGER_NAMEN.map((name) => `DROP TRIGGER IF EXISTS ${name};`).join('\n')
  return [
    praeambel,
    ablPersonTrigger(),
    ablNameFormTrigger(),
    ablNamePartTrigger(),
    ablAussageTrigger(),
    ablOrtsnameTrigger(),
    ablZitatTrigger(),
  ].join('\n\n')
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

// AP-1.33 (Entscheidung B): Der abl-Block wandert in die JÜNGSTE Migration. `0003_abgeleitet.sql`
// ist eingefroren/prüfsummen-registriert (CLAUDE.md §6) und wird NIE wieder regeneriert - sein
// abl-Block bleibt als historischer Stand stehen, wird aber in `0006` per DROP/CREATE ersetzt.
const ZIEL_DATEI = join('docs', 'schema', '0006_namensformen.sql')

/** Schreibt den generierten Triggerblock in `docs/schema/0006_namensformen.sql` (CLI-Kern, testbar). */
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
 * Öffnet eine frische In-Memory-Datenbank über `oeffnen()` (registriert `uuid7`/`suchnormalform`/
 * `koelner_phonetik`) und migriert sie. Seit Migration 0006 (AP-1.33) ruft eine Migration diese
 * SQL-Funktionen bereits zur Kompilierzeit ihrer Datenumzugs-Statements auf - eine nackte
 * `new Database(':memory:')` ohne registrierte Funktionen scheitert daran mit "no such function".
 */
export function generierterJournalTriggerBlock(): string {
  const db = oeffnen(':memory:')
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
