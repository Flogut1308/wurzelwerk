import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type Locator } from '@playwright/test'
import { z } from 'zod'
import { AUTOSAVE_DEBOUNCE_MS } from '../../src/shared/autosave'

/**
 * U-130-nachladen-undo-vor-echo (AP-1.30 / AP-0.15, docs/80 §33, hueter-Review PR #173 S1): ein
 * Menü-Undo, das ankommt, BEVOR das Nachladen des eigenen Schreibens den Renderer erreicht. Der
 * Speicher liefert danach wieder den Stand von vor dem Schreiben — denselben, den der Cache noch
 * hält; für den Autosave-Hook ändert sich `wert` nicht.
 *
 * (a) ohne ausstehenden Entwurf: das Feld muss den zurückgenommenen Stand zeigen (sonst stille
 *     Divergenz Feld „Starta" ≠ gespeichert „Start").
 * (b) mit ausstehendem Entwurf: Undo gewinnt, der Timer darf „Startab" nicht über das Undo schreiben.
 *
 * Das Zeitfenster wird wie in `ablauf-12-nachladen-entwurf.spec.ts` deterministisch getroffen: das
 * Test-Harness hält die Antworten von `abfrage:person.detail` im Hauptprozess zurück (Antwort zum
 * Zeitpunkt der Anfrage berechnet, erst später ausgeliefert). Das Undo ist das echte Menü-Undo
 * (Menüpunkt mit `CmdOrCtrl+Z` im Anwendungsmenü, `click()` im Hauptprozess) — kein
 * `befehl:journal.undo` aus dem Renderer, weil gerade der Weg am Renderer vorbei den Fehler auslöst.
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')
const TOR_SCHLUESSEL = '__wurzelwerkE2eUndoVorEchoTor'

test.describe('Ablauf 13 — Menü-Undo vor dem Echo des eigenen Schreibens (Notiz)', () => {
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

  test.beforeEach(async () => {
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-undo-vor-echo-'))
    app = await electron.launch({ args: [HAUPTPROZESS_EINSTIEG] })
    fenster = await app.firstWindow()
  })

  test.afterEach(async () => {
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

  /** Umhüllt den Handler von `abfrage:person.detail`: solange `halten`, wartet jede Antwort. */
  async function torEinbauen(): Promise<void> {
    await app.evaluate(({ ipcMain }, schluessel) => {
      const handler: unknown = Reflect.get(ipcMain, '_invokeHandlers')
      if (!(handler instanceof Map)) throw new Error('ipcMain._invokeHandlers fehlt — Tor nicht einbaubar')
      const original: unknown = handler.get('abfrage:person.detail')
      if (typeof original !== 'function') throw new Error('kein Handler für abfrage:person.detail')
      const wartende: (() => void)[] = []
      const tor = {
        halten: true,
        anzahlGehalten: () => wartende.length,
        freigeben: () => {
          tor.halten = false
          for (const weiter of wartende.splice(0)) weiter()
        },
      }
      Reflect.set(globalThis, schluessel, tor)
      handler.set('abfrage:person.detail', async (...argumente: unknown[]): Promise<unknown> => {
        // Antwort JETZT berechnen (Stand zum Zeitpunkt der Anfrage), aber erst später ausliefern.
        const antwort: unknown = await Reflect.apply(original, undefined, argumente)
        if (tor.halten) await new Promise<void>((weiter) => wartende.push(weiter))
        return antwort
      })
    }, TOR_SCHLUESSEL)
  }

  async function torAufruf(art: 'anzahl' | 'freigeben'): Promise<number> {
    return app.evaluate((_electron, [schluessel, a]) => {
      const tor: unknown = Reflect.get(globalThis, schluessel)
      if (typeof tor !== 'object' || tor === null) throw new Error('Tor nicht eingebaut')
      const methode: unknown = Reflect.get(tor, a === 'anzahl' ? 'anzahlGehalten' : 'freigeben')
      if (typeof methode !== 'function') throw new Error('Tor unvollständig')
      const erg: unknown = Reflect.apply(methode, tor, [])
      return typeof erg === 'number' ? erg : 0
    }, [TOR_SCHLUESSEL, art] as const)
  }

  /** Klickt den Menüpunkt „Rückgängig" (Tastenkürzel `CmdOrCtrl+Z`) im Hauptprozess. */
  async function menueUndo(): Promise<void> {
    await menuepunktKlicken('CmdOrCtrl+Z')
  }

  /** Klickt den Menüpunkt „Wiederholen" (Tastenkürzel `Shift+CmdOrCtrl+Z`) im Hauptprozess. */
  async function menueRedo(): Promise<void> {
    await menuepunktKlicken('Shift+CmdOrCtrl+Z')
  }

  /**
   * Der Klick läuft als EIGENE Aufgabe der Ereignisschleife (`setImmediate`), nicht direkt im
   * `evaluate`. Playwright wertet `app.evaluate` über den Node-Inspector aus, und der unterbricht
   * gerade laufendes synchrones JS des Hauptprozesses (V8-Interrupt). Traf das Redo so mitten in
   * das `.all()` einer Abfrage, die der Renderer nach dem Undo nachlädt (z. B. `journal.verlauf`:
   * better-sqlite3 baut die Zeilen in JS), war die Verbindung belegt. `redo()` warf dann „This
   * database connection is busy executing a query“, `journalBefehlAusfuehren` protokollierte nur
   * `journal.redo INTERN_UNERWARTET`, und es kam kein `ereignis:datenGeaendert`. Das Feld zeigte
   * korrekt den Undo-Stand, das Redo hatte nie stattgefunden (CI-Flake, docs/80 §33
   * V-130-ci-ablauf13). Ein echter Menüklick kommt nie so an: er ist eine eigene Aufgabe und wartet,
   * bis laufendes JS fertig ist. Die Prüfungen auf fehlenden oder deaktivierten Eintrag bleiben
   * davor, damit ihr Fehler das `evaluate` selbst scheitern lässt.
   */
  async function menuepunktKlicken(kuerzel: string): Promise<void> {
    await app.evaluate(({ Menu }, gesucht) => {
      const menue = Menu.getApplicationMenu()
      if (menue === null) throw new Error('kein Anwendungsmenü')
      const eintrag = menue.items.flatMap((oben) => oben.submenu?.items ?? []).find((unten) => unten.accelerator === gesucht)
      if (eintrag === undefined) throw new Error(`Menüpunkt ${gesucht} fehlt`)
      if (!eintrag.enabled) throw new Error(`Menüpunkt ${gesucht} ist deaktiviert`)
      return new Promise<void>((fertig) => {
        setImmediate(() => {
          eintrag.click()
          fertig()
        })
      })
    }, kuerzel)
  }

  /** Projekt, Person mit Notiz „Start", Editor offen, Cursor am Ende der Notiz, Tor eingebaut. */
  async function vorbereiten(): Promise<{ readonly personId: string; readonly notiz: Locator }> {
    await dialogLiefert(elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Undo-vor-Echo')
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
    const editor = fenster.getByRole('dialog', { name: 'Person bearbeiten', exact: true })
    await editor.getByRole('tab', { name: /^Notizen/ }).click()

    const notiz = editor.getByRole('textbox', { name: 'Notiz', exact: true })
    await expect(notiz).toHaveValue('Start')
    await notiz.click()
    await notiz.press('End')
    await torEinbauen()
    return { personId, notiz }
  }

  test('(a) ohne ausstehenden Entwurf: das Feld zeigt nach dem Undo den gespeicherten Stand', async () => {
    test.setTimeout(60_000)
    const { personId, notiz } = await vorbereiten()
    await notiz.press('a')
    // „Starta" ist geschrieben, das Nachladen (Echo) wird gehalten.
    await expect.poll(() => torAufruf('anzahl'), { timeout: 5_000, intervals: [10] }).toBeGreaterThan(0)
    await menueUndo()
    // Das Nachladen nach dem Undo ist ebenfalls angefragt (und gehalten).
    await expect.poll(() => torAufruf('anzahl'), { timeout: 5_000, intervals: [10] }).toBeGreaterThan(1)
    await torAufruf('freigeben')

    await expect.poll(() => gespeicherteNotiz(personId), { timeout: 5_000 }).toBe('Start')
    await expect(notiz).toHaveValue('Start')
  })

  test('(b) mit ausstehendem Entwurf: Undo gewinnt, der Entwurf wird nicht über das Undo geschrieben', async () => {
    test.setTimeout(60_000)
    const { personId, notiz } = await vorbereiten()
    await notiz.press('a')
    await expect.poll(() => torAufruf('anzahl'), { timeout: 5_000, intervals: [10] }).toBeGreaterThan(0)
    await notiz.press('b') // ausstehend, die Debounce-Frist läuft
    await menueUndo()
    await expect.poll(() => torAufruf('anzahl'), { timeout: 5_000, intervals: [10] }).toBeGreaterThan(1)
    await torAufruf('freigeben')

    await expect(notiz).toHaveValue('Start')
    // Länger als die Debounce-Frist warten: ein Timer, der doch schreibt, fiele jetzt auf.
    await fenster.waitForTimeout(AUTOSAVE_DEBOUNCE_MS * 3)
    expect(await gespeicherteNotiz(personId)).toBe('Start')
    await expect(notiz).toHaveValue('Start')
  })

  // hueter PR #174 H1 (Lebendigkeit): der Wartezustand nach einer Rücknahme endet — nach Undo,
  // zweitem Undo und Undo + sofortigem Redo wird ein neuer Anschlag wieder gespeichert.
  test('nach Undo, zweitem Undo und Undo + Redo wird wieder geschrieben', async () => {
    test.setTimeout(60_000)
    const { personId, notiz } = await vorbereiten()
    await notiz.press('a')
    await expect.poll(() => torAufruf('anzahl'), { timeout: 5_000, intervals: [10] }).toBeGreaterThan(0)
    await menueUndo() // vor dem Echo
    await expect.poll(() => torAufruf('anzahl'), { timeout: 5_000, intervals: [10] }).toBeGreaterThan(1)
    await torAufruf('freigeben')
    await expect(notiz).toHaveValue('Start')

    await notiz.press('x')
    await expect.poll(() => gespeicherteNotiz(personId), { timeout: 5_000 }).toBe('Startx')
    await expect(notiz).toHaveValue('Startx')

    await menueUndo() // zweites Undo
    await expect(notiz).toHaveValue('Start')
    await expect.poll(() => gespeicherteNotiz(personId), { timeout: 5_000 }).toBe('Start')
    await notiz.press('y')
    await expect.poll(() => gespeicherteNotiz(personId), { timeout: 5_000 }).toBe('Starty')

    await menueUndo()
    await menueRedo() // sofort
    await expect(notiz).toHaveValue('Starty')
    await expect.poll(() => gespeicherteNotiz(personId), { timeout: 5_000 }).toBe('Starty')
    await notiz.press('z')
    await expect.poll(() => gespeicherteNotiz(personId), { timeout: 5_000 }).toBe('Startyz')
    await expect(notiz).toHaveValue('Startyz')
  })
})
