// AP-0.10 PR-A2, 55_Architektur.md §2.3/§4.7: `abfrage:journal.verlauf` - rein lesend, öffnet
// KEINE Transaktion (CLAUDE.md §2 gilt für `src/main/befehle/`). Erste Datei unter
// `src/main/abfragen/` (CLAUDE.md §2 Regel 4: `db.prepare` außerhalb von `repositories/` und
// `abfragen/` ist ein Fehler - hier ist es `abfragen/`).
//
// AP-1.30 PR 5: DIE Verlaufsabfrage für die rechte Spalte des Personenprofils (Filter `personId`,
// letzte drei Einträge) und S-16 (AP-1.23, ohne Filter) — keine zweite Verlaufsabfrage
// (docs/arbeitspakete.md AP-1.23, Nachtrag 23.09.2026).
import type Database from 'better-sqlite3'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { TransaktionArt, TransaktionStatus, VerlaufEintrag } from '../../shared/ipc/vertrag'
import { GESUNDHEIT_TABELLEN, PERSONENBEZUG, type Anker, type Personenbezug } from './journal-personenbezug'

const TRANSAKTION_ARTEN: readonly TransaktionArt[] = ['nutzer', 'import', 'merge', 'migration', 'wartung', 'platzhalter_aufgeloest']
const TRANSAKTION_STATUS: readonly TransaktionStatus[] = ['angewendet', 'zurueckgenommen', 'verworfen']

/** Prüft einen rohen `transaktion.art`-Spaltenwert gegen die geschlossene Union (CLAUDE.md §4: kein unbegründetes `as`). */
function alsTransaktionArt(roh: string): TransaktionArt {
  const treffer = TRANSAKTION_ARTEN.find((art) => art === roh)
  if (treffer === undefined) {
    throw new WurzelFehler('INTERN_UNERWARTET', `journalVerlauf(): unbekannte transaktion.art "${roh}".`)
  }
  return treffer
}

/** Prüft einen rohen `transaktion.status`-Spaltenwert gegen die geschlossene Union (s. `alsTransaktionArt`). */
function alsTransaktionStatus(roh: string): TransaktionStatus {
  const treffer = TRANSAKTION_STATUS.find((status) => status === roh)
  if (treffer === undefined) {
    throw new WurzelFehler('INTERN_UNERWARTET', `journalVerlauf(): unbekannter transaktion.status "${roh}".`)
  }
  return treffer
}

interface VerlaufRow {
  readonly id: string
  readonly zeitpunkt: number
  readonly art: string
  readonly status: string
  readonly beschreibung: string | null
  readonly rueckgaengig_moeglich: number
  readonly anzahl: number
  readonly nur_gesundheit: number
}

// ------------------------------------------------------------------------------------------------
// SQL-Erzeugung aus der festen Liste `PERSONENBEZUG` (AP-1.30 PR 5). Zusammengesetzt werden NUR
// Konstanten aus `journal-personenbezug.ts` (Tabellen-/Spaltennamen, Ankerarten) — einmal beim
// Laden des Moduls, nie ein Wert aus einer Anfrage. Werte (`@personId`, `@grenze`) sind benannte
// Parameter (CLAUDE.md §6). `bezeichner()` weist jeden Namen zurück, der kein schlichter
// Kleinbuchstaben-Bezeichner ist — die Liste kann so kein fremdes SQL formen.
//
// Anker werden als EIN Schlüssel `'<ankerart>|<id>'` geführt (IDs sind UUIDs, Ankerarten schlichte
// Bezeichner — beide ohne `|`), damit die Verbindung Verweis → Anker ein einziger Gleichheitsvergleich ist.
// ------------------------------------------------------------------------------------------------

function bezeichner(name: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new WurzelFehler('INTERN_UNERWARTET', `journal-verlauf: ungültiger Bezeichner "${name}" in PERSONENBEZUG.`)
  }
  return name
}

