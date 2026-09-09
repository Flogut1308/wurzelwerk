// AP-0.9, 55_Architektur.md §4.5-Vorlage: der Befehlsbus (`src/main/befehle/bus.ts`) selbst -
// unabhängig von einer konkreten Fachlogik. Nutzt für die reinen Bus-Mechanik-Fälle (leere
// Transaktion verwerfen, werfender Handler, Verschachtelung) `fuehreAusDef()` mit einem winzigen
// Test-Befehl (kein zweites Registrierungssystem im Produktivcode, s. Kommentar in
// `src/main/befehle/registrierung.ts`), für den Erfolgsfall die echte `person.anlegen`-Registrierung.
//
// `sendeEreignis` wird gemockt (nicht `electron`/`BrowserWindow`): `src/main/ipc/ereignisse.ts`
// selbst importiert `electron`, aber ein kompletter Modul-Mock ersetzt die Datei, bevor dieser
// Import überhaupt läuft.
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { v7 as uuidv7 } from 'uuid'

vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { fuehreAus, fuehreAusDef } from '../../src/main/befehle/bus'
import type { BefehlDef } from '../../src/main/befehle/registrierung'
import { sendeEreignis } from '../../src/main/ipc/ereignisse'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'

interface TransaktionZeile {
  readonly id: string
  readonly lfd: number
  readonly status: string
}

interface AenderungZahl {
  readonly anzahl: number
}

function transaktionen(db: ReturnType<typeof oeffnen>): readonly TransaktionZeile[] {
  return db.prepare<[], TransaktionZeile>('SELECT id, lfd, status FROM transaktion ORDER BY lfd').all()
}

function aenderungAnzahl(db: ReturnType<typeof oeffnen>): number {
  const zeile = db.prepare<[], AenderungZahl>('SELECT COUNT(*) AS anzahl FROM aenderung').get()
  if (zeile === undefined) {
    throw new Error('COUNT(*) lieferte keine Zeile.')
  }
  return zeile.anzahl
}

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

const LEERER_BEFEHL: BefehlDef<null, null> = {
  schema: z.null(),
  art: 'nutzer',
  beschreibung: () => 'test.leer',
  handler: () => null,
}

function verschachtelterBefehl(): BefehlDef<null, null> {
  return {
    schema: z.null(),
    art: 'nutzer',
    beschreibung: () => 'test.verschachtelt',
    handler: (tx) => {
      // Ruft den Bus innerhalb eines bereits laufenden Bus-Aufrufs erneut auf — das ist der Fall,
      // den `BEFEHL_VERSCHACHTELT` verhindern soll (55_Architektur.md §4.5).
      fuehreAus(tx, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      return null
    },
  }
}

describe('fuehreAus()/fuehreAusDef() — Befehlsbus-Mechanik (AP-0.9, 55_Architektur.md §4.5)', () => {
  it('Erfolg: genau eine transaktion-Zeile (lfd=1, status=angewendet) + mindestens eine aenderung-Zeile', () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })

      expect(typeof id).toBe('string')
      const zeilen = transaktionen(db)
      expect(zeilen).toHaveLength(1)
      expect(zeilen[0]?.lfd).toBe(1)
      expect(zeilen[0]?.status).toBe('angewendet')
      expect(aenderungAnzahl(db)).toBeGreaterThanOrEqual(1)
    } finally {
      db.close()
    }
  })

  it('werfender Handler: toThrow, danach transaktion UND aenderung leer', () => {
    const db = neueTestDatenbank()
    try {
      expect(() => fuehreAus(db, 'person.loeschen', { id: uuidv7() })).toThrow(WurzelFehler)
      expect(transaktionen(db)).toEqual([])
      expect(aenderungAnzahl(db)).toBe(0)
    } finally {
      db.close()
    }
  })

  it('werfender Handler: der geworfene Fehler trägt NICHT_GEFUNDEN_PERSON', () => {
    const db = neueTestDatenbank()
    try {
      expect.assertions(1)
      try {
        fuehreAus(db, 'person.loeschen', { id: uuidv7() })
      } catch (u) {
        expect(u instanceof WurzelFehler && u.code).toBe('NICHT_GEFUNDEN_PERSON')
      }
    } finally {
      db.close()
    }
  })

  it('leerer Befehl (Handler schreibt nichts): keine transaktion-Zeile', () => {
    const db = neueTestDatenbank()
    try {
      const ergebnis = fuehreAusDef(db, 'test.leer', LEERER_BEFEHL, null)
      expect(ergebnis).toBeNull()
      expect(transaktionen(db)).toEqual([])
      expect(aenderungAnzahl(db)).toBe(0)
    } finally {
      db.close()
    }
  })

  it('Verschachtelung: ein Handler, der fuehreAus() erneut aufruft, wirft BEFEHL_VERSCHACHTELT — die äußere Transaktion rollt zurück', () => {
    const db = neueTestDatenbank()
    try {
      expect.assertions(2)
      try {
        fuehreAusDef(db, 'test.verschachtelt', verschachtelterBefehl(), null)
      } catch (u) {
        expect(u instanceof WurzelFehler && u.code).toBe('BEFEHL_VERSCHACHTELT')
      }
      expect(transaktionen(db)).toEqual([])
    } finally {
      db.close()
    }
  })

  it('sendeEreignis: bei Erfolg beide Kanäle (datenGeaendert, journalStatus)', () => {
    const db = neueTestDatenbank()
    try {
      vi.mocked(sendeEreignis).mockClear()
      fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })

      expect(sendeEreignis).toHaveBeenCalledTimes(2)
      expect(vi.mocked(sendeEreignis).mock.calls[0]?.[0]).toBe('ereignis:datenGeaendert')
      expect(vi.mocked(sendeEreignis).mock.calls[1]?.[0]).toBe('ereignis:journalStatus')
    } finally {
      db.close()
    }
  })

  it('sendeEreignis: bei einer leeren Transaktion kein Aufruf', () => {
    const db = neueTestDatenbank()
    try {
      vi.mocked(sendeEreignis).mockClear()
      fuehreAusDef(db, 'test.leer', LEERER_BEFEHL, null)

      expect(sendeEreignis).not.toHaveBeenCalled()
    } finally {
      db.close()
    }
  })
})
