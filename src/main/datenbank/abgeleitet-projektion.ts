// AP-0.7, 55_Architektur.md §5.2: "Trigger UND Neuaufbau nutzen exakt dieselbe Funktion — das ist
// der Schlüssel zur Bitgleichheit." Dieses Modul ist genau diese eine kanonische Projektions-SQL,
// als reine Text-Bausteine ohne eigene Datenbankverbindung. Zwei Verwender bauen daraus SQL:
//
// - `skripte/trigger-generieren.ts` bettet dieselben Textbausteine wortgleich in die `abl_*`-
//   Trigger von `docs/schema/0003_abgeleitet.sql` ein (gefiltert auf die von einem Ereignis
//   betroffene(n) Person(en)/Namen).
// - `src/main/datenbank/trigger.ts` (`alleAbgeleitetenNeuAufbauen`) nutzt dieselben Bausteine für
//   den vollständigen Neuaufbau (ungefiltert, "1 = 1").
//
// Der einzige zulässige Unterschied zwischen beiden Verwendern ist der WHERE-Filter — das ist
// beabsichtigt (der eine berechnet eine Person, der andere alle). Alles andere an SQL-Text ist
// identisch, weil es aus denselben Funktionen hier kommt.

/** Spaltenreihenfolge von `person_flach` (docs/schema/0003_abgeleitet.sql) für INSERT-Statements. */
export const PERSON_FLACH_SPALTEN = [
  'person_id',
  'anzeigename',
  'sortier_nachname',
  'sortier_vornamen',
  'geburt_jahr',
  'geburt_sort_von',
  'geburt_ort_name',
  'tod_jahr',
  'tod_sort_von',
  'konfidenz_min',
  'hat_widerspruch',
] as const

/**
 * Kanonische Projektion für `person_flach` (55_Architektur.md §5.1). `filterSql` ist ein SQL-
 * Boolescher Ausdruck über die Personentabelle `p` — z. B. `"p.id = NEW.person_id"` für einen
 * einzelnen Trigger-Fall, `"p.id IN (SELECT …)"` für einen fan-out (ortsname/aussage-Änderung
 * betrifft mehrere Personen) oder `"1 = 1"` für den vollständigen Neuaufbau.
 *
 * Selbst getroffene Entscheidungen (siehe AP-0.7-Auftrag):
 * - Bevorzugter Namenseintrag/Aussage: `ist_bevorzugt = 1` zuerst, sonst deterministischer
 *   Fallback über die niedrigste `id` (kein "irgendein" im Sinne von unbestimmt — das wäre nicht
 *   bitgleich reproduzierbar).
 * - `geburt_jahr`/`tod_jahr`: bis zum künftigen Datumsparser (AP-0.10, `src/core/ort/zeitbezug.ts`
 *   & Umgebung) ein einfacher Best-Effort: die ersten vier Ziffern von `datum_wert1`, sofern
 *   vorhanden. `geburt_sort_von`/`tod_sort_von` sind ein direkter Durchgriff auf
 *   `aussage.datum_sort_von` (bereits eine sortierbare Ganzzahl, keine Interpretation nötig).
 * - `hat_widerspruch`: pro (subjekt_id, praedikat)-Gruppe gilt eine "Wertrepräsentation" aus
 *   `wert_text`/`wert_zahl`/`wert_ref_id`/`datum_wert1`/`datum_wert2` als unterschiedlich, wenn
 *   mindestens zwei verschiedene Repräsentationen in der Gruppe vorkommen und keine Zeile
 *   `ist_bevorzugt = 1` trägt (E21).
 */
export function personFlachProjektionSql(filterSql: string): string {
  return `SELECT
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
WHERE ${filterSql}`
}

/** `zeile` referenziert eine `name`-Zeile (z. B. `"NEW"`, `"OLD"` oder ein Alias wie `"n"`). */
export function nameFtsOriginalSql(zeile: string): string {
  return `COALESCE(${zeile}.original_text, '')`
}

/** Dieselbe Sortiernormalform wie `person_flach` — hier für die `normalform`-Spalte von `suche_fts`. */
export function nameFtsNormalformSql(zeile: string): string {
  return (
    `suchnormalform(COALESCE(${zeile}.original_text, ` +
    `TRIM(COALESCE(${zeile}.vornamen, '') || ' ' || COALESCE(${zeile}.nachname, ''))))`
  )
}

