// AP-1.30 PR 7a (Test „Reiterzähler stimmen mit den Daten"): `abfrage:person.detail` liefert die
// Zählbasis `belege_anzahl` = Anzahl VERSCHIEDENER Zitate an allen Aussagen, die zur Person gehören —
// ihre eigenen, die ihrer Namensformen, der Elternkanten, in denen sie Kind ist, ihrer Partnerschaften
// und der Ereignisse, an denen sie beteiligt ist. Gesundheitsbelege (Aussagen an `diagnose`/
// `risikofaktor`) gehören zum Gesundheitsreiter und zählen hier NICHT (M-08: Gesundheitsdaten bleiben
// in ihrem Reiter). Dazu Ende-zu-Ende: `reiterZaehler(reiterZaehlerEingabeAus(detail))` gegen einen
// bekannten Bestand. Aufbau über den echten Befehlsbus; nur Gesundheitsdaten roh (es gibt noch keinen
// Befehl dafür, AP-1.19).
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
import { journalAn, journalAus } from '../../src/main/journal/kontext'
import { personDetail } from '../../src/main/abfragen/person-detail'
import { REITER } from '../../src/core/person/reiter'
import { reiterZaehler } from '../../src/core/person/reiter-zaehler'
import { reiterZaehlerEingabeAus } from '../../src/shared/schemata/person-detail'

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

function person(db: Db, o: { readonly platzhalter?: boolean; readonly lebendStatus?: 'verstorben' } = {}): string {
  return fuehreAus(db, 'person.anlegen', {
    privat: 0,
    ist_platzhalter: o.platzhalter === true ? 1 : 0,
    ...(o.platzhalter === true ? { platzhalter_grund: 'unbekannt' as const } : {}),
    ...(o.lebendStatus !== undefined ? { lebend_status: o.lebendStatus } : {}),
  }).id
}

function zitat(db: Db): string {
  const { id: quelleId } = fuehreAus(db, 'quelle.anlegen', { typ: 'kirchenbuch', titel: 'Kirchenbuch' })
  return fuehreAus(db, 'zitat.anlegen', { quelleId, seite: '1' }).id
}

function personAussage(db: Db, personId: string, belege: readonly string[], praedikat = 'beruf'): string {
  return fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat, wertText: 'Schmied', konfidenz: 3, belege }).id
}

function eltern(db: Db, elternteilId: string, kindId: string, belege: readonly string[] = [], typ: 'biologisch' | 'adoptiv' = 'biologisch'): void {
  fuehreAus(db, 'elternschaft.anlegen', { elternteilId, kindId, typ, konfidenz: 3, belege })
}

function partnerschaft(db: Db, a: string, b: string, belege: readonly string[] = []): void {
  fuehreAus(db, 'partnerschaft.anlegen', {
    typ: 'ehe_zivil',
    beteiligte: [
      { personId: a, rolle: 'ehepartner' },
      { personId: b, rolle: 'ehepartner' },
    ],
    konfidenz: 3,
    belege,
  })
}

function taufe(db: Db, beteiligungen: readonly { readonly personId: string; readonly rolle: 'hauptperson' | 'pate' }[], belege: readonly string[]): void {
  fuehreAus(db, 'ereignis.anlegen', { typ: 'taufe', beteiligungen, konfidenz: 3, belege })
}

function nameMitBeleg(db: Db, personId: string, nachname: string, belege: readonly string[]): void {
  const nameFormId = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname }).id
  fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'name', subjektId: nameFormId, praedikat: 'name', wertText: 'laut Taufeintrag', konfidenz: 3, belege })
}

let laufendeNummer = 0

/** Gesundheitseintrag mit belegter Aussage — roh, weil es noch keinen Befehl gibt (AP-1.19). */
function gesundheitMitBeleg(db: Db, art: 'diagnose' | 'risikofaktor', personId: string, zitatId: string): void {
  laufendeNummer += 1
  const id = `${art}-${laufendeNummer}`
  const aussageId = `aussage-${art}-${laufendeNummer}`
  journalAus(db, 'test-fixture: Gesundheitseintrag ohne Befehl (AP-1.30 PR 7a)')
  try {
    const tabelle = art === 'diagnose' ? 'INSERT INTO diagnose (id, person_id) VALUES (@id, @personId)' : 'INSERT INTO risikofaktor (id, person_id) VALUES (@id, @personId)'
    db.prepare(tabelle).run({ id, personId })
    db.prepare(`INSERT INTO aussage (id, subjekt_typ, subjekt_id, praedikat, konfidenz) VALUES (@aussageId, @art, @id, 'existenz', 3)`).run({ aussageId, art, id })
    db.prepare('INSERT INTO aussage_zitat (aussage_id, zitat_id) VALUES (@aussageId, @zitatId)').run({ aussageId, zitatId })
  } finally {
    journalAn(db)
  }
}

function belegeAnzahl(db: Db, personId: string): number {
  return personDetail(db, { personId }).belege_anzahl
}

