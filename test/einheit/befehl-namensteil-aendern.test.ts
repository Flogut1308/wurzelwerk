// AP-1.30 PR 10-3 (A-02, A-19, F-01/F-02/F-03/F-05; docs/80 §33 V-130-10-3): `namensteil.aendern`
// über den echten Befehlsbus gegen eine migrierte `:memory:`-Datenbank — Wirkung (Teil-Semantik je Feld),
// No-op (AP-0.22), Undo/Redo bitgleich, Koaleszenz (ein Feld = Schlüssel, zwei = keiner), Fehlerfälle,
// E2 (kein Leerraum in Vorname-Teilen), E3 (montierter `original_text` folgt, wortgetreuer bleibt) und
// abgeleitete Tabellen gleich ihrem Neuaufbau + `integrity_check` nach jedem Schritt.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { fuehreAus } from '../../src/main/befehle/bus'
import { REGISTRIERUNG } from '../../src/main/befehle/registrierung'
import { journalAn, journalAus } from '../../src/main/journal/kontext'
import { redo, undo } from '../../src/main/journal/undo'
import { namensteilAendernEinSchema, type NamensteilAendernEin } from '../../src/shared/schemata/befehle'
import { kanonischerAbzug } from '../hilfsmittel/kanonischer-abzug'
import {
  angewendeteSchritte,
  anzeigename,
  type Db,
  erwarteAbgeleitetWieNeuaufbau,
  erwarteSchritteUndoRedoSauber,
  fehlerCode,
  folge,
  ids,
  jetztMs,
  neuePerson,
  neueTestDatenbank,
  originalText,
  teil,
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

/** Person mit Hauptform „Karl Friedrich* Nowak“ (über `name.anlegen`, montierter original_text). */
function karlNowak(db: Db): { readonly personId: string; readonly formId: string } {
  const personId = neuePerson(db)
  const formId = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl Friedrich', rufnameIndex: 1, nachname: 'Nowak' }).id
  return { personId, formId }
}

function schluessel(db: Db, ein: NamensteilAendernEin): string | null {
  const fn = REGISTRIERUNG['namensteil.aendern'].koaleszenzSchluessel
  if (fn === undefined) throw new Error('namensteil.aendern hat keine Schlüsselfunktion.')
  return fn(db, namensteilAendernEinSchema.parse(ein))
}

function formGeaendertAm(db: Db, formId: string): number | null | undefined {
  return db.prepare<{ readonly formId: string }, { readonly geaendert_am: number | null }>('SELECT geaendert_am FROM name_form WHERE id = @formId').get({ formId })
    ?.geaendert_am
}

describe('namensteil.aendern (AP-1.30 PR 10-3)', () => {
  it('ändert nur die mitgegebenen Felder (wert getrimmt); art, Stelle, Rufname und ID bleiben; andere Teile unberührt', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, formId } = karlNowak(db)
      const friedrich = teilId(db, formId, 'vorname', 'Friedrich')
      const vorher = teil(db, friedrich)
      const nachname = teile(db, formId, 'nachname')
      const karl = teil(db, teilId(db, formId, 'vorname', 'Karl'))
      warte(5000)
      fuehreAus(db, 'namensteil.aendern', { id: friedrich, wert: '  Fritz ' })
      expect(teil(db, friedrich)).toEqual({ ...vorher, wert: 'Fritz', geaendert_am: jetztMs() })
      expect(folge(db, formId, 'vorname')).toEqual(['Karl@0', 'Fritz*@1'])
      expect(teil(db, karl.id)).toEqual(karl)
      expect(teile(db, formId, 'nachname')).toEqual(nachname)
      expect(anzeigename(db, personId)).toBe('Karl Fritz Nowak')
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('feminineVariante: Wert setzt, null leert, fehlend bleibt; der Wert bleibt dabei', () => {
    const db = neueTestDatenbank()
    try {
      const { formId } = karlNowak(db)
      const nowak = teilId(db, formId, 'nachname', 'Nowak')
      fuehreAus(db, 'namensteil.aendern', { id: nowak, feminineVariante: 'Nowakowa' })
      expect(teil(db, nowak)).toMatchObject({ wert: 'Nowak', feminine_variante: 'Nowakowa' })
      fuehreAus(db, 'namensteil.aendern', { id: nowak, wert: 'Nowack' })
      expect(teil(db, nowak)).toMatchObject({ wert: 'Nowack', feminine_variante: 'Nowakowa' })
      fuehreAus(db, 'namensteil.aendern', { id: nowak, feminineVariante: null })
      expect(teil(db, nowak)).toMatchObject({ wert: 'Nowack', feminine_variante: null })
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('No-op (AP-0.22): gleicher Wert (auch mit Leerraum), gleiche Variante oder leere Nutzlast — kein Schreibvorgang, keine Transaktion', () => {
    const db = neueTestDatenbank()
    try {
      const { formId } = karlNowak(db)
      const nowak = teilId(db, formId, 'nachname', 'Nowak')
      fuehreAus(db, 'namensteil.aendern', { id: nowak, feminineVariante: 'Nowakowa' })
      const abzug = kanonischerAbzug(db)
      const transaktionen = transaktionAnzahl(db)
      warte(5000)
      fuehreAus(db, 'namensteil.aendern', { id: nowak })
      fuehreAus(db, 'namensteil.aendern', { id: nowak, wert: 'Nowak' })
      fuehreAus(db, 'namensteil.aendern', { id: nowak, wert: ' Nowak\t' })
      fuehreAus(db, 'namensteil.aendern', { id: nowak, feminineVariante: 'Nowakowa', feld: 'feminineVariante' })
      fuehreAus(db, 'namensteil.aendern', { id: nowak, wert: 'Nowak', feminineVariante: 'Nowakowa' })
      expect(kanonischerAbzug(db)).toBe(abzug)
      expect(transaktionAnzahl(db)).toBe(transaktionen)
    } finally {
      db.close()
    }
  })

  it('Undo/Redo bitgleich je Schritt, kein Doppel, abgeleitete Tabellen wie Neuaufbau (Rufname-Teil, Nachname, Variante)', () => {
    const db = neueTestDatenbank()
    try {
      const { formId } = karlNowak(db)
      const friedrich = teilId(db, formId, 'vorname', 'Friedrich')
      const nowak = teilId(db, formId, 'nachname', 'Nowak')
      erwarteSchritteUndoRedoSauber(db, [
        () => fuehreAus(db, 'namensteil.aendern', { id: friedrich, wert: 'Fritz' }),
        () => fuehreAus(db, 'namensteil.aendern', { id: nowak, wert: "O'Nowak", feminineVariante: 'Nowakowa' }),
        () => fuehreAus(db, 'namensteil.aendern', { id: nowak, feminineVariante: null }),
        () => fuehreAus(db, 'namensteil.aendern', { id: friedrich, wert: 'Friedrich' }),
      ])
      expect(folge(db, formId, 'vorname')).toEqual(['Karl@0', 'Friedrich*@1'])
      expect(folge(db, formId, 'nachname')).toEqual(["O'Nowak@0"])
    } finally {
      db.close()
    }
  })

  it('Fehler: unbekannte ID, leerer Wert, Leerraum im Vornamen (E2) — kein Schreibvorgang; Zod: wert nie null', () => {
    const db = neueTestDatenbank()
    try {
      const { formId } = karlNowak(db)
      const karl = teilId(db, formId, 'vorname', 'Karl')
      const nowak = teilId(db, formId, 'nachname', 'Nowak')
      const abzug = kanonischerAbzug(db)
      const transaktionen = transaktionAnzahl(db)
      expect(fehlerCode(() => fuehreAus(db, 'namensteil.aendern', { id: 'gibt-es-nicht', wert: 'Karl' }))).toBe('NICHT_GEFUNDEN_NAMENSTEIL')
      expect(fehlerCode(() => fuehreAus(db, 'namensteil.aendern', { id: nowak, wert: '' }))).toBe('VALIDIERUNG_NAMENSTEIL_LEER')
      expect(fehlerCode(() => fuehreAus(db, 'namensteil.aendern', { id: nowak, wert: ' \t ', feminineVariante: 'Nowakowa' }))).toBe('VALIDIERUNG_NAMENSTEIL_LEER')
      expect(fehlerCode(() => fuehreAus(db, 'namensteil.aendern', { id: karl, wert: 'Karl Heinz' }))).toBe('VALIDIERUNG_NAMENSTEIL_LEERRAUM')
      expect(fehlerCode(() => fuehreAus(db, 'namensteil.aendern', { id: karl, wert: 'Karl Heinz' }))).toBe('VALIDIERUNG_NAMENSTEIL_LEERRAUM')
      expect(kanonischerAbzug(db)).toBe(abzug)
      expect(transaktionAnzahl(db)).toBe(transaktionen)
      expect(namensteilAendernEinSchema.safeParse({ id: nowak, wert: null }).success).toBe(false)
      expect(namensteilAendernEinSchema.safeParse({ id: nowak, feld: 'art' }).success).toBe(false)
      expect(namensteilAendernEinSchema.safeParse({ id: nowak, feminineVariante: null, feld: 'feminineVariante' }).success).toBe(true)
      // E2 gilt nur für Vornamen: mehrwortiger Nachname ist erlaubt.
      fuehreAus(db, 'namensteil.aendern', { id: nowak, wert: 'Lüdenscheidt genannt Schulte' })
      expect(folge(db, formId, 'nachname')).toEqual(['Lüdenscheidt genannt Schulte@0'])
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('E2 prüft nur einen GEÄNDERTEN Wert: ein mehrwortiger Vorname aus Altbestand bleibt in seiner Variante bearbeitbar', () => {
    const db = neueTestDatenbank()
    try {
      const { formId } = karlNowak(db)
      const karl = teilId(db, formId, 'vorname', 'Karl')
      journalAus(db, 'Test V-130-10-3: mehrwortigen Vornamen wie Altbestand (Migration 0006, rufname_text) herstellen.')
      db.prepare("UPDATE name_part SET wert = 'Hans Peter' WHERE id = @karl").run({ karl })
      journalAn(db)
      fuehreAus(db, 'namensteil.aendern', { id: karl, wert: 'Hans Peter', feminineVariante: 'Hanna' })
      expect(teil(db, karl)).toMatchObject({ wert: 'Hans Peter', feminine_variante: 'Hanna' })
      expect(fehlerCode(() => fuehreAus(db, 'namensteil.aendern', { id: karl, wert: 'Hans  Peter' }))).toBe('VALIDIERUNG_NAMENSTEIL_LEERRAUM')
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('E3: montierter original_text folgt dem neuen Wert; Undo stellt ihn zurück; eine Variante berührt die Form nicht', () => {
    const db = neueTestDatenbank()
    try {
      const { formId } = karlNowak(db)
      expect(originalText(db, formId)).toBe('Karl Friedrich Nowak')
      const karl = teilId(db, formId, 'vorname', 'Karl')
      const nowak = teilId(db, formId, 'nachname', 'Nowak')
      erwarteSchritteUndoRedoSauber(db, [
        () => fuehreAus(db, 'namensteil.aendern', { id: karl, wert: 'Carl' }),
        () => fuehreAus(db, 'namensteil.aendern', { id: nowak, wert: 'Nowack' }),
      ])
      expect(originalText(db, formId)).toBe('Carl Friedrich Nowack')
      const formStand = formGeaendertAm(db, formId)
      warte(5000)
      fuehreAus(db, 'namensteil.aendern', { id: nowak, feminineVariante: 'Nowackowa' })
      expect(formGeaendertAm(db, formId)).toBe(formStand)
      expect(originalText(db, formId)).toBe('Carl Friedrich Nowack')
    } finally {
      db.close()
    }
  })

  it('E3: wortgetreuer original_text bleibt unverändert', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const formId = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl', nachname: 'Nowak', originalText: 'Carolus Nowak' }).id
      fuehreAus(db, 'namensteil.aendern', { id: teilId(db, formId, 'vorname', 'Karl'), wert: 'Carl' })
      expect(originalText(db, formId)).toBe('Carolus Nowak')
      expect(anzeigename(db, personId)).toBe('Carl Nowak')
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })
})

describe('namensteil.aendern — Koaleszenz (AP-1.30 PR 4/10-3)', () => {
  it('Schlüssel `namensteil.aendern:<id>:<feld>` nur, wenn sich genau das genannte Feld ändert', () => {
    const db = neueTestDatenbank()
    try {
      const { formId } = karlNowak(db)
      const nowak = teilId(db, formId, 'nachname', 'Nowak')
      expect(schluessel(db, { id: nowak, wert: 'Nowack', feld: 'wert' })).toBe(`namensteil.aendern:${nowak}:wert`)
      expect(schluessel(db, { id: nowak, feminineVariante: 'Nowakowa', feld: 'feminineVariante' })).toBe(`namensteil.aendern:${nowak}:feminineVariante`)
      // Zwei Felder ändern sich → kein Schlüssel.
      expect(schluessel(db, { id: nowak, wert: 'Nowack', feminineVariante: 'Nowakowa', feld: 'wert' })).toBeNull()
      // Ein anderes als das genannte Feld ändert sich → kein Schlüssel.
      expect(schluessel(db, { id: nowak, feminineVariante: 'Nowakowa', feld: 'wert' })).toBeNull()
      // Ohne `feld`, No-op, unbekannte ID → kein Schlüssel (der Handler meldet den Fehler).
      expect(schluessel(db, { id: nowak, wert: 'Nowack' })).toBeNull()
      expect(schluessel(db, { id: nowak, wert: ' Nowak ', feld: 'wert' })).toBeNull()
      expect(schluessel(db, { id: 'gibt-es-nicht', wert: 'Nowack', feld: 'wert' })).toBeNull()
      // Ein mitgegebenes, aber unverändertes zweites Feld zählt nicht.
      expect(schluessel(db, { id: nowak, wert: 'Nowack', feminineVariante: null, feld: 'wert' })).toBe(`namensteil.aendern:${nowak}:wert`)
    } finally {
      db.close()
    }
  })

  it('schnelle Folge am selben Feld = ein Undo-Schritt; Undo stellt den Ausgangsstand bitgleich her, Redo den Endstand', () => {
    const db = neueTestDatenbank()
    try {
      const { formId } = karlNowak(db)
      const nowak = teilId(db, formId, 'nachname', 'Nowak')
      const ausgang = kanonischerAbzug(db)
      const vorher = angewendeteSchritte(db)
      warte(5000)
      for (const wert of ['N', 'No', 'Now', 'Nowa', 'Nowack']) {
        warte(100)
        fuehreAus(db, 'namensteil.aendern', { id: nowak, wert, feld: 'wert' })
      }
      expect(angewendeteSchritte(db) - vorher).toBe(1)
      expect(originalText(db, formId)).toBe('Karl Friedrich Nowack')
      erwarteAbgeleitetWieNeuaufbau(db)
      const endstand = kanonischerAbzug(db)
      undo(db)
      expect(kanonischerAbzug(db)).toBe(ausgang)
      erwarteAbgeleitetWieNeuaufbau(db)
      redo(db)
      expect(kanonischerAbzug(db)).toBe(endstand)
      expect(ids(db, formId, 'nachname')).toEqual([nowak])
    } finally {
      db.close()
    }
  })

  it('zwei Felder in einem Aufruf: eigener Undo-Schritt auch im Fenster', () => {
    const db = neueTestDatenbank()
    try {
      const { formId } = karlNowak(db)
      const nowak = teilId(db, formId, 'nachname', 'Nowak')
      const vorher = angewendeteSchritte(db)
      warte(5000)
      fuehreAus(db, 'namensteil.aendern', { id: nowak, wert: 'Nowack', feld: 'wert' })
      warte(100)
      fuehreAus(db, 'namensteil.aendern', { id: nowak, wert: 'Nowak', feminineVariante: 'Nowakowa', feld: 'wert' })
      expect(angewendeteSchritte(db) - vorher).toBe(2)
      undo(db)
      expect(teil(db, nowak)).toMatchObject({ wert: 'Nowack', feminine_variante: null })
    } finally {
      db.close()
    }
  })
})
