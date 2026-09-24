// AP-1.34 PR-C1b (Fund beim Einbau von `befehl:aussage_zitat.aendern`): der Compile-Zeit-Wächter in
// `src/shared/ipc/kanaele.ts` sichert nur Vertrag ⊆ Preload-Weißliste. Dass jeder Kanal der
// Weißliste in `src/main/ipc/registrierung.ts` auch BEDIENT wird, prüfte bisher nichts — eine
// fehlende `registriere(...)`-Zeile kompilierte und ließ alle Tests grün (Mutationsprobe), der
// Kanal hätte im Renderer mit „No handler registered" geendet. Dieser Test ruft
// `ipcRegistrierung()` mit einem aufzeichnenden `registriere` auf und vergleicht die Mengen.
import { describe, expect, it, vi } from 'vitest'

const registriert: string[] = []

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.0-test', getPath: () => '/nicht-benutzt', isPackaged: false },
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
  dialog: {},
  Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
}))
vi.mock('../../src/main/ipc/huelle', () => ({
  registriere: (kanal: string): void => {
    registriert.push(kanal)
  },
}))
vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))

import { ipcRegistrierung } from '../../src/main/ipc/registrierung'
import { ALLE_KANAELE } from '../../src/shared/ipc/kanaele'

describe('ipcRegistrierung bedient jeden Kanal der Preload-Weißliste', () => {
  it('registriert genau die Kanäle aus ALLE_KANAELE, jeden einmal', () => {
    registriert.length = 0
    ipcRegistrierung()

    expect([...registriert].sort()).toEqual([...ALLE_KANAELE].sort())
  })
})
