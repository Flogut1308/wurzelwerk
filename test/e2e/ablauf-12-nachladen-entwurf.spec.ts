import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { z } from 'zod'

/**
 * U-130-fix-ablauf07-nachladen (AP-1.30 / AP-0.15, docs/80 §33): ein Anschlag, der zwischen dem
 * Schreiben eines Autosave-Stands und dem Eintreffen des Nachladens nach `ereignis:datenGeaendert`
 * fällt, darf nicht vom nachgeladenen (älteren) Stand überschrieben werden.
 *
 * Das Zeitfenster ist in der echten App wenige Millisekunden breit. Um es deterministisch zu
 * treffen, hält dieser Test die Antworten von `abfrage:person.detail` im HAUPTPROZESS zurück (nur
 * hier im Test-Harness, über `app.evaluate` — der Produktivcode kennt keine Verzögerung): die
 * Antwort wird zum Zeitpunkt der Anfrage berechnet (Stand „Starta") und erst ausgeliefert, nachdem
 * der zweite Anschlag „b" getippt ist. Ohne Fix übernimmt das Feld „Starta", der Timer findet
 * `entwurf === wert` und schreibt nichts — „b" ist still verloren.
 *
 * Das Tor greift auf das Electron-interne `ipcMain._invokeHandlers` zu (die einzige Stelle, an der
 * ein bereits registrierter `ipcMain.handle`-Handler umhüllt werden kann). Fehlt es in einer
 * künftigen Electron-Version, bricht der Test laut ab, statt still nichts zu prüfen.
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')
const TOR_SCHLUESSEL = '__wurzelwerkE2eNachladenTor'

test.describe('Ablauf 12 — Anschlag während des Nachladens (Notiz)', () => {
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
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-nachladen-'))
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

  // Rot gegen den unveränderten Hook: gespeichert bleibt „Starta" (test.fail bis zum Fix).
  test.fail('ein Anschlag zwischen Schreiben und Nachladen wird nicht überschrieben und gespeichert', async () => {
    test.setTimeout(60_000)
    await dialogLiefert(elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Nachladentest')
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
    await notiz.press('a')
    // Das Schreiben von „Starta" ist erfolgt und das Nachladen läuft (Antwort wird gehalten).
    await expect.poll(() => torAufruf('anzahl'), { timeout: 5_000, intervals: [10] }).toBeGreaterThan(0)
    await notiz.press('b')
    await expect(notiz).toHaveValue('Startab')
    await torAufruf('freigeben')

    await expect.poll(() => gespeicherteNotiz(personId), { timeout: 5_000 }).toBe('Startab')
    await expect(notiz).toHaveValue('Startab')
  })
})
