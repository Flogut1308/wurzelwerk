import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

/**
 * AP-1.26, langsames Gate (nicht Teil von `pnpm pruefe`): die gestaltete Startansicht (S-01) ohne
 * Pfadtextfelder — „Neues Projekt" wählt den übergeordneten Ordner über den nativen Ordnerdialog
 * (`befehl:projekt.elternordnerWaehlen`), „Projekt öffnen" den Projektordner
 * (`befehl:projekt.ordnerWaehlen`), beide gekapselt in `src/main/dialoge.ts` und darum ersetzbar
 * (dasselbe Muster wie `ablauf-import-trockenlauf.spec.ts::dialogLiefert()`, AP-1.4b).
 *
 * Assertions hängen an der sichtbaren Ansicht (Listenansicht erscheint / verschwindet), NICHT an
 * der „Zuletzt geöffnet"-Liste — die liest einen echten, plattformweiten `electron-store`, den
 * jeder andere e2e-Spec in derselben CI-Sitzung ebenfalls beschreibt (nicht deterministisch
 * stillstellbar, `docs/80_Offene_Fragen.md` §22, s. auch `bildvergleich.spec.ts`-Kopfkommentar).
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')

test.describe('Ablauf 04 — Start (S-01, AP-1.26)', () => {
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
  let elternordner: string

  test.beforeAll(async () => {
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-start-'))
    app = await electron.launch({ args: [HAUPTPROZESS_EINSTIEG] })
    fenster = await app.firstWindow()
  })

  test.afterAll(async () => {
    await app.close()
    rmSync(elternordner, { recursive: true, force: true })
  })

  /** Stubbt den nativen Ordnerdialog im Hauptprozess — dieselbe `dialog`-Instanz, die
   * `src/main/dialoge.ts` benutzt (Muster `ablauf-import-trockenlauf.spec.ts::dialogLiefert()`). */
  async function ordnerdialogLiefert(pfad: string | null): Promise<void> {
    await app.evaluate(({ dialog }, gewaehlt) => {
      dialog.showOpenDialog = (() =>
        Promise.resolve(gewaehlt === null ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [gewaehlt] })) as typeof dialog.showOpenDialog
    }, pfad)
  }

  test('Abbruch im Ordnerdialog: „Neues Projekt" bleibt ohne Aktion, kein Fehler', async () => {
    await ordnerdialogLiefert(null)
    await fenster.getByPlaceholder('Projektname').fill('Abbruchtest')
    await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()

    // Kein Fehlerbanner, keine Navigation — die Startansicht bleibt einfach stehen.
    await expect(fenster.getByRole('alert')).toHaveCount(0)
    await expect(fenster.getByRole('table')).toHaveCount(0)
    await expect(fenster.getByPlaceholder('Projektname')).toBeVisible()
  })

  test('Projekt über den Dialog anlegen, schließen, über den Dialog wieder öffnen', async () => {
    const projektOrdner = join(elternordner, 'Starttest.ahnen')

    // „Neues Projekt": Ordnerdialog liefert den übergeordneten Ordner, kein Pfadtextfeld mehr.
    await ordnerdialogLiefert(elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Starttest')
    await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()

    // Beleg für `ok:true`: die App wechselt auf die Listenansicht (AP-1.6 Stufe 4).
    await expect(fenster.getByRole('table')).toBeVisible()
    await expect(fenster.getByText('Starttest')).toBeVisible()

    // Zurück zur Startansicht.
    await fenster.getByRole('button', { name: 'Projekt schließen' }).click()
    await expect(fenster.getByPlaceholder('Projektname')).toBeVisible()

    // „Projekt öffnen": Ordnerdialog liefert diesmal den bereits angelegten Projektordner.
    await ordnerdialogLiefert(projektOrdner)
    await fenster.getByRole('button', { name: 'Projekt öffnen …' }).click()

    // Beleg für `status: 'geoeffnet'`: dieselbe Listenansicht erscheint erneut.
    await expect(fenster.getByRole('table')).toBeVisible()
    await expect(fenster.getByText('Starttest')).toBeVisible()
  })
})
