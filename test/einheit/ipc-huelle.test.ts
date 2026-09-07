import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { Ergebnis } from '../../src/shared/ipc/ergebnis'
import type { VersionInfo } from '../../src/shared/ipc/vertrag'

type RohHandler = (ereignis: unknown, roh: unknown) => unknown

const handlerRegistrierung = new Map<string, RohHandler>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (kanal: string, fn: RohHandler) => {
      handlerRegistrierung.set(kanal, fn)
    },
  },
  app: { isPackaged: false },
}))

vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))

import { registriere } from '../../src/main/ipc/huelle'

function handlerHolen(kanal: string): RohHandler {
  const fn = handlerRegistrierung.get(kanal)
  if (fn === undefined) {
    throw new Error(`Kein Handler für ${kanal} registriert — registriere() lief nicht durch.`)
  }
  return fn
}

const testVersion: VersionInfo = { app: '0.1.0', schema: '0', electron: '44.0.0' }

describe('ipc/huelle registriere()', () => {
  it('gültige Nutzlast → ok', async () => {
    registriere('abfrage:version', z.null(), () => testVersion)
    const roh = await handlerHolen('abfrage:version')(undefined, null)
    const ergebnis = roh as Ergebnis<VersionInfo> // RohHandler ist unknown, registriere() garantiert diese Form

    expect(ergebnis.ok).toBe(true)
    if (ergebnis.ok) {
      expect(ergebnis.daten).toEqual(testVersion)
    }
  })

  it('ungültige Nutzlast → IPC_UNGUELTIGE_NUTZLAST, kein Wurf', async () => {
    registriere('abfrage:version', z.null(), () => testVersion)
    const roh = await handlerHolen('abfrage:version')(undefined, { falsch: true })
    const ergebnis = roh as Ergebnis<VersionInfo> // RohHandler ist unknown, registriere() garantiert diese Form

    expect(ergebnis.ok).toBe(false)
    if (!ergebnis.ok) {
      expect(ergebnis.fehler.code).toBe('IPC_UNGUELTIGE_NUTZLAST')
      expect(typeof ergebnis.fehler.vorgangsId).toBe('string')
      expect(ergebnis.fehler.vorgangsId.length).toBeGreaterThan(0)
    }
  })

  it('werfender Handler → ok:false mit vorgangsId, kein Wurf über die Hülle', async () => {
    registriere('abfrage:version', z.null(), () => {
      throw new Error('absichtlich kaputt')
    })

    // Wenn die Hülle die Ausnahme durchreichen würde, würfe dieses `await` — der Test schlägt
    // dann mit einer unbehandelten Ausnahme fehl statt mit einer Assertion.
    const roh = await handlerHolen('abfrage:version')(undefined, null)
    const ergebnis = roh as Ergebnis<VersionInfo> // RohHandler ist unknown, registriere() garantiert diese Form
    expect(ergebnis.ok).toBe(false)
    if (!ergebnis.ok) {
      expect(ergebnis.fehler.code).toBe('INTERN_UNERWARTET')
      expect(ergebnis.fehler.vorgangsId.length).toBeGreaterThan(0)
    }
  })

  it.each([
    ['SQLITE_CONSTRAINT_FOREIGNKEY', 'DATENBANK_FREMDSCHLUESSEL'],
    ['SQLITE_BUSY', 'DATENBANK_GESPERRT'],
    ['SQLITE_CORRUPT', 'DATENBANK_INTEGRITAET'],
    ['SQLITE_MISUSE', 'INTERN_UNERWARTET'],
  ] as const)('SQLite-Code %s → %s', async (sqliteCode, erwarteterCode) => {
    registriere('abfrage:version', z.null(), () => {
      throw Object.assign(new Error('sqlite'), { code: sqliteCode })
    })

    const roh = await handlerHolen('abfrage:version')(undefined, null)
    const ergebnis = roh as Ergebnis<VersionInfo> // RohHandler ist unknown, registriere() garantiert diese Form
    expect(ergebnis.ok).toBe(false)
    if (!ergebnis.ok) {
      expect(ergebnis.fehler.code).toBe(erwarteterCode)
    }
  })
})
