// AP-1.30 PR 10-1 (A-02, A-19, F-01/F-02/F-03/F-05; docs/80 §33 V-130-10-1): `namensform.anlegen`
// und `namensform.aendern` über den echten Befehlsbus gegen eine migrierte `:memory:`-Datenbank —
// Wirkung, Undo/Redo bitgleich (kanonischer Abzug), Fehlerfälle, No-op, Koaleszenzschlüssel, E7
// (`rolle = null` nur mit Umschrift) und abgeleitete Tabellen gleich ihrem Neuaufbau (Form ohne Teile).
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
import { REGISTRIERUNG } from '../../src/main/befehle/registrierung'
import { personDetail } from '../../src/main/abfragen/person-detail'
import { journalAn, journalAus } from '../../src/main/journal/kontext'
import { redo, undo } from '../../src/main/journal/undo'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'
import { namensformAendernEinSchema, namensformAnlegenEinSchema, type NamensformAendernEin } from '../../src/shared/schemata/befehle'
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

interface FormZeile {
  readonly id: string
  readonly person_id: string
  readonly sprache: string | null
  readonly schrift: string | null
  readonly reihenfolge: string | null
  readonly rolle: string | null
  readonly rollen_notiz: string | null
  readonly ist_bevorzugt: number
  readonly umschrift_von: string | null
  readonly umschrift_norm: string | null
  readonly konfidenz: number | null
  readonly sortier_index: number | null
  readonly gueltig_von: number | null
  readonly gueltig_bis: number | null
  readonly original_text: string | null
  readonly erstellt_am: number | null
  readonly geaendert_am: number | null
}

function form(db: Db, id: string): FormZeile | undefined {
  return db
    .prepare<{ readonly id: string }, FormZeile>(
      `SELECT id, person_id, sprache, schrift, reihenfolge, rolle, rollen_notiz, ist_bevorzugt, umschrift_von, umschrift_norm,
         konfidenz, sortier_index, gueltig_von, gueltig_bis, original_text, erstellt_am, geaendert_am
       FROM name_form WHERE id = @id`,
    )
    .get({ id })
}

function zaehle(db: Db, sql: string, parameter: Record<string, string> = {}): number {
  const zeile = db.prepare<Record<string, string>, { readonly anzahl: number }>(sql).get(parameter)
  if (zeile === undefined) throw new Error(`zaehle(): COUNT lieferte keine Zeile (${sql}).`)
  return zeile.anzahl
}

function transaktionAnzahl(db: Db): number {
  return zaehle(db, 'SELECT COUNT(*) AS anzahl FROM transaktion')
}

function teilAnzahl(db: Db, formId: string): number {
  return zaehle(db, 'SELECT COUNT(*) AS anzahl FROM name_part WHERE name_form_id = @formId', { formId })
}

