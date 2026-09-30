// AP-1.30 PR 10-2 (A-02, A-19, F-01/F-02/F-03/F-05; docs/80 §33 V-130-10-2): `namensteil.anlegen` und
// `namensteil.loeschen` über den echten Befehlsbus gegen eine migrierte `:memory:`-Datenbank — Wirkung,
// Undo/Redo bitgleich (kanonischer Abzug), eigener Undo-Schritt je Aufruf, Fehlerfälle, E1 (kein
// Zwischenzustand mit doppeltem `sortier_index` je Form und Art — Wächter aus temporären Triggern, auch
// in Undo/Redo), E2 (kein Leerraum in Vorname-Teilen), E3 (montierter `original_text` folgt den Teilen,
// wortgetreuer bleibt) und abgeleitete Tabellen gleich ihrem Neuaufbau nach jedem Schritt.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { alleAbgeleitetenNeuAufbauen } from '../../src/main/datenbank/trigger'
import { fuehreAus } from '../../src/main/befehle/bus'
import { personDetail } from '../../src/main/abfragen/person-detail'
import { journalAn, journalAus } from '../../src/main/journal/kontext'
import { redo, undo } from '../../src/main/journal/undo'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'
import { namensteilAnlegenEinSchema, namensteilLoeschenEinSchema } from '../../src/shared/schemata/befehle'
import { kanonischerAbzug } from '../hilfsmittel/kanonischer-abzug'
import { sucheFtsInhaltAbzug, verwaisteFtsEintraegeAnzahl } from './_hilfen-abgeleitet'

type Db = ReturnType<typeof oeffnen>

let jetzt = 1_790_000_000_000

function warte(ms: number): void {
  jetzt += ms
  vi.setSystemTime(jetzt)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  jetzt = 1_790_000_000_000
  vi.setSystemTime(jetzt)
})

afterEach(() => {
  vi.useRealTimers()
})

