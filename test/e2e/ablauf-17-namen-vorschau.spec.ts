import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { z } from 'zod'

/**
 * A-02, C-26, AP-1.30 PR 11b (docs/80 §33 V-130-11b), langsames Gate: der Vorschau-Umschalter im Reiter
 * „Namen" zeigt über die echte App, wie die Person je Sprache heißt und aus welcher Stufe der
 * Rückfallkette Sprache → Umschrift → Hauptname der Text kommt.
 *
 * - Hauptname ossetisch mit `nachname_zuerst` („Гуытнаты Карл"), lateinische Umschrift davon, russische Form.
 * - Deutsch (Oberflächensprache, keine Form) fällt auf die Umschrift zurück — wie der Kopf.
 * - Ирон / Русский (per Klick bzw. Pfeiltaste) zeigen ihre Form.
 * - Nach dem Löschen der Umschrift fällt Deutsch auf den Hauptnamen zurück.
 *
 * Daten über `window.wurzelwerk.aufrufen` im Fenster (kein `app.evaluate` mit DB-Arbeit). Zusicherungen an
 * den DOM-State, kein Log-Datei-Lesen.
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')

const IdSchema = z.object({ id: z.string() })

test.describe('Ablauf 17 — Namensvorschau je Sprache', () => {
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
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-vorschau-'))
    app = await electron.launch({ args: [HAUPTPROZESS_EINSTIEG] })
    fenster = await app.firstWindow()
  })

  test.afterAll(async () => {
    await app.close()
    rmSync(elternordner, { recursive: true, force: true })
  })

  async function aufrufen(kanal: string, nutzlast: unknown): Promise<unknown> {
    const ergebnis = await fenster.evaluate(async ({ k, n }) => window.wurzelwerk.aufrufen(k, n), { k: kanal, n: nutzlast })
    if (!ergebnis.ok) throw new Error(`${kanal} fehlgeschlagen`)
    return ergebnis.daten
  }

  /** `aufrufen()` ist im Preload kanalunabhängig auf `Ergebnis<unknown>` typisiert — per Zod prüfen. */
  async function anlegen(kanal: string, nutzlast: unknown): Promise<string> {
    return IdSchema.parse(await aufrufen(kanal, nutzlast)).id
  }

  function teile(vorname: string, nachname: string): readonly unknown[] {
    return [
      { art: 'vorname', wert: vorname, istRufname: false },
      { art: 'nachname', wert: nachname, istRufname: false },
    ]
  }

  test('Umschalten zeigt die Form der Sprache, sonst Umschrift, sonst Hauptname', async () => {
    test.setTimeout(60_000)
    await app.evaluate(({ dialog }, gewaehlt) => {
      dialog.showOpenDialog = (() => Promise.resolve({ canceled: false, filePaths: [gewaehlt] })) as typeof dialog.showOpenDialog
    }, elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Vorschautest')
    await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()
    await expect(fenster.getByRole('table')).toBeVisible()

    const personId = await anlegen('befehl:person.anlegen', { privat: 0, ist_platzhalter: 0 })
    const haupt = await anlegen('befehl:namensform.uebernehmen', {
      personId,
      formId: null,
      kopf: { rolle: 'geburtsname', sprache: 'os', schrift: 'cyrl', reihenfolge: 'nachname_zuerst' },
      teile: teile('Карл', 'Гуытнаты'),
    })
    const umschrift = await anlegen('befehl:namensform.uebernehmen', {
      personId,
      formId: null,
      kopf: { rolle: null, umschriftVon: haupt, schrift: 'latn' },
      teile: teile('Karl', 'Gwytnaty'),
    })
    await anlegen('befehl:namensform.uebernehmen', {
      personId,
      formId: null,
      kopf: { rolle: 'sonstiges', sprache: 'ru', schrift: 'cyrl' },
      teile: teile('Карл', 'Гутнов'),
    })

    await fenster.locator('.wz-datentabelle__koerper [role="row"]').click()
    await fenster.getByRole('dialog', { name: 'Profil', exact: true }).getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    const editor = fenster.getByRole('dialog', { name: 'Person bearbeiten', exact: true })
    await editor.getByRole('tab', { name: /^Namen/ }).click()

    const gruppe = editor.getByRole('radiogroup', { name: 'Vorschau in' })
    const name = editor.locator('.wz-namen-vorschau__name')
    const herkunft = editor.locator('.wz-namen-vorschau__herkunft')
    await expect(gruppe.getByRole('radio')).toHaveText(['Deutsch', 'Ирон', 'Русский'])
    await expect(gruppe.getByRole('radio', { name: 'Deutsch' })).toHaveAttribute('aria-checked', 'true')

    // Deutsch hat keine Form: Umschrift der Hauptform — derselbe Text wie im Kopf.
    await expect(name).toHaveText('Karl Gwytnaty')
    await expect(herkunft).toHaveText('Herkunft: Umschrift des Hauptnamens')
    await expect(editor.getByRole('heading', { level: 1 })).toHaveText('Karl Gwytnaty')
    await expect(editor.getByText('Rückfall: Sprache → Umschrift → Hauptname')).toBeVisible()

    await gruppe.getByRole('radio', { name: 'Ирон' }).click()
    await expect(name).toHaveText('Гуытнаты Карл')
    await expect(herkunft).toHaveText('Herkunft: Namensform dieser Sprache')

    await gruppe.getByRole('radio', { name: 'Ирон' }).press('ArrowRight')
    await expect(gruppe.getByRole('radio', { name: 'Русский' })).toBeFocused()
    await expect(gruppe.getByRole('radio', { name: 'Русский' })).toHaveAttribute('aria-checked', 'true')
    await expect(name).toHaveText('Карл Гутнов')

    await gruppe.getByRole('radio', { name: 'Русский' }).press('Home')
    await expect(name).toHaveText('Karl Gwytnaty')

    // Ohne Umschrift fällt Deutsch auf den Hauptnamen zurück.
    await aufrufen('befehl:name.loeschen', { id: umschrift })
    await expect(name).toHaveText('Гуытнаты Карл')
    await expect(herkunft).toHaveText('Herkunft: Hauptname')
  })
})