function fehlerCode(fn: () => void): string | undefined {
  try {
    fn()
    return undefined
  } catch (fehler) {
    return fehler instanceof WurzelFehler ? fehler.code : `KEIN_WURZELFEHLER:${String(fehler)}`
  }
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

describe('namensform.anlegen (AP-1.30 PR 10-1)', () => {
  it('legt die erste Form einer Person bevorzugt an, OHNE Bestandteile, mit allen Kopf-Feldern', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'namensform.anlegen', {
        personId,
        rolle: 'geburtsname',
        rollenNotiz: 'Taufbuch 1802',
        sprache: 'pl',
        schrift: 'latn',
        reihenfolge: 'nachname_zuerst',
        konfidenz: 3,
        gueltigVon: 18020101,
        gueltigBis: 18300101,
        originalText: "Nowak O'Brien",
      })
      expect(form(db, id)).toEqual({
        id,
        person_id: personId,
        sprache: 'pl',
        schrift: 'latn',
        reihenfolge: 'nachname_zuerst',
        rolle: 'geburtsname',
        rollen_notiz: 'Taufbuch 1802',
        ist_bevorzugt: 1,
        umschrift_von: null,
        umschrift_norm: null,
        konfidenz: 3,
        sortier_index: null,
        gueltig_von: 18020101,
        gueltig_bis: 18300101,
        original_text: "Nowak O'Brien",
        erstellt_am: jetzt,
        geaendert_am: jetzt,
      })
      expect(teilAnzahl(db, id)).toBe(0)
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('jede weitere Form ist nicht bevorzugt; fehlende optionale Felder bleiben NULL (auch original_text)', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const erste = fuehreAus(db, 'namensform.anlegen', { personId, rolle: 'geburtsname' }).id
      const zweite = fuehreAus(db, 'namensform.anlegen', { personId, rolle: 'ehename' }).id
      expect(form(db, erste)?.ist_bevorzugt).toBe(1)
      expect(form(db, zweite)).toMatchObject({
        ist_bevorzugt: 0,
        rolle: 'ehename',
        sprache: null,
        schrift: null,
        reihenfolge: null,
        rollen_notiz: null,
        umschrift_von: null,
        umschrift_norm: null,
        konfidenz: null,
        gueltig_von: null,
        gueltig_bis: null,
        original_text: null,
      })
      // Eine Person mit bestehender (flacher) Form: auch dann ist die neue Form nicht bevorzugt.
      const andere = neuePerson(db)
      fuehreAus(db, 'name.anlegen', { personId: andere, typ: 'geburtsname', vornamen: 'Anna', nachname: 'Müller' })
      const dritte = fuehreAus(db, 'namensform.anlegen', { personId: andere, rolle: 'vulgo' }).id
      expect(form(db, dritte)?.ist_bevorzugt).toBe(0)
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('Umschrift: rolle = null mit umschriftVon (Form derselben Person) und umschriftNorm', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const original = fuehreAus(db, 'namensform.anlegen', { personId, rolle: 'geburtsname', schrift: 'cyrl', originalText: 'Иван Петров' }).id
      const umschrift = fuehreAus(db, 'namensform.anlegen', {
        personId,
        rolle: null,
        schrift: 'latn',
        umschriftVon: original,
        umschriftNorm: 'manuell',
        originalText: 'Iwan Petrow',
      }).id
      expect(form(db, umschrift)).toMatchObject({ rolle: null, umschrift_von: original, umschrift_norm: 'manuell', ist_bevorzugt: 0 })
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('E7: rolle = null ohne umschriftVon lehnt das Zod-Schema ab — kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      expect(namensformAnlegenEinSchema.safeParse({ personId, rolle: null }).success).toBe(false)
      expect(namensformAnlegenEinSchema.safeParse({ personId, rolle: null, umschriftNorm: 'iso9' }).success).toBe(false)
      // `rolle` ist Pflicht (null-fähig, nicht weglassbar) und 'transliteriert' ist keine Rolle mehr (0006).
      expect(namensformAnlegenEinSchema.safeParse({ personId }).success).toBe(false)
      expect(namensformAnlegenEinSchema.safeParse({ personId, rolle: 'transliteriert', umschriftVon: 'x' }).success).toBe(false)
      expect(namensformAnlegenEinSchema.safeParse({ personId, rolle: null, umschriftVon: 'x' }).success).toBe(true)
      expect(namensformAnlegenEinSchema.safeParse({ personId, rolle: 'geburtsname', konfidenz: 5 }).success).toBe(false)

      const vorher = transaktionAnzahl(db)
      expect(() => fuehreAus(db, 'namensform.anlegen', { personId, rolle: null })).toThrow()
      expect(transaktionAnzahl(db)).toBe(vorher)
      expect(zaehle(db, 'SELECT COUNT(*) AS anzahl FROM name_form')).toBe(0)
    } finally {
      db.close()
    }
  })

  it('Fehlerfälle: unbekannte Person, unbekannte Ursprungsform, Ursprungsform einer anderen Person — nichts geschrieben', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const andere = neuePerson(db)
      const fremdeForm = fuehreAus(db, 'namensform.anlegen', { personId: andere, rolle: 'geburtsname' }).id
      const vorher = transaktionAnzahl(db)
      const abzug = kanonischerAbzug(db)

      expect(fehlerCode(() => fuehreAus(db, 'namensform.anlegen', { personId: 'gibt-es-nicht', rolle: 'geburtsname' }))).toBe('NICHT_GEFUNDEN_PERSON')
      expect(fehlerCode(() => fuehreAus(db, 'namensform.anlegen', { personId, rolle: null, umschriftVon: 'gibt-es-nicht' }))).toBe('NICHT_GEFUNDEN_NAME')
      expect(fehlerCode(() => fuehreAus(db, 'namensform.anlegen', { personId, rolle: null, umschriftVon: fremdeForm }))).toBe('VALIDIERUNG_UMSCHRIFT_BEZUG')

      expect(transaktionAnzahl(db)).toBe(vorher)
      expect(kanonischerAbzug(db)).toBe(abzug)
    } finally {
      db.close()
    }
  })

  it('Undo/Redo bitgleich; genau ein Journalschritt; abgeleitete Tabellen wie Neuaufbau', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const original = fuehreAus(db, 'namensform.anlegen', { personId, rolle: 'geburtsname', originalText: 'Иван' }).id
      warte(5000)
      const ausgang = kanonischerAbzug(db)
      const vorher = transaktionAnzahl(db)

      fuehreAus(db, 'namensform.anlegen', { personId, rolle: null, umschriftVon: original, umschriftNorm: 'iso9', originalText: 'Ivan' })
      expect(transaktionAnzahl(db) - vorher).toBe(1)
      const nachher = kanonischerAbzug(db)

      undo(db)
      expect(kanonischerAbzug(db)).toBe(ausgang)
      erwarteAbgeleitetWieNeuaufbau(db)
      redo(db)
      expect(kanonischerAbzug(db)).toBe(nachher)
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('E5: name.loeschen und hauptname.wechseln arbeiten auf einer Form ohne Teile; Undo bitgleich; Lesemodell trägt sie', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const erste = fuehreAus(db, 'namensform.anlegen', { personId, rolle: 'geburtsname' }).id
      const zweite = fuehreAus(db, 'namensform.anlegen', { personId, rolle: 'ehename', originalText: 'Anna Schmidt' }).id
      expect(personDetail(db, { personId }).namen.map((name) => name.id).sort()).toEqual([erste, zweite].sort())
      warte(5000)

      const vorWechsel = kanonischerAbzug(db)
      fuehreAus(db, 'hauptname.wechseln', { personId, alt: erste, neu: zweite })
      expect(form(db, zweite)?.ist_bevorzugt).toBe(1)
      expect(form(db, erste)?.ist_bevorzugt).toBe(0)
      erwarteAbgeleitetWieNeuaufbau(db)
      undo(db)
      expect(kanonischerAbzug(db)).toBe(vorWechsel)

      // Löschen der bevorzugten Form rückt die verbliebene nach.
      fuehreAus(db, 'name.loeschen', { id: erste })
      expect(form(db, erste)).toBeUndefined()
      expect(form(db, zweite)?.ist_bevorzugt).toBe(1)
      erwarteAbgeleitetWieNeuaufbau(db)
      undo(db)
      expect(kanonischerAbzug(db)).toBe(vorWechsel)
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })
})

