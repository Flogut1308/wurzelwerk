// AP-1.30 PR 9a (Bugfix, Entscheidung D1): Der Import schreibt `geburtsdatum`/`todesdatum` als Aussage
// NUR mit Datumsgruppe, ohne `wert_text`/`wert_zahl`/`wert_ref_id` (src/main/import/schreiben.ts).
// `aussage.anlegen`/`.aendern` verlangten bisher „genau eines von wertText/wertZahl/wertRefId" — eine
// importierte Datums-Aussage ließ sich darum nicht ändern, nicht einmal ihre Sicherheit.
// D1: an Datumsprädikaten (`DATUMS_PRAEDIKATE`, src/core/person/datums-wert.ts) gilt die Datumsgruppe
// als Wert — entweder das Datum allein oder (Altbestand, bisheriger Weg) genau ein Wert wie bisher.
// Für alle anderen Prädikate bleibt „genau einer"; an Orts-Prädikaten bleibt ein Datum verboten.
// Eiserne Regel §5: rot gegen den unveränderten Stand, grün nach dem Fix.
import type Database from 'better-sqlite3'
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
import { journalAn, journalAus } from '../../src/main/journal/kontext'
import { schreibeImport } from '../../src/main/import/schreiben'
import * as aussageRepo from '../../src/main/repositories/aussage-repo'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'
import { aussageAendernEinSchema, aussageAnlegenEinSchema } from '../../src/shared/schemata/befehle'
import { importDateiSchema } from '../../src/shared/schemata/import-v1'

type Db = Database.Database

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

/** Der Befehlsbus prüft das Vertragsschema vor dem Handler (`bus.ts`, `def.schema.parse`) — ein
 * Schemaverstoß wirft dort einen ZodError, keinen WurzelFehler. */
function vomSchemaAbgelehnt(fn: () => unknown): boolean {
  return fehlercode(fn).startsWith('KEIN_WURZELFEHLER:')
}

function zeile(db: Db, id: string): aussageRepo.AussageZeile {
  const gelesen = aussageRepo.lesen(db, id)
  if (gelesen === undefined) throw new Error(`Aussage ${id} fehlt.`)
  return gelesen
}

function neuePerson(db: Db): string {
  return fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
}

/** Minimale v1-Datei: eine Person mit Geburt (Datum mit Zweitkalender) und Tod (etwa, Originaltext). */
function rohImport(): Record<string, unknown> {
  return {
    vertrag: 'wurzelwerk-import/v1',
    erzeugt: { am: '2026-09-26', werkzeug: 'test' },
    zusammenfassung: { personen: 1, orte: 0, medien: 0, notizen_unverarbeitet: 0 },
    quellen: [{ id: 'tmp:q1', typ: 'sonstiges', titel: 'Testquelle' }],
    orte: [],
    personen: [
      {
        id: 'tmp:p1',
        namen: [{ typ: 'geburtsname', vornamen: 'Anna', nachname: 'Probe', ist_bevorzugt: true }],
        konfidenz: 4,
        belege: [{ quelle: 'tmp:q1', seite: '1', konfidenz: 4 }],
      },
    ],
    ereignisse: [
      {
        id: 'tmp:e-geb',
        typ: 'geburt',
        datum: { kalender: 'julian', modifikator: 'exakt', praezision: 'tag', wert1: '1711-03-01', zweitkalender: 'gregorian', zweitwert: '1711-03-12', doppeljahr: '1710/11' },
        beteiligungen: [{ person: 'tmp:p1', rolle: 'hauptperson' }],
        konfidenz: 4,
        belege: [{ quelle: 'tmp:q1', seite: '3', konfidenz: 4 }],
      },
      {
        id: 'tmp:e-tod',
        typ: 'tod',
        datum: { kalender: 'gregorian', modifikator: 'etwa', praezision: 'jahr', wert1: '1780', original_text: 'um 1780' },
        beteiligungen: [{ person: 'tmp:p1', rolle: 'verstorbener' }],
        konfidenz: 2,
        belege: [{ quelle: 'tmp:q1', seite: '4', konfidenz: 2 }],
      },
    ],
    notizen_unverarbeitet: [],
  }
}