describe('abfrage:person.detail — belege_anzahl (AP-1.30 PR 7a)', () => {
  it('PZ1 ohne Belege 0, ein Zitat an einer eigenen Aussage 1', () => {
    mitDb((db) => {
      const p = person(db)
      expect(belegeAnzahl(db, p)).toBe(0)
      personAussage(db, p, [zitat(db)])
      expect(belegeAnzahl(db, p)).toBe(1)
    })
  })

  it('PZ2 dasselbe Zitat an zwei Aussagen zählt einmal', () => {
    mitDb((db) => {
      const p = person(db)
      const vater = person(db)
      const z = zitat(db)
      personAussage(db, p, [z], 'beruf')
      personAussage(db, p, [z], 'religion')
      eltern(db, vater, p, [z])
      expect(belegeAnzahl(db, p)).toBe(1)
    })
  })

  it('PZ3 Belege an allen Namensformen zählen (nicht nur an der Hauptform)', () => {
    mitDb((db) => {
      const p = person(db)
      nameMitBeleg(db, p, 'Müller', [zitat(db)])
      nameMitBeleg(db, p, 'Möller', [zitat(db)])
      expect(belegeAnzahl(db, p)).toBe(2)
    })
  })

  it('PZ4 die Elternkante zählt beim Kind, nicht beim Elternteil', () => {
    mitDb((db) => {
      const kind = person(db)
      const vater = person(db)
      eltern(db, vater, kind, [zitat(db)])
      expect(belegeAnzahl(db, kind)).toBe(1)
      expect(belegeAnzahl(db, vater)).toBe(0)
    })
  })

  it('PZ5 der Beleg einer Partnerschaft zählt bei beiden Partnern', () => {
    mitDb((db) => {
      const a = person(db)
      const b = person(db)
      partnerschaft(db, a, b, [zitat(db)])
      expect(belegeAnzahl(db, a)).toBe(1)
      expect(belegeAnzahl(db, b)).toBe(1)
    })
  })

  it('PZ6 ein Ereignis zählt bei jeder beteiligten Person, gleich welche Rolle', () => {
    mitDb((db) => {
      const taeufling = person(db)
      const pate = person(db)
      const unbeteiligt = person(db)
      taufe(
        db,
        [
          { personId: taeufling, rolle: 'hauptperson' },
          { personId: pate, rolle: 'pate' },
        ],
        [zitat(db)],
      )
      expect(belegeAnzahl(db, taeufling)).toBe(1)
      expect(belegeAnzahl(db, pate)).toBe(1)
      expect(belegeAnzahl(db, unbeteiligt)).toBe(0)
    })
  })

  it('PZ7 Gesundheitsbelege zählen nicht in Belege & Medien', () => {
    mitDb((db) => {
      const p = person(db)
      gesundheitMitBeleg(db, 'diagnose', p, zitat(db))
      gesundheitMitBeleg(db, 'risikofaktor', p, zitat(db))
      expect(belegeAnzahl(db, p)).toBe(0)
    })
  })

  it('PZ8 ein Zitat, das auch eine Gesundheitsaussage belegt, zählt über die eigene Aussage genau einmal', () => {
    mitDb((db) => {
      const p = person(db)
      const z = zitat(db)
      personAussage(db, p, [z])
      gesundheitMitBeleg(db, 'diagnose', p, z)
      expect(belegeAnzahl(db, p)).toBe(1)
    })
  })

  it('PZ9 Belege an Aussagen einer anderen Person zählen nicht', () => {
    mitDb((db) => {
      const p = person(db)
      const andere = person(db)
      personAussage(db, andere, [zitat(db)])
      expect(belegeAnzahl(db, p)).toBe(0)
    })
  })
})

describe('Reiterzähler stimmen mit den Daten (AP-1.30 PR 7a)', () => {
  it('PZ10 Ende zu Ende: Lesemodell → reiterZaehlerEingabeAus → reiterZaehler', () => {
    mitDb((db) => {
      const p = person(db, { lebendStatus: 'verstorben' })
      const vater = person(db)
      const mutter = person(db, { platzhalter: true })
      const partnerin = person(db)
      const kind = person(db)
      const gemeinsam = zitat(db)

      nameMitBeleg(db, p, 'Müller', [gemeinsam])
      nameMitBeleg(db, p, 'Möller', [])
      personAussage(db, p, [gemeinsam, zitat(db)])
      eltern(db, vater, p)
      eltern(db, mutter, p)
      partnerschaft(db, p, partnerin, [zitat(db)])
      // Ein Kind mit zwei Kanten zur Person (biologisch + adoptiv), ohne Partnerschaftszuordnung.
      eltern(db, p, kind, [], 'biologisch')
      eltern(db, p, kind, [], 'adoptiv')
      gesundheitMitBeleg(db, 'diagnose', p, zitat(db))
      gesundheitMitBeleg(db, 'risikofaktor', p, zitat(db))

      const detail = personDetail(db, { personId: p })
      const z = reiterZaehler(reiterZaehlerEingabeAus(detail))

      expect(z.namen.anzahl).toBe(2)
      // vater, mutter (Platzhalter), partnerin, kind (zwei Kanten = eine Person)
      expect(z.beziehungen.anzahl).toBe(4)
      // gemeinsam (Name + Person, einmal), zweites Personen-Zitat, Partnerschafts-Zitat; ohne Gesundheit
      expect(z.belege_medien.anzahl).toBe(3)
      expect(z.gesundheit.anzahl).toBe(2)
      for (const reiter of ['person', 'leben', 'notizen', 'verwaltung'] as const) expect(z[reiter].anzahl).toBeUndefined()

      // verstorben ohne Sterbeort → Punkt an „Person"; Kind ohne Partnerschaft → Punkt an „Beziehungen".
      expect(z.person.offenerPunkt).toBe(true)
      expect(z.beziehungen.offenerPunkt).toBe(true)
      expect(z.namen.offenerPunkt).toBe(false)
      expect(z.belege_medien.offenerPunkt).toBe(false)
      expect(z.gesundheit.offenerPunkt).toBe(false)
      const punktReiter = new Set(detail.offene_punkte.map((punkt) => punkt.reiter))
      for (const reiter of REITER) expect(z[reiter].offenerPunkt).toBe(punktReiter.has(reiter))
    })
  })
})
