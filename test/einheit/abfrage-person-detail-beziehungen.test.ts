// AP-1.30 PR 12b (§33 V-130-12-vertrag, -einzelpartnerschaft): `abfrage:person.detail` liefert für den
// Reiter Beziehungen Kanten-ID/-Notiz/Geschlecht, abgeleitete Geschwister, Partnerschaften mit Kindern
// und Kinder ohne Partnerschaft — über den echten Befehlsbus.
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
import { neueId } from '../../src/main/id'
import { armieren, entwaffnen } from '../../src/main/journal/kontext'
import { naechsteLfd, transaktionAnlegen } from '../../src/main/repositories/journal-repo'
import { personDetail } from '../../src/main/abfragen/person-detail'

type Db = ReturnType<typeof oeffnen>

function mitDb(fn: (db: Db) => void): void {
  const db = oeffnen(':memory:')
  try {
    migrieren(db)
    fn(db)
  } finally {
    db.close()
  }
}

interface PersonOptionen {
  readonly geschlecht?: 'M' | 'F' | 'U' | 'X'
  readonly platzhalter?: boolean
}

function person(db: Db, o: PersonOptionen = {}): string {
  return fuehreAus(db, 'person.anlegen', {
    privat: 0,
    ist_platzhalter: o.platzhalter === true ? 1 : 0,
    ...(o.platzhalter === true ? { platzhalter_grund: 'unbekannt' as const } : {}),
    ...(o.geschlecht !== undefined ? { geschlecht: o.geschlecht } : {}),
  }).id
}

function eltern(db: Db, elternteilId: string, kindId: string, typ: 'biologisch' | 'adoptiv' | 'stief' = 'biologisch', notiz?: string): string {
  return fuehreAus(db, 'elternschaft.anlegen', { elternteilId, kindId, typ, konfidenz: 3, ...(notiz !== undefined ? { notiz } : {}) }).id
}

function partnerschaft(db: Db, ids: readonly string[], notiz?: string): string {
  return fuehreAus(db, 'partnerschaft.anlegen', {
    typ: 'ehe_zivil',
    beteiligte: ids.map((personId) => ({ personId, rolle: 'ehepartner' })),
    konfidenz: 3,
    ...(notiz !== undefined ? { notiz } : {}),
  }).id
}

/** Partnerschaft nur mit einer Person: `partnerschaft.anlegen` verlangt zwei, das Schema nicht (§33 V-130-12-einzelpartnerschaft). */
function einzelpartnerschaft(db: Db, personId: string, id: string): string {
  const txId = neueId()
  db.transaction((): void => {
    transaktionAnlegen(db, { id: txId, zeitpunkt: 1, art: 'nutzer', beschreibung: 'test.roh', lfd: naechsteLfd(db) })
    armieren(db, txId)
    try {
      db.prepare(`INSERT INTO partnerschaft (id, typ) VALUES (@id, 'unbekannt')`).run({ id })
      db.prepare(`INSERT INTO partnerschaft_person (partnerschaft_id, person_id) VALUES (@id, @p)`).run({ id, p: personId })
    } finally {
      entwaffnen(db)
    }
  })()
  return id
}

