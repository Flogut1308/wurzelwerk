// AP-1.30 PR 10-3: gemeinsame Hilfen der Befehlstests für Namensteile (`namensteil.*`,
// `namensform.rufnameSetzen`) — dieselben Prüfmuster wie in `befehl-namensteil.test.ts` (PR 10-2; dort
// lokal definiert und unverändert gelassen): Wächter aus temporären Triggern gegen Doppel-`sortier_index`
// in JEDEM Zwischenzustand, abgeleitete Tabellen = Neuaufbau + `integrity_check`, Undo/Redo bitgleich
// je Schritt. Die Testdatei selbst muss `logger`/`ereignisse` mocken (vi.mock wird je Datei gehoben).
import { expect, vi } from 'vitest'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { alleAbgeleitetenNeuAufbauen } from '../../src/main/datenbank/trigger'
import { fuehreAus } from '../../src/main/befehle/bus'
import { redo, undo } from '../../src/main/journal/undo'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'
import { kanonischerAbzug } from '../hilfsmittel/kanonischer-abzug'
import { sucheFtsInhaltAbzug, verwaisteFtsEintraegeAnzahl } from './_hilfen-abgeleitet'

export type Db = ReturnType<typeof oeffnen>

const START = 1_790_000_000_000
let jetzt = START

/** Feste Uhr (nur `Date`) auf den Startwert — in `beforeEach` aufrufen, `vi.useRealTimers()` in `afterEach`. */
export function uhrStarten(): void {
  vi.useFakeTimers({ toFake: ['Date'] })
  jetzt = START
  vi.setSystemTime(jetzt)
}

export function warte(ms: number): void {
  jetzt += ms
  vi.setSystemTime(jetzt)
}

export function jetztMs(): number {
  return jetzt
}