function neueTestDatenbank(): Db {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

function neuePerson(db: Db): string {
  return fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
}

/** Person + teillose Form (Journal an, über den Bus). */
function leereForm(db: Db, originalText?: string): { readonly personId: string; readonly formId: string } {
  const personId = neuePerson(db)
  const formId = fuehreAus(db, 'namensform.anlegen', { personId, rolle: 'geburtsname', ...(originalText === undefined ? {} : { originalText }) }).id
  return { personId, formId }
}

interface TeilZeile {
  readonly id: string
  readonly art: string
  readonly wert: string
  readonly ist_rufname: number
  readonly sortier_index: number
  readonly feminine_variante: string | null
  readonly erstellt_am: number | null
  readonly geaendert_am: number | null
}

function teile(db: Db, formId: string, art?: string): readonly TeilZeile[] {
  return db
    .prepare<{ readonly formId: string }, TeilZeile>(
      `SELECT id, art, wert, ist_rufname, sortier_index, feminine_variante, erstellt_am, geaendert_am
       FROM name_part WHERE name_form_id = @formId ORDER BY art, sortier_index, id`,
    )
    .all({ formId })
    .filter((teil) => art === undefined || teil.art === art)
}

/** Kurzform: `wert@sortier_index` (Rufname mit `*`) der Teile einer Art. */
function folge(db: Db, formId: string, art: string): readonly string[] {
  return teile(db, formId, art).map((teil) => `${teil.wert}${teil.ist_rufname === 1 ? '*' : ''}@${String(teil.sortier_index)}`)
}

function originalText(db: Db, formId: string): string | null | undefined {
  return db.prepare<{ readonly formId: string }, { readonly original_text: string | null }>('SELECT original_text FROM name_form WHERE id = @formId').get({ formId })
    ?.original_text
}

function zaehle(db: Db, sql: string, parameter: Record<string, string> = {}): number {
  const zeile = db.prepare<Record<string, string>, { readonly anzahl: number }>(sql).get(parameter)
  if (zeile === undefined) throw new Error(`zaehle(): COUNT lieferte keine Zeile (${sql}).`)
  return zeile.anzahl
}

function transaktionAnzahl(db: Db): number {
  return zaehle(db, 'SELECT COUNT(*) AS anzahl FROM transaktion')
}

function angewendeteSchritte(db: Db): number {
  return zaehle(db, "SELECT COUNT(*) AS anzahl FROM transaktion WHERE status = 'angewendet'")
}

function fehlerCode(fn: () => void): string | undefined {
  try {
    fn()
    return undefined
  } catch (fehler) {
    return fehler instanceof WurzelFehler ? fehler.code : `KEIN_WURZELFEHLER:${String(fehler)}`
  }
}

function anzeigename(db: Db, personId: string): string | undefined {
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
function erwarteAbgeleitetWieNeuaufbau(db: Db): void {
  const inkrementell = abgeleitetAbzug(db)
  alleAbgeleitetenNeuAufbauen(db)
  expect(inkrementell).toBe(abgeleitetAbzug(db))
  expect(JSON.parse(inkrementell)).toMatchObject({ verwaist: 0 })
  expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
}

interface DoppelZeile {
  readonly zeitpunkt: string
  readonly name_form_id: string
  readonly art: string
  readonly sortier_index: number
}

/** Wächter über JEDEN Zwischenzustand (wie befehl-name-erhaelt-granular.test.ts): temporäre Trigger (nur
 * diese Verbindung, nicht im Schema, nicht im kanonischen Abzug) protokollieren jedes Einfügen/Ändern
 * eines `name_part`, nach dem zwei Teile derselben (Form, Art) denselben `sortier_index` tragen — auch
 * innerhalb eines Befehls, eines Undo oder eines Redo. Ein DELETE kann kein Doppel erzeugen. */
function doppelWaechterAnlegen(db: Db): void {
  db.exec(`
    CREATE TEMP TABLE sortier_doppel (zeitpunkt TEXT NOT NULL, name_form_id TEXT NOT NULL, art TEXT NOT NULL, sortier_index INTEGER NOT NULL);
    CREATE TEMP TRIGGER sortier_doppel_ai AFTER INSERT ON main.name_part
    WHEN (SELECT COUNT(*) FROM main.name_part np WHERE np.name_form_id = NEW.name_form_id AND np.art = NEW.art AND np.sortier_index = NEW.sortier_index) > 1
    BEGIN
      INSERT INTO sortier_doppel (zeitpunkt, name_form_id, art, sortier_index) VALUES ('insert', NEW.name_form_id, NEW.art, NEW.sortier_index);
    END;
    CREATE TEMP TRIGGER sortier_doppel_au AFTER UPDATE ON main.name_part
    WHEN (SELECT COUNT(*) FROM main.name_part np WHERE np.name_form_id = NEW.name_form_id AND np.art = NEW.art AND np.sortier_index = NEW.sortier_index) > 1
    BEGIN
      INSERT INTO sortier_doppel (zeitpunkt, name_form_id, art, sortier_index) VALUES ('update', NEW.name_form_id, NEW.art, NEW.sortier_index);
    END;
  `)
}

function doppelte(db: Db): readonly DoppelZeile[] {
  return db.prepare<[], DoppelZeile>('SELECT zeitpunkt, name_form_id, art, sortier_index FROM temp.sortier_doppel').all()
}

/** Führt `schritte` aus (je außerhalb des Koaleszenzfensters und je ein Undo-Schritt), prüft nach JEDEM
 * Schritt, jedem Undo und jedem Redo: kein Doppel, abgeleitete Tabellen wie Neuaufbau; Undo aller Schritte
 * = Ausgangsstand bitgleich, Redo aller = Endstand bitgleich. */
function erwarteSchritteUndoRedoSauber(db: Db, schritte: readonly (() => void)[]): void {
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

describe('namensteil.anlegen (AP-1.30 PR 10-2)', () => {
  it('ohne position: hinten anhängen (MAX + 1 je Form und Art), wert getrimmt, nie Rufname, feminineVariante', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = leereForm(db)
      const karl = fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vorname', wert: '  Karl ' }).id
      fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vorname', wert: 'Friedrich' })
      fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'nachname', wert: 'Nowak', feminineVariante: 'Nowakowa' })
      expect(folge(db, formId, 'vorname')).toEqual(['Karl@0', 'Friedrich@1'])
      expect(folge(db, formId, 'nachname')).toEqual(['Nowak@0'])
      expect(teile(db, formId, 'vorname')[0]).toEqual({
        id: karl,
        art: 'vorname',
        wert: 'Karl',
        ist_rufname: 0,
        sortier_index: 0,
        feminine_variante: null,
        erstellt_am: jetzt,
        geaendert_am: jetzt,
      })
      expect(teile(db, formId, 'nachname')[0]?.feminine_variante).toBe('Nowakowa')
      expect(anzeigename(db, personId)).toBe('Karl Friedrich Nowak')
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('MAX + 1 auch bei einer Lücke aus Altbestand', () => {
    const db = neueTestDatenbank()
    try {
      const { formId } = leereForm(db)
      fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vorname', wert: 'Karl' })
      journalAus(db, 'Test V-130-10-2: Lücke im sortier_index wie Altbestand herstellen.')
      db.prepare("UPDATE name_part SET sortier_index = 4 WHERE name_form_id = @formId AND art = 'vorname'").run({ formId })
      journalAn(db)
      fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vorname', wert: 'Friedrich' })
      expect(folge(db, formId, 'vorname')).toEqual(['Karl@4', 'Friedrich@5'])
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('mit position: einfügen, die Teile dahinter rücken lückenlos nach (IDs und Rufname bleiben); andere Arten unberührt', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const formId = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl Friedrich', rufnameIndex: 1, nachname: 'Nowak' }).id
      const vorherIds = teile(db, formId, 'vorname').map((teil) => teil.id)
      const nachnameVorher = teile(db, formId, 'nachname')
      warte(5000)
      fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vorname', wert: 'Wilhelm', position: 1 })
      expect(folge(db, formId, 'vorname')).toEqual(['Karl@0', 'Wilhelm@1', 'Friedrich*@2'])
      const nachher = teile(db, formId, 'vorname')
      expect([nachher[0]?.id, nachher[2]?.id]).toEqual(vorherIds)
      expect(nachher[2]?.geaendert_am).toBe(jetzt)
      warte(5000)
      fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vorname', wert: 'Johann', position: 0 })
      expect(folge(db, formId, 'vorname')).toEqual(['Johann@0', 'Karl@1', 'Wilhelm@2', 'Friedrich*@3'])
      // position = Anzahl: hinten anhängen.
      fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vorname', wert: 'August', position: 4 })
      expect(folge(db, formId, 'vorname')).toEqual(['Johann@0', 'Karl@1', 'Wilhelm@2', 'Friedrich*@3', 'August@4'])
      expect(teile(db, formId, 'nachname')).toEqual(nachnameVorher)
      expect(anzeigename(db, personId)).toBe('Johann Karl Wilhelm Friedrich August Nowak')
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('jeder Aufruf ist ein eigener Undo-Schritt (keine Koaleszenz, auch im Fenster); Undo/Redo bitgleich', () => {
    const db = neueTestDatenbank()
    try {
      const { formId } = leereForm(db)
      const ausgang = kanonischerAbzug(db)
      const vorher = angewendeteSchritte(db)
      fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vorname', wert: 'Karl' })
      const nachEinem = kanonischerAbzug(db)
      warte(100)
      fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vorname', wert: 'Wilhelm', position: 0 })
      const nachZwei = kanonischerAbzug(db)
      expect(angewendeteSchritte(db) - vorher).toBe(2)
      undo(db)
      expect(kanonischerAbzug(db)).toBe(nachEinem)
      undo(db)
      expect(kanonischerAbzug(db)).toBe(ausgang)
      redo(db)
      redo(db)
      expect(kanonischerAbzug(db)).toBe(nachZwei)
    } finally {
      db.close()
    }
  })

  it('Fehler: unbekannte Form, leerer Wert, position hinter dem Ende, Leerraum im Vornamen (E2) — kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const { formId } = leereForm(db)
      fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vorname', wert: 'Karl' })
      const abzug = kanonischerAbzug(db)
      const transaktionen = transaktionAnzahl(db)
      expect(fehlerCode(() => fuehreAus(db, 'namensteil.anlegen', { namensformId: 'gibt-es-nicht', art: 'vorname', wert: 'Karl' }))).toBe('NICHT_GEFUNDEN_NAME')
      expect(fehlerCode(() => fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'nachname', wert: '' }))).toBe('VALIDIERUNG_NAMENSTEIL_LEER')
      expect(fehlerCode(() => fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'nachname', wert: ' \t ' }))).toBe('VALIDIERUNG_NAMENSTEIL_LEER')
      expect(fehlerCode(() => fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vorname', wert: 'Hans Peter' }))).toBe('VALIDIERUNG_NAMENSTEIL_LEERRAUM')
      expect(fehlerCode(() => fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vorname', wert: 'Hans Peter' }))).toBe('VALIDIERUNG_NAMENSTEIL_LEERRAUM')
      expect(fehlerCode(() => fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vorname', wert: 'August', position: 2 }))).toBe('VALIDIERUNG_WERTEBEREICH')
      expect(fehlerCode(() => fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'nachname', wert: 'Nowak', position: 1 }))).toBe('VALIDIERUNG_WERTEBEREICH')
      expect(kanonischerAbzug(db)).toBe(abzug)
      expect(transaktionAnzahl(db)).toBe(transaktionen)
      // E2 gilt nur für Vornamen: mehrwortige Nachnamen/Präfixe bleiben möglich (Apostroph: benannte Parameter).
      fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'praefix', wert: 'von der' })
      fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'nachname', wert: "O'Brien Leyen" })
      expect(folge(db, formId, 'praefix')).toEqual(['von der@0'])
      expect(folge(db, formId, 'nachname')).toEqual(["O'Brien Leyen@0"])
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('Zod: position nur als nichtnegative ganze Zahl, art nur aus name_part.art', () => {
    const gueltig = { namensformId: 'f', art: 'vorname', wert: 'Karl' }
    expect(namensteilAnlegenEinSchema.safeParse(gueltig).success).toBe(true)
    expect(namensteilAnlegenEinSchema.safeParse({ ...gueltig, position: 0 }).success).toBe(true)
    expect(namensteilAnlegenEinSchema.safeParse({ ...gueltig, position: -1 }).success).toBe(false)
    expect(namensteilAnlegenEinSchema.safeParse({ ...gueltig, position: 1.5 }).success).toBe(false)
    expect(namensteilAnlegenEinSchema.safeParse({ ...gueltig, art: 'rufname' }).success).toBe(false)
    expect(namensteilAnlegenEinSchema.safeParse({ ...gueltig, wert: undefined }).success).toBe(false)
  })

  it('E1: Einfügen vorn, in der Mitte und hinten — kein Doppel in irgendeinem Zwischenzustand, auch nicht in Undo/Redo', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const formId = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl Friedrich Wilhelm', rufnameIndex: 2, nachname: 'Nowak' }).id
      const anlegen = (art: 'vorname' | 'nachname', wert: string, position?: number) => () => {
        fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art, wert, ...(position === undefined ? {} : { position }) })
      }
      erwarteSchritteUndoRedoSauber(db, [
        anlegen('vorname', 'Johann', 0),
        anlegen('vorname', 'Georg', 2),
        anlegen('vorname', 'August'),
        anlegen('nachname', 'Lüdenscheidt', 0),
        anlegen('vorname', 'Ernst', 1),
      ])
      expect(folge(db, formId, 'vorname')).toEqual(['Johann@0', 'Ernst@1', 'Karl@2', 'Georg@3', 'Friedrich@4', 'Wilhelm*@5', 'August@6'])
      expect(folge(db, formId, 'nachname')).toEqual(['Lüdenscheidt@0', 'Nowak@1'])
    } finally {
      db.close()
    }
  })

  it('E3: montierter original_text folgt den Teilen (auch NULL einer teillosen Form); Undo stellt ihn zurück', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const formId = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl', nachname: 'Nowak' }).id
      expect(originalText(db, formId)).toBe('Karl Nowak')
      warte(5000)
      fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vorname', wert: 'Friedrich' })
      expect(originalText(db, formId)).toBe('Karl Friedrich Nowak')
      fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'titel', wert: 'Dr.' })
      expect(originalText(db, formId)).toBe('Dr. Karl Friedrich Nowak')
      erwarteAbgeleitetWieNeuaufbau(db)

      const { formId: leer } = leereForm(db)
      expect(originalText(db, leer)).toBeNull()
      erwarteSchritteUndoRedoSauber(db, [
        () => fuehreAus(db, 'namensteil.anlegen', { namensformId: leer, art: 'nachname', wert: 'Müller' }),
        () => fuehreAus(db, 'namensteil.anlegen', { namensformId: leer, art: 'vorname', wert: 'Anna' }),
      ])
      expect(originalText(db, leer)).toBe('Anna Müller')
    } finally {
      db.close()
    }
  })

  it('E3: wortgetreuer original_text bleibt unverändert', () => {
    const db = neueTestDatenbank()
    try {
      const { formId } = leereForm(db, 'Joh. Georg Müller alias Miller')
      fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vorname', wert: 'Johann' })
      fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'nachname', wert: 'Müller' })
      expect(originalText(db, formId)).toBe('Joh. Georg Müller alias Miller')
      const personId = neuePerson(db)
      const flach = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl', nachname: 'Nowak', originalText: 'Carolus Nowak' }).id
      fuehreAus(db, 'namensteil.anlegen', { namensformId: flach, art: 'vorname', wert: 'Friedrich' })
      expect(originalText(db, flach)).toBe('Carolus Nowak')
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })
})

