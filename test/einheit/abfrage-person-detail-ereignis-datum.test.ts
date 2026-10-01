// AP-1.30 PR 13b (docs/80 §33 V-130-13-vertrag): `person.detail.ereignisse` trägt je Ereignis die rohe
// Datumsgruppe (`datum`, auch sort_bis und Modifikator) und die Konfidenz der Existenz-Aussage mit
// kleinster id (`konfidenz`, dieselbe Regel wie `ereignis_existenz`). Über den echten Befehlsbus.
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
import { journalAn, journalAus } from '../../src/main/journal/kontext'

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

function person(db: Db): string {
  return fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0, geschlecht: 'M', lebend_status: 'verstorben' }).id
}

interface DatumEin {
  readonly modifikator: 'exakt' | 'zwischen' | 'vor'
  readonly praezision: 'jahr'
  readonly wert1: string
  readonly wert2?: string
  readonly original_text?: string
}

function ereignis(db: Db, personId: string, typ: 'militaerdienst' | 'umzug' | 'beruf', datum?: DatumEin, konfidenz = 3): string {
  return fuehreAus(db, 'ereignis.anlegen', {
    typ,
    ...(datum === undefined ? {} : { datum }),
    beteiligungen: [{ personId, rolle: 'hauptperson' }],
    konfidenz,
  }).id
}

/** Altbestand: eine weitere Existenz-Aussage mit fester id (kein Schreibbefehl legt eine zweite an). */
function existenzDirekt(db: Db, id: string, ereignisId: string, konfidenz: number): void {
  journalAus(db, 'test-fixture: zweite Existenz-Aussage am Ereignis mit fester id')
  try {
    db.prepare<{ readonly id: string; readonly ereignisId: string; readonly konfidenz: number }>(
      `INSERT INTO aussage (id, subjekt_typ, subjekt_id, praedikat, wert_text, konfidenz) VALUES (@id, 'ereignis', @ereignisId, 'existenz', 'ja', @konfidenz)`,
    ).run({ id, ereignisId, konfidenz })
  } finally {
    journalAn(db)
  }
}

function existenzKonfidenzen(db: Db, ereignisId: string): readonly { readonly id: string; readonly konfidenz: number | null }[] {
  return db
    .prepare<{ readonly ereignisId: string }, { readonly id: string; readonly konfidenz: number | null }>(
      `SELECT id AS id, konfidenz AS konfidenz FROM aussage WHERE subjekt_typ = 'ereignis' AND subjekt_id = @ereignisId AND praedikat = 'existenz' ORDER BY id`,
    )
    .all({ ereignisId })
}

interface Spalten {
  readonly datum_kalender: string | null
  readonly datum_modifikator: string | null
  readonly datum_praezision: string | null
  readonly datum_wert1: string | null
  readonly datum_wert2: string | null
  readonly datum_originaltext: string | null
  readonly datum_sort_von: number | null
  readonly datum_sort_bis: number | null
  readonly datum_zweitkalender: string | null
  readonly datum_zweitwert: string | null
  readonly datum_doppeljahr: string | null
}

/** Unabhängig vom Lesemodell: die Gruppenspalten des Ereignisses direkt aus der Tabelle. */
function spalten(db: Db, ereignisId: string): Spalten | undefined {
  return db
    .prepare<{ readonly ereignisId: string }, Spalten>(
      `SELECT datum_kalender, datum_modifikator, datum_praezision, datum_wert1, datum_wert2, datum_originaltext,
              datum_sort_von, datum_sort_bis, datum_zweitkalender, datum_zweitwert, datum_doppeljahr
       FROM ereignis WHERE id = @ereignisId`,
    )
    .get({ ereignisId })
}

