import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { z } from 'zod'
import { AUTOSAVE_DEBOUNCE_MS } from '../../src/shared/autosave'

/**
 * AP-1.30 PR 7b (Abnahme AP-1.30: „Beim Öffnen steht immer ‚Person' oben, die Reiterwahl wird nicht
 * gemerkt. Reiterwechsel speichert." / „Reiterzähler stimmen mit den Daten"), langsames Gate: der
 * Editor als eigene Ansicht mit acht Reitern über die echte Oberfläche.
 *
 * - Öffnen aus der Lesesicht zeigt den Dialog „Person bearbeiten" mit aktivem Reiter „Person".
 * - Reiter wechseln; Zähler am Reiter „Namen" = Anzahl der Namensformen laut `abfrage:person.detail`.
 * - In der Notiz tippen und SOFORT den Reiter wechseln → der Wert steht in der Datenbank, bevor die
 *   Debounce-Frist abgelaufen sein könnte (Frist-Hälfte als Obergrenze der Wartezeit).
 * - Reiterwahl nicht gemerkt: nach „Fertig" + „Bearbeiten" und nach Schließen + Wiederöffnen aus der
 *   Liste steht wieder „Person" oben.
 *
 * Zusicherungen an DOM-State und `abfrage:*`-Ergebnisse (kein Log-Datei-Lesen, ENOENT-Flake auf
 * frischem Runner, `docs/80_Offene_Fragen.md`).
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')

test.describe('Ablauf 08 — Person bearbeiten: Reiter', () => {
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
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-reiter-'))
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

  /**
   * Drückt eine Ziffer der oberen Reihe über `webContents.sendInputEvent` (keyDown, char, keyUp).
   * `fenster.keyboard.press` reicht nicht: Playwright spritzt Tasten über das DevTools-Protokoll
   * direkt in den Renderer, daran vorbei feuert `before-input-event` im Hauptprozess nie (lokal
   * belegt) — genau der Weg, den die Tasten 1…8 nehmen (AP-1.30 PR 7c). `sendInputEvent` läuft
   * dagegen wie eine echte Taste durch den Hauptprozess (`code` = `Digit<n>`).
   */
  async function ziffertasteNativ(ziffer: string, modifikatoren: readonly ('shift' | 'control' | 'alt' | 'meta')[] = []): Promise<void> {
    await app.evaluate(
      ({ BrowserWindow }, taste) => {
        const inhalt = BrowserWindow.getAllWindows()[0]?.webContents
        if (inhalt === undefined) throw new Error('kein Fenster')
        for (const type of ['keyDown', 'char', 'keyUp'] as const) {
          inhalt.sendInputEvent({ type, keyCode: taste.ziffer, modifiers: [...taste.modifikatoren] })
        }
      },
      { ziffer, modifikatoren },
    )
  }

  async function personDetail(personId: string): Promise<{ readonly notiz: string | null; readonly namenAnzahl: number }> {
    const ergebnis = await fenster.evaluate(async (id) => window.wurzelwerk.aufrufen('abfrage:person.detail', { personId: id }), personId)
    if (!ergebnis.ok) throw new Error('abfrage:person.detail fehlgeschlagen')
    // `aufrufen()` ist im Preload kanalunabhängig auf `Ergebnis<unknown>` typisiert — per Zod prüfen.
    const daten = z.object({ notiz: z.string().nullable(), namen: z.array(z.unknown()) }).parse(ergebnis.daten)
    return { notiz: daten.notiz, namenAnzahl: daten.namen.length }
  }

  test('Öffnen zeigt „Person", Reiter wechseln, Zähler = Daten, Wechsel speichert sofort, Wahl nicht gemerkt', async () => {
    test.setTimeout(60_000)
    await dialogLiefert(elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Reitertest')
    await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()
    await expect(fenster.getByRole('table')).toBeVisible()

    const anlegen = await fenster.evaluate(async () => window.wurzelwerk.aufrufen('befehl:person.anlegen', { privat: 0, ist_platzhalter: 0, notiz: 'Start' }))
    if (!anlegen.ok) throw new Error('person.anlegen fehlgeschlagen')
    const personId = z.object({ id: z.string() }).parse(anlegen.daten).id
    for (const [typ, vornamen] of [['geburtsname', 'Minna'], ['ehename', 'Wilhelmine']] as const) {
      const name = await fenster.evaluate(
        async (ein) => window.wurzelwerk.aufrufen('befehl:name.anlegen', { personId: ein.personId, typ: ein.typ, vornamen: ein.vornamen, nachname: 'Muster' }),
        { personId, typ, vornamen },
      )
      expect(name.ok).toBe(true)
    }

    const zeile = fenster.locator('.wz-datentabelle__koerper [role="row"]')
    await expect(zeile).toHaveCount(1)
    await zeile.click()
    const profil = fenster.getByRole('dialog', { name: 'Profil', exact: true })
    await expect(profil).toBeVisible()

    // Öffnen: eigene Ansicht, die Lesesicht ist weg, „Person" aktiv und fokussiert.
    await profil.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    const editor = fenster.getByRole('dialog', { name: 'Person bearbeiten', exact: true })
    await expect(editor).toBeVisible()
    await expect(profil).toHaveCount(0)
    await expect(editor.getByRole('tab')).toHaveCount(8)
    const personReiter = editor.getByRole('tab', { name: /^Person/ })
    await expect(personReiter).toHaveAttribute('aria-selected', 'true')
    await expect(personReiter).toBeFocused()
    await expect(editor.getByRole('tabpanel')).toContainText('Geschlecht')

    // Zähler am Reiter „Namen" = Anzahl der Namensformen in der Datenbank.
    const { namenAnzahl } = await personDetail(personId)
    expect(namenAnzahl).toBe(2)
    const namenReiter = editor.getByRole('tab', { name: /^Namen/ })
    await expect(namenReiter.locator('.wz-zaehler')).toHaveText(String(namenAnzahl))

    // Reiter wechseln: nur der aktive Inhalt ist da.
    await namenReiter.click()
    await expect(namenReiter).toHaveAttribute('aria-selected', 'true')
    await expect(personReiter).toHaveAttribute('aria-selected', 'false')
    await expect(editor.getByRole('tabpanel')).toHaveCount(1)
    await expect(editor.getByRole('tabpanel').locator('input[value="Wilhelmine"]')).toBeVisible()

    await editor.getByRole('tab', { name: /^Leben/ }).click()
    await expect(editor.getByRole('tabpanel').getByText('Neues Ereignis erfassen', { exact: true })).toBeVisible()

    // Notiz tippen und SOFORT den Reiter wechseln — geschrieben ist, bevor der Debounce fällig wäre.
    await editor.getByRole('tab', { name: /^Notizen/ }).click()
    const notiz = editor.getByRole('textbox', { name: 'Notiz', exact: true })
    await expect(notiz).toHaveValue('Start')
    await notiz.click()
    await notiz.press('End')
    await notiz.pressSequentially(' neu')
    await editor.getByRole('tab', { name: /^Verwaltung/ }).click()
    await expect.poll(async () => (await personDetail(personId)).notiz, { timeout: AUTOSAVE_DEBOUNCE_MS / 2, intervals: [25] }).toBe('Start neu')
    await expect(editor.getByRole('tabpanel')).toContainText('kommt in einem späteren Schritt')

    // „Fertig" → Lesesicht, Fokus auf „Bearbeiten"; erneut „Bearbeiten" → wieder „Person".
    await editor.getByRole('button', { name: 'Fertig', exact: true }).click()
    await expect(editor).toHaveCount(0)
    await expect(profil.getByRole('button', { name: 'Bearbeiten', exact: true })).toBeFocused()
    await profil.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    await expect(editor.getByRole('tab', { name: /^Person/ })).toHaveAttribute('aria-selected', 'true')

    // Schließen aus dem Editor → Liste, Fokus zurück an der Zeile; Wiederöffnen → wieder „Person".
    await editor.getByRole('tab', { name: /^Notizen/ }).click()
    await editor.getByRole('button', { name: 'Schließen', exact: true }).click()
    await expect(editor).toHaveCount(0)
    await expect(profil).toHaveCount(0)
    await expect(zeile).toBeFocused()
    await zeile.click()
    await profil.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    await expect(editor.getByRole('tab', { name: /^Person/ })).toHaveAttribute('aria-selected', 'true')
    await expect(editor.getByRole('tab', { name: /^Notizen/ })).toHaveAttribute('aria-selected', 'false')
    // Frischer Editor ohne eigenen Schreibvorgang: kein Speicherstatus im Kopf (V-130-7-speicherfehler),
    // obwohl der vorige Editor derselben Person geschrieben hat.
    await expect(editor.locator('.wz-speicherstatus')).toHaveCount(0)

    // AP-1.30 PR 7c (V-130-7-tasten): Taste 3 wählt „Leben" (der Hauptprozess beobachtet die Ziffer
    // über `before-input-event`, der Renderer wählt den Reiter), der Fokus folgt auf den Reiter.
    // Shift+3 ist keine Kontexttaste. Tasten über `ziffertasteNativ` (s. dort), nicht `keyboard.press`.
    const lebenReiter = editor.getByRole('tab', { name: /^Leben/ })
    // Shift+3 darf „Leben" nie wählen — auch nicht kurz: ein Beobachter am Reiter merkt jede
    // Auswahl, danach wählt Taste 2 „Namen" (gleiche Reihenfolge der Push-Ereignisse, also ist
    // Shift+3 sicher verarbeitet, wenn „Namen" aktiv ist).
    await fenster.evaluate(() => {
      const ablage = window as unknown as { lebenJeGewaehlt?: boolean } // nur Testablage am Fenster
      ablage.lebenJeGewaehlt = false
      const reiter = document.getElementById('person-bearbeiten-reiter-leben')
      if (reiter === null) throw new Error('Reiter Leben fehlt')
      new MutationObserver(() => {
        if (reiter.getAttribute('aria-selected') === 'true') ablage.lebenJeGewaehlt = true
      }).observe(reiter, { attributes: true, attributeFilter: ['aria-selected'] })
    })
    await ziffertasteNativ('3', ['shift'])
    await ziffertasteNativ('2')
    await expect(editor.getByRole('tab', { name: /^Namen/ })).toHaveAttribute('aria-selected', 'true')
    expect(await fenster.evaluate(() => (window as unknown as { lebenJeGewaehlt?: boolean }).lebenJeGewaehlt)).toBe(false) // Testablage, s. o.
    await ziffertasteNativ('3')
    await expect(lebenReiter).toHaveAttribute('aria-selected', 'true')
    await expect(lebenReiter).toBeFocused()
    await expect(editor.getByRole('tabpanel').getByText('Neues Ereignis erfassen', { exact: true })).toBeVisible()
    await ziffertasteNativ('7')
    const notizenReiter = editor.getByRole('tab', { name: /^Notizen/ })
    await expect(notizenReiter).toHaveAttribute('aria-selected', 'true')

    // Eine Ziffer im Notizfeld wird getippt und wechselt den Reiter nicht (nicht blockiert).
    const notizFeld = editor.getByRole('textbox', { name: 'Notiz', exact: true })
    await notizFeld.click()
    await notizFeld.press('End')
    await ziffertasteNativ('2')
    await expect(notizFeld).toHaveValue('Start neu2')
    await expect(notizenReiter).toHaveAttribute('aria-selected', 'true')
    await expect(editor.getByRole('tab', { name: /^Namen/ })).toHaveAttribute('aria-selected', 'false')
    await expect.poll(async () => (await personDetail(personId)).notiz, { timeout: AUTOSAVE_DEBOUNCE_MS * 10 }).toBe('Start neu2')

    // AP-1.30 PR 7c (V-130-7-speicherfehler): nach dem Schreiben steht „Gespeichert" im Kopf dieses
    // Editors (vorher, s. oben beim Wiederöffnen, stand dort nichts).
    await expect(editor.getByRole('status')).toHaveText('Gespeichert · gerade eben')
  })
})
