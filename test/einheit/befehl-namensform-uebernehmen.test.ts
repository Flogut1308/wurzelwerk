// AP-1.30 PR 11-0 (A-02, A-19; docs/80 §33 V-130-11-E1, V-130-11-E4, V-130-11-0): `namensform.uebernehmen`
// über den echten Befehlsbus gegen eine migrierte `:memory:`-Datenbank. Der Befehl schreibt das Modal
// „Namensform bearbeiten" in EINER Transaktion und als EIN Undo-Schritt: Kopf (Teil-Semantik je Feld),
// vollständige Zielliste der Teile (ändern, anlegen, löschen, umordnen, Rufname) und Hauptname. Geprüft
// werden Wirkung, erhaltene Teil-IDs, No-op (AP-0.22), verworfene leere Teile, Ablehnungen ohne
// Schreibvorgang, Altbestand mit Leerraum (E4), Undo/Redo bitgleich, abgeleitete Tabellen gleich ihrem
// Neuaufbau und — per abbrechendem TEMP-Trigger (Muster `test/invarianten/namensteil-sortierindex-eindeutig`,
// hier nachgebaut, nicht importiert) — kein doppelter `sortier_index` in irgendeinem Zwischenzustand.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { fuehreAus } from '../../src/main/befehle/bus'
import { journalAn, journalAus } from '../../src/main/journal/kontext'
import { redo, undo } from '../../src/main/journal/undo'
import type { NamensformUebernehmenEin, NamensformUebernehmenTeil } from '../../src/shared/schemata/befehle'
import { kanonischerAbzug } from '../hilfsmittel/kanonischer-abzug'
import {
  angewendeteSchritte,
  anzeigename,
  type Db,
  doppelte,
  doppelWaechterAnlegen,
  erwarteAbgeleitetWieNeuaufbau,
  fehlerCode,
  folge,
  neuePerson,
  neueTestDatenbank,
  originalText,
  teile,
  teilId,
  transaktionAnzahl,
  uhrStarten,
  warte,
} from './_hilfen-namensteil'

beforeEach(() => {
  uhrStarten()
})

afterEach(() => {
  vi.useRealTimers()
})

const WAECHTER_MELDUNG = 'Waechter: doppelter sortier_index je (name_form_id, art)'

/** Feste SQL (kein Eingabewert): die gerade geschriebene Zeile teilt ihren `sortier_index` mit einem anderen
 * Teil derselben (Form, Art). */
const WAECHTER_WENN = `EXISTS (SELECT 1 FROM name_part p
  WHERE p.name_form_id = NEW.name_form_id AND p.art = NEW.art AND p.sortier_index = NEW.sortier_index AND p.id <> NEW.id)`

/** Abbrechender Wächter (TEMP, nur diese Verbindung): ein Doppel mitten im Befehl, im Undo oder im Redo
 * bricht die Anweisung mit `RAISE(ABORT)` ab. */
function abbrechendenWaechterEinbauen(db: Db): void {
  db.exec(`
    CREATE TEMP TRIGGER IF NOT EXISTS u110_waechter_ai AFTER INSERT ON main.name_part WHEN ${WAECHTER_WENN}
    BEGIN SELECT RAISE(ABORT, '${WAECHTER_MELDUNG}'); END;
    CREATE TEMP TRIGGER IF NOT EXISTS u110_waechter_au AFTER UPDATE OF sortier_index, art, name_form_id ON main.name_part WHEN ${WAECHTER_WENN}
    BEGIN SELECT RAISE(ABORT, '${WAECHTER_MELDUNG}'); END;
  `)
}

/** Person mit Hauptform „Karl Friedrich* Nowak“ (über `name.anlegen`, montierter original_text). */
function karlNowak(db: Db): { readonly personId: string; readonly formId: string } {
  const personId = neuePerson(db)
  const formId = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl Friedrich', rufnameIndex: 1, nachname: 'Nowak' }).id
  return { personId, formId }
}

/** Der gespeicherte Stand einer Form als Zielliste (Arten nach Name, je Art nach Stelle). */
function zielliste(db: Db, formId: string): readonly NamensformUebernehmenTeil[] {
  return teile(db, formId).map((t) => ({
    id: t.id,
    art: artVon(t.art),
    wert: t.wert,
    feminineVariante: t.feminine_variante,
    istRufname: t.ist_rufname === 1,
  }))
}

function artVon(art: string): NamensformUebernehmenTeil['art'] {
  switch (art) {
    case 'vorname':
    case 'praefix':
    case 'nachname':
    case 'suffix':
    case 'titel':
    case 'vatersname':
      return art
    default:
      throw new Error(`artVon(): unbekannte Art ${art}.`)
  }
}

function uebernehmen(db: Db, ein: NamensformUebernehmenEin): string {
  return fuehreAus(db, 'namensform.uebernehmen', ein).id
}

interface FormKopf {
  readonly id: string
  readonly rolle: string | null
  readonly sprache: string | null
  readonly schrift: string | null
  readonly reihenfolge: string | null
  readonly ist_bevorzugt: number
  readonly konfidenz: number | null
}

function kopf(db: Db, formId: string): FormKopf | undefined {
  return db
    .prepare<{ readonly formId: string }, FormKopf>('SELECT id, rolle, sprache, schrift, reihenfolge, ist_bevorzugt, konfidenz FROM name_form WHERE id = @formId')
    .get({ formId })
}