// -----------------------------------------------------------------------------------------------
// namensform.aendern
// -----------------------------------------------------------------------------------------------

const GRUND = 'Test V-130-10-1: Zustände herstellen, die kein Befehl schreibt (sortier_index, Altbestand ohne Rolle/Ursprung).'

interface TeilZeile {
  readonly id: string
  readonly art: string
  readonly wert: string
  readonly ist_rufname: number
  readonly sortier_index: number
  readonly feminine_variante: string | null
  readonly geaendert_am: number | null
}

function teile(db: Db, formId: string): readonly TeilZeile[] {
  return db
    .prepare<{ readonly formId: string }, TeilZeile>(
      `SELECT id, art, wert, ist_rufname, sortier_index, feminine_variante, geaendert_am
       FROM name_part WHERE name_form_id = @formId ORDER BY art, sortier_index, id`,
    )
    .all({ formId })
}

function angewendeteSchritte(db: Db): number {
  return zaehle(db, "SELECT COUNT(*) AS anzahl FROM transaktion WHERE status = 'angewendet'")
}

function schluessel(db: Db, ein: NamensformAendernEin): string | null {
  const fn = REGISTRIERUNG['namensform.aendern'].koaleszenzSchluessel
  if (fn === undefined) throw new Error('namensform.aendern hat keine Schlüsselfunktion.')
  return fn(db, namensformAendernEinSchema.parse(ein))
}

/** Person mit Hauptform (über `name.anlegen`, also MIT Teilen) und einer zweiten, teillosen Form. */
function personMitZweiFormen(db: Db): { readonly personId: string; readonly haupt: string; readonly zweite: string } {
  const personId = neuePerson(db)
  const haupt = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl Friedrich', rufnameIndex: 1, nachname: 'Nowak' }).id
  const zweite = fuehreAus(db, 'namensform.anlegen', { personId, rolle: 'ehename', rollenNotiz: 'Heiratsregister', sprache: 'de' }).id
  return { personId, haupt, zweite }
}