function teilId(db: Db, formId: string, art: string, wert: string): string {
  const treffer = teile(db, formId, art).find((teil) => teil.wert === wert)
  if (treffer === undefined) throw new Error(`teilId(): kein Teil ${art} "${wert}" in Form ${formId}.`)
  return treffer.id
}

describe('namensteil.loeschen (AP-1.30 PR 10-2)', () => {
  it('entfernt den Teil und nummeriert die übrigen derselben (Form, Art) lückenlos nach — IDs bleiben, andere Arten unberührt', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const formId = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Johann Karl Friedrich Wilhelm', nachname: 'Nowak' }).id
      const ids = teile(db, formId, 'vorname').map((teil) => teil.id)
      const nachname = teile(db, formId, 'nachname')
      warte(5000)
      fuehreAus(db, 'namensteil.loeschen', { id: teilId(db, formId, 'vorname', 'Karl') })
      expect(folge(db, formId, 'vorname')).toEqual(['Johann@0', 'Friedrich@1', 'Wilhelm@2'])
      expect(teile(db, formId, 'vorname').map((teil) => teil.id)).toEqual([ids[0], ids[2], ids[3]])
      // Nur die verschobenen Teile sind geändert.
      expect(teile(db, formId, 'vorname').map((teil) => teil.geaendert_am === jetzt)).toEqual([false, true, true])
      expect(teile(db, formId, 'nachname')).toEqual(nachname)
      expect(anzeigename(db, personId)).toBe('Johann Friedrich Wilhelm Nowak')
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('schließt eine Lücke aus Altbestand', () => {
    const db = neueTestDatenbank()
    try {
      const { formId } = leereForm(db)
      for (const wert of ['Karl', 'Friedrich', 'Wilhelm']) fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vorname', wert })
      journalAus(db, 'Test V-130-10-2: Lücken im sortier_index wie Altbestand herstellen.')
      db.prepare("UPDATE name_part SET sortier_index = sortier_index * 3 WHERE name_form_id = @formId AND art = 'vorname'").run({ formId })
      journalAn(db)
      expect(folge(db, formId, 'vorname')).toEqual(['Karl@0', 'Friedrich@3', 'Wilhelm@6'])
      erwarteSchritteUndoRedoSauber(db, [() => fuehreAus(db, 'namensteil.loeschen', { id: teilId(db, formId, 'vorname', 'Karl') })])
      expect(folge(db, formId, 'vorname')).toEqual(['Friedrich@0', 'Wilhelm@1'])
    } finally {
      db.close()
    }
  })

  it('Rufname-Teil löschen: die Markierung entfällt, kein anderer Teil wird Rufname', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const formId = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl Friedrich Wilhelm', rufnameIndex: 1, nachname: 'Nowak' }).id
      expect(folge(db, formId, 'vorname')).toEqual(['Karl@0', 'Friedrich*@1', 'Wilhelm@2'])
      erwarteSchritteUndoRedoSauber(db, [() => fuehreAus(db, 'namensteil.loeschen', { id: teilId(db, formId, 'vorname', 'Friedrich') })])
      expect(folge(db, formId, 'vorname')).toEqual(['Karl@0', 'Wilhelm@1'])
      expect(zaehle(db, 'SELECT COUNT(*) AS anzahl FROM name_part WHERE name_form_id = @formId AND ist_rufname = 1', { formId })).toBe(0)
      const name = personDetail(db, { personId }).namen.find((kandidat) => kandidat.id === formId)
      expect(name).toMatchObject({ vornamen: 'Karl Wilhelm', rufname_index: null, rufname_text: null })
    } finally {
      db.close()
    }
  })

  it('E8: auch der letzte Teil einer Form darf weg — die Form bleibt, ein montierter original_text wird NULL', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const formId = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname: 'Nowak' }).id
      expect(originalText(db, formId)).toBe('Nowak')
      erwarteSchritteUndoRedoSauber(db, [() => fuehreAus(db, 'namensteil.loeschen', { id: teilId(db, formId, 'nachname', 'Nowak') })])
      expect(teile(db, formId)).toEqual([])
      expect(zaehle(db, 'SELECT COUNT(*) AS anzahl FROM name_form WHERE id = @formId', { formId })).toBe(1)
      expect(originalText(db, formId)).toBeNull()
      expect(zaehle(db, 'SELECT COUNT(*) AS anzahl FROM name_phonetik')).toBe(0)
    } finally {
      db.close()
    }
  })

  it('Fehler: unbekannte ID → NICHT_GEFUNDEN_NAMENSTEIL, kein Schreibvorgang; Zod verlangt id', () => {
    const db = neueTestDatenbank()
    try {
      const { formId } = leereForm(db)
      fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vorname', wert: 'Karl' })
      const abzug = kanonischerAbzug(db)
      const transaktionen = transaktionAnzahl(db)
      expect(fehlerCode(() => fuehreAus(db, 'namensteil.loeschen', { id: 'gibt-es-nicht' }))).toBe('NICHT_GEFUNDEN_NAMENSTEIL')
      // Zweimal dasselbe Löschen: das zweite findet den Teil nicht mehr.
      const id = teilId(db, formId, 'vorname', 'Karl')
      fuehreAus(db, 'namensteil.loeschen', { id })
      const nachLoeschen = transaktionAnzahl(db)
      expect(fehlerCode(() => fuehreAus(db, 'namensteil.loeschen', { id }))).toBe('NICHT_GEFUNDEN_NAMENSTEIL')
      expect(transaktionAnzahl(db)).toBe(nachLoeschen)
      undo(db)
      expect(kanonischerAbzug(db)).toBe(abzug)
      expect(transaktionAnzahl(db)).toBe(transaktionen + 1)
      expect(namensteilLoeschenEinSchema.safeParse({}).success).toBe(false)
      expect(namensteilLoeschenEinSchema.safeParse({ id: 'x' }).success).toBe(true)
    } finally {
      db.close()
    }
  })

  it('E3: montierter original_text folgt dem Löschen, wortgetreuer bleibt', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const montiert = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl Friedrich', nachname: 'Nowak', titelVor: 'Dr.' }).id
      expect(originalText(db, montiert)).toBe('Dr. Karl Friedrich Nowak')
      fuehreAus(db, 'namensteil.loeschen', { id: teilId(db, montiert, 'titel', 'Dr.') })
      expect(originalText(db, montiert)).toBe('Karl Friedrich Nowak')
      fuehreAus(db, 'namensteil.loeschen', { id: teilId(db, montiert, 'vorname', 'Karl') })
      expect(originalText(db, montiert)).toBe('Friedrich Nowak')

      const wortgetreu = fuehreAus(db, 'name.anlegen', { personId, typ: 'aka', vornamen: 'Johann Georg', nachname: 'Müller', originalText: 'Joh. Georg Müller alias Miller' }).id
      fuehreAus(db, 'namensteil.loeschen', { id: teilId(db, wortgetreu, 'vorname', 'Georg') })
      expect(originalText(db, wortgetreu)).toBe('Joh. Georg Müller alias Miller')
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })
})

