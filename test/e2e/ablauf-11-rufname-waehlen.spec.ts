import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { z } from 'zod'
import { AUTOSAVE_DEBOUNCE_MS } from '../../src/shared/autosave'

/**
 * A-02, AP-1.30 (Fix Rufname-Anhängen), langsames Gate: im Reiter „Namen" wird der Rufname einer
 * bestehenden Namenszeile aus ihren Vornamen gewählt. Vorher war er ein Textfeld mit Autosave —
 * langsam getipptes „Fri" ergab über die echte Oberfläche „Karl Friedrich F Fr Fri" (jeder
 * Zwischenstand wurde als zusätzlicher Vorname geschrieben).
 *
 * - Die Auswahl bietet genau die Vornamen an; „Friedrich" wählen markiert Position 1, die Vornamen
 *   bleiben „Karl Friedrich".
 * - Vornamen langsam umschreiben (Pausen über der Debounce-Frist) hängt den bisherigen Rufnamen nicht an.
 *
 * Zusicherungen an DOM-State und `abfrage:*`-Ergebnisse (kein Log-Datei-Lesen).
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')

const NameSchema = z.object({ vornamen: z.string().nullable(), rufname_text: z.string().nullable(), rufname_index: z.number().nullable() })

test.describe('Ablauf 11 — Rufname wählen', () => {
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
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-rufname-'))
    app = await electron.launch({ args: [HAUPTPROZESS_EINSTIEG] })
    fenster = await app.firstWindow()
  })

  test.afterAll(async () => {
    await app.close()
    rmSync(elternordner, { recursive: true, force: true })
  })

  async function gespeicherterName(personId: string): Promise<z.infer<typeof NameSchema>> {
    const ergebnis = await fenster.evaluate(async (id) => window.wurzelwerk.aufrufen('abfrage:person.detail', { personId: id }), personId)
    if (!ergebnis.ok) throw new Error('abfrage:person.detail fehlgeschlagen')
    // `aufrufen()` ist im Preload kanalunabhängig auf `Ergebnis<unknown>` typisiert — per Zod prüfen.
    const name = z.object({ namen: z.array(NameSchema) }).parse(ergebnis.daten).namen[0]
    if (name === undefined) throw new Error('kein Name gespeichert')
    return name
  }

  test('Rufname aus den Vornamen wählen; Vornamen umschreiben hängt nichts an', async () => {
    test.setTimeout(60_000)
    await app.evaluate(({ dialog }, gewaehlt) => {
      dialog.showOpenDialog = (() => Promise.resolve({ canceled: false, filePaths: [gewaehlt] })) as typeof dialog.showOpenDialog
    }, elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Rufnametest')
    await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()
    await expect(fenster.getByRole('table')).toBeVisible()

    const anlegen = await fenster.evaluate(async () => window.wurzelwerk.aufrufen('befehl:person.anlegen', { privat: 0, ist_platzhalter: 0 }))
    if (!anlegen.ok) throw new Error('person.anlegen fehlgeschlagen')
    const personId = z.object({ id: z.string() }).parse(anlegen.daten).id
    const name = await fenster.evaluate(
      async (id) => window.wurzelwerk.aufrufen('befehl:name.anlegen', { personId: id, typ: 'geburtsname', vornamen: 'Karl Friedrich', nachname: 'Gutnoff' }),
      personId,
    )
    expect(name.ok).toBe(true)

    await fenster.locator('.wz-datentabelle__koerper [role="row"]').click()
    await fenster.getByRole('dialog', { name: 'Profil', exact: true }).getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    const editor = fenster.getByRole('dialog', { name: 'Person bearbeiten', exact: true })
    await editor.getByRole('tab', { name: /^Namen/ }).click()
    const zeile = editor.getByRole('tabpanel').locator('.wz-profil-bearbeiten-namen__zeile')

    const rufname = zeile.getByRole('combobox', { name: 'Rufname' })
    await expect(rufname.locator('option')).toHaveText(['nicht angegeben', 'Karl', 'Friedrich'])
    await rufname.selectOption({ label: 'Friedrich' })
    await expect.poll(async () => gespeicherterName(personId)).toEqual({ vornamen: 'Karl Friedrich', rufname_text: 'Friedrich', rufname_index: 1 })
    await expect(rufname).toHaveValue('1')

    // „Friedrich" → „Fritz", mit Pausen über der Debounce-Frist: jeder Zwischenstand wird geschrieben.
    const vornamen = zeile.getByRole('textbox', { name: 'Vorname(n)' })
    await vornamen.click()
    await vornamen.press('End')
    for (let i = 0; i < 'edrich'.length; i += 1) {
      await vornamen.press('Backspace')
      await fenster.waitForTimeout(AUTOSAVE_DEBOUNCE_MS * 2)
    }
    await vornamen.pressSequentially('tz', { delay: AUTOSAVE_DEBOUNCE_MS * 2 })
    await vornamen.blur()
    await expect.poll(async () => (await gespeicherterName(personId)).vornamen).toBe('Karl Fritz')
    await expect(vornamen).toHaveValue('Karl Fritz')
    await expect(rufname.locator('option')).toHaveText(['nicht angegeben', 'Karl', 'Fritz'])
  })
})
