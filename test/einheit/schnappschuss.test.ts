// AP-0.11, 55_Architektur.md §6.2 (F-04, ADR-003): `schnappschussErzeugen()` — die Kopie muss
// öffenbar UND inhaltlich identisch sein, und `VACUUM INTO` darf eine offene Lesetransaktion nicht
// blockieren (der ganze Grund, warum SQLite hier die richtige Wahl ist, ADR-002).
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { schnappschussErzeugen } from '../../src/main/schnappschuss/erzeugen'
import { fuehreAus } from '../../src/main/befehle/bus'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'

function neueTestDatenbank(pfad: string): ReturnType<typeof oeffnen> {
  const db = oeffnen(pfad)
  migrieren(db)
  return db
}

describe('schnappschussErzeugen() (55_Architektur.md §6.2, AP-0.11)', () => {
  let ordner: string

  beforeEach(() => {
    ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-schnappschuss-'))
  })

  afterEach(() => {
    rmSync(ordner, { recursive: true, force: true })
  })

  it('legt eine Kopie an der erwarteten kolonfreien Stelle an, die sich öffnen lässt', () => {
    const dbPfad = join(ordner, 'baum.sqlite')
    const snapshotsPfad = join(ordner, 'snapshots')
    const db = neueTestDatenbank(dbPfad)
    try {
      const eintrag = schnappschussErzeugen(db, { snapshotsPfad }, () => Date.UTC(2026, 8, 10, 12, 0, 0))

      expect(eintrag.id).toBe('2026-09-10T12-00-00Z')
      expect(eintrag.pfad).toBe(join(snapshotsPfad, '2026-09-10T12-00-00Z.sqlite'))
      expect(basename(eintrag.pfad)).not.toContain(':') // Windows-Dateinamen dürfen keinen Doppelpunkt enthalten (nur der Dateiname, nicht der Laufwerksbuchstabe C:)
      expect(existsSync(eintrag.pfad)).toBe(true)
      expect(eintrag.groesseBytes).toBeGreaterThan(0)

      const kopie = oeffnen(eintrag.pfad)
      try {
        expect(kopie.pragma('integrity_check', { simple: true })).toBe('ok')
      } finally {
        kopie.close()
      }
    } finally {
      db.close()
    }
  })

  it('der Inhalt der Kopie stimmt mit der Quelle überein (Zeilen-Vergleich)', () => {
    const dbPfad = join(ordner, 'baum.sqlite')
    const snapshotsPfad = join(ordner, 'snapshots')
    const db = neueTestDatenbank(dbPfad)
    try {
      fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      fuehreAus(db, 'person.anlegen', { privat: 1, ist_platzhalter: 0 })

      const vorherigePersonen = db.prepare('SELECT id, privat, ist_platzhalter FROM person ORDER BY id').all()

      const eintrag = schnappschussErzeugen(db, { snapshotsPfad })

      const kopie = oeffnen(eintrag.pfad)
      try {
        const kopiePersonen = kopie.prepare('SELECT id, privat, ist_platzhalter FROM person ORDER BY id').all()
        expect(kopiePersonen).toEqual(vorherigePersonen)
      } finally {
        kopie.close()
      }
    } finally {
      db.close()
    }
  })

  it('legt den snapshots/-Ordner an, falls er noch nicht existiert', () => {
    const dbPfad = join(ordner, 'baum.sqlite')
    const snapshotsPfad = join(ordner, 'noch-nicht-vorhanden')
    const db = neueTestDatenbank(dbPfad)
    try {
      expect(existsSync(snapshotsPfad)).toBe(false)
      schnappschussErzeugen(db, { snapshotsPfad })
      expect(readdirSync(snapshotsPfad)).toHaveLength(1)
    } finally {
      db.close()
    }
  })

  it('eine offene Lesetransaktion auf einer zweiten Verbindung blockiert die Schnappschuss-Erzeugung nicht (VACUUM INTO, ADR-002)', () => {
    const dbPfad = join(ordner, 'baum.sqlite')
    const snapshotsPfad = join(ordner, 'snapshots')
    const db = neueTestDatenbank(dbPfad)
    const leser = oeffnen(dbPfad)
    try {
      fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })

      // Eine zweite, gleichzeitig offene Lesetransaktion (WAL-Modus, ADR-002) - simuliert eine
      // parallel laufende Abfrage, während der Schnappschuss auf der ersten Verbindung entsteht.
      leser.exec('BEGIN')
      leser.prepare('SELECT id FROM person').all()
      try {
        expect(() => schnappschussErzeugen(db, { snapshotsPfad })).not.toThrow()
      } finally {
        leser.exec('COMMIT')
      }
    } finally {
      leser.close()
      db.close()
    }
  })

  it('bei fehlgeschlagener Integritätsprüfung wird die beschädigte Kopie sofort gelöscht (hueter-Auflage C1)', () => {
    // Ohne diesen Aufräumschritt bliebe eine korrupte Datei mit gültigem Schnappschuss-Dateinamen
    // in snapshots/ liegen und würde von `schnappschussListeLesen()` als Wiederherstellungs-
    // Kandidat gelistet (der Fehler dieses Tests wird über eine injizierte, immer fehlschlagende
    // Prüffunktion erzwungen - eine echte Beschädigung ließe sich nicht deterministisch erzeugen).
    const dbPfad = join(ordner, 'baum.sqlite')
    const snapshotsPfad = join(ordner, 'snapshots')
    const db = neueTestDatenbank(dbPfad)
    try {
      const immerFehlschlagend = (): void => {
        throw new WurzelFehler('DATEI_KEIN_PLATZ')
      }

      expect.assertions(3)
      let erzeugterPfad: string | undefined
      try {
        schnappschussErzeugen(db, { snapshotsPfad }, () => Date.UTC(2026, 8, 10, 12, 0, 0), immerFehlschlagend)
        expect.unreachable()
      } catch (u) {
        expect(u).toBeInstanceOf(WurzelFehler)
        if (u instanceof WurzelFehler) {
          expect(u.code).toBe('DATEI_KEIN_PLATZ')
        }
        erzeugterPfad = join(snapshotsPfad, '2026-09-10T12-00-00Z.sqlite')
      }
      expect(erzeugterPfad !== undefined && existsSync(erzeugterPfad)).toBe(false)
    } finally {
      db.close()
    }
  })
})