describe('person.detail — Ereignis: Datumsgruppe und Sicherheit (PR 13b)', () => {
  it('Gruppe roh: zwischen 1941 und 1945 mit sort_bis, vor 1930 mit Modifikator', () => {
    mitDb((db) => {
      const p = person(db)
      const zwischen = ereignis(db, p, 'militaerdienst', { modifikator: 'zwischen', praezision: 'jahr', wert1: '1941', wert2: '1945', original_text: 'zwischen 1941 und 1945' })
      const vor = ereignis(db, p, 'umzug', { modifikator: 'vor', praezision: 'jahr', wert1: '1930', original_text: 'vor 1930' })
      const detail = personDetail(db, { personId: p })

      for (const [id, modifikator] of [[zwischen, 'zwischen'], [vor, 'vor']] as const) {
        const roh = spalten(db, id)
        const eintrag = detail.ereignisse.find((e) => e.ereignis_id === id)
        expect(roh?.datum_modifikator).toBe(modifikator)
        expect(eintrag?.datum).toEqual({
          kalender: roh?.datum_kalender,
          modifikator: roh?.datum_modifikator,
          praezision: roh?.datum_praezision,
          wert1: roh?.datum_wert1,
          wert2: roh?.datum_wert2,
          originaltext: roh?.datum_originaltext,
          sort_von: roh?.datum_sort_von,
          sort_bis: roh?.datum_sort_bis,
          zweitkalender: roh?.datum_zweitkalender,
          zweitwert: roh?.datum_zweitwert,
          doppeljahr: roh?.datum_doppeljahr,
        })
      }
      const z = detail.ereignisse.find((e) => e.ereignis_id === zwischen)
      expect(z?.datum?.sort_bis).not.toBeNull()
      expect(z?.datum?.sort_bis).toBeGreaterThan(z?.datum?.sort_von ?? Number.POSITIVE_INFINITY)
      expect(z?.datum_sort_von).toBe(z?.datum?.sort_von)
      expect(detail.ereignisse.find((e) => e.ereignis_id === vor)?.datum?.wert1).toBe('1930')
    })
  })

  it('Ereignis ohne Datum → datum null', () => {
    mitDb((db) => {
      const p = person(db)
      const id = ereignis(db, p, 'beruf')
      const eintrag = personDetail(db, { personId: p }).ereignisse.find((e) => e.ereignis_id === id)
      expect(eintrag).toBeDefined()
      expect(eintrag?.datum).toBeNull()
    })
  })

  it('Konfidenz aus der Existenz-Aussage mit kleinster id', () => {
    mitDb((db) => {
      const p = person(db)
      const id = ereignis(db, p, 'militaerdienst', { modifikator: 'exakt', praezision: 'jahr', wert1: '1941' }, 3)
      existenzDirekt(db, '00000000-0000-7000-8000-000000000001', id, 2)
      existenzDirekt(db, 'ffffffff-ffff-7fff-8fff-ffffffffffff', id, 4)
      const rohe = existenzKonfidenzen(db, id)
      expect(rohe).toHaveLength(3)
      expect(rohe[0]).toEqual({ id: '00000000-0000-7000-8000-000000000001', konfidenz: 2 })

      const detail = personDetail(db, { personId: p })
      expect(detail.ereignisse.find((e) => e.ereignis_id === id)?.konfidenz).toBe(2)
    })
  })

  it('ohne Existenz-Aussage → konfidenz null', () => {
    mitDb((db) => {
      const p = person(db)
      const id = ereignis(db, p, 'umzug', { modifikator: 'exakt', praezision: 'jahr', wert1: '1945' })
      journalAus(db, 'test-fixture: Existenz-Aussage entfernen')
      try {
        db.prepare<{ readonly id: string }>(`DELETE FROM aussage WHERE subjekt_typ = 'ereignis' AND subjekt_id = @id AND praedikat = 'existenz'`).run({ id })
      } finally {
        journalAn(db)
      }
      expect(existenzKonfidenzen(db, id)).toEqual([])
      expect(personDetail(db, { personId: p }).ereignisse.find((e) => e.ereignis_id === id)?.konfidenz).toBeNull()
    })
  })

  it('Reihenfolge unverändert: nach sort_von, unbekannt zuletzt', () => {
    mitDb((db) => {
      const p = person(db)
      const ohne = ereignis(db, p, 'beruf')
      const spaet = ereignis(db, p, 'umzug', { modifikator: 'exakt', praezision: 'jahr', wert1: '1945' })
      const frueh = ereignis(db, p, 'militaerdienst', { modifikator: 'vor', praezision: 'jahr', wert1: '1930', original_text: 'vor 1930' })
      expect(personDetail(db, { personId: p }).ereignisse.map((e) => e.ereignis_id)).toEqual([frueh, spaet, ohne])
    })
  })
})
