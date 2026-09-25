import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { z } from 'zod'
import { AUTOSAVE_DEBOUNCE_MS } from '../../src/shared/autosave'

/**
 * AP-1.30 (PR 4), Stichprobe zur Abnahme „Kein Speichern-Knopf … Koaleszenz = ein Undo-Schritt"
 * über die echte Oberfläche: Notiz im Profil-Bearbeiten. Zehn Tastenanschläge, zwischen denen mindestens
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

/** Wartezeit nach jedem bestätigten Schreiben, bevor der nächste Anschlag folgt. */
const RAND_MS = 250

/** Koaleszenz-Fenster des Bus (`src/main/journal/koaleszenz.ts`, 55_Architektur.md §4.8). */
const KOALESZENZ_FENSTER_MS = 2000

/**
 * Frist je Anschlag bis zum bestätigten Schreiben. Früher `AUTOSAVE_DEBOUNCE_MS + RAND_MS` (650 ms):
 * das ließ nach der 400-ms-Debounce nur 250 ms für IPC, Commit und die Kontroll-Abfrage — auf dem
 * CI-Runner lag der Anschlag-bis-gespeichert-Weg in grünen Läufen schon bei ~550 ms, ein einzelner
 * Ausreißer machte den Test rot (PR #161, Lauf 36190246461: „Start" statt „Starta" nach 650 ms).
 * Die Zusicherung hängt nicht an dieser Frist: jeder Anschlag wird weiterhin einzeln bestätigt, und
 * ob zehn Schreibvorgänge EIN Undo-Schritt sind, entscheidet das Undo am Ende. Die Frist ist so
 * bemessen, dass zwei Schreibvorgänge auch im ungünstigsten Fall (Frist ausgeschöpft + RAND_MS)
 * noch im Koaleszenz-Fenster liegen; zusätzlich wird der beobachtete Abstand geprüft, damit ein zu
 * langsamer Lauf als verletzte Vorbedingung scheitert statt als rätselhaftes Undo-Ergebnis.
 */
const SCHREIB_FRIST_MS = KOALESZENZ_FENSTER_MS - AUTOSAVE_DEBOUNCE_MS - RAND_MS

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
    // AP-1.30 PR 7b: Editor als eigene Ansicht, die Notiz steht im Reiter „Notizen".
    const editor = fenster.getByRole('dialog', { name: 'Person bearbeiten', exact: true })
    await editor.getByRole('tab', { name: /^Notizen/ }).click()

    const notiz = editor.getByRole('textbox', { name: 'Notiz', exact: true })
    await expect(notiz).toHaveValue('Start')
    await notiz.click()
    await notiz.press('End')

    expect(SCHREIB_FRIST_MS).toBeGreaterThan(AUTOSAVE_DEBOUNCE_MS)
    let erwartet = 'Start'
    let zuletztGeschrieben: number | null = null
    for (let i = 0; i < 10; i += 1) {
      const zeichen = String.fromCharCode(97 + i)
      erwartet += zeichen
      await notiz.press(zeichen)
      // Jeder Anschlag wird für sich geschrieben (sonst prüfte der Test keine Koaleszenz).
      await expect.poll(() => gespeicherteNotiz(personId), { timeout: SCHREIB_FRIST_MS, intervals: [50] }).toBe(erwartet)
      const jetzt = Date.now()
      // Vorbedingung der Koaleszenz: der Abstand zweier Schreibvorgänge liegt im Fenster.
      if (zuletztGeschrieben !== null) expect(jetzt - zuletztGeschrieben).toBeLessThan(KOALESZENZ_FENSTER_MS)
      zuletztGeschrieben = jetzt
      await fenster.waitForTimeout(RAND_MS)
    }
    await expect(notiz).toHaveValue('Startabcdefghij')

    const undoErgebnis = await fenster.evaluate(async () => window.wurzelwerk.aufrufen('befehl:journal.undo', null))
    expect(undoErgebnis.ok).toBe(true)
    await expect.poll(() => gespeicherteNotiz(personId)).toBe('Start')
    await expect(notiz).toHaveValue('Start')
  })
})