describe('namensteil.anlegen und .loeschen gemischt: E1 über jeden Zwischenzustand', () => {
  it('Einfügen und Löschen an allen Stellen, mehrere Arten und Formen — kein Doppel, abgeleitet wie Neuaufbau, Undo/Redo bitgleich', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const a = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl Friedrich Wilhelm', rufnameIndex: 0, nachname: 'Nowak' }).id
      const b = fuehreAus(db, 'namensform.anlegen', { personId, rolle: 'ehename' }).id
      const anlegen = (formId: string, art: 'vorname' | 'nachname', wert: string, position?: number) => () => {
        fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art, wert, ...(position === undefined ? {} : { position }) })
      }
      const loeschen = (formId: string, art: string, wert: string) => () => {
        fuehreAus(db, 'namensteil.loeschen', { id: teilId(db, formId, art, wert) })
      }
      erwarteSchritteUndoRedoSauber(db, [
        loeschen(a, 'vorname', 'Friedrich'),
        anlegen(a, 'vorname', 'Georg', 0),
        anlegen(b, 'nachname', 'Schulz'),
        anlegen(b, 'vorname', 'Karl'),
        loeschen(a, 'vorname', 'Georg'),
        anlegen(a, 'vorname', 'August', 1),
        loeschen(a, 'vorname', 'Wilhelm'),
        anlegen(a, 'nachname', 'Lüdenscheidt', 1),
        loeschen(a, 'nachname', 'Nowak'),
        loeschen(b, 'nachname', 'Schulz'),
      ])
      expect(folge(db, a, 'vorname')).toEqual(['Karl*@0', 'August@1'])
      expect(folge(db, a, 'nachname')).toEqual(['Lüdenscheidt@0'])
      expect(folge(db, b, 'vorname')).toEqual(['Karl@0'])
      expect(folge(db, b, 'nachname')).toEqual([])
    } finally {
      db.close()
    }
  })
})