/** Das Zeilenbild der `aenderung`-Zeile (ADR-017): nach insert/update das neue, nach delete das alte. */
const BILD = 'COALESCE(a.wert_neu_json, a.wert_alt_json)'

/** Wert einer Spalte im Zeilenbild. `id` ist bei Tabellen mit `id`-Primärschlüssel gleich
 * `aenderung.datensatz_id` — spart das JSON-Lesen (Tabellen mit zusammengesetztem Schlüssel haben
 * keine `id`-Spalte, s. test/einheit/journal-verlauf-personenbezug.test.ts). */
function bildWert(spalte: string): string {
  return spalte === 'id' ? 'a.datensatz_id' : `json_extract(${BILD}, '$.${bezeichner(spalte)}')`
}

/**
 * Spalte `treffer` einer Zeile: `NULL` = trifft die Person nicht; sonst der Ankerschlüssel, den die
 * Zeile bereitstellt, oder `''`, wenn sie keinen bereitstellt. `instr()` ist ein billiger Vorfilter:
 * ohne die Person-ID im Zeilenbild kann keine Spalte sie tragen — erst dann wird das JSON gelesen.
 */
function trefferAusdruck(bezug: Personenbezug): string | null {
  if (bezug.art === 'ueber') return null
  let bedingung: string
  if (bezug.art === 'spalten') {
    const [erste, ...weitere] = bezug.spalten
    if (weitere.length === 0 && erste === 'id') {
      bedingung = 'a.datensatz_id = @personId'
    } else {
      const vergleich = weitere.length === 0 ? `${bildWert(erste)} = @personId` : `@personId IN (${bezug.spalten.map(bildWert).join(', ')})`
      bedingung = `instr(${BILD}, @personId) > 0 AND ${vergleich}`
    }
  } else {
    bedingung = `instr(${BILD}, @personId) > 0 AND ${bildWert(bezug.typSpalte)} = 'person' AND ${bildWert(bezug.idSpalte)} = @personId`
  }
  const anker = bezug.anker === undefined ? "''" : `COALESCE('${bezeichner(bezug.anker.art)}|' || ${bildWert(bezug.anker.spalte)}, '')`
  return `CASE WHEN ${bedingung} THEN ${anker} END`
}

/**
 * Spalte `verweis` einer mittelbar betroffenen Zeile: der Ankerschlüssel, auf den sie zeigt. Bei
 * `subjekt` wird das JSON nicht gelesen, wenn das Zeilenbild sichtbar `"<typSpalte>":"person"`
 * enthält — ein Personensubjekt ist ein direkter Treffer, kein Verweis. Der Vorfilter kann nur
 * Arbeit sparen, nie einen Verweis unterschlagen: in einem JSON-Text steht `":"` ohne Rückstrich
 * nur zwischen Schlüssel und Wert, nie innerhalb eines Zeichenkettenwerts.
 */
function verweisAusdruck(bezug: Personenbezug): string | null {
  if (bezug.art === 'ueber') return `'${bezeichner(bezug.ankerart)}|' || ${bildWert(bezug.spalte)}`
  if (bezug.art === 'subjekt') {
    return `CASE WHEN instr(${BILD}, '"${bezeichner(bezug.typSpalte)}":"person"') = 0 THEN ${bildWert(bezug.typSpalte)} || '|' || ${bildWert(bezug.idSpalte)} END`
  }
  return null
}

/** Ankerschlüssel aus der HEUTIGEN Tabelle — Ersatz, wenn das Journal die Ankerzeile nicht (mehr)
 * enthält: aufgeräumtes Journal, Großimport ohne Journal (ADR-019), Bestand aus einer Migration. */
function heutigerAnker(tabelle: string, bezug: Personenbezug, anker: Anker): string | null {
  let bedingung: string
  if (bezug.art === 'spalten') {
    bedingung = bezug.spalten.map((spalte) => `${bezeichner(spalte)} = @personId`).join(' OR ')
  } else if (bezug.art === 'subjekt') {
    bedingung = `${bezeichner(bezug.typSpalte)} = 'person' AND ${bezeichner(bezug.idSpalte)} = @personId`
  } else {
    return null
  }
  return `SELECT '${bezeichner(anker.art)}|' || ${bezeichner(anker.spalte)} FROM ${bezeichner(tabelle)} WHERE ${bedingung}`
}

