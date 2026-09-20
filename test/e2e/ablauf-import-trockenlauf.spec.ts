import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

/**
 * AP-1.4b, langsames Gate (nicht Teil von `pnpm pruefe`): der Import-Assistent (S-10…S-13) über die
 * echte Oberfläche — „Datei wählen → Bericht sehen → bei Fehlern ist ‚Importieren' gesperrt"
 * (`docs/arbeitspakete.md` AP-1.4b). Der native Datei-Öffnen-Dialog lässt sich in Playwright nicht
 * bedienen (OS-Dialog, außerhalb des Renderers) — er wird darum im Hauptprozess über `app.evaluate`
 * gestubbt, sodass „Datei wählen …" den Fixture-Pfad zurückgibt, ohne einen echten Dialog zu öffnen.
 * Der restliche Flow (Assistent öffnen, Prüfen, Sperre) läuft durch die echte UI und IPC.
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')
const FIXTURE_GUELTIG = join(__dirname, 'fixtures/import-erna-und-walter-wruck.json')
const FIXTURE_UNGUELTIG = join(__dirname, 'fixtures/import-ungueltig.json')

test.describe('Ablauf — Import-Trockenlauf (S-10…S-13)', () => {
  const einstiegFehlt = !existsSync(HAUPTPROZESS_EINSTIEG)
  if (einstiegFehlt && process.env['CI'] !== undefined) {
    throw new Error('out/main/index.js fehlt im CI-Lauf — das E2E-Gate würde stillschweigend überspringen. `test:e2e` muss zuvor bauen (electron-vite build).')
  }
  test.skip(einstiegFehlt, 'out/main/index.js fehlt — lokal `pnpm test:e2e` (baut selbst) oder vorher `pnpm build`.')

  let app: Awaited<ReturnType<typeof electron.launch>>
  let fenster: Awaited<ReturnType<typeof app.firstWindow>>
  let elternordner: string

  test.beforeAll(async () => {
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-import-'))
    app = await electron.launch({ args: [HAUPTPROZESS_EINSTIEG] })
    fenster = await app.firstWindow()

    // Projekt anlegen (echte Start→Liste-Oberfläche). „Neues Projekt" wählt den übergeordneten
    // Ordner seit AP-1.26 über den Systemdialog (`src/main/dialoge.ts`), nicht mehr über ein
    // Pfadtextfeld — `dialogLiefert()` ist unten definiert, aber als Funktionsdeklaration bereits
    // hier nutzbar (Hoisting).
    await dialogLiefert(elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Importtest')
    await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()
    await expect(fenster.getByRole('table')).toBeVisible()
  })

  test.afterAll(async () => {
    await app.close()
    rmSync(elternordner, { recursive: true, force: true })
  })

  /** Stubbt den nativen Öffnen-Dialog im Hauptprozess, sodass er `pfad` zurückgibt. */
  async function dialogLiefert(pfad: string): Promise<void> {
    await app.evaluate(({ dialog }, gewaehlt) => {
      // Reine Test-Injektion: dieselbe `dialog`-Instanz, die `src/main/dialoge.ts` benutzt.
      dialog.showOpenDialog = (() => Promise.resolve({ canceled: false, filePaths: [gewaehlt] })) as typeof dialog.showOpenDialog
    }, pfad)
  }

  test('gültige Datei: Bericht erscheint, „Importieren" ist frei', async () => {
    await dialogLiefert(FIXTURE_GUELTIG)

    await fenster.getByRole('button', { name: 'Importieren …' }).click()
    await fenster.getByRole('button', { name: 'Datei wählen …' }).click()
    await expect(fenster.getByText(FIXTURE_GUELTIG)).toBeVisible()
    await fenster.getByRole('button', { name: 'Prüfen' }).click()

    // Bericht sichtbar (Blocküberschriften), „Importieren" bedienbar.
    await expect(fenster.getByRole('heading', { name: 'Zusammenfassung' })).toBeVisible()
    await expect(fenster.getByRole('heading', { name: 'Gesundheitsdaten' })).toBeVisible()
    await expect(fenster.getByRole('button', { name: 'Importieren', exact: true })).toBeEnabled()

    await fenster.getByRole('button', { name: 'Abbrechen' }).click()
  })

  test('ungültige Datei: Fehlerliste, „Importieren" ist sichtbar gesperrt mit Grund', async () => {
    await dialogLiefert(FIXTURE_UNGUELTIG)

    await fenster.getByRole('button', { name: 'Importieren …' }).click()
    await fenster.getByRole('button', { name: 'Datei wählen …' }).click()
    await expect(fenster.getByText(FIXTURE_UNGUELTIG)).toBeVisible()
    await fenster.getByRole('button', { name: 'Prüfen' }).click()

    // Fehlerliste statt Bericht, „Importieren" gesperrt, Grund daneben.
    await expect(fenster.getByRole('heading', { name: 'Fehler in der Importdatei' })).toBeVisible()
    await expect(fenster.getByRole('button', { name: 'Importieren', exact: true })).toBeDisabled()
    await expect(fenster.getByText(/verhindern den Import/)).toBeVisible()
  })
})
