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
 * Seit AP-1.30 PR 11c-1 geht beides über das Modal „Namensform bearbeiten" (docs/80 §33 V-130-11c-1):
 * jeder Vorname ist ein eigener Teil, der Rufname eine Auswahl aus ihnen, geschrieben wird beim Übernehmen.
 * Zusätzlich geprüft: während des langsamen Tippens ist nichts gespeichert, und der Rufname bleibt am
 * umbenannten Teil („Fritz", Position 1).
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
    // AP-1.30 PR 11c-1: bearbeitet wird im Modal „Namensform bearbeiten" (jeder Vorname ein eigener Teil);
    // geschrieben wird erst beim Übernehmen.
    const karte = editor.getByRole('article', { name: 'Karl Friedrich Gutnoff', exact: true })
    await karte.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    let modal = fenster.getByRole('dialog', { name: 'Namensform bearbeiten', exact: true })

    const rufname = modal.getByRole('combobox', { name: 'Rufname' })
    await expect(rufname.locator('option')).toHaveText(['nicht angegeben', 'Karl', 'Friedrich'])
    await rufname.selectOption({ label: 'Friedrich' })
    await modal.getByRole('button', { name: 'Übernehmen', exact: true }).click()
    await expect(modal).toHaveCount(0)
    await expect.poll(async () => gespeicherterName(personId)).toEqual({ vornamen: 'Karl Friedrich', rufname_text: 'Friedrich', rufname_index: 1 })
    await expect(editor.getByRole('article', { name: 'Karl Friedrich Gutnoff', exact: true }).locator('.wz-namensform-karte__wert--rufname')).toContainText('Friedrich')

    // „Friedrich" → „Fritz", mit Pausen über der früheren Debounce-Frist: das Modal schreibt keinen
    // Zwischenstand (kein Autosave), erst „Übernehmen" genau den Endstand.
    await editor.getByRole('article', { name: 'Karl Friedrich Gutnoff', exact: true }).getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    modal = fenster.getByRole('dialog', { name: 'Namensform bearbeiten', exact: true })
    await expect(modal.getByRole('combobox', { name: 'Rufname' })).toHaveValue(/.+/)
    const vorname2 = modal.getByRole('textbox', { name: /^Vorname 2/ })
    await expect(vorname2).toHaveValue('Friedrich')
    await vorname2.click()
    await vorname2.press('End')
    for (let i = 0; i < 'edrich'.length; i += 1) {
      await vorname2.press('Backspace')
      await fenster.waitForTimeout(AUTOSAVE_DEBOUNCE_MS * 2)
    }
    await vorname2.pressSequentially('tz', { delay: AUTOSAVE_DEBOUNCE_MS * 2 })
    expect(await gespeicherterName(personId)).toEqual({ vornamen: 'Karl Friedrich', rufname_text: 'Friedrich', rufname_index: 1 })
    await expect(modal.getByRole('combobox', { name: 'Rufname' }).locator('option')).toHaveText(['nicht angegeben', 'Karl', 'Fritz'])
    await modal.getByRole('button', { name: 'Übernehmen', exact: true }).click()
    await expect(modal).toHaveCount(0)
    // Nichts angehängt: zwei Vornamen, der Rufname bleibt am umbenannten Teil.
    await expect.poll(async () => gespeicherterName(personId)).toEqual({ vornamen: 'Karl Fritz', rufname_text: 'Fritz', rufname_index: 1 })
    await expect(editor.getByRole('article', { name: 'Karl Fritz Gutnoff', exact: true })).toBeVisible()
  })
})