function fallAusdruck(zweige: readonly (readonly [string, string])[]): string {
  if (zweige.length === 0) return 'NULL'
  return `CASE a.tabelle ${zweige.map(([tabelle, ausdruck]) => `WHEN '${bezeichner(tabelle)}' THEN ${ausdruck}`).join(' ')} END`
}

const GESUNDHEIT_LISTE = GESUNDHEIT_TABELLEN.map((tabelle) => `'${bezeichner(tabelle)}'`).join(', ')

/** `(tabelle, bezug)` aller Einträge der Liste, einmal geprüft. */
const EINTRAEGE: readonly (readonly [string, Personenbezug])[] = Object.entries(PERSONENBEZUG).flatMap(([tabelle, bezug]) =>
  bezug === undefined ? [] : [[bezeichner(tabelle), bezug] as const],
)

/** Polymorphe Einträge mit Anker (heute: `aussage`) — sie stellen ihren Anker auch bei mittelbarem
 * Treffer bereit (zweite Stufe, s. `bereitAusdruck`). */
const SUBJEKT_MIT_ANKER: readonly { readonly tabelle: string; readonly bezug: Personenbezug; readonly typSpalte: string; readonly anker: Anker }[] =
  EINTRAEGE.flatMap(([tabelle, bezug]) =>
    bezug.art === 'subjekt' && bezug.anker !== undefined ? [{ tabelle, bezug, typSpalte: bezug.typSpalte, anker: bezug.anker }] : [],
  )

/** Spalte `bereit`: der Anker, den eine polymorphe Zeile bereitstellt — unabhängig davon, ob und wie
 * sie die Person trifft. Nur so findet ein Beleg an einer Aussage über ein Ereignis oder eine
 * Diagnose der Person zu ihr (`aussage_zitat` → `aussage` → `beteiligung`/`diagnose`). */
function bereitAusdruck(bezug: Personenbezug): string | null {
  if (bezug.art !== 'subjekt' || bezug.anker === undefined) return null
  return `'${bezeichner(bezug.anker.art)}|' || ${bildWert(bezug.anker.spalte)}`
}

/** Spalte `gesund` (M-08): 1, wenn die Zeile selbst Gesundheitsdatum ist — Zeile einer
 * Gesundheitstabelle oder polymorphe Zeile mit einer Gesundheitstabelle als Subjekttyp. Beide
 * Zeilenbilder zählen (ein geänderter Subjekttyp verbirgt eher zu viel als zu wenig). Zeilen, die
 * erst über einen Anker Gesundheitsdatum sind (`aussage_zitat`), bestimmt `fein` (s. `gesundSchluss`).
 * `instr()` auf `"<typSpalte>":"<tabelle>"` ist der billige Vorfilter (Begründung wie bei
 * `verweisAusdruck`: `":"` ohne Rückstrich steht nur zwischen Schlüssel und Wert) — das JSON wird
 * nur bei einem Vorfiltertreffer gelesen. */
function gesundAusdruck(): string {
  const zweige: (readonly [string, string])[] = []
  for (const [tabelle, bezug] of EINTRAEGE) {
    if (GESUNDHEIT_TABELLEN.some((g) => g === tabelle)) {
      zweige.push([tabelle, '1'])
    } else if (bezug.art === 'subjekt') {
      const typ = bezeichner(bezug.typSpalte)
      const vorfilter = ['a.wert_neu_json', 'a.wert_alt_json']
        .flatMap((bild) => GESUNDHEIT_TABELLEN.map((g) => `instr(${bild}, '"${typ}":"${bezeichner(g)}"') > 0`))
        .join(' OR ')
      const pruefung = ['a.wert_neu_json', 'a.wert_alt_json'].map((bild) => `json_extract(${bild}, '$.${typ}') IN (${GESUNDHEIT_LISTE})`).join(' OR ')
      zweige.push([tabelle, `CASE WHEN ${vorfilter} THEN ${pruefung} END`])
    }
  }
  return `COALESCE(${fallAusdruck(zweige)}, 0)`
}

