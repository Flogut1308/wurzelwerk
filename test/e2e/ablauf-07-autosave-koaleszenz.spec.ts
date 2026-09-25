import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { z } from 'zod'
import { AUTOSAVE_DEBOUNCE_MS } from '../../src/shared/autosave'

/**
 * AP-1.30 (PR 4), Stichprobe zur Abnahme „Kein Speichern-Knopf … Koaleszenz = ein Undo-Schritt"
 * über die echte Oberfläche: Notiz im Profil-Bearbeiten. Zehn Tastenanschläge, zwischen denen je
 * `AUTOSAVE_DEBOUNCE_MS + RAND_MS` liegen — jeder Anschlag wird also EINZELN geschrieben (die
 * Zusicherung wartet nach jedem Anschlag, bis genau dieser Stand gespeichert ist), der Abstand
 * zweier Schreibvorgänge bleibt unter dem 2-s-Fenster. Danach nimmt EIN Undo alle zehn zurück.
 * Die Last trägt `test/einheit/koaleszenz-autosave.test.ts` (feste Uhr, je Autosave-Befehl); hier
 * nur der Beleg, dass Renderer-Frist und Bus zusammenpassen.
 *
 * Undo über die IPC-Brücke (wie `ablauf-03-person-bearbeiten.spec.ts`) statt ⌘Z: das Menü-
 * Tastenkürzel ist in Electron+Playwright nicht deterministisch auslösbar; `befehl:journal.undo`
 * ist derselbe Weg, den das Menü nimmt.
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')

/** Rand über der Debounce-Frist: Zeit für Commit, `ereignis:datenGeaendert` und Neuladen. */
const RAND_MS = 250

test.describe('Ablauf 07 — Autosave-Koaleszenz (Notiz)', () => {
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
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-autosave-'))
    app = await electron.launch({ args: [HAUPTPROZESS_EINSTIEG] })
    fenster = await app.firstWindow()
  })

  test.afterAll(async () => {
    await app.close()
    rmSync(elternordner, { recursive: true, force: true })
  })

  async function dialogLiefert(pfad: string): Promise<void> {
    await app.evaluate(({ dialog }, gewaehlt) => {
      dialog.showOpenDialog = (() => Promise.resolve({ canceled: false, filePaths: [gewaehlt] })) as typeof dialog.showOpenDialog
    }, pfad)
  }

  async function gespeicherteNotiz(personId: string): Promise<string | null> {
    const ergebnis = await fenster.evaluate(async (id) => window.wurzelwerk.aufrufen('abfrage:person.detail', { personId: id }), personId)
    if (!ergebnis.ok) throw new Error('abfrage:person.detail fehlgeschlagen')
    // `aufrufen()` ist im Preload kanalunabhängig auf `Ergebnis<unknown>` typisiert — per Zod prüfen.
    return z.object({ notiz: z.string().nullable() }).parse(ergebnis.daten).notiz
  }

  test('zehn einzeln geschriebene Tastenanschläge (Abstand < 2 s) = ein Undo-Schritt', async () => {
    test.setTimeout(60_000)
    await dialogLiefert(elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Autosavetest')
    await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()
    await expect(fenster.getByRole('table')).toBeVisible()

    const anlegen = await fenster.evaluate(async () => window.wurzelwerk.aufrufen('befehl:person.anlegen', { privat: 0, ist_platzhalter: 0, notiz: 'Start' }))
    if (!anlegen.ok) throw new Error('person.anlegen fehlgeschlagen')
    const personId = z.object({ id: z.string() }).parse(anlegen.daten).id

    const zeile = fenster.locator('.wz-datentabelle__koerper [role="row"]')
    await expect(zeile).toHaveCount(1)
    await zeile.click()
    const profil = fenster.getByRole('dialog', { name: 'Profil', exact: true })
    await expect(profil).toBeVisible()
    await profil.getByRole('button', { name: 'Bearbeiten', exact: true }).click()

    const notiz = profil.getByRole('textbox', { name: 'Notiz', exact: true })
    await expect(notiz).toHaveValue('Start')
    await notiz.click()
    await notiz.press('End')

    const pause = AUTOSAVE_DEBOUNCE_MS + RAND_MS
    expect(pause).toBeLessThan(2000)
    let erwartet = 'Start'
    for (let i = 0; i < 10; i += 1) {
      const zeichen = String.fromCharCode(97 + i)
      erwartet += zeichen
      await notiz.press(zeichen)
      // Jeder Anschlag wird für sich geschrieben (sonst prüfte der Test keine Koaleszenz).
      await expect.poll(() => gespeicherteNotiz(personId), { timeout: pause, intervals: [50] }).toBe(erwartet)
      await fenster.waitForTimeout(RAND_MS)
    }
    await expect(notiz).toHaveValue('Startabcdefghij')

    const undoErgebnis = await fenster.evaluate(async () => window.wurzelwerk.aufrufen('befehl:journal.undo', null))
    expect(undoErgebnis.ok).toBe(true)
    await expect.poll(() => gespeicherteNotiz(personId)).toBe('Start')
    await expect(notiz).toHaveValue('Start')
  })
})
