import Database from 'better-sqlite3'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Kontext } from '../../src/main/ipc/huelle'
import { MIGRATIONEN, SCHEMA_VERSION } from '../../src/main/datenbank/migration/registrierung'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'

// AP-0.17: `projekt-dienst.ts` löst `docs/schema` über `schemaBasisverzeichnis()`
// (`app.getAppPath()`) auf — die Attrappe liefert das Repo-Root, wo `docs/schema` echt liegt
// (Vitest läuft mit cwd = Repo-Root, `vitest.config.ts`).
vi.mock('electron', () => ({ app: { getVersion: () => '0.1.0-test', isPackaged: false, getAppPath: () => process.cwd() } }))
vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
// AP-0.10: `projektUebernehmen()`/`projektSchliessen()` melden seither den Journalstatus
// (`journalStatusMelden()`), der seinerseits `sendeEreignis()` aufruft - das echte Modul
// importiert `electron`s `BrowserWindow`, die die obige Attrappe nicht mitbringt (analog zu
// `test/einheit/befehl-bus.test.ts`).
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))
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

import { fuehreAus } from '../../src/main/befehle/bus'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { sendeEreignis } from '../../src/main/ipc/ereignisse'
import { projektOrdnerAnlegen, projektOrdnerPfade } from '../../src/main/projekt/ordnerformat'
import { projektAnlegen, projektOeffnen, projektSchliessen, projektZuletzt } from '../../src/main/projekt/projekt-dienst'
import { sperrdateiPfad } from '../../src/main/projekt/sperrdatei'
import { protokollInfo } from '../../src/main/protokoll/logger'
import { schnappschussListeLesen } from '../../src/main/schnappschuss/liste'

/** `integritaetVollPruefen()` (AP-0.13) protokolliert ausschließlich unter diesem Code (§7, `src/main/datenbank/integritaet.ts`). */
const VOLLER_INTEGRITAETSCHECK_CODE = 'integritaet_voll_pruefung'

function vollerIntegritaetscheckLief(): boolean {
  return vi.mocked(protokollInfo).mock.calls.some(([eintrag]) => {
    return typeof eintrag === 'object' && eintrag !== null && 'code' in eintrag && eintrag.code === VOLLER_INTEGRITAETSCHECK_CODE
  })
}

const ktx: Kontext = { vorgangsId: 'v-test-0001' }

/**
 * AP-0.4: Orchestrierung von anlegen/öffnen/schließen. Jeder Test schließt am Ende explizit
 * (`projektSchliessen()`), weil `projekt-dienst.ts` sein Prozesszustand als Modul-Singleton hält.
 */
