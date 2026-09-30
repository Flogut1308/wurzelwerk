// AP-1.30 PR 9d-2 (docs/80 §33 V-130-9d2): `abfrage:person.detail.ereignis_existenz` liefert NUR
// lesend die Existenz-Aussage (ADR-026) jedes Ereignisses, aus dem ein Lebensdatum kommt, samt ihrer
// Belege mit `feld` — das Ziel von „Beleg verknüpfen" an einem Ereigniswert. Über den echten
// Befehlsbus, damit die Daten genau so entstehen wie in der UI.
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
  return fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0, geschlecht: 'F', lebend_status: 'verstorben' }).id
}

function zitat(db: Db, seite: string): string {
  const { id: quelleId } = fuehreAus(db, 'quelle.anlegen', { typ: 'kirchenbuch', titel: "Taufregister St. Marien (O'Brien)" })
  return fuehreAus(db, 'zitat.anlegen', { quelleId, seite }).id
}

/** Unabhängig vom Lesemodell: die Existenz-Aussagen eines Ereignisses direkt aus der Tabelle. */
function existenzAussagen(db: Db, ereignisId: string): readonly string[] {
  return db
    .prepare<{ readonly ereignisId: string }, { readonly id: string }>(
      `SELECT id FROM aussage WHERE subjekt_typ = 'ereignis' AND subjekt_id = @ereignisId AND praedikat = 'existenz' ORDER BY id`,
    )
    .all({ ereignisId })
    .map((zeile) => zeile.id)
}

function geburt(db: Db, personId: string, mit: { readonly datum?: boolean; readonly ort?: boolean } = { datum: true }): string {
  const ortId = mit.ort === true ? fuehreAus(db, 'ort.anlegen', { name: 'Danzig', typ: 'stadt' }).id : undefined
  return fuehreAus(db, 'ereignis.anlegen', {
    typ: 'geburt',
    ...(ortId === undefined ? {} : { ortId }),
    ...(mit.datum === true ? { datum: { modifikator: 'exakt', praezision: 'jahr', wert1: '1850' } } : {}),
    beteiligungen: [{ personId, rolle: 'kind' }],
    konfidenz: 3,
  }).id
}

describe('person.detail — ereignis_existenz (V-130-9d2)', () => {
  it('EX1: Geburt nur als Ereignis → Existenz-Aussage des Ereignisses, zunächst ohne Belege', () => {
    mitDb((db) => {
      const p = person(db)
      const ereignisId = geburt(db, p)
      const [aussageId] = existenzAussagen(db, ereignisId)
      expect(aussageId).toBeDefined()

      const detail = personDetail(db, { personId: p })
      expect(detail.lebensdaten.find((l) => l.angabe === 'geburtsdatum')).toMatchObject({ herkunft: 'ereignis', ereignis_id: ereignisId })
      expect(detail.ereignis_existenz).toEqual([{ ereignis_id: ereignisId, aussage_id: aussageId, belege: [] }])
    })
  })

  it('EX2: Belege der Existenz-Aussage mit ihrem feld (datum, ort, NULL, beschreibung) — alle, unverändert', () => {
    mitDb((db) => {
      const p = person(db)
      const ereignisId = geburt(db, p, { datum: true, ort: true })
      const [aussageId = ''] = existenzAussagen(db, ereignisId)
      const zDatum = zitat(db, '1')
      const zOrt = zitat(db, '2')
      const zGanz = zitat(db, '3')
      const zBeschreibung = zitat(db, '4')
      fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId: zDatum, feld: 'datum' })
      fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId: zOrt, feld: 'ort' })
      fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId: zGanz })
      fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId: zBeschreibung, feld: 'beschreibung' })

      const [eintrag] = personDetail(db, { personId: p }).ereignis_existenz
      expect(eintrag?.aussage_id).toBe(aussageId)
      const felder = new Map(eintrag?.belege.map((beleg) => [beleg.zitat_id, beleg.feld]))
      expect(felder).toEqual(
        new Map<string, string | null>([
          [zDatum, 'datum'],
          [zOrt, 'ort'],
          [zGanz, null],
          [zBeschreibung, 'beschreibung'],
        ]),
      )
      expect(eintrag?.belege.find((beleg) => beleg.zitat_id === zDatum)).toMatchObject({ quelle: { titel: "Taufregister St. Marien (O'Brien)" }, zitat: { seite: '1' } })
    })
  })

  it('EX3: führt eine Aussage, gibt es keinen Eintrag; ohne Lebensdatum aus einem Ereignis keinen', () => {
    mitDb((db) => {
      const p = person(db)
      expect(personDetail(db, { personId: p }).ereignis_existenz).toEqual([])
      geburt(db, p)
      fuehreAus(db, 'aussage.anlegen', {
        subjektTyp: 'person',
        subjektId: p,
        praedikat: 'geburtsdatum',
        datum: { kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', wert1: '1851' },
        konfidenz: 2,
      })
      const detail = personDetail(db, { personId: p })
      expect(detail.lebensdaten.every((l) => l.herkunft !== 'ereignis')).toBe(true)
      expect(detail.ereignis_existenz).toEqual([])
    })
  })

  it('EX4: Datum und Ort aus demselben Ereignis → ein Eintrag; Geburt und Tod → zwei, nach ereignis_id sortiert', () => {
    mitDb((db) => {
      const p = person(db)
      const geburtId = geburt(db, p, { datum: true, ort: true })
      const { id: todId } = fuehreAus(db, 'ereignis.anlegen', {
        typ: 'tod',
        datum: { modifikator: 'exakt', praezision: 'jahr', wert1: '1920' },
        beteiligungen: [{ personId: p, rolle: 'verstorbener' }],
        konfidenz: 2,
      })
      const eintraege = personDetail(db, { personId: p }).ereignis_existenz
      expect(eintraege.map((e) => e.ereignis_id)).toEqual([geburtId, todId].sort())
      expect(eintraege.map((e) => e.aussage_id)).toEqual(eintraege.map((e) => existenzAussagen(db, e.ereignis_id)[0]))
    })
  })

  it('EX5: ein Ereignis, an dem die Person nicht als Rückfall beteiligt ist (Taufe), erscheint nicht', () => {
    mitDb((db) => {
      const p = person(db)
      fuehreAus(db, 'ereignis.anlegen', {
        typ: 'taufe',
        datum: { modifikator: 'exakt', praezision: 'jahr', wert1: '1850' },
        beteiligungen: [{ personId: p, rolle: 'hauptperson' }],
        konfidenz: 3,
      })
      expect(personDetail(db, { personId: p }).ereignis_existenz).toEqual([])
    })
  })
})
