import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type Locator } from '@playwright/test'
import { z } from 'zod'
import { AUTOSAVE_DEBOUNCE_MS } from '../../src/shared/autosave'

/**
 * U-130-nachladen-sofortaendern (AP-1.30 / AP-0.15, docs/80 §33): Auswahlfelder schreiben sofort.
 * Bis zu diesem Fix taten sie das am Autosave-Hook vorbei; der Hook kannte den geschriebenen Stand
 * nicht. Zwei Folgen, beide hier über die echte Oberfläche geprüft:
 *
 * - Nach einer Auswahl hält der Hook den Stand für ungeschrieben und schreibt ihn nach der Frist ein
 *   zweites Mal (sichtbar, sobald das Nachladen länger dauert als die Frist).
 * - Wer nach der Auswahl vor dem Nachladen in einem Textfeld derselben Zeile tippt, verliert den
 *   Anschlag: das Nachladen gilt als fremde Änderung und ersetzt den Entwurf.
 *
 * Tor wie `ablauf-12-nachladen-entwurf.spec.ts`: die Antworten von `abfrage:person.detail` werden im
 * Hauptprozess zurückgehalten (nur im Test-Harness; der Produktivcode kennt keine Verzögerung).
 * Zusätzlich zählt das Tor die `befehl:name.aendern`-Aufrufe. Fehlt `ipcMain._invokeHandlers` in
 * einer künftigen Electron-Version, bricht der Test laut ab, statt still nichts zu prüfen.
 *
 * Seit AP-1.30 PR 11c-1 bearbeitet der Reiter „Namen" im Modal ohne Autosave (docs/80 §33 V-130-11c-1):
 * dort schreibt eine Auswahl gar nicht, ein Anschlag bei gehaltenem Nachladen bleibt stehen, und
 * „Übernehmen" ist genau ein `befehl:namensform.uebernehmen` (das Tor zählt auch diesen Kanal).
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')
const TOR_SCHLUESSEL = '__wurzelwerkE2eAuswahlTor'

const NameSchema = z.object({ typ: z.string(), nachname: z.string().nullable(), rufname_text: z.string().nullable(), rufname_index: z.number().nullable() })

test.describe('Ablauf 14 — Auswahl, dann Tippen vor dem Nachladen', () => {
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
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-auswahl-'))
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

  /** Umhüllt `abfrage:person.detail` (hält Antworten, solange geschlossen) und zählt `befehl:name.aendern`
   * sowie (seit AP-1.30 PR 11c-1, Modal im Reiter „Namen") `befehl:namensform.uebernehmen`. */
  async function torEinbauen(): Promise<void> {
    await app.evaluate(({ ipcMain }, schluessel) => {
      const handler: unknown = Reflect.get(ipcMain, '_invokeHandlers')
      if (!(handler instanceof Map)) throw new Error('ipcMain._invokeHandlers fehlt — Tor nicht einbaubar')
      const detail: unknown = handler.get('abfrage:person.detail')
      const aendern: unknown = handler.get('befehl:name.aendern')
      const uebernehmen: unknown = handler.get('befehl:namensform.uebernehmen')
      if (typeof detail !== 'function') throw new Error('kein Handler für abfrage:person.detail')
      if (typeof aendern !== 'function') throw new Error('kein Handler für befehl:name.aendern')
      if (typeof uebernehmen !== 'function') throw new Error('kein Handler für befehl:namensform.uebernehmen')
      const wartende: (() => void)[] = []
      const tor = {
        halten: false,
        aenderungen: 0,
        uebernahmen: 0,
        anzahlGehalten: () => wartende.length,
        anzahlAenderungen: () => tor.aenderungen,
        anzahlUebernahmen: () => tor.uebernahmen,
        schliessen: () => {
          tor.halten = true
          tor.aenderungen = 0
          tor.uebernahmen = 0
          return 0
        },
        freigeben: () => {
          tor.halten = false
          for (const weiter of wartende.splice(0)) weiter()
          return 0
        },
      }
      Reflect.set(globalThis, schluessel, tor)
      handler.set('abfrage:person.detail', async (...argumente: unknown[]): Promise<unknown> => {
        // Antwort JETZT berechnen (Stand zum Zeitpunkt der Anfrage), aber erst später ausliefern.
        const antwort: unknown = await Reflect.apply(detail, undefined, argumente)
        if (tor.halten) await new Promise<void>((weiter) => wartende.push(weiter))
        return antwort
      })
      handler.set('befehl:name.aendern', async (...argumente: unknown[]): Promise<unknown> => {
        tor.aenderungen += 1
        return Reflect.apply(aendern, undefined, argumente)
      })
      handler.set('befehl:namensform.uebernehmen', async (...argumente: unknown[]): Promise<unknown> => {
        tor.uebernahmen += 1
        return Reflect.apply(uebernehmen, undefined, argumente)
      })
    }, TOR_SCHLUESSEL)
  }

  async function tor(art: 'anzahlGehalten' | 'anzahlAenderungen' | 'anzahlUebernahmen' | 'schliessen' | 'freigeben'): Promise<number> {
    return app.evaluate((_electron, [schluessel, methodenname]) => {
      const t: unknown = Reflect.get(globalThis, schluessel)
      if (typeof t !== 'object' || t === null) throw new Error('Tor nicht eingebaut')
      const methode: unknown = Reflect.get(t, methodenname)
      if (typeof methode !== 'function') throw new Error('Tor unvollständig')
      const erg: unknown = Reflect.apply(methode, t, [])
      return typeof erg === 'number' ? erg : 0
    }, [TOR_SCHLUESSEL, art] as const)
  }

  /**
   * Zwei Schritte je Auswahlfeld, beide bei gehaltenem Nachladen:
   * (a) Auswahl `erst`, dann länger als die Frist warten: genau EIN `name.aendern` (kein zweites
   *     Schreiben desselben Stands durch den Timer).
   * (b) Auswahl `dann`, sofort im Textfeld tippen, Nachladen sofort freigeben: der Anschlag bleibt im
   *     Feld (und wird gespeichert, geprüft vom Aufrufer). Das Freigeben muss vor dem Ablauf der Frist
   *     des Anschlags liegen — sonst schriebe der Timer den Anschlag vor dem Echo, und (b) prüfte nichts
   *     (falsch grün, nie falsch rot). Deterministisch belegt ist (b) in
   *     `test/einheit/autosave-auswahl-sofort.test.tsx`.
   */
  async function auswahlSchritte(auswahl: Locator, textfeld: Locator, erst: string, dann: string, anschlag: string): Promise<void> {
    const vorher = await textfeld.inputValue()
    // (a)
    await tor('schliessen')
    await auswahl.selectOption({ label: erst })
    await expect.poll(() => tor('anzahlGehalten'), { timeout: 5_000, intervals: [10] }).toBeGreaterThan(0)
    await fenster.waitForTimeout(AUTOSAVE_DEBOUNCE_MS * 3)
    expect.soft(await tor('anzahlAenderungen'), `name.aendern nach „${erst}"`).toBe(1)
    await tor('freigeben')
    // (b)
    await tor('schliessen')
    await auswahl.selectOption({ label: dann })
    await expect.poll(() => tor('anzahlGehalten'), { timeout: 5_000, intervals: [10] }).toBeGreaterThan(0)
    await textfeld.click()
    await textfeld.press('End')
    await textfeld.press(anschlag)
    await tor('freigeben')
    // Auswahl + Anschlag, nicht mehr. Bleibt es bei 1, hat das Echo den Anschlag verdrängt.
    await expect.poll(() => tor('anzahlAenderungen'), { timeout: 5_000, message: `Anschlag nach „${dann}" geschrieben` }).toBe(2)
    await fenster.waitForTimeout(AUTOSAVE_DEBOUNCE_MS * 2)
    expect.soft(await tor('anzahlAenderungen'), `name.aendern nach „${dann}" + Anschlag`).toBe(2)
    await expect(textfeld).toHaveValue(`${vorher}${anschlag}`)
  }

  test('Rufname (Reiter Person): EIN Schreiben je Auswahl; Namenstyp (Modal Reiter Namen): EIN Schreiben beim Übernehmen; Anschlag danach bleibt erhalten', async () => {
    test.setTimeout(90_000)
    await app.evaluate(({ dialog }, gewaehlt) => {
      dialog.showOpenDialog = (() => Promise.resolve({ canceled: false, filePaths: [gewaehlt] })) as typeof dialog.showOpenDialog
    }, elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Auswahltest')
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
    await expect(editor.getByRole('tab', { name: /^Person/ })).toHaveAttribute('aria-selected', 'true')
    await torEinbauen()

    // 1) Reiter „Person": Rufname der Hauptnamen-Gruppe.
    const rufname = editor.locator('#person-bearbeiten-hauptname-rufname')
    const hauptNachname = editor.locator('#person-bearbeiten-hauptname-nachname')
    await expect(hauptNachname).toHaveValue('Gutnoff')
    await auswahlSchritte(rufname, hauptNachname, 'Friedrich', 'Karl', 'x')
    await expect.poll(() => gespeicherterName(personId), { timeout: 5_000 }).toEqual({ typ: 'geburtsname', nachname: 'Gutnoffx', rufname_text: 'Karl', rufname_index: 0 })
    await expect(hauptNachname).toHaveValue('Gutnoffx')

    // 2) Reiter „Namen": Namenstyp der bestehenden Form. Seit AP-1.30 PR 11c-1 im Modal „Namensform
    // bearbeiten" ohne Autosave: eine Auswahl schreibt NICHTS (auch nicht nach der Frist), ein Anschlag
    // danach bleibt auch bei gehaltenem Nachladen stehen, und „Übernehmen" schreibt genau EINMAL.
    await editor.getByRole('tab', { name: /^Namen/ }).click()
    await editor.getByRole('article', { name: 'Karl Friedrich Gutnoffx', exact: true }).getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    const modal = fenster.getByRole('dialog', { name: 'Namensform bearbeiten', exact: true })
    const nachname = modal.getByRole('textbox', { name: /^Nachname/ })
    const namenstyp = modal.getByRole('combobox', { name: 'Namenstyp' })
    await expect(nachname).toHaveValue('Gutnoffx')
    await tor('schliessen')
    await namenstyp.selectOption({ label: 'Ehename' })
    await fenster.waitForTimeout(AUTOSAVE_DEBOUNCE_MS * 3)
    expect.soft(await tor('anzahlUebernahmen'), 'namensform.uebernehmen nach „Ehename"').toBe(0)
    await namenstyp.selectOption({ label: 'Vulgo-/Hausname' })
    await nachname.click()
    await nachname.press('End')
    await nachname.press('y')
    await tor('freigeben')
    await fenster.waitForTimeout(AUTOSAVE_DEBOUNCE_MS * 2)
    await expect(nachname).toHaveValue('Gutnoffxy')
    await expect(namenstyp).toHaveValue('vulgo')
    expect.soft(await tor('anzahlUebernahmen'), 'namensform.uebernehmen vor Übernehmen').toBe(0)
    await tor('schliessen')
    await modal.getByRole('button', { name: 'Übernehmen', exact: true }).click()
    await expect.poll(() => tor('anzahlUebernahmen'), { timeout: 5_000, message: 'Übernehmen geschrieben' }).toBe(1)
    await tor('freigeben')
    await expect(modal).toHaveCount(0)
    await fenster.waitForTimeout(AUTOSAVE_DEBOUNCE_MS * 2)
    expect.soft(await tor('anzahlUebernahmen'), 'namensform.uebernehmen nach Übernehmen').toBe(1)
    expect.soft(await tor('anzahlAenderungen'), 'name.aendern im Reiter Namen').toBe(0)
    await expect.poll(() => gespeicherterName(personId), { timeout: 5_000 }).toEqual({ typ: 'vulgo', nachname: 'Gutnoffxy', rufname_text: 'Karl', rufname_index: 0 })
    await expect(editor.getByRole('article', { name: 'Karl Friedrich Gutnoffxy', exact: true })).toBeVisible()
  })
})
