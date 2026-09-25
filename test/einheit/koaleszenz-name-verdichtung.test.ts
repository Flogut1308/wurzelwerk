// AP-1.30 (PR 4), Verdichtungspfad: `name.aendern` löscht die Bestandteile einer Form und legt sie
// mit NEUEN ids wieder an (`name-repo.ts::aktualisieren`). Mit einem Koaleszenzschlüssel landen darum
// erstmals insert+delete-Paare im zusammengefassten Journal (`verdichteAenderungen`, Tabelle §4.8:
// „insert + delete → beide entfallen") — die Zwischenstände verschwinden, übrig bleiben die
// Löschung der Ausgangsteile und das Einfügen der Endteile. Undo und Redo müssen dabei bitgleich
// bleiben, auch über den partiellen UNIQUE-Index „höchstens ein Rufname je Form" (`ein_rufname`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { fuehreAus } from '../../src/main/befehle/bus'
import { redo, undo } from '../../src/main/journal/undo'
import { undoZiel } from '../../src/main/repositories/journal-repo'
import { kanonischerAbzug } from '../hilfsmittel/kanonischer-abzug'
import { nameAnlegenMitRufname, nameStand } from '../hilfsmittel/autosave-szenarien'

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

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

interface Anzahl {
  readonly anzahl: number
}

function schritte(db: ReturnType<typeof oeffnen>): number {
  const zeile = db.prepare<[], Anzahl>("SELECT COUNT(*) AS anzahl FROM transaktion WHERE status = 'angewendet'").get()
  if (zeile === undefined) throw new Error('schritte(): COUNT lieferte keine Zeile.')
  return zeile.anzahl
}

interface JournalZeile {
  readonly tabelle: string
  readonly datensatz_id: string
  readonly operation: string
}

function journal(db: ReturnType<typeof oeffnen>, transaktionId: string): readonly JournalZeile[] {
  return db
    .prepare<{ readonly id: string }, JournalZeile>('SELECT tabelle, datensatz_id, operation FROM aenderung WHERE transaktion_id = @id ORDER BY reihenfolge')
    .all({ id: transaktionId })
}

interface TeilZeile {
  readonly id: string
}

function teilIds(db: ReturnType<typeof oeffnen>, formId: string): readonly string[] {
  return db
    .prepare<{ readonly formId: string }, TeilZeile>('SELECT id FROM name_part WHERE name_form_id = @formId ORDER BY id')
    .all({ formId })
    .map((zeile) => zeile.id)
}

interface RufnameZeile {
  readonly wert: string
}

function rufnamen(db: ReturnType<typeof oeffnen>, formId: string): readonly string[] {
  return db
    .prepare<{ readonly formId: string }, RufnameZeile>('SELECT wert FROM name_part WHERE name_form_id = @formId AND ist_rufname = 1')
    .all({ formId })
    .map((zeile) => zeile.wert)
}

