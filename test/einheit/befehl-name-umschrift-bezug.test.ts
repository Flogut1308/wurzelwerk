// U-130-11-0b-selbstbezug (A-02, A-19; docs/80 §33 V-130-fix-umschrift-selbstbezug): die flache Brücke
// `name.anlegen`/`name.aendern` prüft den Umschrift-Bezug mit DERSELBEN Regel wie
// `namensform.anlegen`/`namensform.aendern` (`umschriftBezugPruefen`, namensform-anlegen.ts): die
// Ursprungsform existiert, gehört derselben Person und die Kette der Ursprungsformen führt nicht auf
// die Form selbst zurück.
//
// Befund vor dem Fix: `name.aendern` mit `umschriftVon` = eigene ID scheiterte an einem
// `SQLITE_CORRUPT_VTAB` aus dem `abl_name_form_au`-Trigger (0006_namensformen.sql) — die Transaktion
// rollte vollständig zurück, der Volltextindex blieb intakt. Hatte die Form schon eine Ursprungsform,
// wurde der Selbstbezug dagegen still GESCHRIEBEN; ebenso ein Kreis und ein Bezug auf die Form einer
// fremden Person (auch über `name.anlegen`).
import { describe, expect, it, vi } from 'vitest'

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
import { suche } from '../../src/main/abfragen/suche'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'
import type { PersonListeFilter } from '../../src/shared/schemata/person-liste'
import { kanonischerAbzug } from '../hilfsmittel/kanonischer-abzug'
import { sucheFtsInhaltAbzug, verwaisteFtsEintraegeAnzahl } from './_hilfen-abgeleitet'

type Db = ReturnType<typeof oeffnen>

const FILTER_ALLE: PersonListeFilter = { platzhalter: 'alle', privat: 'alle', nurWiderspruch: false }