/** Ein Geschwistereintrag, der (nur) rechnerisch existiert — für die Rekonstruktion eines Vorher-Zustands, den die Zeilentabelle selbst nicht mehr hergibt (siehe `nameFtsUmschriftSql`). */
export interface VirtuellerUmschriftKandidat {
  /** SQL-Ausdruck für die `id` des virtuellen Kandidaten (z. B. `"OLD.id"`). */
  readonly idSql: string
  /** SQL-Ausdruck für den `original_text` des virtuellen Kandidaten (z. B. `"OLD.original_text"`). */
  readonly originalTextSql: string
  /** Optionale Bedingung, unter der der virtuelle Kandidat überhaupt zählt (sonst immer). */
  readonly bedingungSql?: string
}

export interface NameFtsUmschriftOptionen {
  /** Blendet eine bestimmte `name.id` aus der Geschwistersuche aus (z. B. die selbst gerade lebende Zeile). */
  readonly ausschlussIdSql?: string
  /** Siehe `VirtuellerUmschriftKandidat`. */
  readonly virtuellerKandidat?: VirtuellerUmschriftKandidat
}

/**
 * ADR-014: die dritte FTS-Ebene ist die Umschrift eines fremdschriftlichen Originals. `idSql` ist
 * ein SQL-Ausdruck, der die `name.id` liefert, deren Umschrift-Geschwistereintrag gesucht wird
 * (z. B. `"ziel.id"`). Mehrere Geschwister sind möglich (nicht durch UNIQUE ausgeschlossen) — der
 * mit der niedrigsten `id` gewinnt deterministisch.
 *
 * Fan-out-Falle (55_Architektur.md §5.2 "Achtung fan-out"): Bei AFTER-UPDATE/-DELETE-Triggern
 * spiegelt die `name`-Tabelle zum Zeitpunkt der Trigger-Ausführung bereits den NEUEN Stand (bzw.
 * bei DELETE gar keinen Stand mehr für die betroffene Zeile) — eine reine Live-Abfrage kann den
 * VORHER-Zustand für den `'delete'`-Sonderbefehl der contentless-FTS5-Tabelle also nicht mehr
 * liefern. `ausschlussIdSql` blendet die (schon aktualisierte, aber noch mit altem
 * Fremdschlüsselwert live sichtbare) eigene Zeile aus der Geschwistersuche aus;
 * `virtuellerKandidat` fügt einen rechnerischen Geschwistereintrag mit den ALTEN Werten hinzu, für
 * den Fall, dass die echte Zeile (bei DELETE) nicht mehr existiert oder (bei UPDATE) mit neuen
 * Werten weiterlebt.
 */
export function nameFtsUmschriftSql(idSql: string, optionen?: NameFtsUmschriftOptionen): string {
  const ausschluss = optionen?.ausschlussIdSql !== undefined ? ` AND sib.id <> ${optionen.ausschlussIdSql}` : ''
  const geschwister = `SELECT sib.id AS id, sib.original_text AS original_text FROM name sib WHERE sib.umschrift_von = ${idSql}${ausschluss}`
  const virtuellerKandidat = optionen?.virtuellerKandidat
  const kandidaten =
    virtuellerKandidat === undefined
      ? geschwister
      : `${geschwister} UNION ALL SELECT ${virtuellerKandidat.idSql} AS id, ${virtuellerKandidat.originalTextSql} AS original_text` +
        (virtuellerKandidat.bedingungSql !== undefined ? ` WHERE ${virtuellerKandidat.bedingungSql}` : '')
  return `COALESCE((SELECT original_text FROM (${kandidaten}) ORDER BY id ASC LIMIT 1), '')`
}

/** `zeile` referenziert eine `name`-Zeile. Kein Code für Namen ohne Nachnamen (siehe Trigger-Body: dort ausgelassen). */
export function namePhonetikCodeSql(zeile: string): string {
  return `koelner_phonetik(${zeile}.nachname)`
}

/** `zeile` referenziert eine `person`-Zeile. */
export function personNotizFtsSql(zeile: string): string {
  return `COALESCE(${zeile}.notiz, '')`
}

/** `zeile` referenziert eine `zitat`-Zeile. */
export function zitatTranskriptFtsSql(zeile: string): string {
  return `COALESCE(${zeile}.transkript, '')`
}
