// AP-0.11, 55_Architektur.md §6.2/§6.4 (F-04, ADR-003): `schnappschussWiederherstellen()` — Projekt
// schließen, aktuelle Datei nach `snapshots/ersetzt-<Zeit>.sqlite` verschieben (NIE löschen),
// gewählten Schnappschuss zurückkopieren, wieder öffnen.
import Database from 'better-sqlite3'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Kontext } from '../../src/main/ipc/huelle'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'

vi.mock('electron', () => ({ app: { getVersion: () => '0.1.0-test', isPackaged: false } }))
vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))
vi.mock('electron-store', () => {
  class SpeicherAttrappe<T extends Record<string, unknown>> {
    private daten: T
    public constructor(optionen: { readonly defaults: T }) {
      this.daten = { ...optionen.defaults }
    }
    public get<K extends keyof T>(schluessel: K): T[K] {
      return this.daten[schluessel]
    }
    public set<K extends keyof T>(schluessel: K, wert: T[K]): void {
      this.daten[schluessel] = wert
    }
  }
  return { default: SpeicherAttrappe }
})

import { fuehreAus } from '../../src/main/befehle/bus'
import { offenesProjektDatenbank, projektAnlegen, projektOeffnen, projektSchliessen } from '../../src/main/projekt/projekt-dienst'
import { schnappschussErzeugen } from '../../src/main/schnappschuss/erzeugen'
import { schnappschussWiederherstellen } from '../../src/main/schnappschuss/wiederherstellen'

const ktx: Kontext = { vorgangsId: 'v-test-0001' }

function personenAnzahl(pfad: string): number {
  const db = new Database(pfad, { readonly: true })
  try {
    const zeile = db.prepare<[], { readonly anzahl: number }>('SELECT COUNT(*) AS anzahl FROM person').get()
    if (zeile === undefined) {
      throw new Error('COUNT(*) lieferte keine Zeile.')
    }
    return zeile.anzahl
  } finally {
    db.close()
  }
}