function neueTestDatenbank(): Db {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

function neuePerson(db: Db): string {
  return fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
}

function fehlerCode(fn: () => void): string | undefined {
  try {
    fn()
    return undefined
  } catch (fehler) {
    return fehler instanceof WurzelFehler ? fehler.code : `KEIN_WURZELFEHLER:${String(fehler)}`
  }
}

function zaehle(db: Db, sql: string): number {
  const zeile = db.prepare<[], { readonly anzahl: number }>(sql).get()
  if (zeile === undefined) throw new Error(`zaehle(): COUNT lieferte keine Zeile (${sql}).`)
  return zeile.anzahl
}

function umschriftVon(db: Db, id: string): string | null | undefined {
  return db.prepare<{ readonly id: string }, { readonly umschrift_von: string | null }>('SELECT umschrift_von FROM name_form WHERE id = @id').get({ id })
    ?.umschrift_von
}

/** Abgeleitete Tabellen (FTS-Inhalt je Quelle, Karteileichen, person_flach, name_phonetik). */
function abgeleitetAbzug(db: Db): string {
  db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS vocab USING fts5vocab('suche_fts', 'instance')")
  const fts = sucheFtsInhaltAbzug(db)
  const verwaist = verwaisteFtsEintraegeAnzahl(db)
  db.exec('DROP TABLE vocab')
  const flach = db.prepare('SELECT person_id, anzeigename, sortier_nachname, sortier_vornamen FROM person_flach ORDER BY person_id').all()
  const phonetik = db.prepare('SELECT name_id, verfahren, code FROM name_phonetik ORDER BY name_id, verfahren').all()
  return JSON.stringify({ fts, verwaist, flach, phonetik })
}

/** Stand vor einem abgewiesenen Befehl: Basistabellen, abgeleitete Tabellen, Journal. */
function stand(db: Db): string {
  return JSON.stringify({
    kanonisch: kanonischerAbzug(db),
    abgeleitet: abgeleitetAbzug(db),
    transaktionen: zaehle(db, 'SELECT COUNT(*) AS anzahl FROM transaktion'),
    aenderungen: zaehle(db, 'SELECT COUNT(*) AS anzahl FROM aenderung'),
  })
}

/** FTS5-eigene Konsistenzprüfung, SQLite-Integrität, abgeleitete Tabellen gleich ihrem Neuaufbau. */
function erwarteIndexIntakt(db: Db): void {
  expect(() => db.exec("INSERT INTO suche_fts (suche_fts, rank) VALUES ('integrity-check', 0)")).not.toThrow()
  expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
  const inkrementell = abgeleitetAbzug(db)
  alleAbgeleitetenNeuAufbauen(db)
  expect(abgeleitetAbzug(db)).toBe(inkrementell)
}

function findet(db: Db, text: string, personId: string): boolean {
  return suche(db, { text, grenze: 50, filter: FILTER_ALLE, sortierung: 'nachname', richtung: 'auf', seite: 1, proSeite: 100 }).treffer.some(
    (treffer) => treffer.person_id === personId,
  )
}

describe('name.aendern — Umschrift-Bezug (U-130-11-0b-selbstbezug)', () => {
  it('umschriftVon = eigene ID (Form ohne Ursprung) → VALIDIERUNG_UMSCHRIFT_BEZUG, nichts geschrieben, Index intakt, Suche findet die Person', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Anna', nachname: 'Scherbakowa' })
      const vorher = stand(db)

      expect(fehlerCode(() => fuehreAus(db, 'name.aendern', { id, typ: 'geburtsname', vornamen: 'Anna', nachname: 'Scherbakowa', umschriftVon: id }))).toBe(
        'VALIDIERUNG_UMSCHRIFT_BEZUG',
      )
      expect(db.inTransaction).toBe(false)
      expect(stand(db)).toBe(vorher)
      expect(umschriftVon(db, id)).toBeNull()
      expect(findet(db, 'Scherbakowa', personId)).toBe(true)
      erwarteIndexIntakt(db)
    } finally {
      db.close()
    }
  })

  it('umschriftVon = eigene ID (Form MIT Ursprung) → VALIDIERUNG_UMSCHRIFT_BEZUG statt stillem Schreiben', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const ursprung = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname: 'Щербакова', originalText: 'Щербакова' }).id
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'transliteriert', nachname: 'Scherbakowa', umschriftVon: ursprung })
      const vorher = stand(db)

      expect(fehlerCode(() => fuehreAus(db, 'name.aendern', { id, typ: 'transliteriert', nachname: 'Scherbakowa', umschriftVon: id }))).toBe(
        'VALIDIERUNG_UMSCHRIFT_BEZUG',
      )
      expect(stand(db)).toBe(vorher)
      expect(umschriftVon(db, id)).toBe(ursprung)
      erwarteIndexIntakt(db)
    } finally {
      db.close()
    }
  })

  it('Kreis über eine Zwischenform → VALIDIERUNG_UMSCHRIFT_BEZUG', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const ursprung = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname: 'Щербакова' }).id
      const umschrift = fuehreAus(db, 'name.anlegen', { personId, typ: 'transliteriert', nachname: 'Scherbakowa', umschriftVon: ursprung }).id
      const vorher = stand(db)

      expect(fehlerCode(() => fuehreAus(db, 'name.aendern', { id: ursprung, typ: 'geburtsname', nachname: 'Щербакова', umschriftVon: umschrift }))).toBe(
        'VALIDIERUNG_UMSCHRIFT_BEZUG',
      )
      expect(stand(db)).toBe(vorher)
      expect(umschriftVon(db, ursprung)).toBeNull()
    } finally {
      db.close()
    }
  })

  it('Ursprungsform einer fremden Person → VALIDIERUNG_UMSCHRIFT_BEZUG; unbekannte Ursprungsform → NICHT_GEFUNDEN_NAME', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const fremd = fuehreAus(db, 'name.anlegen', { personId: neuePerson(db), typ: 'geburtsname', nachname: 'Fremd' }).id
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname: 'Scherbakowa' })
      const vorher = stand(db)

      expect(fehlerCode(() => fuehreAus(db, 'name.aendern', { id, typ: 'transliteriert', nachname: 'Scherbakowa', umschriftVon: fremd }))).toBe(
        'VALIDIERUNG_UMSCHRIFT_BEZUG',
      )
      expect(fehlerCode(() => fuehreAus(db, 'name.aendern', { id, typ: 'transliteriert', nachname: 'Scherbakowa', umschriftVon: 'gibt-es-nicht' }))).toBe(
        'NICHT_GEFUNDEN_NAME',
      )
      expect(stand(db)).toBe(vorher)
    } finally {
      db.close()
    }
  })

  it('ein gültiger Bezug auf eine Form derselben Person bleibt möglich; ein unveränderter Bezug wird nicht erneut geprüft', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const ursprung = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname: 'Щербакова' }).id
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'sonstiges', nachname: 'Scherbakowa' })

      fuehreAus(db, 'name.aendern', { id, typ: 'transliteriert', nachname: 'Scherbakowa', umschriftVon: ursprung })
      expect(umschriftVon(db, id)).toBe(ursprung)
      fuehreAus(db, 'name.aendern', { id, typ: 'transliteriert', nachname: 'Scherbakoff', umschriftVon: ursprung })
      expect(umschriftVon(db, id)).toBe(ursprung)
      expect(findet(db, 'Scherbakoff', personId)).toBe(true)
      erwarteIndexIntakt(db)
    } finally {
      db.close()
    }
  })
})

describe('name.anlegen — Umschrift-Bezug (U-130-11-0b-selbstbezug)', () => {
  it('Ursprungsform einer fremden Person → VALIDIERUNG_UMSCHRIFT_BEZUG, nichts geschrieben', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const fremd = fuehreAus(db, 'name.anlegen', { personId: neuePerson(db), typ: 'geburtsname', nachname: 'Fremd' }).id
      const vorher = stand(db)

      expect(fehlerCode(() => fuehreAus(db, 'name.anlegen', { personId, typ: 'transliteriert', nachname: 'Scherbakowa', umschriftVon: fremd }))).toBe(
        'VALIDIERUNG_UMSCHRIFT_BEZUG',
      )
      expect(stand(db)).toBe(vorher)
      erwarteIndexIntakt(db)
    } finally {
      db.close()
    }
  })
})