/** Ankerarten, die eine Gesundheitszeile bereitstellen kann: die der Gesundheitstabellen und die der
 * polymorphen Einträge (deren Subjekt eine Diagnose sein kann). */
const GESUND_ANKERARTEN: ReadonlySet<string> = new Set([
  ...EINTRAEGE.flatMap(([tabelle, bezug]) =>
    GESUNDHEIT_TABELLEN.some((g) => g === tabelle) && bezug.art !== 'ueber' && bezug.anker !== undefined ? [bezug.anker.art] : [],
  ),
  ...SUBJEKT_MIT_ANKER.map(({ anker }) => anker.art),
])

/** Mittelbare Einträge, deren Verweis auf eine Gesundheitszeile zeigen kann (heute: `aussage_zitat`). */
const GESUND_VERWEIS_TABELLEN = EINTRAEGE.flatMap(([tabelle, bezug]) =>
  bezug.art === 'ueber' && GESUND_ANKERARTEN.has(bezug.ankerart) ? [tabelle] : [],
)

/** Anker von Gesundheitszeilen, die HEUTE bestehen (Ersatz für Zeilen ohne Journal, s. `heutigerAnker`). */
const GESUND_ANKER_HEUTE = SUBJEKT_MIT_ANKER.map(
  ({ tabelle, typSpalte, anker }) =>
    `SELECT '${bezeichner(anker.art)}|' || ${bezeichner(anker.spalte)} FROM ${tabelle} WHERE ${bezeichner(typSpalte)} IN (${GESUNDHEIT_LISTE})`,
)

function tabellenListe(tabellen: readonly string[]): string {
  return tabellen.length === 0 ? 'NULL' : tabellen.map((tabelle) => `'${bezeichner(tabelle)}'`).join(', ')
}

/** Tabellen, deren Zeilen Gesundheitsdaten sein KÖNNEN. Eine Transaktion mit einer Zeile außerhalb
 * dieser Liste ist nie „nur Gesundheit“ — für sie wird kein Zeilenbild gelesen (Vorstufe `grob`). */
const GESUND_KANDIDATEN = EINTRAEGE.flatMap(([tabelle, bezug]) =>
  GESUNDHEIT_TABELLEN.some((g) => g === tabelle) || bezug.art === 'subjekt' || GESUND_VERWEIS_TABELLEN.includes(tabelle) ? [tabelle] : [],
)

/**
 * Der gemeinsame Schluss beider Fassungen: Anzahl + Gesundheitsmerker je ausgewählter Transaktion.
 * `zeilen(r, tx, tabelle)` sind die Journalzeilen der ausgewählten Transaktionen (`r` =
 * `aenderung.rowid`), `verweis` der Ausdruck für den Verweis einer Kandidatenzeile (über `q` =
 * `zeilen`, `a` = ihre `aenderung`-Zeile), `bereit(r, bereit)` die Journalzeilen polymorpher
 * Einträge mit ihrem Anker.
 * Zweistufig, damit ein großer Import nicht jedes Zeilenbild liest: `grob` zählt je Transaktion alle
 * Zeilen und die Zeilen aus `GESUND_KANDIDATEN`; nur wo beide gleich sind, liest `fein` die
 * Zeilenbilder (über die rowid, ein Schlüsselzugriff je Zeile; `CROSS JOIN` hält SQLite davon ab,
 * stattdessen `aenderung` ganz zu durchlaufen). `gesund_anker` (Anker von
 * Gesundheitszeilen: Aussage an einer Diagnose) wird nur für die Verweise dieser Transaktionen
 * gebildet.
 */
