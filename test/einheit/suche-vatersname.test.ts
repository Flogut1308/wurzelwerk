// AP-1.30 PR 3 (docs/80 §32 V-3-flache-bruecke-vatersname): findet die Volltextsuche einen über die
// flache Brücke geschriebenen Vatersnamen? Die FTS-Normalform einer Namensform stammt aus
// `COALESCE(original_text, Vornamen + Nachname)` (abl_name_form_*, 0006) — Teile der Art
// `vatersname` stehen darin nur über den montierten `original_text` („Iwan Petrowitsch Iwanow").
// KEINE Trigger-/Migrationsänderung in diesem PR; dieser Test hält fest, dass der Montageweg trägt.
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { fuehreAus } from '../../src/main/befehle/bus'
import { suche } from '../../src/main/abfragen/suche'
import type { SucheEin } from '../../src/shared/schemata/person-liste'

type Db = ReturnType<typeof oeffnen>

function neueTestDatenbank(): Db {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

function sucheEingabe(text: string): SucheEin {
  return {
    text,
    grenze: 10,
    filter: { platzhalter: 'alle', privat: 'alle', nurWiderspruch: false },
    sortierung: 'nachname',
    richtung: 'auf',
    seite: 1,
    proSeite: 100,
  }
}

function volltextTreffer(db: Db, text: string): readonly string[] {
  return suche(db, sucheEingabe(text))
    .treffer.filter((treffer) => treffer.quelle === 'volltext')
    .map((treffer) => treffer.person_id)
}

describe('Volltextsuche findet den Vatersnamen der flachen Brücke (AP-1.30 PR 3)', () => {
  it('name.anlegen mit Vatersname: „Petrowitsch" findet die Person über den montierten original_text', () => {
    const db = neueTestDatenbank()
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Iwan', vatersname: 'Petrowitsch', nachname: 'Iwanow' })
      expect(volltextTreffer(db, 'Petrowitsch')).toStrictEqual([personId])
    } finally {
      db.close()
    }
  })

  it('name.aendern des Vatersnamens: der neue wird gefunden, der alte nicht mehr', () => {
    const db = neueTestDatenbank()
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Iwan', vatersname: 'Petrowitsch', nachname: 'Iwanow' })
      fuehreAus(db, 'name.aendern', { id, typ: 'geburtsname', vornamen: 'Iwan', vatersname: 'Pawlowitsch', nachname: 'Iwanow' })
      expect(volltextTreffer(db, 'Pawlowitsch')).toStrictEqual([personId])
      expect(volltextTreffer(db, 'Petrowitsch')).toStrictEqual([])
    } finally {
      db.close()
    }
  })
})
