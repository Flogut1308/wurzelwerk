// Vorarbeiten AP-1.30, PR 5 (docs/80 §31 U-1.34-D-ortspraedikat-wertzahl, Eigentümer 25.09.2026:
// „Orts-Prädikate lehnen Zahlwerte beim Anlegen ab"): `geburtsort`, `todesort` und `wohnort` tragen
// einen Ort — einen Ortsverweis (`wertRefId`) oder freien Ortstext (`wertText`), nie eine Zahl
// (`traegtOrt`, src/core/person/ort-wert.ts). Rot zuerst (CLAUDE.md §5).
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
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'
import { ORTS_PRAEDIKATE, ortswertVerletzung } from '../../src/core/person/ort-wert'
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

function fehlercode(fn: () => unknown): string {
  try {
    fn()
    return 'KEIN_FEHLER'
  } catch (fehler) {
    return fehler instanceof WurzelFehler ? fehler.code : `KEIN_WURZELFEHLER:${String(fehler)}`
  }
}

function aussagenZahl(db: Db): number {
  return db.prepare<[], { readonly n: number }>(`SELECT COUNT(*) AS n FROM aussage`).get()?.n ?? -1
}

describe('Orts-Prädikate nehmen keinen Zahlwert an (U-1.34-D-ortspraedikat-wertzahl)', () => {
  it('O1: die Orts-Prädikate sind geburtsort, todesort, wohnort', () => {
    expect([...ORTS_PRAEDIKATE]).toEqual(['geburtsort', 'todesort', 'wohnort'])
  })

  it('O2: aussage.anlegen mit wertZahl an einem Orts-Prädikat → VALIDIERUNG_ORTSWERT, nichts geschrieben', () => {
    mitDb((db) => {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const vorher = aussagenZahl(db)
      for (const praedikat of ['geburtsort', 'todesort', 'wohnort'] as const) {
        expect(fehlercode(() => fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat, wertZahl: 5, konfidenz: 3 }))).toBe('VALIDIERUNG_ORTSWERT')
      }
      expect(aussagenZahl(db)).toBe(vorher)
    })
  })

  it('O3: Ortsverweis und freier Ortstext bleiben erlaubt; andere Prädikate dürfen Zahlen tragen', () => {
    mitDb((db) => {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const ortId = fuehreAus(db, 'ort.anlegen', { name: 'Irgendwo', typ: 'dorf' }).id
      expect(fehlercode(() => fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat: 'geburtsort', wertRefId: ortId, konfidenz: 3 }))).toBe('KEIN_FEHLER')
      expect(fehlercode(() => fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat: 'todesort', wertText: 'bei Riga', konfidenz: 3 }))).toBe('KEIN_FEHLER')
      expect(fehlercode(() => fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat: 'alter_bei_tod', wertZahl: 72, konfidenz: 3 }))).toBe('KEIN_FEHLER')
    })
  })

  it('O4: aussage.aendern kann einen Ort nicht in eine Zahl verwandeln (sonst wäre die Regel umgehbar)', () => {
    mitDb((db) => {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat: 'wohnort', wertText: 'Dorpat', konfidenz: 3 })
      expect(fehlercode(() => fuehreAus(db, 'aussage.aendern', { id, wertZahl: 5, konfidenz: 3 }))).toBe('VALIDIERUNG_ORTSWERT')
      const zeile = db.prepare<{ readonly id: string }, { readonly wert_text: string | null; readonly wert_zahl: number | null }>(`SELECT wert_text, wert_zahl FROM aussage WHERE id = @id`).get({ id })
      expect(zeile).toEqual({ wert_text: 'Dorpat', wert_zahl: null })
      expect(fehlercode(() => fuehreAus(db, 'aussage.aendern', { id, wertText: 'Tartu', konfidenz: 3 }))).toBe('KEIN_FEHLER')
    })
  })

  it('O5: Altbestand (Orts-Aussage mit wert_zahl) lässt sich per aussage.aendern in einen Ort umwandeln, nicht als Zahl weiterführen (hueter #130, Befund 5)', () => {
    mitDb((db) => {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat: 'wohnort', wertText: 'vorläufig', konfidenz: 3 })
      journalAus(db, 'test-fixture: Altbestand Orts-Aussage mit wert_zahl')
      try {
        db.prepare<{ readonly id: string }>(`UPDATE aussage SET wert_text = NULL, wert_zahl = 5 WHERE id = @id`).run({ id })
      } finally {
        journalAn(db)
      }
      expect(fehlercode(() => fuehreAus(db, 'aussage.aendern', { id, wertZahl: 5, konfidenz: 2 }))).toBe('VALIDIERUNG_ORTSWERT')
      expect(fehlercode(() => fuehreAus(db, 'aussage.aendern', { id, wertText: 'Dorpat', konfidenz: 2 }))).toBe('KEIN_FEHLER')
    })
  })
})