function gesundSchluss(zeilen: string, verweis: string, bereit: string): string {
  return `
  grob AS (
    SELECT tx, COUNT(*) AS anzahl, SUM(tabelle IN (${tabellenListe(GESUND_KANDIDATEN)})) AS kandidaten
    FROM ${zeilen}
    GROUP BY tx
  ),
  kandidat AS MATERIALIZED (
    SELECT q.r, q.tx, q.tabelle, ${verweis} AS verweis
    FROM ${zeilen} q JOIN grob ON grob.tx = q.tx CROSS JOIN aenderung a ON a.rowid = q.r
    WHERE grob.anzahl = grob.kandidaten
  ),
  gesund_anker(schluessel) AS (
    SELECT b.bereit FROM ${bereit} b CROSS JOIN aenderung a ON a.rowid = b.r
    WHERE b.bereit IN (SELECT verweis FROM kandidat WHERE tabelle IN (${tabellenListe(GESUND_VERWEIS_TABELLEN)}))
      AND ${gesundAusdruck()} = 1
    ${GESUND_ANKER_HEUTE.map((teil) => `UNION ${teil}`).join('\n    ')}
  ),
  fein AS (
    SELECT k.tx,
           SUM(CASE WHEN ${gesundAusdruck()} = 1 THEN 1
                    WHEN k.tabelle IN (${tabellenListe(GESUND_VERWEIS_TABELLEN)}) AND k.verweis IN (SELECT schluessel FROM gesund_anker) THEN 1
                    ELSE 0 END) AS gesundheit
    FROM kandidat k CROSS JOIN aenderung a ON a.rowid = k.r
    GROUP BY k.tx
  ),
  zahl AS (
    SELECT grob.tx, grob.anzahl, COALESCE(fein.gesundheit, 0) AS gesundheit
    FROM grob LEFT JOIN fein ON fein.tx = grob.tx
  )
  SELECT auswahl.id, auswahl.zeitpunkt, auswahl.art, auswahl.status, auswahl.beschreibung,
         auswahl.rueckgaengig_moeglich,
         COALESCE(zahl.anzahl, 0) AS anzahl,
         COALESCE(zahl.anzahl > 0 AND zahl.anzahl = zahl.gesundheit, 0) AS nur_gesundheit
  FROM auswahl LEFT JOIN zahl ON zahl.tx = auswahl.id
  ORDER BY auswahl.lfd DESC`
}

function baueSqlAlle(): string {
  const verweise: (readonly [string, string])[] = []
  for (const [tabelle, bezug] of EINTRAEGE) {
    const verweisSql = GESUND_VERWEIS_TABELLEN.includes(tabelle) ? verweisAusdruck(bezug) : null
    if (verweisSql !== null) verweise.push([tabelle, verweisSql])
  }
  const bereit: (readonly [string, string])[] = []
  for (const { tabelle, bezug } of SUBJEKT_MIT_ANKER) {
    const bereitSql = bereitAusdruck(bezug)
    if (bereitSql !== null) bereit.push([tabelle, bereitSql])
  }
  // `zeilen` liest `aenderung` einmal, gefiltert auf die (höchstens `grenze`) ausgewählten
  // Transaktionen (`aenderung` hat keinen Index auf `transaktion_id`). `bereit` liest das Journal
  // ein zweites Mal — nur, wenn eine „nur Gesundheit“-Kandidatin eine Verweis-Tabelle
  // (`aussage_zitat`) enthält, und JSON nur für die Zeilen, auf die diese verweisen (der Anker einer
  // Aussage ist ihre `id` = `aenderung.datensatz_id`).
  return `
  WITH auswahl AS (
    SELECT id, zeitpunkt, art, status, beschreibung, rueckgaengig_moeglich, lfd
    FROM transaktion
    ORDER BY lfd DESC
    LIMIT @grenze
  ),
  zeilen AS MATERIALIZED (
    SELECT a.rowid AS r, a.transaktion_id AS tx, a.tabelle AS tabelle
    FROM aenderung a
    WHERE a.transaktion_id IN (SELECT id FROM auswahl)
  ),
  bereit AS (
    SELECT a.rowid AS r, ${fallAusdruck(bereit)} AS bereit
    FROM aenderung a
    WHERE a.tabelle IN (${tabellenListe(SUBJEKT_MIT_ANKER.map(({ tabelle }) => tabelle))})
  ),${gesundSchluss('zeilen', fallAusdruck(verweise), 'bereit')}`
}