/** Importiert die Datei über den echten Import-Writer; liefert die Aussage-IDs der Datums-Aussagen. */
function importiere(db: Db): { readonly geburtsdatum: string; readonly todesdatum: string } {
  journalAus(db, 'Testvorbereitung (AP-1.30 PR 9a): importierte Datums-Aussagen.')
  try {
    const ergebnis = schreibeImport(db, importDateiSchema.parse(rohImport()), { erstelltAm: 1_700_000_000_000 })
    const personId = ergebnis.kennungen.get('tmp:p1')
    if (personId === undefined) throw new Error('Kennung fehlt im Schreibergebnis')
    const id = (praedikat: string): string => {
      const treffer = db
        .prepare<{ readonly personId: string; readonly praedikat: string }, { readonly id: string }>(
          `SELECT id FROM aussage WHERE subjekt_typ = 'person' AND subjekt_id = @personId AND praedikat = @praedikat`,
        )
        .get({ personId, praedikat })
      if (treffer === undefined) throw new Error(`Aussage ${praedikat} fehlt nach dem Import.`)
      return treffer.id
    }
    return { geburtsdatum: id('geburtsdatum'), todesdatum: id('todesdatum') }
  } finally {
    journalAn(db)
  }
}

const DATUM_1850 = { modifikator: 'exakt', praezision: 'jahr', wert1: '1850' } as const

describe('importierte Datums-Aussage lässt sich ändern (AP-1.30 PR 9a, D1)', () => {
  it('I1: Ausgangslage — der Import schreibt geburtsdatum/todesdatum ohne wert_text/wert_zahl/wert_ref_id', () => {
    mitDb((db) => {
      const ids = importiere(db)
      for (const id of [ids.geburtsdatum, ids.todesdatum]) {
        const z = zeile(db, id)
        expect([z.wert_text, z.wert_zahl, z.wert_ref_id]).toEqual([null, null, null])
        expect(z.datum_wert1).not.toBeNull()
      }
    })
  })

  it('I2: nur die Konfidenz ändern (Datum beibehalten) → ok, die ganze Datumsgruppe bleibt bitgleich', () => {
    mitDb((db) => {
      const { geburtsdatum } = importiere(db)
      const ein = { id: geburtsdatum, konfidenz: 2, datumBeibehalten: true } as const
      expect(aussageAendernEinSchema.safeParse(ein).success).toBe(true)
      const vorher = zeile(db, geburtsdatum)
      expect(fehlercode(() => fuehreAus(db, 'aussage.aendern', ein))).toBe('KEIN_FEHLER')
      expect(zeile(db, geburtsdatum)).toEqual({ ...vorher, konfidenz: 2 })
    })
  })

  it('I3: das Datum selbst ersetzen (ohne Wertspalte) → ok, übrige Spalten bleiben', () => {
    mitDb((db) => {
      const { todesdatum } = importiere(db)
      const ein = { id: todesdatum, konfidenz: 2, datum: DATUM_1850 } as const
      expect(aussageAendernEinSchema.safeParse(ein).success).toBe(true)
      const vorher = zeile(db, todesdatum)
      expect(fehlercode(() => fuehreAus(db, 'aussage.aendern', ein))).toBe('KEIN_FEHLER')
      const nachher = zeile(db, todesdatum)
      expect(nachher.datum_wert1).toBe('1850')
      expect(nachher.datum_modifikator).toBe('exakt')
      expect(nachher.datum_originaltext).toBeNull()
      expect({ ...nachher, datum_kalender: null, datum_modifikator: null, datum_praezision: null, datum_wert1: null, datum_originaltext: null, datum_sort_von: null, datum_sort_bis: null }).toEqual({
        ...vorher,
        datum_kalender: null,
        datum_modifikator: null,
        datum_praezision: null,
        datum_wert1: null,
        datum_originaltext: null,
        datum_sort_von: null,
        datum_sort_bis: null,
      })
    })
  })

  it('I4: Datum entfernen, ohne einen Wert zu setzen → abgelehnt, Zeile unverändert', () => {
    mitDb((db) => {
      const { geburtsdatum } = importiere(db)
      const vorher = zeile(db, geburtsdatum)
      expect(aussageAendernEinSchema.safeParse({ id: geburtsdatum, konfidenz: 2 }).success).toBe(false)
      expect(vomSchemaAbgelehnt(() => fuehreAus(db, 'aussage.aendern', { id: geburtsdatum, konfidenz: 2 }))).toBe(true)
      expect(zeile(db, geburtsdatum)).toEqual(vorher)
    })
  })
})