describe('namensform.aendern (AP-1.30 PR 10-1)', () => {
  it('ändert nur die mitgegebenen Kopf-Felder; ist_bevorzugt, person_id, sortier_index und Teile bleiben', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, haupt } = personMitZweiFormen(db)
      journalAus(db, GRUND)
      db.prepare('UPDATE name_form SET sortier_index = 7 WHERE id = @haupt').run({ haupt })
      journalAn(db)
      const vorher = form(db, haupt)
      const teileVorher = teile(db, haupt)
      expect(teileVorher.length).toBeGreaterThan(0)
      warte(5000)

      fuehreAus(db, 'namensform.aendern', { id: haupt, rollenNotiz: 'Taufbuch 1802', konfidenz: 2, reihenfolge: 'nachname_zuerst' })

      expect(form(db, haupt)).toEqual({ ...vorher, rollen_notiz: 'Taufbuch 1802', konfidenz: 2, reihenfolge: 'nachname_zuerst', geaendert_am: jetzt })
      expect(form(db, haupt)).toMatchObject({ person_id: personId, ist_bevorzugt: 1, sortier_index: 7 })
      expect(teile(db, haupt)).toEqual(teileVorher)
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('null leert ein Feld; ein fehlendes Feld bleibt', () => {
    const db = neueTestDatenbank()
    try {
      const { zweite } = personMitZweiFormen(db)
      fuehreAus(db, 'namensform.aendern', { id: zweite, rollenNotiz: null })
      expect(form(db, zweite)).toMatchObject({ rollen_notiz: null, sprache: 'de', rolle: 'ehename' })
    } finally {
      db.close()
    }
  })

  it('ist_bevorzugt und person_id stehen nicht im Vertrag (Zod entfernt sie) und bleiben unverändert', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, zweite } = personMitZweiFormen(db)
      const andere = neuePerson(db)
      const roh: unknown = { id: zweite, istBevorzugt: 1, personId: andere, ist_bevorzugt: 1, person_id: andere, sprache: 'pl' }
      const geparst = namensformAendernEinSchema.parse(roh)
      expect(geparst).toEqual({ id: zweite, sprache: 'pl' })
      fuehreAus(db, 'namensform.aendern', geparst)
      expect(form(db, zweite)).toMatchObject({ person_id: personId, ist_bevorzugt: 0, sprache: 'pl' })
    } finally {
      db.close()
    }
  })

  it("A-19: umschrift_norm = 'manuell' bleibt, solange umschriftNorm nicht ausdrücklich mitgegeben wird", () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const kyrillisch = fuehreAus(db, 'namensform.anlegen', { personId, rolle: 'geburtsname', schrift: 'cyrl', originalText: 'Иван' }).id
      const zweiteQuelle = fuehreAus(db, 'namensform.anlegen', { personId, rolle: 'ehename', schrift: 'cyrl', originalText: 'Иван Петров' }).id
      const umschrift = fuehreAus(db, 'namensform.anlegen', { personId, rolle: null, umschriftVon: kyrillisch, umschriftNorm: 'manuell', originalText: 'Iwan' }).id

      // Andere Felder, sogar ein neuer Ursprung: die manuelle Umschrift bleibt als solche markiert.
      fuehreAus(db, 'namensform.aendern', { id: umschrift, originalText: 'Iwan Petrow', umschriftVon: zweiteQuelle, schrift: 'latn' })
      expect(form(db, umschrift)).toMatchObject({ umschrift_norm: 'manuell', umschrift_von: zweiteQuelle, original_text: 'Iwan Petrow' })

      // Ausdrücklich gesetzt: dann (und nur dann) ändert sie sich.
      fuehreAus(db, 'namensform.aendern', { id: umschrift, umschriftNorm: 'iso9' })
      expect(form(db, umschrift)?.umschrift_norm).toBe('iso9')
      fuehreAus(db, 'namensform.aendern', { id: umschrift, umschriftNorm: null })
      expect(form(db, umschrift)?.umschrift_norm).toBeNull()
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('AP-0.22 No-op: inhaltsgleicher Aufruf (oder nur die ID) schreibt nichts — keine Transaktion, kein neuer Zeitstempel, kein Schlüssel', () => {
    const db = neueTestDatenbank()
    try {
      const { zweite } = personMitZweiFormen(db)
      const vorher = form(db, zweite)
      const schritte = transaktionAnzahl(db)
      warte(5000)

      fuehreAus(db, 'namensform.aendern', { id: zweite })
      fuehreAus(db, 'namensform.aendern', { id: zweite, rolle: 'ehename', rollenNotiz: 'Heiratsregister', sprache: 'de', konfidenz: null, feld: 'rollenNotiz' })

      expect(transaktionAnzahl(db)).toBe(schritte)
      expect(form(db, zweite)).toEqual(vorher)
      expect(schluessel(db, { id: zweite, rollenNotiz: 'Heiratsregister', feld: 'rollenNotiz' })).toBeNull()
    } finally {
      db.close()
    }
  })

  it('E7: rolle = null zusammen mit umschriftVon = null lehnt das Zod-Schema ab', () => {
    expect(namensformAendernEinSchema.safeParse({ id: 'x', rolle: null, umschriftVon: null }).success).toBe(false)
    expect(namensformAendernEinSchema.safeParse({ id: 'x', rolle: null }).success).toBe(true)
    expect(namensformAendernEinSchema.safeParse({ id: 'x', rolle: 'transliteriert' }).success).toBe(false)
    expect(namensformAendernEinSchema.safeParse({ id: 'x', konfidenz: 0 }).success).toBe(false)
    expect(namensformAendernEinSchema.safeParse({ id: 'x', feld: 'istBevorzugt' }).success).toBe(false)
  })

  it('Fehlerfälle — nichts geschrieben: unbekannte Form, Ursprung unbekannt/fremd/selbst/zirkulär, Rolle weg ohne Ursprung, Ursprung weg ohne Rolle', () => {
    const db = neueTestDatenbank()
    try {
      const { personId, haupt, zweite } = personMitZweiFormen(db)
      const umschrift = fuehreAus(db, 'namensform.anlegen', { personId, rolle: null, umschriftVon: haupt }).id
      const fremd = fuehreAus(db, 'namensform.anlegen', { personId: neuePerson(db), rolle: 'geburtsname' }).id
      const schritte = transaktionAnzahl(db)
      const abzug = kanonischerAbzug(db)

      expect(fehlerCode(() => fuehreAus(db, 'namensform.aendern', { id: 'gibt-es-nicht', sprache: 'de' }))).toBe('NICHT_GEFUNDEN_NAME')
      expect(fehlerCode(() => fuehreAus(db, 'namensform.aendern', { id: zweite, umschriftVon: 'gibt-es-nicht' }))).toBe('NICHT_GEFUNDEN_NAME')
      expect(fehlerCode(() => fuehreAus(db, 'namensform.aendern', { id: zweite, umschriftVon: fremd }))).toBe('VALIDIERUNG_UMSCHRIFT_BEZUG')
      expect(fehlerCode(() => fuehreAus(db, 'namensform.aendern', { id: zweite, umschriftVon: zweite }))).toBe('VALIDIERUNG_UMSCHRIFT_BEZUG')
      // haupt → umschrift → haupt wäre ein Kreis.
      expect(fehlerCode(() => fuehreAus(db, 'namensform.aendern', { id: haupt, umschriftVon: umschrift }))).toBe('VALIDIERUNG_UMSCHRIFT_BEZUG')
      expect(fehlerCode(() => fuehreAus(db, 'namensform.aendern', { id: zweite, rolle: null }))).toBe('VALIDIERUNG_UMSCHRIFT_BEZUG')
      expect(fehlerCode(() => fuehreAus(db, 'namensform.aendern', { id: umschrift, umschriftVon: null }))).toBe('VALIDIERUNG_UMSCHRIFT_BEZUG')

      expect(transaktionAnzahl(db)).toBe(schritte)
      expect(kanonischerAbzug(db)).toBe(abzug)

      // Gegenprobe: mit Ursprung darf die Rolle weg, mit Rolle darf der Ursprung weg.
      fuehreAus(db, 'namensform.aendern', { id: zweite, rolle: null, umschriftVon: haupt })
      expect(form(db, zweite)).toMatchObject({ rolle: null, umschrift_von: haupt })
      fuehreAus(db, 'namensform.aendern', { id: umschrift, rolle: 'aka', umschriftVon: null })
      expect(form(db, umschrift)).toMatchObject({ rolle: 'aka', umschrift_von: null })
    } finally {
      db.close()
    }
  })

  it('Altbestand ohne Rolle und ohne Ursprung (0006-Umzug von „transliteriert“) bleibt in den übrigen Feldern bearbeitbar', () => {
    const db = neueTestDatenbank()
    try {
      const { zweite } = personMitZweiFormen(db)
      journalAus(db, GRUND)
      db.prepare('UPDATE name_form SET rolle = NULL, umschrift_von = NULL WHERE id = @zweite').run({ zweite })
      journalAn(db)
      fuehreAus(db, 'namensform.aendern', { id: zweite, originalText: 'Iwan' })
      expect(form(db, zweite)).toMatchObject({ rolle: null, umschrift_von: null, original_text: 'Iwan' })
    } finally {
      db.close()
    }
  })

  it('Undo/Redo bitgleich (auch original_text, der in die Suche geht); abgeleitete Tabellen wie Neuaufbau', () => {
    const db = neueTestDatenbank()
    try {
      const { haupt, zweite } = personMitZweiFormen(db)
      warte(5000)
      const ausgang = kanonischerAbzug(db)

      fuehreAus(db, 'namensform.aendern', { id: zweite, originalText: "Anna d'Aboville", rolle: null, umschriftVon: haupt, umschriftNorm: 'manuell', gueltigVon: 18500101 })
      const nachher = kanonischerAbzug(db)
      erwarteAbgeleitetWieNeuaufbau(db)

      undo(db)
      expect(kanonischerAbzug(db)).toBe(ausgang)
      erwarteAbgeleitetWieNeuaufbau(db)
      redo(db)
      expect(kanonischerAbzug(db)).toBe(nachher)
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })

  it('Koaleszenzschlüssel namensform.aendern:<id>:<feld> nur bei genau diesem einen geänderten Feld', () => {
    const db = neueTestDatenbank()
    try {
      const { zweite } = personMitZweiFormen(db)
      expect(schluessel(db, { id: zweite, rollenNotiz: 'neu', feld: 'rollenNotiz' })).toBe(`namensform.aendern:${zweite}:rollenNotiz`)
      expect(schluessel(db, { id: zweite, konfidenz: 4, feld: 'konfidenz' })).toBe(`namensform.aendern:${zweite}:konfidenz`)
      // Unveränderte Felder in der Nutzlast stören nicht.
      expect(schluessel(db, { id: zweite, rollenNotiz: 'neu', sprache: 'de', feld: 'rollenNotiz' })).toBe(`namensform.aendern:${zweite}:rollenNotiz`)
      expect(schluessel(db, { id: zweite, rollenNotiz: 'neu' })).toBeNull()
      expect(schluessel(db, { id: zweite, rollenNotiz: 'neu', sprache: 'pl', feld: 'rollenNotiz' })).toBeNull()
      expect(schluessel(db, { id: zweite, sprache: 'pl', feld: 'rollenNotiz' })).toBeNull()
      expect(schluessel(db, { id: 'gibt-es-nicht', rollenNotiz: 'neu', feld: 'rollenNotiz' })).toBeNull()
    } finally {
      db.close()
    }
  })

  it('Autosave-Folge am selben Feld = EIN Undo-Schritt, Undo/Redo bitgleich; anderes Feld = eigener Schritt', () => {
    const db = neueTestDatenbank()
    try {
      const { zweite } = personMitZweiFormen(db)
      warte(5000)
      const ausgang = kanonischerAbzug(db)
      const schritte = angewendeteSchritte(db)

      for (const [i, notiz] of ['H', 'He', 'Hei', 'Heirat 1850'].entries()) {
        if (i > 0) warte(300)
        fuehreAus(db, 'namensform.aendern', { id: zweite, rollenNotiz: notiz, feld: 'rollenNotiz' })
      }
      expect(angewendeteSchritte(db) - schritte).toBe(1)
      const nachher = kanonischerAbzug(db)

      warte(300)
      fuehreAus(db, 'namensform.aendern', { id: zweite, originalText: 'Anna Schmidt', feld: 'originalText' })
      expect(angewendeteSchritte(db) - schritte).toBe(2)

      undo(db)
      expect(kanonischerAbzug(db)).toBe(nachher)
      undo(db)
      expect(kanonischerAbzug(db)).toBe(ausgang)
      erwarteAbgeleitetWieNeuaufbau(db)
      redo(db)
      expect(kanonischerAbzug(db)).toBe(nachher)
      erwarteAbgeleitetWieNeuaufbau(db)
    } finally {
      db.close()
    }
  })
})
