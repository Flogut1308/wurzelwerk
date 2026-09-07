import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// vi.mock wird von Vitest oberhalb aller Importe ausgeführt. `vi.hoisted` stellt sicher, dass der
// Protokollordner schon existiert, wenn die Mock-Fabrik für 'electron' läuft.
const { protokollOrdner } = vi.hoisted(() => ({
  protokollOrdner: `${process.cwd()}/test-results/protokoll-test-${process.pid}`,
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'logs' ? protokollOrdner : protokollOrdner),
    isPackaged: false,
  },
}))

// Muss nach vi.mock('electron', …) stehen: electron-log importiert 'electron' beim Laden.
import { protokollEinrichten, protokollFehler } from '../../src/main/protokoll/logger'

const protokollDatei = `${protokollOrdner}/wurzelwerk.log`

describe('Protokoll (ADR-024, 55_Architektur.md §10.2)', () => {
  beforeAll(() => {
    mkdirSync(protokollOrdner, { recursive: true })
    protokollEinrichten()
  })

  afterAll(() => {
    rmSync(protokollOrdner, { recursive: true, force: true })
  })

  it('schreibt die Vorgangs-ID, aber keinen Namen und keine Notiz aus der Nutzlast', () => {
    protokollFehler({
      vorgangsId: 'v-0123456789',
      kanal: 'befehl:test',
      code: 'INTERN_UNERWARTET',
      // Diese beiden Felder gehören nicht zur Weißliste und dürfen nie im Protokoll landen —
      // auch nicht, wenn ein Aufrufer sie versehentlich mitschickt (§7, ADR-024).
      name: 'Max Mustermann',
      notiz: 'Eine private Notiz über Max Mustermann',
    })

    expect(existsSync(protokollDatei)).toBe(true)
    const inhalt = readFileSync(protokollDatei, 'utf8')
    expect(inhalt).toContain('v-0123456789')
    expect(inhalt).not.toContain('Max Mustermann')
    expect(inhalt).not.toContain('private Notiz')
  })
})
