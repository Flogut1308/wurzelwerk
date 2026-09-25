// Vorarbeiten AP-1.30 Teil 3, PR 4b (Eigentümer-Entscheidung E5 vom 25.09.2026, docs/80 §32 Teil 3
// V-E5-erhalt): ältere Dateien und Importe können Orts-Aussagen MIT Datum enthalten. Seit Teil 2 lehnt
// `aussage.aendern` ein Datum an Orts-Prädikaten ab, und ohne `datum` entfernt es das gespeicherte
// (O10). Damit die Oberfläche beim Ändern das Datum nicht still weglässt, trägt der Befehl ein
// ausdrückliches Signal `datumBeibehalten: true`: die gespeicherte Datumsgruppe bleibt unberührt,
// ohne Rundreise der Datumsspalten und ohne neuen Datumswert. Rot zuerst (CLAUDE.md §5).
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
import { redo, undo } from '../../src/main/journal/undo'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'
import { journalAn, journalAus } from '../../src/main/journal/kontext'
import { aussageAendernEinSchema } from '../../src/shared/schemata/befehle'

type Db = ReturnType<typeof oeffnen>

interface DatumZeile {
  readonly wert_text: string | null
  readonly konfidenz: number
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

function zeile(db: Db, id: string): DatumZeile | undefined {
  return db
    .prepare<{ readonly id: string }, DatumZeile>(
      `SELECT wert_text, konfidenz, datum_kalender, datum_modifikator, datum_praezision, datum_wert1, datum_wert2,
              datum_originaltext, datum_sort_von, datum_sort_bis, datum_zweitkalender, datum_zweitwert, datum_doppeljahr
         FROM aussage WHERE id = @id`,
    )
    .get({ id })
}

/** Altbestand: eine Orts-Aussage, deren Datumsgruppe (mit Sonderformen: Zweitkalender, Doppeljahr,
 * Originaltext) an der Validierung vorbei geschrieben wurde — wie aus einer älteren Datei. */
function altbestand(db: Db, praedikat: string): string {
  const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
  const { id } = fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat, wertText: 'Riga', konfidenz: 3 })
  journalAus(db, 'test-fixture: Altbestand Orts-Aussage mit Datum')
  try {
    db.prepare<{ readonly id: string }>(
      `UPDATE aussage SET datum_kalender = 'julian', datum_modifikator = 'zwischen', datum_praezision = 'jahr', datum_wert1 = '1711', datum_wert2 = '1712',
              datum_originaltext = 'Anno 1711/12', datum_sort_von = 2346000, datum_sort_bis = 2346365,
              datum_zweitkalender = 'gregorian', datum_zweitwert = '1712', datum_doppeljahr = '1711/12'
        WHERE id = @id`,
    ).run({ id })
  } finally {
    journalAn(db)
  }
  return id
}

describe('aussage.aendern mit datumBeibehalten (E5, V-E5-erhalt)', () => {
  it('D1: Orts-Aussage mit Bestandsdatum — Ort ändern mit datumBeibehalten erhält die ganze Datumsgruppe', () => {
    mitDb((db) => {
      const id = altbestand(db, 'geburtsort')
      const vorher = zeile(db, id)
      expect(fehlercode(() => fuehreAus(db, 'aussage.aendern', { id, wertText: 'Dorpat', konfidenz: 2, datumBeibehalten: true }))).toBe('KEIN_FEHLER')
      expect(zeile(db, id)).toEqual({ ...vorher, wert_text: 'Dorpat', konfidenz: 2 })
    })
  })

  it('D2: ein Schritt: Undo stellt den Ort zurück, Redo wieder her — das Datum bleibt dabei stehen', () => {
    mitDb((db) => {
      const id = altbestand(db, 'todesort')
      const vorher = zeile(db, id)
      fuehreAus(db, 'aussage.aendern', { id, wertText: 'Dorpat', konfidenz: 3, datumBeibehalten: true })
      const nachher = zeile(db, id)
      undo(db)
      expect(zeile(db, id)).toEqual(vorher)
      redo(db)
      expect(zeile(db, id)).toEqual(nachher)
    })
  })

  it('D3: datumBeibehalten ohne sonstige Änderung ist ein No-op (keine neue Transaktion)', () => {
    mitDb((db) => {
      const id = altbestand(db, 'wohnort')
      const anzahl = (): number => db.prepare<[], { readonly n: number }>(`SELECT COUNT(*) AS n FROM transaktion`).get()?.n ?? -1
      const vorher = anzahl()
      fuehreAus(db, 'aussage.aendern', { id, wertText: 'Riga', konfidenz: 3, datumBeibehalten: true })
      expect(anzahl()).toBe(vorher)
    })
  })

  it('D4: datum und datumBeibehalten zugleich sind widersprüchlich — der Vertrag lehnt ab', () => {
    const ergebnis = aussageAendernEinSchema.safeParse({
      id: 'a',
      wertText: 'Riga',
      konfidenz: 3,
      datumBeibehalten: true,
      datum: { modifikator: 'exakt', praezision: 'jahr', wert1: '1900' },
    })
    expect(ergebnis.success).toBe(false)
  })

  it('D4b: datumBeibehalten ist nur als true zulässig — false lehnt der Vertrag ab (hueter #144, 5)', () => {
    expect(aussageAendernEinSchema.safeParse({ id: 'a', wertText: 'Riga', konfidenz: 3, datumBeibehalten: false }).success).toBe(false)
    expect(aussageAendernEinSchema.safeParse({ id: 'a', wertText: 'Riga', konfidenz: 3, datumBeibehalten: true }).success).toBe(true)
  })

  it('D5: ohne datumBeibehalten bleibt es bei O10 — Ändern ohne Datum entfernt es', () => {
    mitDb((db) => {
      const id = altbestand(db, 'geburtsort')
      fuehreAus(db, 'aussage.aendern', { id, wertText: 'Riga', konfidenz: 2 })
      expect(zeile(db, id)?.datum_wert1).toBeNull()
    })
  })

  it('D6: auch an anderen Prädikaten (Beruf mit Datum) erhält datumBeibehalten das Datum', () => {
    mitDb((db) => {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'aussage.anlegen', {
        subjektTyp: 'person',
        subjektId: personId,
        praedikat: 'beruf',
        wertText: 'Müller',
        datum: { modifikator: 'exakt', praezision: 'jahr', wert1: '1850' },
        konfidenz: 3,
      })
      const vorher = zeile(db, id)
      fuehreAus(db, 'aussage.aendern', { id, wertText: 'Müllermeister', konfidenz: 3, datumBeibehalten: true })
      expect(zeile(db, id)).toEqual({ ...vorher, wert_text: 'Müllermeister' })
    })
  })
})