/** Führt `schritt` unter beiden Wächtern (protokollierend und abbrechend) als einen Undo-Schritt aus; prüft genau einen neuen angewendeten Schritt, Undo = Ausgang
 * bitgleich, Redo = Endstand bitgleich, abgeleitete Tabellen = Neuaufbau nach jedem Stand. */
function erwarteEinSchrittUndoRedo(db: Db, schritt: () => void): void {
  doppelWaechterAnlegen(db)
  abbrechendenWaechterEinbauen(db)
  const ausgang = kanonischerAbzug(db)
  const vorher = angewendeteSchritte(db)
  warte(5000)
  schritt()
  expect(angewendeteSchritte(db) - vorher).toBe(1)
  expect(doppelte(db)).toEqual([])
  erwarteAbgeleitetWieNeuaufbau(db)
  const endstand = kanonischerAbzug(db)
  undo(db)
  expect(doppelte(db)).toEqual([])
  erwarteAbgeleitetWieNeuaufbau(db)
  expect(kanonischerAbzug(db)).toBe(ausgang)
  redo(db)
  expect(doppelte(db)).toEqual([])
  erwarteAbgeleitetWieNeuaufbau(db)
  expect(kanonischerAbzug(db)).toBe(endstand)
}

describe('namensform.uebernehmen (AP-1.30 PR 11-0)', () => {
  it('neue Form mit Teilen, Rufname und Hauptname: ein Undo-Schritt, Undo/Redo bitgleich', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId: alteForm } = karlNowak(db)
      doppelWaechterAnlegen(db)
      abbrechendenWaechterEinbauen(db)
      let neueForm = ''
      erwarteEinSchrittUndoRedo(db, () => {
        neueForm = uebernehmen(db, {
          personId,
          formId: null,
          kopf: { rolle: 'geburtsname', sprache: 'ru', schrift: 'cyrl' },
          teile: [
            { art: 'vorname', wert: 'Карл', istRufname: false },
            { art: 'vorname', wert: ' Фридрих ', istRufname: true },
            { art: 'nachname', wert: 'Новак', feminineVariante: 'Новакова', istRufname: false },
          ],
          hauptname: true,
        })
      })
      expect(kopf(db, neueForm)).toMatchObject({ rolle: 'geburtsname', sprache: 'ru', schrift: 'cyrl', ist_bevorzugt: 1 })
      expect(kopf(db, alteForm)).toMatchObject({ ist_bevorzugt: 0 })
      expect(folge(db, neueForm, 'vorname')).toEqual(['Карл@0', 'Фридрих*@1'])
      expect(folge(db, neueForm, 'nachname')).toEqual(['Новак@0'])
      expect(teile(db, neueForm, 'nachname')[0]?.feminine_variante).toBe('Новакова')
      expect(originalText(db, neueForm)).toBe('Карл Фридрих Новак')
      expect(anzeigename(db, personId)).toBe('Карл Фридрих Новак')
    } finally {
      db.close()
    }
  })

  it('erste Form einer Person ohne hauptname wird trotzdem Hauptname (Regel von namensform.anlegen)', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const formId = uebernehmen(db, { personId, formId: null, kopf: { rolle: 'geburtsname' }, teile: [{ art: 'nachname', wert: 'Nowak', istRufname: false }] })
      expect(kopf(db, formId)).toMatchObject({ ist_bevorzugt: 1 })
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('Kopf ändern: fehlt = bleibt, null = leeren; Teile unberührt; ein Undo-Schritt', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = karlNowak(db)
      uebernehmen(db, { personId, formId, kopf: { sprache: 'de', konfidenz: 3 }, teile: zielliste(db, formId) })
      const teileVorher = teile(db, formId)
      erwarteEinSchrittUndoRedo(db, () => {
        uebernehmen(db, { personId, formId, kopf: { reihenfolge: 'nachname_zuerst', konfidenz: null }, teile: zielliste(db, formId) })
      })
      expect(kopf(db, formId)).toMatchObject({ sprache: 'de', reihenfolge: 'nachname_zuerst', konfidenz: null })
      expect(teile(db, formId)).toEqual(teileVorher)
    } finally {
      db.close()
    }
  })

  it('ändern, anlegen, löschen, umordnen und Rufname wechseln in EINEM Aufruf: IDs unveränderter Teile bleiben, kein Doppel in keinem Zwischenstand', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = karlNowak(db)
      fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vorname', wert: 'Anton' })
      const karl = teilId(db, formId, 'vorname', 'Karl')
      const friedrich = teilId(db, formId, 'vorname', 'Friedrich')
      const nowak = teilId(db, formId, 'nachname', 'Nowak')
      expect(folge(db, formId, 'vorname')).toEqual(['Karl@0', 'Friedrich*@1', 'Anton@2'])
      doppelWaechterAnlegen(db)
      abbrechendenWaechterEinbauen(db)
      erwarteEinSchrittUndoRedo(db, () => {
        uebernehmen(db, {
          personId,
          formId,
          kopf: {},
          teile: [
            { id: friedrich, art: 'vorname', wert: 'Friedrich', istRufname: false },
            { id: karl, art: 'vorname', wert: 'Carl', istRufname: false },
            { art: 'vorname', wert: 'Wilhelm', istRufname: true },
            { id: nowak, art: 'nachname', wert: 'Nowak', istRufname: false },
            { art: 'nachname', wert: 'Schulz', istRufname: false },
          ],
        })
      })
      expect(folge(db, formId, 'vorname')).toEqual(['Friedrich@0', 'Carl@1', 'Wilhelm*@2'])
      expect(folge(db, formId, 'nachname')).toEqual(['Nowak@0', 'Schulz@1'])
      expect(teilId(db, formId, 'vorname', 'Friedrich')).toBe(friedrich)
      expect(teilId(db, formId, 'vorname', 'Carl')).toBe(karl)
      expect(teilId(db, formId, 'nachname', 'Nowak')).toBe(nowak)
      expect(originalText(db, formId)).toBe('Friedrich Carl Wilhelm Nowak Schulz')
      expect(anzeigename(db, personId)).toBe('Friedrich Carl Wilhelm Nowak Schulz')
    } finally {
      db.close()
    }
  })

  it('Umordnen und Rufname-Wechsel unter abbrechendem Wächter (auch mit Lücke aus Altbestand)', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = karlNowak(db)
      fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vorname', wert: 'Anton' })
      fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vorname', wert: 'Wilhelm' })
      journalAus(db, 'Test V-130-11-0: Lücken im sortier_index wie Altbestand herstellen.')
      db.prepare("UPDATE name_part SET sortier_index = sortier_index * 3 WHERE name_form_id = @formId AND art = 'vorname'").run({ formId })
      journalAn(db)
      abbrechendenWaechterEinbauen(db)
      doppelWaechterAnlegen(db)
      const [karl, friedrich, anton, wilhelm] = ['Karl', 'Friedrich', 'Anton', 'Wilhelm'].map((wert) => teilId(db, formId, 'vorname', wert))
      const nowak = teilId(db, formId, 'nachname', 'Nowak')
      erwarteEinSchrittUndoRedo(db, () => {
        uebernehmen(db, {
          personId,
          formId,
          kopf: {},
          teile: [
            { id: wilhelm, art: 'vorname', wert: 'Wilhelm', istRufname: true },
            { id: anton, art: 'vorname', wert: 'Anton', istRufname: false },
            { id: karl, art: 'vorname', wert: 'Karl', istRufname: false },
            { id: friedrich, art: 'vorname', wert: 'Friedrich', istRufname: false },
            { id: nowak, art: 'nachname', wert: 'Nowak', istRufname: false },
          ],
        })
      })
      expect(folge(db, formId, 'vorname')).toEqual(['Wilhelm*@0', 'Anton@3', 'Karl@6', 'Friedrich@9'])
    } finally {
      db.close()
    }
  })

  it('Gegenprobe: der abbrechende Wächter ist scharf (ein direktes Doppel bricht ab)', () => {
    const db = neueTestDatenbank()
    try {
      const { formId } = karlNowak(db)
      abbrechendenWaechterEinbauen(db)
      const karl = teilId(db, formId, 'vorname', 'Karl')
      journalAus(db, 'Test V-130-11-0: Gegenprobe des Wächters.')
      expect(() => db.prepare('UPDATE name_part SET sortier_index = 1 WHERE id = @karl').run({ karl })).toThrow(WAECHTER_MELDUNG)
      journalAn(db)
    } finally {
      db.close()
    }
  })

  it('Hauptname auf eine bestehende Form wechseln', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId: erste } = karlNowak(db)
      const zweite = fuehreAus(db, 'namensform.anlegen', { personId, rolle: 'ehename' }).id
      erwarteEinSchrittUndoRedo(db, () => {
        uebernehmen(db, { personId, formId: zweite, kopf: {}, teile: [{ art: 'nachname', wert: 'Schulz', istRufname: false }], hauptname: true })
      })
      expect(kopf(db, zweite)).toMatchObject({ ist_bevorzugt: 1 })
      expect(kopf(db, erste)).toMatchObject({ ist_bevorzugt: 0 })
    } finally {
      db.close()
    }
  })

  it('ein wortgetreuer original_text bleibt; ein ausdrücklich geänderter gewinnt über die Nachführung', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = karlNowak(db)
      const nowak = teilId(db, formId, 'nachname', 'Nowak')
      const mitNachname = (wert: string): readonly NamensformUebernehmenTeil[] =>
        zielliste(db, formId).map((t) => (t.id === nowak ? { ...t, wert } : t))
      uebernehmen(db, { personId, formId, kopf: { originalText: 'Carolus Fridericus Nowak' }, teile: mitNachname('Nowack') })
      expect(originalText(db, formId)).toBe('Carolus Fridericus Nowak')
      uebernehmen(db, { personId, formId, kopf: {}, teile: mitNachname('Nowakk') })
      expect(originalText(db, formId)).toBe('Carolus Fridericus Nowak')
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('No-op (AP-0.22): unveränderter Aufruf (auch Hauptname schon gesetzt, Werte mit Rand-Leerraum) schreibt nichts', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = karlNowak(db)
      const abzug = kanonischerAbzug(db)
      const transaktionen = transaktionAnzahl(db)
      warte(5000)
      uebernehmen(db, { personId, formId, kopf: {}, teile: zielliste(db, formId) })
      uebernehmen(db, { personId, formId, kopf: { rolle: 'geburtsname', sprache: null }, teile: zielliste(db, formId), hauptname: true })
      uebernehmen(db, { personId, formId, kopf: {}, teile: zielliste(db, formId).map((t) => ({ ...t, wert: ` ${t.wert} ` })) })
      expect(transaktionAnzahl(db)).toBe(transaktionen)
      expect(kanonischerAbzug(db)).toBe(abzug)
    } finally {
      db.close()
    }
  })

  it('leere Teile werden verworfen: ein neues leeres Teil legt nichts an, ein geleertes bestehendes wird entfernt', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = karlNowak(db)
      const transaktionen = transaktionAnzahl(db)
      const abzug = kanonischerAbzug(db)
      uebernehmen(db, { personId, formId, kopf: {}, teile: [...zielliste(db, formId), { art: 'vorname', wert: '   ', istRufname: false }, { art: 'titel', wert: '', istRufname: false }] })
      expect(transaktionAnzahl(db)).toBe(transaktionen)
      expect(kanonischerAbzug(db)).toBe(abzug)
      const karl = teilId(db, formId, 'vorname', 'Karl')
      uebernehmen(db, { personId, formId, kopf: {}, teile: zielliste(db, formId).map((t) => (t.id === karl ? { ...t, wert: ' ' } : t)) })
      expect(folge(db, formId, 'vorname')).toEqual(['Friedrich*@0'])
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('Ablehnungen mit genauem Fehlercode — danach ist nichts geschrieben', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = karlNowak(db)
      const fremd = karlNowak(db)
      const fremdesTeil = teilId(db, fremd.formId, 'vorname', 'Karl')
      const karl = teilId(db, formId, 'vorname', 'Karl')
      const nowak = teilId(db, formId, 'nachname', 'Nowak')
      const abzug = kanonischerAbzug(db)
      const transaktionen = transaktionAnzahl(db)
      // Jeder Aufruf trägt zusätzlich gültige Änderungen (Kopf, neues Teil), die ohne Ablehnung geschrieben würden.
      const basis = { personId, formId, kopf: { sprache: 'de' } }
      const mitKarl = (wert: string): readonly NamensformUebernehmenTeil[] => [
        ...zielliste(db, formId).map((t) => (t.id === karl ? { ...t, wert } : t)),
        { art: 'suffix', wert: 'jun.', istRufname: false },
      ]
      expect(fehlerCode(() => uebernehmen(db, { ...basis, teile: mitKarl('Hans Peter') }))).toBe('VALIDIERUNG_NAMENSTEIL_LEERRAUM')
      expect(fehlerCode(() => uebernehmen(db, { ...basis, teile: [...zielliste(db, formId), { art: 'vorname', wert: 'Hans Peter', istRufname: false }] }))).toBe(
        'VALIDIERUNG_NAMENSTEIL_LEERRAUM',
      )
      expect(fehlerCode(() => uebernehmen(db, { ...basis, teile: [...mitKarl('Carl'), { id: fremdesTeil, art: 'vorname', wert: 'Karl', istRufname: false }] }))).toBe(
        'NICHT_GEFUNDEN_NAMENSTEIL',
      )
      expect(
        fehlerCode(() =>
          uebernehmen(db, {
            ...basis,
            teile: zielliste(db, formId).map((t) => ({ ...t, istRufname: t.id === nowak })),
          }),
        ),
      ).toBe('VALIDIERUNG_RUFNAME_KEIN_VORNAME')
      expect(fehlerCode(() => uebernehmen(db, { ...basis, formId: fremd.formId, teile: zielliste(db, fremd.formId) }))).toBe('NICHT_GEFUNDEN_NAME')
      expect(transaktionAnzahl(db)).toBe(transaktionen)
      expect(kanonischerAbzug(db)).toBe(abzug)
    } finally {
      db.close()
    }
  })

  it('E4: ein unverändertes Altbestand-Teil mit Leerraum bleibt erhalten, während andere Teile sich ändern', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = karlNowak(db)
      const karl = teilId(db, formId, 'vorname', 'Karl')
      journalAus(db, 'Test V-130-11-0: mehrwortigen Vornamen wie Altbestand (Migration 0006) herstellen.')
      db.prepare("UPDATE name_part SET wert = 'Hans Peter' WHERE id = @karl").run({ karl })
      journalAn(db)
      const nowak = teilId(db, formId, 'nachname', 'Nowak')
      erwarteEinSchrittUndoRedo(db, () => {
        uebernehmen(db, { personId, formId, kopf: {}, teile: zielliste(db, formId).map((t) => (t.id === nowak ? { ...t, wert: 'Nowack' } : t)) })
      })
      expect(folge(db, formId, 'vorname')).toEqual(['Hans Peter@0', 'Friedrich*@1'])
      expect(teilId(db, formId, 'vorname', 'Hans Peter')).toBe(karl)
      expect(folge(db, formId, 'nachname')).toEqual(['Nowack@0'])
    } finally {
      db.close()
    }
  })
})