/** Ohne Filter (S-16): die letzten `grenze` Transaktionen wie bisher, dazu `anzahl`. */
export const SQL_ALLE = baueSqlAlle()

/** Ankerschlüssel der zweiten Stufe aus der HEUTIGEN Tabelle: polymorphe Zeilen (Aussagen), deren
 * Subjekt ein Anker der ersten Stufe ist — über den Index auf `(subjekt_typ, subjekt_id)`. */
function heutigerAnkerZweiteStufe(tabelle: string, bezug: Personenbezug, anker: Anker): string | null {
  if (bezug.art !== 'subjekt') return null
  const trenner = "instr(k.schluessel, '|')"
  return `SELECT '${bezeichner(anker.art)}|' || t.${bezeichner(anker.spalte)} FROM anker_eins k JOIN ${bezeichner(tabelle)} t
      ON t.${bezeichner(bezug.typSpalte)} = substr(k.schluessel, 1, ${trenner} - 1) AND t.${bezeichner(bezug.idSpalte)} = substr(k.schluessel, ${trenner} + 1)`
}

function baueSqlPerson(): string {
  const treffer: (readonly [string, string])[] = []
  const verweise: (readonly [string, string])[] = []
  const bereit: (readonly [string, string])[] = []
  const heutigeAnker: string[] = []
  const heutigeAnkerZwei: string[] = []
  for (const [tabelle, bezug] of EINTRAEGE) {
    const trefferSql = trefferAusdruck(bezug)
    if (trefferSql !== null) treffer.push([tabelle, trefferSql])
    const verweisSql = verweisAusdruck(bezug)
    if (verweisSql !== null) verweise.push([tabelle, verweisSql])
    const bereitSql = bereitAusdruck(bezug)
    if (bereitSql !== null) bereit.push([tabelle, bereitSql])
    if (bezug.art !== 'ueber' && bezug.anker !== undefined) {
      const heute = heutigerAnker(tabelle, bezug, bezug.anker)
      if (heute !== null) heutigeAnker.push(heute)
      const heuteZwei = heutigerAnkerZweiteStufe(tabelle, bezug, bezug.anker)
      if (heuteZwei !== null) heutigeAnkerZwei.push(heuteZwei)
    }
  }

  // `z` ist der einzige Durchlauf über `aenderung` (MATERIALIZED; `fein`/`gesund_anker` greifen
  // danach nur noch über die rowid auf einzelne Zeilen zu). Je Zeile nur, was danach gebraucht wird:
  // rowid, Transaktion, Tabelle, Treffer (+ bereitgestellter Anker), Verweis auf einen Anker, der
  // bei mittelbarem Treffer bereitgestellte Anker. Anker in zwei Stufen: `anker_eins` aus direkten
  // Treffern (+ heutiger Bestand), `anker` zusätzlich die Anker der Zeilen, die auf einen Anker der
  // ersten Stufe verweisen (Aussage über ein Ereignis/eine Diagnose der Person → deren Belege).
  // `betroffen` ist ein UNION — jede Transaktions-ID genau einmal —, `auswahl` verbindet über den
  // Primärschlüssel `transaktion.id` (kein korreliertes EXISTS je Transaktion). Der letzte Zweig von
  // `betroffen` deckt den Großimport ohne Journal ab (ADR-019): dessen Herkunft steht nur in der
  // heutigen `import_herkunft` (ein Durchlauf über diese Tabelle, sie hat keinen Index auf
  // `datensatz_id`; ebenso ein Durchlauf über `transaktion` für `auswahl`).
  return `
  WITH z AS MATERIALIZED (
    SELECT a.rowid AS r,
           a.transaktion_id AS tx,
           a.tabelle AS tabelle,
           ${fallAusdruck(treffer)} AS treffer,
           ${fallAusdruck(verweise)} AS verweis,
           ${fallAusdruck(bereit)} AS bereit
    FROM aenderung a
  ),
  anker_eins(schluessel) AS MATERIALIZED (
    SELECT treffer FROM z WHERE treffer <> ''
    ${heutigeAnker.map((teil) => `UNION ${teil}`).join('\n    ')}
  ),
  anker(schluessel) AS MATERIALIZED (
    SELECT schluessel FROM anker_eins
    UNION
    SELECT z.bereit FROM z JOIN anker_eins ON anker_eins.schluessel = z.verweis WHERE z.bereit IS NOT NULL
    ${heutigeAnkerZwei.map((teil) => `UNION ${teil}`).join('\n    ')}
  ),
  betroffen(id) AS (
    SELECT tx FROM z WHERE treffer IS NOT NULL
    UNION
    SELECT z.tx FROM z JOIN anker ON anker.schluessel = z.verweis
    UNION
    SELECT il.transaktion_id
    FROM import_herkunft ih JOIN import_lauf il ON il.id = ih.import_lauf_id
    WHERE ih.datensatz_typ = 'person' AND ih.datensatz_id = @personId
  ),
  auswahl AS (
    SELECT t.id, t.zeitpunkt, t.art, t.status, t.beschreibung, t.rueckgaengig_moeglich, t.lfd
    FROM betroffen JOIN transaktion t ON t.id = betroffen.id
    ORDER BY t.lfd DESC
    LIMIT @grenze
  ),
  zeilen AS MATERIALIZED (
    SELECT r, tx, tabelle, verweis FROM z WHERE tx IN (SELECT id FROM auswahl)
  ),
  bereit AS (
    SELECT r, bereit FROM z WHERE bereit IS NOT NULL
  ),${gesundSchluss('zeilen', 'q.verweis', 'bereit')}`
}