describe('main/projekt/projekt-dienst', () => {
  let elternordner: string

  beforeEach(() => {
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-dienst-'))
    vi.mocked(protokollInfo).mockClear()
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

  it('projektAnlegen migriert die neue Datenbank auf SCHEMA_VERSION (AP-0.5)', () => {
    const info = projektAnlegen({ elternordner, name: 'Testbaum' })

    const pruefverbindung = new Database(join(info.pfad, 'baum.sqlite'))
    try {
      expect(pruefverbindung.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
      const migrationsZeilen = pruefverbindung.prepare('SELECT version FROM schema_migration').all()
      // War zu AP-0.5-Zeiten hart `1` (nur die Grundgerüst-Migration) - jetzt an der Registry
      // gespiegelt, damit eine neue Migration (wie 0002_kern in AP-0.6) diesen Test nicht bricht.
      expect(migrationsZeilen).toHaveLength(MIGRATIONEN.length)
    } finally {
      pruefverbindung.close()
    }
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

  it('projektSchliessen ohne offenes Projekt ist ein No-op (kein Wurf) — AP-0.18, das nutzt before-quit aus', () => {
    // Kein projektAnlegen()/projektOeffnen() zuvor — offenesProjekt ist bereits undefined
    // (afterEach hat das vorherige Projekt geschlossen). Das ist genau der Fall, den
    // src/main/lebenszyklus.ts bei before-quit ohne je geöffnetes Projekt auslöst.
    expect(() => {
      projektSchliessen()
    }).not.toThrow()

    // Und: ein zweiter Aufruf direkt nach einem regulären Schließen ist ebenso ein No-op.
    const info = projektAnlegen({ elternordner, name: 'Testbaum' })
    projektSchliessen()
    expect(existsSync(sperrdateiPfad(info.pfad))).toBe(false)
    expect(() => {
      projektSchliessen()
    }).not.toThrow()
  })

  it('projektOeffnen öffnet ein zuvor angelegtes und geordnet geschlossenes Projekt erneut', () => {
    const angelegt = projektAnlegen({ elternordner, name: 'Testbaum' })
    projektSchliessen()

    const ergebnis = projektOeffnen({ pfad: angelegt.pfad }, ktx)
    expect(ergebnis).toEqual({ status: 'geoeffnet', projekt: angelegt })
  })

  it('projektOeffnen auf einem SAUBER geschlossenen Projekt führt KEINEN vollen integrity_check aus (AP-0.13)', () => {
    const angelegt = projektAnlegen({ elternordner, name: 'Testbaum' })
    projektSchliessen()
    vi.mocked(protokollInfo).mockClear()

    projektOeffnen({ pfad: angelegt.pfad }, ktx)
    expect(vollerIntegritaetscheckLief()).toBe(false)
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
    // AP-0.13: nach einem unsauberen letzten Lauf (Sperre "verwaist") läuft zusätzlich zum
    // quick_check (integritaetPruefen, immer) der volle integrity_check (integritaetVollPruefen).
    expect(vollerIntegritaetscheckLief()).toBe(true)
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

    // Vor dem Löschen die offene Verbindung schließen: Windows kann eine Datei mit offenem Handle
    // nicht entfernen (EBUSY). Das `projektSchliessen()` im afterEach greift erst nach dieser Zeile.
    projektSchliessen()
    rmSync(heimat, { recursive: true, force: true })
  })

  it('projektOeffnen an beschädigter Datei hinterlässt weder Sperre noch offene Verbindung (AP-0.19)', () => {
    const angelegt = projektAnlegen({ elternordner, name: 'Testbaum' })
    projektSchliessen()
    writeFileSync(join(angelegt.pfad, 'baum.sqlite'), 'kein sqlite header'.repeat(50))

    const schliessenSpion = vi.spyOn(Database.prototype, 'close')
    try {
      expect(() => projektOeffnen({ pfad: angelegt.pfad }, ktx)).toThrow(WurzelFehler)
      expect(existsSync(sperrdateiPfad(angelegt.pfad))).toBe(false)
      expect(schliessenSpion).toHaveBeenCalled()
    } finally {
      schliessenSpion.mockRestore()
    }
  })

  it('projektSchliessen setzt den Schnappschuss-Auslöser zurück (AP-0.19)', () => {
    const angelegt = projektAnlegen({ elternordner, name: 'Testbaum' })
    const pfadeA = projektOrdnerPfade(angelegt.pfad)
    const standVorher = schnappschussListeLesen(pfadeA.snapshotsPfad).length
    projektSchliessen()

    // Schnappschuss-Dateinamen sind sekundengenau (kolonfreieZeit, `dateiname.ts`) — ohne einen
    // künstlichen Zeitsprung würde ein vom stehengebliebenen Auslöser erzeugter Schnappschuss den
    // Dateinamen des soeben beim Anlegen erzeugten treffen (`output file already exists`) und den
    // Fehler aus einem ganz anderen Grund werfen, statt die Reset-Frage zu prüfen.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 5000)
    try {
      const fremdeDb = oeffnen(':memory:')
      migrieren(fremdeDb)
      for (let i = 0; i < 200; i += 1) {
        fuehreAus(fremdeDb, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      }
      fremdeDb.close()
    } finally {
      vi.useRealTimers()
    }

    expect(schnappschussListeLesen(pfadeA.snapshotsPfad)).toHaveLength(standVorher)
  })

  it('projektSchliessen sendet genau ein ereignis:projektGeschlossen (AP-0.20)', () => {
    projektAnlegen({ elternordner, name: 'Testbaum' })
    vi.mocked(sendeEreignis).mockClear()

    projektSchliessen()

    const rufe = vi.mocked(sendeEreignis).mock.calls.filter(([kanal]) => kanal === 'ereignis:projektGeschlossen')
    expect(rufe).toHaveLength(1)
  })

  it('projektSchliessen ohne offenes Projekt sendet KEIN ereignis:projektGeschlossen (No-op, AP-0.20)', () => {
    // afterEach hat das vorherige Projekt bereits geschlossen — offenesProjekt ist undefined.
    vi.mocked(sendeEreignis).mockClear()

    projektSchliessen()

    const rufe = vi.mocked(sendeEreignis).mock.calls.filter(([kanal]) => kanal === 'ereignis:projektGeschlossen')
    expect(rufe).toHaveLength(0)
  })
})