describe('namensform.uebernehmen — Nachbesserung Review #200', () => {
  it('V1: ein ausdrücklich gesetzter originalText gewinnt auch bei einer NEUEN Form', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const erste = uebernehmen(db, {
        personId,
        formId: null,
        kopf: { rolle: 'geburtsname', originalText: 'Nowak' },
        teile: [
          { art: 'nachname', wert: 'Nowak', istRufname: false },
          { art: 'vorname', wert: 'Karl', istRufname: false },
        ],
      })
      expect(originalText(db, erste)).toBe('Nowak')
      const zweite = uebernehmen(db, {
        personId,
        formId: null,
        kopf: { rolle: 'ehename', originalText: 'Karl' },
        teile: [
          { art: 'vorname', wert: 'Karl', istRufname: false },
          { art: 'nachname', wert: 'Nowak', istRufname: false },
        ],
      })
      expect(originalText(db, zweite)).toBe('Karl')
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('Art-Wechsel einer bestehenden Teil-ID wird abgewiesen — nichts geschrieben, keine Transaktion', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = karlNowak(db)
      const karl = teilId(db, formId, 'vorname', 'Karl')
      const abzug = kanonischerAbzug(db)
      const transaktionen = transaktionAnzahl(db)
      const teileMitArtwechsel = zielliste(db, formId).map((t) => (t.id === karl ? { ...t, art: artVon('nachname') } : t))
      expect(fehlerCode(() => uebernehmen(db, { personId, formId, kopf: { sprache: 'de' }, teile: teileMitArtwechsel }))).toBe('VALIDIERUNG_NAMENSTEIL_ART_ABWEICHEND')
      expect(transaktionAnzahl(db)).toBe(transaktionen)
      expect(kanonischerAbzug(db)).toBe(abzug)
    } finally {
      db.close()
    }
  })

  it('V3a: ein unverändert mitgeschickter originalText (alte Montage) setzt die Nachführung nicht zurück', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = karlNowak(db)
      const nowak = teilId(db, formId, 'nachname', 'Nowak')
      expect(originalText(db, formId)).toBe('Karl Friedrich Nowak')
      uebernehmen(db, {
        personId,
        formId,
        kopf: { originalText: 'Karl Friedrich Nowak', sprache: 'de' },
        teile: zielliste(db, formId).map((t) => (t.id === nowak ? { ...t, wert: 'Nowack' } : t)),
      })
      expect(originalText(db, formId)).toBe('Karl Friedrich Nowack')
      expect(kopf(db, formId)).toMatchObject({ sprache: 'de' })
    } finally {
      db.close()
    }
  })

  it('V3b: der Kopf kommt nach den Teilen — ein geänderter originalText gleich der alten Montage bleibt stehen', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = karlNowak(db)
      const nowak = teilId(db, formId, 'nachname', 'Nowak')
      fuehreAus(db, 'namensform.aendern', { id: formId, originalText: 'Carolus' })
      uebernehmen(db, {
        personId,
        formId,
        kopf: { originalText: 'Karl Friedrich Nowak' },
        teile: zielliste(db, formId).map((t) => (t.id === nowak ? { ...t, wert: 'Nowack' } : t)),
      })
      expect(originalText(db, formId)).toBe('Karl Friedrich Nowak')
    } finally {
      db.close()
    }
  })

  it('H2: der Kopf wird VOR dem ersten Schreibvorgang geprüft (Umschrift-Bezug, E7)', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = karlNowak(db)
      const fremd = karlNowak(db)
      const nowak = teilId(db, formId, 'nachname', 'Nowak')
      const teileGeaendert = zielliste(db, formId).map((t) => (t.id === nowak ? { ...t, wert: 'Nowack' } : t))
      const abzug = kanonischerAbzug(db)
      const transaktionen = transaktionAnzahl(db)
      // Jeder Schreibvorgang an name_part bricht ab: käme die Kopfprüfung erst danach, meldete sich dieser Abbruch statt ihres Codes.
      db.exec(`
        CREATE TEMP TRIGGER u110_teil_ai BEFORE INSERT ON main.name_part BEGIN SELECT RAISE(ABORT, 'u110: Teil geschrieben'); END;
        CREATE TEMP TRIGGER u110_teil_au BEFORE UPDATE ON main.name_part BEGIN SELECT RAISE(ABORT, 'u110: Teil geschrieben'); END;
        CREATE TEMP TRIGGER u110_teil_ad BEFORE DELETE ON main.name_part BEGIN SELECT RAISE(ABORT, 'u110: Teil geschrieben'); END;
      `)
      expect(fehlerCode(() => uebernehmen(db, { personId, formId, kopf: { umschriftVon: fremd.formId }, teile: teileGeaendert }))).toBe('VALIDIERUNG_UMSCHRIFT_BEZUG')
      expect(fehlerCode(() => uebernehmen(db, { personId, formId, kopf: { rolle: null }, teile: teileGeaendert }))).toBe('VALIDIERUNG_UMSCHRIFT_BEZUG')
      expect(transaktionAnzahl(db)).toBe(transaktionen)
      expect(kanonischerAbzug(db)).toBe(abzug)
    } finally {
      db.close()
    }
  })

  it('H2: ein Wurf mitten im Ablauf (nach geschriebenen Teilen) lässt nichts zurück', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = karlNowak(db)
      const nowak = teilId(db, formId, 'nachname', 'Nowak')
      const abzug = kanonischerAbzug(db)
      const transaktionen = transaktionAnzahl(db)
      db.exec("CREATE TEMP TRIGGER u110_form_au BEFORE UPDATE ON main.name_form BEGIN SELECT RAISE(ABORT, 'u110: Kopf geschrieben'); END;")
      expect(() =>
        uebernehmen(db, {
          personId,
          formId,
          kopf: { sprache: 'de' },
          teile: [...zielliste(db, formId).map((t) => (t.id === nowak ? { ...t, wert: 'Nowack' } : t)), { art: 'suffix', wert: 'jun.', istRufname: false }],
        }),
      ).toThrow('u110: Kopf geschrieben')
      db.exec('DROP TRIGGER temp.u110_form_au')
      expect(transaktionAnzahl(db)).toBe(transaktionen)
      expect(kanonischerAbzug(db)).toBe(abzug)
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })
})

