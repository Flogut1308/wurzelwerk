import { existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { VIER_KOMBINATIONEN, bilderDateiname, kombinationImDomSetzen } from '../../skripte/bilder-hilfen'

/**
 * AP-1.11 (72_Screens_und_Flows.md S-19): fotografiert die Zustandsbibliothek in **hell und dunkel
 * × beide Dichten** (vier Bilder), als CI-Artefakt (`.github/workflows/ci.yml`,
 * `artefakte/bilder/**`). Langsames Gate (nicht Teil von `pnpm pruefe`), analog zu den übrigen
 * `test/e2e/*.spec.ts`.
 *
 * Der Einstieg „Menü Entwicklung → Zustandsbibliothek" ist ein natives Electron-Menü — Playwrights
 * `_electron`-API hat kein belastbares „klicke nativen Menüpunkt"-Werkzeug. Genau wie
 * `ablauf-01-import-und-liste.spec.ts` den (noch fehlenden) Import-Bildschirm über die IPC-Brücke
 * statt über einen Klick auslöst, sendet dieser Test hier direkt den Kanal, den der Menüpunkt
 * ohnehin nur weiterreicht (`src/main/menue/menue.ts::entwicklungMenueEintrag`,
 * `src/main/ipc/ereignisse.ts::sendeEreignis`) — dieselbe Wirkung, ohne natives Menü-Handling zu
 * simulieren. Das Menü selbst (inkl. `!app.isPackaged`-Sichtbarkeit) prüft
 * `test/einheit/menue-entwicklung.test.ts`.
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')
const BILDER_ORDNER = join(__dirname, '../../artefakte/bilder')

test.describe('Zustandsbibliothek — Bildstrecke (S-19, AP-1.11)', () => {
  const einstiegFehlt = !existsSync(HAUPTPROZESS_EINSTIEG)
  if (einstiegFehlt && process.env['CI'] !== undefined) {
    throw new Error(
      'out/main/index.js fehlt im CI-Lauf — das E2E-Gate würde stillschweigend überspringen. ' +
        '`test:e2e` muss zuvor bauen (electron-vite build).',
    )
  }
  test.skip(einstiegFehlt, 'out/main/index.js fehlt — lokal `pnpm test:e2e` (baut selbst) oder vorher `pnpm build`.')

  let app: Awaited<ReturnType<typeof electron.launch>>
  let fenster: Awaited<ReturnType<typeof app.firstWindow>>

  test.beforeAll(async () => {
    mkdirSync(BILDER_ORDNER, { recursive: true })
    app = await electron.launch({ args: [HAUPTPROZESS_EINSTIEG] })
    fenster = await app.firstWindow()

    // Entspricht dem Klick auf „Entwicklung → Zustandsbibliothek" (s. Kopfkommentar).
    await app.evaluate(({ BrowserWindow }) => {
      for (const fensterHandle of BrowserWindow.getAllWindows()) {
        fensterHandle.webContents.send('ereignis:zustandsbibliothekOeffnen', null)
      }
    })
    await fenster.locator('[data-testid="wz-zustandsbibliothek"]').waitFor({ state: 'visible' })
  })

  test.afterAll(async () => {
    await app.close()
  })

  for (const kombination of VIER_KOMBINATIONEN) {
    test(`Aufnahme ${kombination.theme}/${kombination.dichte}`, async () => {
      await fenster.evaluate(kombinationImDomSetzen, kombination)
      const zielpfad = join(BILDER_ORDNER, bilderDateiname(kombination))
      // KEIN `fullPage: true` — s. Begründung in skripte/bilder.ts (dieselbe Aufnahme, geteilte Logik).
      await fenster.screenshot({ path: zielpfad })
      expect(statSync(zielpfad).size).toBeGreaterThan(0)
    })
  }
})
