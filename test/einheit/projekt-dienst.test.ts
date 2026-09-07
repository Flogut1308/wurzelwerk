import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
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
// Ohne echtes Electron fällt `electron-store` auf einen plattformeigenen Konfigurationspfad
// zurück (z. B. ~/Library/Preferences) statt auf `app.getPath('userData')` — diese Attrappe hält
// den Einheitstest frei von Schreibzugriffen außerhalb des temporären Testordners.
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

import { projektOrdnerAnlegen } from '../../src/main/projekt/ordnerformat'
import { projektAnlegen, projektOeffnen, projektSchliessen, projektZuletzt } from '../../src/main/projekt/projekt-dienst'
import { sperrdateiPfad } from '../../src/main/projekt/sperrdatei'

const ktx: Kontext = { vorgangsId: 'v-test-0001' }

/**
 * AP-0.4: Orchestrierung von anlegen/öffnen/schließen. Jeder Test schließt am Ende explizit
 * (`projektSchliessen()`), weil `projekt-dienst.ts` sein Prozesszustand als Modul-Singleton hält.
 */
describe('main/projekt/projekt-dienst', () => {
  let elternordner: string

  beforeEach(() => {
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-dienst-'))
  })

  afterEach(() => {
    projektSchliessen()
    rmSync(elternordner, { recursive: true, force: true })
  })

  it('projektAnlegen erzeugt den Projektordner, öffnet ihn und setzt die Sperre', () => {
    const info = projektAnlegen({ elternordner, name: 'Testbaum' })

    expect(info).toEqual({
      pfad: join(elternordner, 'Testbaum.ahnen'),
      name: 'Testbaum',
      schemaversion: expect.any(String),
    })
    expect(existsSync(sperrdateiPfad(info.pfad))).toBe(true)
  })

  it('projektAnlegen trägt das Projekt vorne in die Zuletzt-Liste ein', () => {
    const info = projektAnlegen({ elternordner, name: 'Testbaum' })
    const zuletzt = projektZuletzt()
    expect(zuletzt[0]).toMatchObject({ pfad: info.pfad, name: 'Testbaum' })
  })

  it('projektSchliessen entfernt die Sperre wieder', () => {
    const info = projektAnlegen({ elternordner, name: 'Testbaum' })
    projektSchliessen()
    expect(existsSync(sperrdateiPfad(info.pfad))).toBe(false)
  })

  it('projektOeffnen öffnet ein zuvor angelegtes und geordnet geschlossenes Projekt erneut', () => {
    const angelegt = projektAnlegen({ elternordner, name: 'Testbaum' })
    projektSchliessen()

    const ergebnis = projektOeffnen({ pfad: angelegt.pfad }, ktx)
    expect(ergebnis).toEqual({ status: 'geoeffnet', projekt: angelegt })
  })

  it('projektOeffnen auf einem Ordner ohne manifest.json wirft PROJEKT_KEIN_WURZELWERK_ORDNER', () => {
    const fremderOrdner = join(elternordner, 'kein-projekt')
    mkdirSync(fremderOrdner)

    expect(() => projektOeffnen({ pfad: fremderOrdner }, ktx)).toThrow(WurzelFehler)
    try {
      projektOeffnen({ pfad: fremderOrdner }, ktx)
      expect.unreachable()
    } catch (u) {
      expect(u).toBeInstanceOf(WurzelFehler)
      if (u instanceof WurzelFehler) {
        expect(u.code).toBe('PROJEKT_KEIN_WURZELWERK_ORDNER')
      }
    }
  })

  it('zweites projektOeffnen auf ein bereits offenes Projekt wirft PROJEKT_BEREITS_GEOEFFNET', () => {
    const angelegt = projektAnlegen({ elternordner, name: 'Testbaum' })
    // Nicht schließen — die Sperre trägt die PID dieses (lebenden) Testprozesses.

    try {
      projektOeffnen({ pfad: angelegt.pfad }, ktx)
      expect.unreachable()
    } catch (u) {
      expect(u).toBeInstanceOf(WurzelFehler)
      if (u instanceof WurzelFehler) {
        expect(u.code).toBe('PROJEKT_BEREITS_GEOEFFNET')
      }
    }
  })

  it('projektOeffnen erkennt eine verwaiste Sperre, übernimmt sie und öffnet trotzdem', () => {
    const angelegt = projektAnlegen({ elternordner, name: 'Testbaum' })
    projektSchliessen()

    // Ein Kindprozess, der sofort beendet: spawnSync wartet auf das Ende, seine PID ist beim
    // Rückgabewert bereits reaped. Host = eigener Hostname, damit `sperrdateiPruefen` die
    // PID-Liveness prüft, statt konservativ auf "fremder Host" auszuweichen — der Test simuliert
    // den eigenen, abgestürzten vorherigen Lauf.
    const kindprozess = spawnSync(process.execPath, ['-e', 'process.exit(0)'])
    writeFileSync(
      sperrdateiPfad(angelegt.pfad),
      JSON.stringify({
        pid: kindprozess.pid,
        host: hostname(),
        appVersion: '0.0.0-alt',
        gesetztAm: new Date(0).toISOString(),
      }),
      'utf8',
    )

    const ergebnis = projektOeffnen({ pfad: angelegt.pfad }, ktx)
    expect(ergebnis).toEqual({ status: 'geoeffnet', projekt: angelegt })
  })

  it('projektOeffnen unter einem erkannten Sync-Ordner liefert sync_warnung ohne zu öffnen', () => {
    const heimat = mkdtempSync(join(tmpdir(), 'wurzelwerk-heimat-'))
    const dropboxOrdner = join(heimat, 'Dropbox')
    mkdirSync(dropboxOrdner, { recursive: true })

    const { pfade } = projektOrdnerAnlegen({ elternordner: dropboxOrdner, projektname: 'Testbaum' })

    const warnung = projektOeffnen({ pfad: pfade.ordnerPfad }, ktx, heimat)
    expect(warnung).toEqual({ status: 'sync_warnung', anbieter: 'dropbox', pfad: pfade.ordnerPfad })
    expect(existsSync(sperrdateiPfad(pfade.ordnerPfad))).toBe(false)

    const ergebnis = projektOeffnen({ pfad: pfade.ordnerPfad, syncBestaetigt: true }, ktx, heimat)
    expect(ergebnis).toMatchObject({ status: 'geoeffnet' })

    rmSync(heimat, { recursive: true, force: true })
  })
})
