// AP-1.30 PR 1 (V-D9-anzeige, docs/80 §32): `abfrage:person.detail` liefert `lebensdaten` — je
// Angabe (geburtsdatum, geburtsort, todesdatum, todesort) die Herkunft „Aussage" oder „Ereignis",
// aufgelöst über die EINE Kernregel (`lebensdatumAufloesen`, src/core/person/lebensdaten.ts).
// Deckungsgleich mit `kernangaben.aufschluesselung` und `sterbeort` (keine zweite Auflösung).
// Über den echten Befehlsbus, damit die Daten genau so entstehen wie in der UI.
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
import type { PersonDetailAus, PersonDetailLebensdatum } from '../../src/shared/schemata/person-detail'

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

function person(db: Db, lebendStatus: 'lebend' | 'verstorben' = 'verstorben'): string {
  return fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0, geschlecht: 'M', lebend_status: lebendStatus }).id
}

function ort(db: Db, name: string): string {
  return fuehreAus(db, 'ort.anlegen', { name, typ: 'dorf' }).id
}

function lebensdatum(detail: PersonDetailAus, angabe: PersonDetailLebensdatum['angabe']): PersonDetailLebensdatum | undefined {
  return detail.lebensdaten.find((eintrag) => eintrag.angabe === angabe)
}

function zustand(detail: PersonDetailAus, id: string): string | undefined {
  return detail.kernangaben?.aufschluesselung.find((eintrag) => eintrag.id === id)?.zustand
}

