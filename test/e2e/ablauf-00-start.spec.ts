import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

/**
 * AP-0.2, langsames Gate (nicht Teil von `pnpm pruefe`): Nachweis, dass die gebaute App startet,
 * `abfrage:version` beantwortet und ein unbekannter Kanal ohne Ausnahme abgewiesen wird.
 * Voraussetzung: `pnpm build` (electron-vite build), damit `out/main/index.js` existiert.
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')

test.describe('Ablauf 00 — Start', () => {
  test.skip(!existsSync(HAUPTPROZESS_EINSTIEG), 'out/main/index.js fehlt — vorher `pnpm build` laufen lassen.')

  let app: Awaited<ReturnType<typeof electron.launch>>
  let fenster: Awaited<ReturnType<typeof app.firstWindow>>

  test.beforeAll(async () => {
    app = await electron.launch({ args: [HAUPTPROZESS_EINSTIEG] })
    fenster = await app.firstWindow()
  })

  test.afterAll(async () => {
    await app.close()
  })

  test('Fenster erscheint und abfrage:version antwortet', async () => {
    await expect(fenster).toHaveTitle('Wurzelwerk')

    const ergebnis = await fenster.evaluate(async () => window.wurzelwerk.aufrufen('abfrage:version', null))

    expect(ergebnis).toMatchObject({
      ok: true,
      daten: {
        app: expect.any(String),
        schema: expect.any(String),
        electron: expect.any(String),
      },
    })
  })

  test('erfunden:kanal liefert IPC_UNBEKANNTER_KANAL ohne Ausnahme', async () => {
    const ergebnis = await fenster.evaluate(async () => window.wurzelwerk.aufrufen('erfunden:kanal', null))

    expect(ergebnis).toMatchObject({
      ok: false,
      fehler: { code: 'IPC_UNBEKANNTER_KANAL' },
    })
  })
})