export function neueTestDatenbank(): Db {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

export function neuePerson(db: Db): string {
  return fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
}

export interface TeilZeile {
  readonly id: string
  readonly art: string
  readonly wert: string
  readonly ist_rufname: number
  readonly sortier_index: number
  readonly feminine_variante: string | null
  readonly erstellt_am: number | null
  readonly geaendert_am: number | null
}

export function teile(db: Db, formId: string, art?: string): readonly TeilZeile[] {
  return db
    .prepare<{ readonly formId: string }, TeilZeile>(
      `SELECT id, art, wert, ist_rufname, sortier_index, feminine_variante, erstellt_am, geaendert_am
       FROM name_part WHERE name_form_id = @formId ORDER BY art, sortier_index, id`,
    )
    .all({ formId })
    .filter((teil) => art === undefined || teil.art === art)
}

export function teil(db: Db, id: string): TeilZeile {
  const zeile = db
    .prepare<{ readonly id: string }, TeilZeile>(
      'SELECT id, art, wert, ist_rufname, sortier_index, feminine_variante, erstellt_am, geaendert_am FROM name_part WHERE id = @id',
    )
    .get({ id })
  if (zeile === undefined) throw new Error(`teil(): kein name_part ${id}.`)
  return zeile
}

/** Kurzform: `wert@sortier_index` (Rufname mit `*`) der Teile einer Art. */
export function folge(db: Db, formId: string, art: string): readonly string[] {
  return teile(db, formId, art).map((t) => `${t.wert}${t.ist_rufname === 1 ? '*' : ''}@${String(t.sortier_index)}`)
}

/** Die IDs der Teile einer Art in Stellenreihenfolge. */
export function ids(db: Db, formId: string, art: string): readonly string[] {
  return teile(db, formId, art).map((t) => t.id)
}

export function teilId(db: Db, formId: string, art: string, wert: string): string {
  const treffer = teile(db, formId, art).find((t) => t.wert === wert)
  if (treffer === undefined) throw new Error(`teilId(): kein Teil ${art} "${wert}" in Form ${formId}.`)
  return treffer.id
}

export function originalText(db: Db, formId: string): string | null | undefined {
  return db.prepare<{ readonly formId: string }, { readonly original_text: string | null }>('SELECT original_text FROM name_form WHERE id = @formId').get({ formId })
    ?.original_text
}

export function zaehle(db: Db, sql: string, parameter: Record<string, string> = {}): number {
  const zeile = db.prepare<Record<string, string>, { readonly anzahl: number }>(sql).get(parameter)
  if (zeile === undefined) throw new Error(`zaehle(): COUNT lieferte keine Zeile (${sql}).`)
  return zeile.anzahl
}

export function transaktionAnzahl(db: Db): number {
  return zaehle(db, 'SELECT COUNT(*) AS anzahl FROM transaktion')
}

export function angewendeteSchritte(db: Db): number {
  return zaehle(db, "SELECT COUNT(*) AS anzahl FROM transaktion WHERE status = 'angewendet'")
}

/** Anzahl der `aenderung`-Zeilen der zuletzt angewendeten Transaktion (Journalschritte eines Befehls). */
export function journalZeilenLetzterSchritt(db: Db): number {
  return zaehle(
    db,
    "SELECT COUNT(*) AS anzahl FROM aenderung WHERE transaktion_id = (SELECT id FROM transaktion WHERE status = 'angewendet' ORDER BY lfd DESC LIMIT 1)",
  )
}

export function fehlerCode(fn: () => void): string | undefined {
  try {
    fn()
    return undefined
  } catch (fehler) {
    return fehler instanceof WurzelFehler ? fehler.code : `KEIN_WURZELFEHLER:${String(fehler)}`
  }
}

export function anzeigename(db: Db, personId: string): string | undefined {
  return db.prepare<{ readonly personId: string }, { readonly anzeigename: string }>('SELECT anzeigename FROM person_flach WHERE person_id = @personId').get({ personId })
    ?.anzeigename
}

interface PersonFlachZeile {
  readonly person_id: string
  readonly anzeigename: string
  readonly sortier_nachname: string | null
  readonly sortier_vornamen: string | null
}

interface PhonetikZeile {
  readonly name_id: string
  readonly verfahren: string
  readonly code: string
}

function abgeleitetAbzug(db: Db): string {
  db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS vocab USING fts5vocab('suche_fts', 'instance')")
  const fts = sucheFtsInhaltAbzug(db)
  const verwaist = verwaisteFtsEintraegeAnzahl(db)
  db.exec('DROP TABLE vocab')
  const flach = db
    .prepare<[], PersonFlachZeile>('SELECT person_id, anzeigename, sortier_nachname, sortier_vornamen FROM person_flach ORDER BY person_id')
    .all()
  const phonetik = db.prepare<[], PhonetikZeile>('SELECT name_id, verfahren, code FROM name_phonetik ORDER BY name_id, verfahren').all()
  return JSON.stringify({ fts, verwaist, flach, phonetik })
}

/** Abgeleitete Tabellen (FTS, person_flach, name_phonetik) gleich ihrem vollständigen Neuaufbau. */
export function erwarteAbgeleitetWieNeuaufbau(db: Db): void {
  const inkrementell = abgeleitetAbzug(db)
  alleAbgeleitetenNeuAufbauen(db)
  expect(inkrementell).toBe(abgeleitetAbzug(db))
  expect(JSON.parse(inkrementell)).toMatchObject({ verwaist: 0 })
  expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
}

export interface DoppelZeile {
  readonly zeitpunkt: string
  readonly name_form_id: string
  readonly art: string
  readonly sortier_index: number
}

/** Wächter über JEDEN Zwischenzustand: temporäre Trigger (nur diese Verbindung, nicht im Schema, nicht
 * im kanonischen Abzug) protokollieren jedes Einfügen/Ändern eines `name_part`, nach dem zwei Teile
 * derselben (Form, Art) denselben `sortier_index` tragen — auch innerhalb eines Befehls, eines Undo oder
 * eines Redo. Ein DELETE kann kein Doppel erzeugen. Idempotent (zweiter Aufruf ist wirkungslos). */
export function doppelWaechterAnlegen(db: Db): void {
  db.exec(`
    CREATE TEMP TABLE IF NOT EXISTS sortier_doppel (zeitpunkt TEXT NOT NULL, name_form_id TEXT NOT NULL, art TEXT NOT NULL, sortier_index INTEGER NOT NULL);
    CREATE TEMP TRIGGER IF NOT EXISTS sortier_doppel_ai AFTER INSERT ON main.name_part
    WHEN (SELECT COUNT(*) FROM main.name_part np WHERE np.name_form_id = NEW.name_form_id AND np.art = NEW.art AND np.sortier_index = NEW.sortier_index) > 1
    BEGIN
      INSERT INTO sortier_doppel (zeitpunkt, name_form_id, art, sortier_index) VALUES ('insert', NEW.name_form_id, NEW.art, NEW.sortier_index);
    END;
    CREATE TEMP TRIGGER IF NOT EXISTS sortier_doppel_au AFTER UPDATE ON main.name_part
    WHEN (SELECT COUNT(*) FROM main.name_part np WHERE np.name_form_id = NEW.name_form_id AND np.art = NEW.art AND np.sortier_index = NEW.sortier_index) > 1
    BEGIN
      INSERT INTO sortier_doppel (zeitpunkt, name_form_id, art, sortier_index) VALUES ('update', NEW.name_form_id, NEW.art, NEW.sortier_index);
    END;
  `)
}

export function doppelte(db: Db): readonly DoppelZeile[] {
  return db.prepare<[], DoppelZeile>('SELECT zeitpunkt, name_form_id, art, sortier_index FROM temp.sortier_doppel').all()
}

/** Führt `schritte` aus (je außerhalb des Koaleszenzfensters und je ein Undo-Schritt), prüft nach JEDEM
 * Schritt, jedem Undo und jedem Redo: kein Doppel, abgeleitete Tabellen wie Neuaufbau; Undo aller Schritte
 * = Ausgangsstand bitgleich, Redo aller = Endstand bitgleich. */
export function erwarteSchritteUndoRedoSauber(db: Db, schritte: readonly (() => void)[]): void {
  doppelWaechterAnlegen(db)
  const ausgang = kanonischerAbzug(db)
  const vorher = angewendeteSchritte(db)
  const zwischen: string[] = []
  for (const schritt of schritte) {
    warte(5000)
    schritt()
    expect(doppelte(db)).toEqual([])
    erwarteAbgeleitetWieNeuaufbau(db)
    zwischen.push(kanonischerAbzug(db))
  }
  expect(angewendeteSchritte(db) - vorher).toBe(schritte.length)
  const endstand = kanonischerAbzug(db)
  for (let i = schritte.length - 1; i >= 0; i -= 1) {
    undo(db)
    expect(doppelte(db)).toEqual([])
    erwarteAbgeleitetWieNeuaufbau(db)
    expect(kanonischerAbzug(db)).toBe(i === 0 ? ausgang : zwischen[i - 1])
  }
  expect(kanonischerAbzug(db)).toBe(ausgang)
  for (let i = 0; i < schritte.length; i += 1) {
    redo(db)
    expect(doppelte(db)).toEqual([])
    erwarteAbgeleitetWieNeuaufbau(db)
    expect(kanonischerAbzug(db)).toBe(zwischen[i])
  }
  expect(kanonischerAbzug(db)).toBe(endstand)
}
