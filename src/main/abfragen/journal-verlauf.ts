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

/** Der gemeinsame Schluss beider Fassungen: Anzahl + Gesundheitsmerker je ausgewählter Transaktion. */
const AUSGABE = `
  SELECT auswahl.id, auswahl.zeitpunkt, auswahl.art, auswahl.status, auswahl.beschreibung,
         auswahl.rueckgaengig_moeglich,
         COALESCE(zahl.anzahl, 0) AS anzahl,
         COALESCE(zahl.anzahl > 0 AND zahl.anzahl = zahl.gesundheit, 0) AS nur_gesundheit
  FROM auswahl LEFT JOIN zahl ON zahl.tx = auswahl.id
  ORDER BY auswahl.lfd DESC`

/** Ohne Filter (S-16): die letzten `grenze` Transaktionen wie bisher, dazu `anzahl`. `aenderung`
 * hat keinen Index auf `transaktion_id` — EIN Durchlauf über `aenderung`, gefiltert auf die
 * (höchstens `grenze`) ausgewählten Transaktionen. */
export const SQL_ALLE = `
  WITH auswahl AS (
    SELECT id, zeitpunkt, art, status, beschreibung, rueckgaengig_moeglich, lfd
    FROM transaktion
    ORDER BY lfd DESC
    LIMIT @grenze
  ),
  zahl AS (
    SELECT transaktion_id AS tx, COUNT(*) AS anzahl, SUM(tabelle IN (${GESUNDHEIT_LISTE})) AS gesundheit
    FROM aenderung
    WHERE transaktion_id IN (SELECT id FROM auswahl)
    GROUP BY transaktion_id
  )${AUSGABE}`

function baueSqlPerson(): string {
  const treffer: (readonly [string, string])[] = []
  const verweise: (readonly [string, string])[] = []
  const heutigeAnker: string[] = []
  for (const [tabelle, bezug] of Object.entries(PERSONENBEZUG)) {
    if (bezug === undefined) continue
    const trefferSql = trefferAusdruck(bezug)
    if (trefferSql !== null) treffer.push([tabelle, trefferSql])
    const verweisSql = verweisAusdruck(bezug)
    if (verweisSql !== null) verweise.push([tabelle, verweisSql])
    if (bezug.art !== 'ueber' && bezug.anker !== undefined) {
      const heute = heutigerAnker(tabelle, bezug, bezug.anker)
      if (heute !== null) heutigeAnker.push(heute)
    }
  }

  // `z` liest `aenderung` GENAU EINMAL (MATERIALIZED) und trägt je Zeile nur, was danach gebraucht
  // wird: Transaktion, Tabelle, Treffer (+ bereitgestellter Anker), Verweis auf einen Anker.
  // `betroffen` ist ein UNION — jede Transaktions-ID genau einmal —, `auswahl` verbindet über den
  // Primärschlüssel `transaktion.id` (kein korreliertes EXISTS je Transaktion). Der letzte Zweig von
  // `betroffen` deckt den Großimport ohne Journal ab (ADR-019): dessen Herkunft steht nur in der
  // heutigen `import_herkunft`.
  return `
  WITH z AS MATERIALIZED (
    SELECT a.transaktion_id AS tx,
           a.tabelle AS tabelle,
           ${fallAusdruck(treffer)} AS treffer,
           ${fallAusdruck(verweise)} AS verweis
    FROM aenderung a
  ),
  anker(schluessel) AS (
    SELECT treffer FROM z WHERE treffer <> ''
    ${heutigeAnker.map((teil) => `UNION ${teil}`).join('\n    ')}
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
  zahl AS (
    SELECT tx, COUNT(*) AS anzahl, SUM(tabelle IN (${GESUNDHEIT_LISTE})) AS gesundheit
    FROM z
    WHERE tx IN (SELECT id FROM auswahl)
    GROUP BY tx
  )${AUSGABE}`
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