describe('person.detail — Reiter Beziehungen (AP-1.30 PR 12b)', () => {
  it('Kanten: kante_id, kante_notiz und geschlecht je Zeile (Eltern, Kinder, Partner)', () => {
    mitDb((db) => {
      const p = person(db)
      const vater = person(db, { geschlecht: 'M' })
      const kind = person(db, { geschlecht: 'F' })
      const q = person(db, { geschlecht: 'X' })
      const kanteVater = eltern(db, vater, p, 'adoptiv', 'Adoption 1950')
      const kanteKind = eltern(db, p, kind)
      const ps = partnerschaft(db, [p, q], 'Notiz zur Ehe')

      const b = personDetail(db, { personId: p }).beziehungen
      expect(b.find((z) => z.person_id === vater)).toMatchObject({ kante_id: kanteVater, kante_notiz: 'Adoption 1950', geschlecht: 'M', richtung: 'elternteil' })
      expect(b.find((z) => z.person_id === kind)).toMatchObject({ kante_id: kanteKind, kante_notiz: null, geschlecht: 'F', richtung: 'kind' })
      expect(b.find((z) => z.person_id === q)).toMatchObject({ kante_id: ps, kante_notiz: 'Notiz zur Ehe', geschlecht: 'X', richtung: 'partner' })
    })
  })

  it('Geschwister: voll, halb, sozial, mit Namen-Feldern; nicht in beziehungen', () => {
    mitDb((db) => {
      const vater = person(db, { geschlecht: 'M' })
      const mutter = person(db, { geschlecht: 'F' })
      const zweiteMutter = person(db, { geschlecht: 'F' })
      const p = person(db)
      const voll = person(db, { geschlecht: 'F' })
      const halb = person(db, { geschlecht: 'M' })
      const stief = person(db)
      for (const k of [p, voll]) {
        eltern(db, vater, k)
        eltern(db, mutter, k)
      }
      eltern(db, vater, halb)
      eltern(db, zweiteMutter, halb)
      eltern(db, vater, stief, 'stief')

      const aus = personDetail(db, { personId: p })
      expect(aus.geschwister.map((g) => [g.person_id, g.art])).toEqual(
        [
          [voll, 'voll'],
          [halb, 'halb'],
          [stief, 'sozial'],
        ].sort((a, b) => ['voll', 'halb', 'offen', 'sozial'].indexOf(a[1] ?? '') - ['voll', 'halb', 'offen', 'sozial'].indexOf(b[1] ?? '')),
      )
      expect(aus.geschwister.find((g) => g.person_id === voll)).toMatchObject({ geschlecht: 'F', ist_platzhalter: false, gemeinsame_eltern_ids: [mutter, vater].sort() })
      expect(aus.geschwister.find((g) => g.person_id === halb)).toMatchObject({ geschlecht: 'M', gemeinsame_eltern_ids: [vater] })
      expect(aus.geschwister.find((g) => g.person_id === stief)).toMatchObject({ gemeinsame_eltern_ids: [] })
      expect(aus.beziehungen.map((z) => z.person_id)).not.toContain(voll)
    })
  })

  it('Partnerschaften: mit Kindern, mehrere, Partnerschaft nur mit P sichtbar', () => {
    mitDb((db) => {
      const p = person(db)
      const q = person(db)
      const r = person(db)
      const k1 = person(db)
      const k2 = person(db)
      const k3 = person(db)
      eltern(db, p, k1)
      eltern(db, q, k1)
      eltern(db, p, k2)
      const psQ = partnerschaft(db, [p, q])
      const psAlleine = einzelpartnerschaft(db, p, 'ps-allein')
      const psR = partnerschaft(db, [p, r])
      eltern(db, p, k3)
      eltern(db, r, k3)

      const aus = personDetail(db, { personId: p })
      const nachId = new Map(aus.partnerschaften.map((x) => [x.id, x]))
      expect(aus.partnerschaften).toHaveLength(3)
      expect(nachId.get(psQ)).toMatchObject({ typ: 'ehe_zivil', partner_ids: [q], kind_ids: [k1] })
      expect(nachId.get(psAlleine)).toMatchObject({ partner_ids: [], kind_ids: [] })
      expect(nachId.get(psR)).toMatchObject({ partner_ids: [r], kind_ids: [k3] })
      expect(aus.kinder_ohne_partnerschaft).toEqual([k2])
    })
  })

  it('Konsistenz: kinder_ohne_partnerschaft ohne Platzhalter == bezug_ids der offenen Punkte', () => {
    mitDb((db) => {
      const p = person(db)
      const q = person(db)
      const k1 = person(db)
      const k2 = person(db)
      const platzhalterKind = person(db, { platzhalter: true })
      eltern(db, p, k1)
      eltern(db, q, k1)
      partnerschaft(db, [p, q])
      eltern(db, p, k2)
      eltern(db, p, platzhalterKind)

      const aus = personDetail(db, { personId: p })
      expect([...aus.kinder_ohne_partnerschaft].sort()).toEqual([k2, platzhalterKind].sort())
      const ohnePlatzhalter = aus.kinder_ohne_partnerschaft.filter((id) => id !== platzhalterKind)
      const bezug = aus.offene_punkte.filter((x) => x.regel_id === 'kind_ohne_partnerschaft').map((x) => x.bezug_id)
      expect([...ohnePlatzhalter].sort()).toEqual([...bezug].sort())
    })
  })

  it('Platzhalter-Person: Geschwister, Partnerschaften und Kinderzuordnung werden trotzdem geliefert, ohne offene Punkte', () => {
    mitDb((db) => {
      const vater = person(db, { geschlecht: 'M' })
      const p = person(db, { platzhalter: true })
      const bruder = person(db)
      const kind = person(db)
      eltern(db, vater, p)
      eltern(db, vater, bruder)
      eltern(db, p, kind)
      const q = person(db)
      const gemeinsamesKind = person(db)
      eltern(db, p, gemeinsamesKind)
      eltern(db, q, gemeinsamesKind)
      partnerschaft(db, [p, q])

      const aus = personDetail(db, { personId: p })
      expect(aus.offene_punkte).toEqual([])
      expect(aus.geschwister.map((g) => [g.person_id, g.art])).toEqual([[bruder, 'offen']])
      expect(aus.partnerschaften[0]?.kind_ids).toEqual([gemeinsamesKind])
      expect(aus.kinder_ohne_partnerschaft).toEqual([kind])
    })
  })

  it('Partnerschaften: Reihenfolge nach reihenfolge, beginn_sort_von (NULL jeweils zuletzt), id', () => {
    mitDb((db) => {
      const p = person(db)
      const ids = ['a', 'b', 'c', 'd', 'e'].map(() => partnerschaft(db, [p, person(db)]))
      const [a, b, c, d, e] = ids
      const werte: readonly (readonly [string | undefined, number | null, number | null])[] = [
        [a, 2, null],
        [b, 1, 500],
        [c, null, 100],
        [d, null, null],
        [e, null, 50],
      ]
      const txId = neueId()
      db.transaction((): void => {
        transaktionAnlegen(db, { id: txId, zeitpunkt: 1, art: 'nutzer', beschreibung: 'test.roh', lfd: naechsteLfd(db) })
        armieren(db, txId)
        try {
          for (const [id, reihenfolge, beginn] of werte) {
            db.prepare(`UPDATE partnerschaft SET reihenfolge = @reihenfolge, beginn_sort_von = @beginn WHERE id = @id`).run({ id, reihenfolge, beginn })
          }
        } finally {
          entwaffnen(db)
        }
      })()
      expect(personDetail(db, { personId: p }).partnerschaften.map((x) => x.id)).toEqual([b, a, e, c, d])
    })
  })
})