describe('person.detail — lebensdaten (V-D9-anzeige)', () => {
  it('LD1: ohne Aussage liefert das Geburts-Ereignis Datum und Ort, deckungsgleich mit den Kernangaben', () => {
    mitDb((db) => {
      const p = person(db)
      const ortId = ort(db, 'Geburtsdorf')
      const { id: ereignisId } = fuehreAus(db, 'ereignis.anlegen', {
        typ: 'geburt',
        ortId,
        datum: { modifikator: 'exakt', praezision: 'jahr', wert1: '1900' },
        beteiligungen: [{ personId: p, rolle: 'kind' }],
        konfidenz: 3,
      })

      const detail = personDetail(db, { personId: p })
      const datum = lebensdatum(detail, 'geburtsdatum')
      expect(datum).toMatchObject({ herkunft: 'ereignis', ereignis_id: ereignisId, aussage_id: null })
      expect(datum?.datum).toMatchObject({ kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', wert1: '1900' })
      expect(zustand(detail, 'geburtsdatum')).toBe('vorhanden')

      expect(lebensdatum(detail, 'geburtsort')).toMatchObject({ herkunft: 'ereignis', ereignis_id: ereignisId, ort_id: ortId, ort_name: 'Geburtsdorf', datum: null })
      expect(zustand(detail, 'geburtsort')).toBe('vorhanden')
    })
  })

  it('LD2: immer vier Einträge in fester Reihenfolge; ohne Quelle herkunft null', () => {
    mitDb((db) => {
      const detail = personDetail(db, { personId: person(db) })
      expect(detail.lebensdaten.map((eintrag) => eintrag.angabe)).toEqual(['geburtsdatum', 'geburtsort', 'todesdatum', 'todesort'])
      for (const eintrag of detail.lebensdaten) {
        expect(eintrag).toEqual({ angabe: eintrag.angabe, herkunft: null, aussage_id: null, ereignis_id: null, datum: null, datum_originaltext: null, ort_id: null, ort_name: null })
      }
    })
  })

  it('LD3: die Aussage führt; todesort ist deckungsgleich mit sterbeort', () => {
    mitDb((db) => {
      const p = person(db)
      const aussageOrt = ort(db, 'Aussagedorf')
      const ereignisOrt = ort(db, 'Ereignisdorf')
      const { id: aussageId } = fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: p, praedikat: 'todesort', wertRefId: aussageOrt, konfidenz: 3 })
      const { id: ereignisId } = fuehreAus(db, 'ereignis.anlegen', {
        typ: 'tod',
        ortId: ereignisOrt,
        datum: { modifikator: 'exakt', praezision: 'jahr', wert1: '1974' },
        beteiligungen: [{ personId: p, rolle: 'verstorbener' }],
        konfidenz: 2,
      })

      const detail = personDetail(db, { personId: p })
      const todesort = lebensdatum(detail, 'todesort')
      expect(todesort).toMatchObject({ herkunft: 'aussage', aussage_id: aussageId, ereignis_id: null, ort_id: aussageOrt, ort_name: 'Aussagedorf' })
      expect(detail.sterbeort).toEqual({ herkunft: todesort?.herkunft, ort_id: todesort?.ort_id, ort_name: todesort?.ort_name, aussage_id: todesort?.aussage_id })
      expect(lebensdatum(detail, 'todesdatum')).toMatchObject({ herkunft: 'ereignis', ereignis_id: ereignisId })
      expect(lebensdatum(detail, 'todesdatum')?.datum).toMatchObject({ modifikator: 'exakt', wert1: '1974' })
    })
  })

  it('LD4: todesort aus dem Ereignis ist deckungsgleich mit sterbeort (Rolle hauptperson zählt, V-D9-rollen)', () => {
    mitDb((db) => {
      const p = person(db)
      const ortId = ort(db, 'Sterbedorf')
      fuehreAus(db, 'ereignis.anlegen', { typ: 'tod', ortId, beteiligungen: [{ personId: p, rolle: 'hauptperson' }], konfidenz: 2 })
      const detail = personDetail(db, { personId: p })
      const todesort = lebensdatum(detail, 'todesort')
      expect(todesort?.herkunft).toBe('ereignis')
      expect(detail.sterbeort).toEqual({ herkunft: 'ereignis', ort_id: ortId, ort_name: 'Sterbedorf', aussage_id: null })
      expect(lebensdatum(detail, 'todesdatum')?.herkunft).toBeNull()
    })
  })

  it('LD5: Rollen außerhalb von RUECKFALL_ROLLEN und Ersatz-Ereignisse zählen nicht', () => {
    mitDb((db) => {
      const p = person(db)
      const ortId = ort(db, 'Taufdorf')
      const datum = { modifikator: 'exakt' as const, praezision: 'jahr' as const, wert1: '1900' }
      fuehreAus(db, 'ereignis.anlegen', { typ: 'taufe', ortId, datum, beteiligungen: [{ personId: p, rolle: 'hauptperson' }], konfidenz: 3 })
      fuehreAus(db, 'ereignis.anlegen', { typ: 'tod', ortId, datum, beteiligungen: [{ personId: p, rolle: 'informant' }], konfidenz: 3 })
      const detail = personDetail(db, { personId: p })
      expect(detail.lebensdaten.every((eintrag) => eintrag.herkunft === null)).toBe(true)
    })
  })

  it('LD6: ein Ereignis nur mit Originaltext liefert datum null und den Originaltext', () => {
    mitDb((db) => {
      const p = person(db)
      const { id: e } = fuehreAus(db, 'ereignis.anlegen', {
        typ: 'geburt',
        datum: { modifikator: 'etwa', praezision: 'jahr', wert1: '1812', original_text: 'um Martini 1812' },
        beteiligungen: [{ personId: p, rolle: 'hauptperson' }],
        konfidenz: 2,
      })
      // Altbestand: die Schreibbefehle verlangen wert1, ältere Daten können nur den Originaltext tragen.
      journalAus(db, 'test-fixture: Altbestand nur Originaltext')
      try {
        db.prepare<{ readonly id: string }>(
          `UPDATE ereignis SET datum_wert1 = NULL, datum_kalender = NULL, datum_modifikator = NULL, datum_praezision = NULL, datum_sort_von = NULL, datum_sort_bis = NULL WHERE id = @id`,
        ).run({ id: e })
      } finally {
        journalAn(db)
      }
      const detail = personDetail(db, { personId: p })
      expect(lebensdatum(detail, 'geburtsdatum')).toMatchObject({ herkunft: 'ereignis', ereignis_id: e, datum: null, datum_originaltext: 'um Martini 1812' })
      expect(zustand(detail, 'geburtsdatum')).toBe('vorhanden')
    })
  })

  it('LD7: Altbestand — eine Orts-Aussage nur mit wert_zahl trägt keinen Ort, der Ereignis-Ort gilt', () => {
    mitDb((db) => {
      const p = person(db)
      const ortId = ort(db, 'Geburtsdorf')
      const { id: aussageId } = fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: p, praedikat: 'geburtsort', wertText: 'vorläufig', konfidenz: 3 })
      journalAus(db, 'test-fixture: Altbestand Orts-Aussage mit wert_zahl')
      try {
        db.prepare<{ readonly id: string }>(`UPDATE aussage SET wert_text = NULL, wert_zahl = 5 WHERE id = @id`).run({ id: aussageId })
      } finally {
        journalAn(db)
      }
      const { id: ereignisId } = fuehreAus(db, 'ereignis.anlegen', { typ: 'geburt', ortId, beteiligungen: [{ personId: p, rolle: 'hauptperson' }], konfidenz: 3 })
      const detail = personDetail(db, { personId: p })
      expect(lebensdatum(detail, 'geburtsort')).toMatchObject({ herkunft: 'ereignis', ereignis_id: ereignisId, aussage_id: null, ort_name: 'Geburtsdorf' })
      expect(zustand(detail, 'geburtsort')).toBe('vorhanden')
    })
  })
})