/** Eine Form ohne Teile mit dem wortgetreuen Text `text` (über `namensform.anlegen` + `namensform.aendern`). */
function formOhneTeileMitText(db: Db, text: string): { readonly personId: string; readonly formId: string } {
  const personId = neuePerson(db)
  const formId = fuehreAus(db, 'namensform.anlegen', { personId, rolle: 'geburtsname' }).id
  fuehreAus(db, 'namensform.aendern', { id: formId, originalText: text })
  return { personId, formId }
}

/** Eine Form mit den Teilen [Karl, Nowak] und dem wortgetreuen Text „Karl" (gesetzt NACH den Teilen). */
function karlMitTextKarl(db: Db): { readonly personId: string; readonly formId: string } {
  const personId = neuePerson(db)
  const formId = fuehreAus(db, 'namensform.anlegen', { personId, rolle: 'geburtsname' }).id
  fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'vorname', wert: 'Karl' })
  fuehreAus(db, 'namensteil.anlegen', { namensformId: formId, art: 'nachname', wert: 'Nowak' })
  fuehreAus(db, 'namensform.aendern', { id: formId, originalText: 'Karl' })
  return { personId, formId }
}

const ANNA_NOWAK: readonly NamensformUebernehmenTeil[] = [
  { art: 'vorname', wert: 'Anna', istRufname: false },
  { art: 'nachname', wert: 'Nowak', istRufname: false },
]

