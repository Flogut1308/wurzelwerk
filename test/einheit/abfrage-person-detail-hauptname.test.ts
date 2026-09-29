// AP-1.30 PR 9c (docs/80 §33 V-130-9c, E4): `abfrage:person.detail` nennt je Namensform, ob sie der
// Hauptname ist (`ist_bevorzugt`) — der Reiter „Person" bearbeitet genau diese Form, nicht `namen[0]`.
// Rot zuerst: vor PR 9c trug `PersonDetailName` das Feld nicht.
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
import { personDetail } from '../../src/main/abfragen/person-detail'

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

describe('abfrage:person.detail — ist_bevorzugt je Namensform (AP-1.30 PR 9c, E4)', () => {
  it('die erste Form ist Hauptname, eine weitere nicht; nach hauptname.wechseln folgt das Kennzeichen', () => {
    const db = neueTestDatenbank()
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const erste = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl', nachname: 'Gutnoff' }).id
      const zweite = fuehreAus(db, 'name.anlegen', { personId, typ: 'aka', vornamen: 'Карл', nachname: 'Гутнов' }).id

      const vorher = personDetail(db, { personId }).namen
      expect(vorher.map((name) => [name.id, name.ist_bevorzugt])).toStrictEqual([
        [erste, true],
        [zweite, false],
      ])

      fuehreAus(db, 'hauptname.wechseln', { personId, alt: erste, neu: zweite })
      const nachher = personDetail(db, { personId }).namen
      expect(nachher.filter((name) => name.ist_bevorzugt).map((name) => name.id)).toStrictEqual([zweite])
      expect(nachher.find((name) => name.id === erste)?.ist_bevorzugt).toBe(false)
    } finally {
      db.close()
    }
  })
})