describe('aussage.anlegen an Datumsprädikaten nur mit Datum (AP-1.30 PR 9a, D1)', () => {
  it('A1: geburtsdatum nur mit datum → Schema und Befehl ok, keine Wertspalte gesetzt', () => {
    mitDb((db) => {
      const ein = { subjektTyp: 'person', subjektId: neuePerson(db), praedikat: 'geburtsdatum', datum: DATUM_1850, konfidenz: 3 } as const
      expect(aussageAnlegenEinSchema.safeParse(ein).success).toBe(true)
      const { id } = fuehreAus(db, 'aussage.anlegen', ein)
      const z = zeile(db, id)
      expect([z.wert_text, z.wert_zahl, z.wert_ref_id]).toEqual([null, null, null])
      expect(z.datum_wert1).toBe('1850')
    })
  })

  it('A2: todesdatum nur mit datum → ok', () => {
    mitDb((db) => {
      const ein = { subjektTyp: 'person', subjektId: neuePerson(db), praedikat: 'todesdatum', datum: DATUM_1850, konfidenz: 3 } as const
      expect(aussageAnlegenEinSchema.safeParse(ein).success).toBe(true)
      expect(fehlercode(() => fuehreAus(db, 'aussage.anlegen', ein))).toBe('KEIN_FEHLER')
    })
  })

  it('A3: Altbestandsweg bleibt gültig — geburtsdatum mit wertText (mit und ohne datum)', () => {
    mitDb((db) => {
      const personId = neuePerson(db)
      const mitDatum = { subjektTyp: 'person', subjektId: personId, praedikat: 'geburtsdatum', wertText: '1900', datum: { modifikator: 'exakt', praezision: 'jahr', wert1: '1900' }, konfidenz: 3 } as const
      const ohneDatum = { subjektTyp: 'person', subjektId: personId, praedikat: 'geburtsdatum', wertText: '1900', konfidenz: 3 } as const
      expect(aussageAnlegenEinSchema.safeParse(mitDatum).success).toBe(true)
      expect(aussageAnlegenEinSchema.safeParse(ohneDatum).success).toBe(true)
      expect(fehlercode(() => fuehreAus(db, 'aussage.anlegen', mitDatum))).toBe('KEIN_FEHLER')
      expect(fehlercode(() => fuehreAus(db, 'aussage.anlegen', ohneDatum))).toBe('KEIN_FEHLER')
    })
  })

  it('A4: auch an Datumsprädikaten nie zwei Werte zugleich', () => {
    const ein = { subjektTyp: 'person', subjektId: 'x', praedikat: 'geburtsdatum', wertText: '1900', wertZahl: 1900, datum: DATUM_1850, konfidenz: 3 } as const
    expect(aussageAnlegenEinSchema.safeParse(ein).success).toBe(false)
    expect(aussageAendernEinSchema.safeParse({ id: 'a', wertText: '1900', wertZahl: 1900, datum: DATUM_1850, konfidenz: 3 }).success).toBe(false)
  })

  it('A5: Datumsprädikat ganz ohne Wert und ohne Datum → abgelehnt', () => {
    mitDb((db) => {
      const ein = { subjektTyp: 'person', subjektId: neuePerson(db), praedikat: 'geburtsdatum', konfidenz: 3 } as const
      expect(aussageAnlegenEinSchema.safeParse(ein).success).toBe(false)
      expect(vomSchemaAbgelehnt(() => fuehreAus(db, 'aussage.anlegen', ein))).toBe(true)
    })
  })
})