/** Gespeicherte Zielliste ohne den Nachnamen „Nowak", dafür ein NEUER Nachname `nachname` (Tausch). */
function nachnameGetauscht(db: Db, formId: string, nachname: string): readonly NamensformUebernehmenTeil[] {
  const nowak = teilId(db, formId, 'nachname', 'Nowak')
  return [...zielliste(db, formId).filter((t) => t.id !== nowak), { art: 'nachname', wert: nachname, istRufname: false }]
}

describe('namensform.uebernehmen — E3 einmal je Aufruf (U-130-11-0b-e3-zwischenstand)', () => {
  it('Beispiel 1: wortgetreu „Anna" an einer Form ohne Teile bleibt bei [Anna, Nowak]; Undo/Redo bitgleich', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = formOhneTeileMitText(db, 'Anna')
      erwarteEinSchrittUndoRedo(db, () => {
        uebernehmen(db, { personId, formId, kopf: {}, teile: ANNA_NOWAK })
      })
      expect(folge(db, formId, 'vorname')).toEqual(['Anna@0'])
      expect(folge(db, formId, 'nachname')).toEqual(['Nowak@0'])
      expect(originalText(db, formId)).toBe('Anna')
    } finally {
      db.close()
    }
  })

  it('Beispiel 2: wortgetreu „Karl" an [Karl, Nowak] bleibt, wenn der Nachname getauscht wird; Undo/Redo bitgleich', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = karlMitTextKarl(db)
      expect(originalText(db, formId)).toBe('Karl')
      erwarteEinSchrittUndoRedo(db, () => {
        uebernehmen(db, { personId, formId, kopf: {}, teile: nachnameGetauscht(db, formId, 'Müller') })
      })
      expect(folge(db, formId, 'nachname')).toEqual(['Müller@0'])
      expect(originalText(db, formId)).toBe('Karl')
    } finally {
      db.close()
    }
  })

  it('wortgetreu „Joh. Georg Müller alias Miller" bleibt (Form ohne Teile, danach Nachname getauscht)', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = formOhneTeileMitText(db, 'Joh. Georg Müller alias Miller')
      uebernehmen(db, { personId, formId, kopf: {}, teile: ANNA_NOWAK })
      expect(originalText(db, formId)).toBe('Joh. Georg Müller alias Miller')
      uebernehmen(db, { personId, formId, kopf: { sprache: 'de' }, teile: nachnameGetauscht(db, formId, 'Miller') })
      expect(originalText(db, formId)).toBe('Joh. Georg Müller alias Miller')
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('ein automatisch montierter Text wird am Ende aus den Zielteilen neu montiert (auch NULL und neue Form)', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = karlNowak(db)
      expect(originalText(db, formId)).toBe('Karl Friedrich Nowak')
      erwarteEinSchrittUndoRedo(db, () => {
        uebernehmen(db, { personId, formId, kopf: {}, teile: nachnameGetauscht(db, formId, 'Müller') })
      })
      expect(originalText(db, formId)).toBe('Karl Friedrich Müller')

      const ohneText = fuehreAus(db, 'namensform.anlegen', { personId, rolle: 'ehename' }).id
      expect(originalText(db, ohneText)).toBeNull()
      uebernehmen(db, { personId, formId: ohneText, kopf: {}, teile: ANNA_NOWAK })
      expect(originalText(db, ohneText)).toBe('Anna Nowak')

      const neu = uebernehmen(db, { personId, formId: null, kopf: { rolle: 'ehename' }, teile: ANNA_NOWAK })
      expect(originalText(db, neu)).toBe('Anna Nowak')
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('ein mitgeschickter, abweichender originalText gewinnt — über wortgetreu und über automatisch', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = formOhneTeileMitText(db, 'Anna')
      erwarteEinSchrittUndoRedo(db, () => {
        uebernehmen(db, { personId, formId, kopf: { originalText: 'Anna N.' }, teile: ANNA_NOWAK })
      })
      expect(originalText(db, formId)).toBe('Anna N.')

      const karl = karlNowak(db)
      uebernehmen(db, { personId: karl.personId, formId: karl.formId, kopf: { originalText: 'Carl Nowak' }, teile: nachnameGetauscht(db, karl.formId, 'Nowack') })
      expect(originalText(db, karl.formId)).toBe('Carl Nowak')
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('No-op: ein zweiter, gleicher Aufruf nach Beispiel 1 schreibt nichts', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = formOhneTeileMitText(db, 'Anna')
      uebernehmen(db, { personId, formId, kopf: {}, teile: ANNA_NOWAK })
      const abzug = kanonischerAbzug(db)
      const transaktionen = transaktionAnzahl(db)
      uebernehmen(db, { personId, formId, kopf: { originalText: 'Anna' }, teile: zielliste(db, formId) })
      expect(transaktionAnzahl(db)).toBe(transaktionen)
      expect(kanonischerAbzug(db)).toBe(abzug)
    } finally {
      db.close()
    }
  })
})