describe('Koaleszenz über name.aendern: insert+delete-Paare der Bestandteile (AP-1.30 PR 4)', () => {
  it('drei name.aendern (Nachname) in Folge → EINE Transaktion; Journal hält nur Ausgangs-Löschungen + End-Einfügungen; Undo und Redo bitgleich', () => {
    const db = neueTestDatenbank()
    try {
      const p = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const form = nameAnlegenMitRufname(db, p, 'geburtsname')
      warte(5000)
      const ausgang = kanonischerAbzug(db)
      const ausgangsTeile = teilIds(db, form)
      const schritteVorher = schritte(db)

      for (const [i, nachname] of ['Meier', 'Maier', 'Mayer'].entries()) {
        if (i > 0) warte(300)
        fuehreAus(db, 'name.aendern', { ...nameStand(db, form), nachname, feld: 'nachname' })
      }

      expect(schritte(db) - schritteVorher).toBe(1)
      const nachher = kanonischerAbzug(db)
      const endTeile = teilIds(db, form)
      const ziel = undoZiel(db)
      if (ziel === undefined) throw new Error('kein Undo-Ziel')

      const teilZeilen = journal(db, ziel.id).filter((zeile) => zeile.tabelle === 'name_part')
      const geloescht = teilZeilen.filter((z) => z.operation === 'delete').map((z) => z.datensatz_id).sort()
      const eingefuegt = teilZeilen.filter((z) => z.operation === 'insert').map((z) => z.datensatz_id).sort()
      expect(geloescht).toEqual([...ausgangsTeile].sort())
      expect(eingefuegt).toEqual([...endTeile].sort())
      expect(teilZeilen).toHaveLength(ausgangsTeile.length + endTeile.length)

      undo(db)
      expect(kanonischerAbzug(db)).toBe(ausgang)
      expect(rufnamen(db, form)).toEqual(['Friedrich'])
      redo(db)
      expect(kanonischerAbzug(db)).toBe(nachher)
      expect(rufnamen(db, form)).toEqual(['Friedrich'])
    } finally {
      db.close()
    }
  })

  it('Rufname-Wechsel dreimal in Folge (feld rufnameIndex) → EINE Transaktion, der partielle UNIQUE-Index bleibt heil, Undo und Redo bitgleich', () => {
    const db = neueTestDatenbank()
    try {
      const p = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const form = nameAnlegenMitRufname(db, p, 'geburtsname')
      warte(5000)
      const ausgang = kanonischerAbzug(db)
      const schritteVorher = schritte(db)

      for (const [i, rufnameIndex] of [0, 1, 0].entries()) {
        if (i > 0) warte(300)
        fuehreAus(db, 'name.aendern', { ...nameStand(db, form), rufnameText: undefined, rufnameIndex, feld: 'rufnameIndex' })
      }

      expect(schritte(db) - schritteVorher).toBe(1)
      expect(rufnamen(db, form)).toEqual(['Karl'])
      const nachher = kanonischerAbzug(db)

      undo(db)
      expect(kanonischerAbzug(db)).toBe(ausgang)
      expect(rufnamen(db, form)).toEqual(['Friedrich'])
      redo(db)
      expect(kanonischerAbzug(db)).toBe(nachher)
      expect(rufnamen(db, form)).toEqual(['Karl'])
    } finally {
      db.close()
    }
  })
})

describe('name.aendern-Schlüssel und original_text (AP-1.30 PR 4)', () => {
  function formMitWortgetreuerSchreibung(db: ReturnType<typeof oeffnen>): string {
    const p = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
    return fuehreAus(db, 'name.anlegen', { personId: p, typ: 'geburtsname', vornamen: 'Johann', nachname: 'Müller', originalText: 'Joh. Müller alias Miller' }).id
  }

  it('wortgetreue Schreibung bleibt (originalText mitgegeben) → nur der Nachname ändert sich → EIN Undo-Schritt', () => {
    const db = neueTestDatenbank()
    try {
      const form = formMitWortgetreuerSchreibung(db)
      warte(5000)
      const schritteVorher = schritte(db)
      for (const [i, nachname] of ['Meier', 'Maier', 'Mayer'].entries()) {
        if (i > 0) warte(300)
        fuehreAus(db, 'name.aendern', { ...nameStand(db, form), originalText: 'Joh. Müller alias Miller', nachname, feld: 'nachname' })
      }
      expect(schritte(db) - schritteVorher).toBe(1)
    } finally {
      db.close()
    }
  })

  it('Gegenprobe: ohne originalText ersetzt die Montage die wortgetreue Schreibung — zweite Änderung, keine Koaleszenz', () => {
    const db = neueTestDatenbank()
    try {
      const form = formMitWortgetreuerSchreibung(db)
      warte(5000)
      const schritteVorher = schritte(db)
      fuehreAus(db, 'name.aendern', { ...nameStand(db, form), nachname: 'Meier', feld: 'nachname' })
      warte(300)
      // Jetzt ist original_text die Montage — ab hier folgt er den Teilen, der Schlüssel greift wieder.
      fuehreAus(db, 'name.aendern', { ...nameStand(db, form), nachname: 'Maier', feld: 'nachname' })
      warte(300)
      fuehreAus(db, 'name.aendern', { ...nameStand(db, form), nachname: 'Mayer', feld: 'nachname' })
      expect(schritte(db) - schritteVorher).toBe(2)
    } finally {
      db.close()
    }
  })
})