/** Mit Filter `personId` — einmal beim Laden erzeugt, rein aus Konstanten (s. o.). */
export const SQL_PERSON = baueSqlPerson()

/**
 * `abfrage:journal.verlauf` (AP-0.10, 55_Architektur.md §4.7): die letzten `grenze`
 * `transaktion`-Zeilen, neueste zuerst (`ORDER BY lfd DESC`), Status unverändert (auch
 * `zurueckgenommen`/`verworfen`). Mit `personId` (AP-1.30 PR 5) nur die Transaktionen, die diese
 * Person betreffen — über die feste Liste `PERSONENBEZUG`, aus den Zeilenbildern des Journals
 * (Gelöschtes bleibt sichtbar), ersatzweise aus dem heutigen Bestand. Ein Import ist eine
 * Transaktion und damit EIN Eintrag. Kein Benutzername (ADR-001).
 */
export function journalVerlauf(db: Database.Database, grenze: number, personId?: string): readonly VerlaufEintrag[] {
  const zeilen =
    personId === undefined
      ? db.prepare<{ readonly grenze: number }, VerlaufRow>(SQL_ALLE).all({ grenze })
      : db.prepare<{ readonly grenze: number; readonly personId: string }, VerlaufRow>(SQL_PERSON).all({ grenze, personId })
  return zeilen.map((zeile) => ({
    id: zeile.id,
    zeitpunkt: zeile.zeitpunkt,
    art: alsTransaktionArt(zeile.art),
    status: alsTransaktionStatus(zeile.status),
    // M-08: eine Transaktion nur auf Gesundheitsdaten erscheint ohne jeden Inhalt (Art/Zeit/Anzahl).
    beschreibung: zeile.nur_gesundheit === 1 ? null : zeile.beschreibung,
    rueckgaengigMoeglich: zeile.rueckgaengig_moeglich === 1,
    anzahl: zeile.anzahl,
  }))
}