/** Form aus `name.anlegen` mit angehängtem Rufnamen: Teile „Karl", „Hans Peter"*, „Gutnow", Text „Karl Gutnow"
 * (Anlege-Montage ohne den angehängten Rufnamen — `istMontierterOriginalText` erkennt sie als automatisch). */
function karlMitAngehaengtemRufnamen(db: Db): { readonly personId: string; readonly formId: string } {
  const personId = neuePerson(db)
  const formId = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl', rufnameText: 'Hans Peter', nachname: 'Gutnow' }).id
  return { personId, formId }
}

describe('namensform.uebernehmen — E3 ohne Montage-Änderung schreibt keinen Text (Review #205)', () => {
  it('Fall 1: Montage ohne angehängten Rufnamen, gleiche Zielliste, kopf {} — keine Transaktion, Text bleibt', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = karlMitAngehaengtemRufnamen(db)
      expect(originalText(db, formId)).toBe('Karl Gutnow')
      const abzug = kanonischerAbzug(db)
      const transaktionen = transaktionAnzahl(db)
      uebernehmen(db, { personId, formId, kopf: {}, teile: zielliste(db, formId) })
      expect(transaktionAnzahl(db)).toBe(transaktionen)
      expect(kanonischerAbzug(db)).toBe(abzug)
    } finally {
      db.close()
    }
  })

  it('Fall 2: „Anna  Nowak" (doppelter Leerraum) bleibt bei einem No-op — auch mit unverändert mitgeschicktem Text', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = formOhneTeileMitText(db, 'Anna')
      uebernehmen(db, { personId, formId, kopf: {}, teile: ANNA_NOWAK })
      fuehreAus(db, 'namensform.aendern', { id: formId, originalText: 'Anna  Nowak' })
      const abzug = kanonischerAbzug(db)
      const transaktionen = transaktionAnzahl(db)
      uebernehmen(db, { personId, formId, kopf: {}, teile: zielliste(db, formId) })
      uebernehmen(db, { personId, formId, kopf: { originalText: 'Anna  Nowak' }, teile: zielliste(db, formId) })
      expect(transaktionAnzahl(db)).toBe(transaktionen)
      expect(kanonischerAbzug(db)).toBe(abzug)
      expect(originalText(db, formId)).toBe('Anna  Nowak')
    } finally {
      db.close()
    }
  })

  it('Fall 3: nur der Kopf ändert sich — „Karl Gutnow" bleibt, sprache wird geschrieben', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = karlMitAngehaengtemRufnamen(db)
      erwarteEinSchrittUndoRedo(db, () => {
        uebernehmen(db, { personId, formId, kopf: { sprache: 'de' }, teile: zielliste(db, formId) })
      })
      expect(kopf(db, formId)).toMatchObject({ sprache: 'de' })
      expect(originalText(db, formId)).toBe('Karl Gutnow')
    } finally {
      db.close()
    }
  })
})