// Vorarbeiten AP-1.30 Teil 2, PR 4 (Eigentümer 25.09.2026, docs/80 §32 V-5-datum): Orts-Prädikate
// lehnen auch einen Datumswert (`datum`) ab, mit demselben Code. Der Gültigkeitszeitraum
// (`gueltigVon`/`gueltigBis`, A-08 „Wohnort mit Zeitraum") bleibt erlaubt (§32 V-5b-zeitraum).
const DATUM = { modifikator: 'exakt', praezision: 'jahr', wert1: '1900' } as const

describe('Orts-Prädikate nehmen keinen Datumswert an (V-5-datum)', () => {
  it('O6: Kernregel — Zahl oder Datum an einem Orts-Prädikat ist eine Verletzung, an anderen Prädikaten nicht', () => {
    expect(ortswertVerletzung('geburtsort', { hatZahl: false, hatDatum: true })).toBe('datum')
    expect(ortswertVerletzung('wohnort', { hatZahl: true, hatDatum: false })).toBe('zahl')
    expect(ortswertVerletzung('todesort', { hatZahl: true, hatDatum: true })).toBe('zahl')
    expect(ortswertVerletzung('todesort', { hatZahl: false, hatDatum: false })).toBeNull()
    expect(ortswertVerletzung('beruf', { hatZahl: true, hatDatum: true })).toBeNull()
  })

  it('O7: aussage.anlegen mit datum an einem Orts-Prädikat → VALIDIERUNG_ORTSWERT, nichts geschrieben', () => {
    mitDb((db) => {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const ortId = fuehreAus(db, 'ort.anlegen', { name: 'Irgendwo', typ: 'dorf' }).id
      const vorher = aussagenZahl(db)
      for (const praedikat of ORTS_PRAEDIKATE) {
        expect(fehlercode(() => fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat, wertText: 'Dorpat', datum: DATUM, konfidenz: 3 }))).toBe('VALIDIERUNG_ORTSWERT')
        expect(fehlercode(() => fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat, wertRefId: ortId, datum: DATUM, konfidenz: 3 }))).toBe('VALIDIERUNG_ORTSWERT')
      }
      expect(aussagenZahl(db)).toBe(vorher)
    })
  })

  it('O8: aussage.aendern kann einer Orts-Aussage kein Datum geben; die Zeile bleibt unverändert', () => {
    mitDb((db) => {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat: 'geburtsort', wertText: 'Dorpat', konfidenz: 3 })
      expect(fehlercode(() => fuehreAus(db, 'aussage.aendern', { id, wertText: 'Dorpat', datum: DATUM, konfidenz: 3 }))).toBe('VALIDIERUNG_ORTSWERT')
      const zeile = db.prepare<{ readonly id: string }, { readonly wert_text: string | null; readonly datum_wert1: string | null }>(`SELECT wert_text, datum_wert1 FROM aussage WHERE id = @id`).get({ id })
      expect(zeile).toEqual({ wert_text: 'Dorpat', datum_wert1: null })
    })
  })

  it('O9: Gültigkeitszeitraum am Wohnort bleibt erlaubt; Datum an anderen Prädikaten auch', () => {
    mitDb((db) => {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat: 'wohnort', wertText: 'Dorpat', gueltigVon: 1780, gueltigBis: 1795, konfidenz: 3 })
      expect(fehlercode(() => fuehreAus(db, 'aussage.aendern', { id, wertText: 'Tartu', gueltigVon: 1781, gueltigBis: 1796, konfidenz: 3 }))).toBe('KEIN_FEHLER')
      expect(fehlercode(() => fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat: 'beruf', wertText: 'Müller', datum: DATUM, konfidenz: 3 }))).toBe('KEIN_FEHLER')
    })
  })

  it('O10: Altbestand (Orts-Aussage mit Datum) — Ändern mit Datum scheitert, Ändern ohne Datum entfernt es', () => {
    mitDb((db) => {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat: 'todesort', wertText: 'Riga', konfidenz: 3 })
      journalAus(db, 'test-fixture: Altbestand Orts-Aussage mit Datum')
      try {
        db.prepare<{ readonly id: string }>(`UPDATE aussage SET datum_modifikator = 'exakt', datum_praezision = 'jahr', datum_wert1 = '1900' WHERE id = @id`).run({ id })
      } finally {
        journalAn(db)
      }
      expect(fehlercode(() => fuehreAus(db, 'aussage.aendern', { id, wertText: 'Riga', datum: DATUM, konfidenz: 2 }))).toBe('VALIDIERUNG_ORTSWERT')
      expect(fehlercode(() => fuehreAus(db, 'aussage.aendern', { id, wertText: 'Riga', konfidenz: 2 }))).toBe('KEIN_FEHLER')
      const zeile = db.prepare<{ readonly id: string }, { readonly datum_wert1: string | null }>(`SELECT datum_wert1 FROM aussage WHERE id = @id`).get({ id })
      expect(zeile).toEqual({ datum_wert1: null })
    })
  })
})