describe('schnappschussWiederherstellen() (55_Architektur.md §6.2/§6.4, AP-0.11)', () => {
  let elternordner: string

  beforeEach(() => {
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-wiederherstellen-'))
  })

  afterEach(() => {
    projektSchliessen()
    rmSync(elternordner, { recursive: true, force: true })
  })

  it('verschiebt die ersetzte Datei nach snapshots/ersetzt-<Zeit>.sqlite (intakt, NIE gelöscht) und stellt den Schnappschuss-Stand wieder her', () => {
    const projekt = projektAnlegen({ elternordner, name: 'Testbaum' })
    const dbVorher = offenesProjektDatenbank()
    fuehreAus(dbVorher, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })

    const snapshotsPfad = join(projekt.pfad, 'snapshots')
    const eintrag = schnappschussErzeugen(dbVorher, { snapshotsPfad }, () => Date.UTC(2026, 8, 10, 8, 0, 0))

    // Nach dem Schnappschuss noch eine zweite Person anlegen — dieser Stand darf nach der
    // Wiederherstellung NICHT mehr im aktiven baum.sqlite stehen, aber IN der verschobenen Datei.
    fuehreAus(dbVorher, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
    const dbPfad = join(projekt.pfad, 'baum.sqlite')
    expect(personenAnzahl(dbPfad)).toBe(2)

    schnappschussWiederherstellen({ id: eintrag.id }, ktx, () => Date.UTC(2026, 8, 10, 9, 0, 0))

    // Wiederhergestellt: genau der Ein-Personen-Stand des Schnappschusses.
    expect(personenAnzahl(dbPfad)).toBe(1)

    // Die verschobene Vorgängerdatei liegt in snapshots/ersetzt-<Zeit>.sqlite, ist NICHT gelöscht
    // und enthält weiterhin den Zwei-Personen-Stand von unmittelbar vor der Wiederherstellung.
    const ersetztPfad = join(snapshotsPfad, 'ersetzt-2026-09-10T09-00-00Z.sqlite')
    expect(existsSync(ersetztPfad)).toBe(true)
    expect(personenAnzahl(ersetztPfad)).toBe(2)

    // Das Projekt ist danach wieder offen (nicht nur die Datei ausgetauscht).
    expect(() => offenesProjektDatenbank()).not.toThrow()
  })

  it('ohne einen Schnappschuss mit der übergebenen id wirft es DATEI_NICHT_LESBAR', () => {
    projektAnlegen({ elternordner, name: 'Testbaum' })

    expect.assertions(2)
    try {
      schnappschussWiederherstellen({ id: 'nie-existiert' }, ktx)
    } catch (u) {
      expect(u).toBeInstanceOf(WurzelFehler)
      if (u instanceof WurzelFehler) {
        expect(u.code).toBe('DATEI_NICHT_LESBAR')
      }
    }
  })

  it('ohne offenes Projekt wirft es PROJEKT_NICHT_GEOEFFNET', () => {
    expect.assertions(2)
    try {
      schnappschussWiederherstellen({ id: 'irgendwas' }, ktx)
    } catch (u) {
      expect(u).toBeInstanceOf(WurzelFehler)
      if (u instanceof WurzelFehler) {
        expect(u.code).toBe('PROJEKT_NICHT_GEOEFFNET')
      }
    }
  })

  it('ein zweiter Schnappschuss danach wiederherstellen belässt genau eine ersetzt-Datei je Wiederherstellung (keine überschrieben)', () => {
    const projekt = projektAnlegen({ elternordner, name: 'Testbaum' })
    const db = offenesProjektDatenbank()
    const snapshotsPfad = join(projekt.pfad, 'snapshots')
    const eintrag = schnappschussErzeugen(db, { snapshotsPfad }, () => Date.UTC(2026, 8, 10, 8, 0, 0))

    schnappschussWiederherstellen({ id: eintrag.id }, ktx, () => Date.UTC(2026, 8, 10, 9, 0, 0))
    schnappschussWiederherstellen({ id: eintrag.id }, ktx, () => Date.UTC(2026, 8, 10, 10, 0, 0))

    const ersetzteDateien = readdirSync(snapshotsPfad).filter((name) => name.startsWith('ersetzt-'))
    expect(ersetzteDateien).toHaveLength(2)
  })

  it('ein fehlschlagendes copyFileSync (nach erfolgreichem renameSync) rollt zurück - baum.sqlite ist wieder da, keine verwaiste ersetzt-Datei, Projekt danach wieder öffenbar (hueter-Auflage C2)', () => {
    const projekt = projektAnlegen({ elternordner, name: 'Testbaum' })
    const dbVorher = offenesProjektDatenbank()
    fuehreAus(dbVorher, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
    const dbPfad = join(projekt.pfad, 'baum.sqlite')
    expect(personenAnzahl(dbPfad)).toBe(1)

    // Erzwingt einen `copyFileSync`-Fehlschlag OHNE Testseam in der Produktivfunktion: eine
    // Quelle, die als Verzeichnis existiert (besteht `existsSync()`, aber `copyFileSync` scheitert
    // an einem Verzeichnis als Quelle mit EISDIR) - `renameSync(dbPfad → ersetzt-)` läuft davor
    // bereits erfolgreich durch.
    const snapshotsPfad = join(projekt.pfad, 'snapshots')
    mkdirSync(join(snapshotsPfad, 'kaputt.sqlite'))

    try {
      schnappschussWiederherstellen({ id: 'kaputt' }, ktx, () => Date.UTC(2026, 8, 10, 9, 0, 0))
      expect.unreachable()
    } catch (u) {
      expect(u).toBeInstanceOf(WurzelFehler)
      if (u instanceof WurzelFehler) {
        expect(u.code).toBe('DATEI_KEIN_PLATZ')
      }
    }

    // Rückgerollt: baum.sqlite ist wieder da, mit unverändertem Inhalt.
    expect(existsSync(dbPfad)).toBe(true)
    expect(personenAnzahl(dbPfad)).toBe(1)

    // Keine verwaiste ersetzt-Datei (der Rückroll benennt sie zurück, statt sie liegen zu lassen).
    const ersetzteDateien = readdirSync(snapshotsPfad).filter((name) => name.startsWith('ersetzt-'))
    expect(ersetzteDateien).toHaveLength(0)

    // Das Projekt ist NICHT mehr offen (der Fehlschlag passiert nach projektSchliessen(), vor
    // dem erneuten projektOeffnen()) - lässt sich aber unverändert wieder öffnen, statt an einem
    // fehlenden baum.sqlite zu scheitern (der eigentliche Kern der Auflage: kein "Projekt steckt").
    expect(() => offenesProjektDatenbank()).toThrow(WurzelFehler)
    const wiedergeoeffnet = projektOeffnen({ pfad: projekt.pfad }, ktx)
    expect(wiedergeoeffnet).toEqual({ status: 'geoeffnet', projekt })
    expect(personenAnzahl(dbPfad)).toBe(1)
  })
})
