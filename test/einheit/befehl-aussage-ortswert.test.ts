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
import { ORTS_PRAEDIKATE } from '../../src/core/person/ort-wert'

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
})