describe('Nicht-Datumsprädikate: weiter genau ein Wert (AP-1.30 PR 9a, D1)', () => {
  it('N1: beruf nur mit datum → Schema und Befehl lehnen ab', () => {
    mitDb((db) => {
      const ein = { subjektTyp: 'person', subjektId: neuePerson(db), praedikat: 'beruf', datum: DATUM_1850, konfidenz: 3 } as const
      expect(aussageAnlegenEinSchema.safeParse(ein).success).toBe(false)
      expect(vomSchemaAbgelehnt(() => fuehreAus(db, 'aussage.anlegen', ein))).toBe(true)
      expect(db.prepare<[], { readonly n: number }>(`SELECT COUNT(*) AS n FROM aussage WHERE praedikat = 'beruf'`).get()?.n).toBe(0)
    })
  })

  it('N2: beruf ändern ohne Wert (nur datum bzw. datumBeibehalten) → der Befehl lehnt ab, Zeile unverändert', () => {
    mitDb((db) => {
      const { id } = fuehreAus(db, 'aussage.anlegen', {
        subjektTyp: 'person',
        subjektId: neuePerson(db),
        praedikat: 'beruf',
        wertText: 'Müller',
        datum: DATUM_1850,
        konfidenz: 3,
      })
      const vorher = zeile(db, id)
      expect(fehlercode(() => fuehreAus(db, 'aussage.aendern', { id, datum: DATUM_1850, konfidenz: 2 }))).toBe('VALIDIERUNG_PFLICHTFELD')
      expect(fehlercode(() => fuehreAus(db, 'aussage.aendern', { id, datumBeibehalten: true, konfidenz: 2 }))).toBe('VALIDIERUNG_PFLICHTFELD')
      expect(zeile(db, id)).toEqual(vorher)
    })
  })

  it('N3: ganz ohne Wert und ohne Datum lehnt schon das Schema von aussage.aendern ab', () => {
    expect(aussageAendernEinSchema.safeParse({ id: 'a', konfidenz: 2 }).success).toBe(false)
  })

  it('N4: Datumsprädikat-Altbestand ohne Datum: datumBeibehalten ohne Wert → abgelehnt (es gäbe keinen Wert)', () => {
    mitDb((db) => {
      const { id } = fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: neuePerson(db), praedikat: 'geburtsdatum', wertText: '1900', konfidenz: 3 })
      expect(fehlercode(() => fuehreAus(db, 'aussage.aendern', { id, datumBeibehalten: true, konfidenz: 2 }))).toBe('VALIDIERUNG_PFLICHTFELD')
    })
  })
})

describe('Orts-Prädikate: Datum weiter verboten (AP-1.30 PR 9a, V-5-datum)', () => {
  it('O1: geburtsort mit datum → VALIDIERUNG_ORTSWERT (anlegen mit Ort, ändern nur mit Datum); anlegen nur mit Datum lehnt schon das Schema ab', () => {
    mitDb((db) => {
      const personId = neuePerson(db)
      expect(
        fehlercode(() =>
          fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat: 'geburtsort', wertText: 'Riga', datum: DATUM_1850, konfidenz: 3 }),
        ),
      ).toBe('VALIDIERUNG_ORTSWERT')
      expect(aussageAnlegenEinSchema.safeParse({ subjektTyp: 'person', subjektId: personId, praedikat: 'geburtsort', datum: DATUM_1850, konfidenz: 3 }).success).toBe(false)
      const { id } = fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat: 'geburtsort', wertText: 'Riga', konfidenz: 3 })
      expect(fehlercode(() => fuehreAus(db, 'aussage.aendern', { id, datum: DATUM_1850, konfidenz: 3 }))).toBe('VALIDIERUNG_ORTSWERT')
    })
  })
})

describe('Undo/Redo der neuen Schreibwege (AP-1.30 PR 9a)', () => {
  it('U1: Konfidenz einer importierten Datums-Aussage ändern — Undo stellt bitgleich her, Redo wieder', () => {
    mitDb((db) => {
      const { todesdatum } = importiere(db)
      const vorher = zeile(db, todesdatum)
      fuehreAus(db, 'aussage.aendern', { id: todesdatum, konfidenz: 4, datumBeibehalten: true })
      const nachher = zeile(db, todesdatum)
      expect(nachher.konfidenz).toBe(4)
      undo(db)
      expect(zeile(db, todesdatum)).toEqual(vorher)
      redo(db)
      expect(zeile(db, todesdatum)).toEqual(nachher)
    })
  })

  it('U2: geburtsdatum nur mit Datum anlegen — Undo entfernt, Redo stellt bitgleich wieder her', () => {
    mitDb((db) => {
      const { id } = fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: neuePerson(db), praedikat: 'geburtsdatum', datum: DATUM_1850, konfidenz: 3 })
      const angelegt = zeile(db, id)
      undo(db)
      expect(aussageRepo.lesen(db, id)).toBeUndefined()
      redo(db)
      expect(zeile(db, id)).toEqual(angelegt)
    })
  })
})