/** Setzt in der Zielliste den Rufnamen auf den Teil `id` (`null`: keinen). */
function mitRufname(liste: readonly NamensformUebernehmenTeil[], id: string | null): readonly NamensformUebernehmenTeil[] {
  return liste.map((t) => ({ ...t, istRufname: t.id !== undefined && t.id === id }))
}

/** Zielliste ohne den Nachnamen `alt`, dafür ein NEUER Nachname `neu`. */
function nachnameErsetzt(db: Db, formId: string, alt: string, neu: string): readonly NamensformUebernehmenTeil[] {
  const altId = teilId(db, formId, 'nachname', alt)
  return [...zielliste(db, formId).filter((t) => t.id !== altId), { art: 'nachname', wert: neu, istRufname: false }]
}

describe('namensform.uebernehmen — E3 bei Rufname- und Montage-Kombinationen (Nachreview #205)', () => {
  it('1a: Rufname vom angehängten „Hans Peter" auf „Karl" — Text folgt, danach auch dem Nachnamen', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = karlMitAngehaengtemRufnamen(db)
      erwarteEinSchrittUndoRedo(db, () => {
        uebernehmen(db, { personId, formId, kopf: {}, teile: mitRufname(zielliste(db, formId), teilId(db, formId, 'vorname', 'Karl')) })
      })
      expect(folge(db, formId, 'vorname')).toEqual(['Karl*@0', 'Hans Peter@1'])
      expect(originalText(db, formId)).toBe('Karl Hans Peter Gutnow')
      uebernehmen(db, { personId, formId, kopf: {}, teile: nachnameErsetzt(db, formId, 'Gutnow', 'Müller') })
      expect(originalText(db, formId)).toBe('Karl Hans Peter Müller')
    } finally {
      db.close()
    }
  })

  it('1b: Rufname entfernt — Text folgt, danach auch dem Nachnamen', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = karlMitAngehaengtemRufnamen(db)
      erwarteEinSchrittUndoRedo(db, () => {
        uebernehmen(db, { personId, formId, kopf: {}, teile: mitRufname(zielliste(db, formId), null) })
      })
      expect(originalText(db, formId)).toBe('Karl Hans Peter Gutnow')
      uebernehmen(db, { personId, formId, kopf: {}, teile: nachnameErsetzt(db, formId, 'Gutnow', 'Müller') })
      expect(originalText(db, formId)).toBe('Karl Hans Peter Müller')
    } finally {
      db.close()
    }
  })

  it('reines Löschen an einem automatischen Text folgt („Karl Friedrich Nowak" ohne Friedrich)', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = karlNowak(db)
      const friedrich = teilId(db, formId, 'vorname', 'Friedrich')
      erwarteEinSchrittUndoRedo(db, () => {
        uebernehmen(db, { personId, formId, kopf: {}, teile: zielliste(db, formId).filter((t) => t.id !== friedrich) })
      })
      expect(originalText(db, formId)).toBe('Karl Nowak')
    } finally {
      db.close()
    }
  })

  it('reines Löschen, Text danach weiter als Montage erkannt: neu montiert wie im Einzelbefehl („Anna  Nowak" → „Anna Nowak")', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const formId = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Anna', rufnameText: 'Maria', nachname: 'Nowak' }).id
      fuehreAus(db, 'namensform.aendern', { id: formId, originalText: 'Anna  Nowak' })
      const maria = teilId(db, formId, 'vorname', 'Maria')
      uebernehmen(db, { personId, formId, kopf: {}, teile: zielliste(db, formId).filter((t) => t.id !== maria) })
      expect(originalText(db, formId)).toBe('Anna Nowak')
      // Gegenprobe: derselbe Schritt als Einzelbefehl.
      const zweite = fuehreAus(db, 'name.anlegen', { personId, typ: 'ehename', vornamen: 'Anna', rufnameText: 'Maria', nachname: 'Nowak' }).id
      fuehreAus(db, 'namensform.aendern', { id: zweite, originalText: 'Anna  Nowak' })
      fuehreAus(db, 'namensteil.loeschen', { id: teilId(db, zweite, 'vorname', 'Maria') })
      expect(originalText(db, zweite)).toBe('Anna Nowak')
    } finally {
      db.close()
    }
  })

  it('nur Verschieben mit geänderter Montage folgt; der Rufname wandert mit dem Teil', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = karlMitAngehaengtemRufnamen(db)
      const liste = zielliste(db, formId)
      const hansPeter = teilId(db, formId, 'vorname', 'Hans Peter')
      const umgestellt = [...liste.filter((t) => t.id === hansPeter), ...liste.filter((t) => t.id !== hansPeter)]
      erwarteEinSchrittUndoRedo(db, () => {
        uebernehmen(db, { personId, formId, kopf: {}, teile: umgestellt })
      })
      expect(folge(db, formId, 'vorname')).toEqual(['Hans Peter*@0', 'Karl@1'])
      expect(originalText(db, formId)).toBe('Hans Peter Karl Gutnow')
    } finally {
      db.close()
    }
  })

  it('Rufname auf einen neu angelegten Vornamen am Ende: der neue Vorname erscheint im Text', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const formId = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl', nachname: 'Nowak' }).id
      expect(originalText(db, formId)).toBe('Karl Nowak')
      const liste = zielliste(db, formId)
      erwarteEinSchrittUndoRedo(db, () => {
        uebernehmen(db, {
          personId,
          formId,
          kopf: {},
          teile: [...liste.filter((t) => t.art === 'vorname'), { art: 'vorname', wert: 'Hans', istRufname: true }, ...liste.filter((t) => t.art !== 'vorname')],
        })
      })
      expect(folge(db, formId, 'vorname')).toEqual(['Karl@0', 'Hans*@1'])
      expect(originalText(db, formId)).toBe('Karl Hans Nowak')
    } finally {
      db.close()
    }
  })

  it('Vorname mit angehängtem Rufnamen gelöscht: „Karl Gutnow" bleibt, danach folgt er dem Nachnamen', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = karlMitAngehaengtemRufnamen(db)
      const hansPeter = teilId(db, formId, 'vorname', 'Hans Peter')
      uebernehmen(db, { personId, formId, kopf: {}, teile: zielliste(db, formId).filter((t) => t.id !== hansPeter) })
      expect(originalText(db, formId)).toBe('Karl Gutnow')
      uebernehmen(db, { personId, formId, kopf: {}, teile: nachnameErsetzt(db, formId, 'Gutnow', 'Müller') })
      expect(originalText(db, formId)).toBe('Karl Müller')
    } finally {
      db.close()
    }
  })
})
