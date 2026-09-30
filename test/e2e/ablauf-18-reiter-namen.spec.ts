import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type Locator } from '@playwright/test'
import { z } from 'zod'

/**
 * A-02, A-19, C-26, AP-1.30 PR 11c-1 (docs/80 §33 V-130-11c-1), langsames Gate: der Reiter „Namen" mit
 * Karten und dem Modal „Namensform bearbeiten" über die echte App.
 *
 * - Form anlegen, Nachname ändern, Übernehmen; ⌘Z nimmt genau diesen Schritt zurück.
 * - Zehn Tastenanschläge im Modal, dann Übernehmen: genau ein Undo-Schritt (Verlauf +1, Reiterzähler stimmt).
 * - Hauptname wechseln, Entfernen.
 * - Abbrechen mit geändertem Entwurf fragt nach; ohne Änderung nicht.
 * - ⌘Z bei offenem Modal verwirft den Entwurf mit Hinweis; Übernehmen schreibt das Undo nicht zurück.
 *
 * Menü-Undo über den Menüpunkt im Hauptprozess, per `setImmediate` als eigene Aufgabe (Muster
 * `menuepunktKlicken` in ablauf-13, docs/80 §33 V-130-ci-ablauf13). Daten über `window.wurzelwerk.aufrufen`
 * im Fenster. Zusicherungen an DOM-State und `abfrage:*`-Ergebnisse (kein Log-Datei-Lesen).
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')

const TeilSchema = z.object({ id: z.string(), art: z.string(), wert: z.string() })
const FormSchema = z.object({ id: z.string(), ist_bevorzugt: z.boolean(), sprache: z.string().nullable(), teile: z.array(TeilSchema) })
type Form = z.infer<typeof FormSchema>

test.describe('Ablauf 18 — Reiter Namen: Karten und Modal', () => {
  const einstiegFehlt = !existsSync(HAUPTPROZESS_EINSTIEG)
  if (einstiegFehlt && process.env['CI'] !== undefined) {
    throw new Error(
      'out/main/index.js fehlt im CI-Lauf — das E2E-Gate würde stillschweigend überspringen. ' +
        '`test:e2e` muss zuvor bauen (electron-vite build).',
    )
  }
  test.skip(einstiegFehlt, 'out/main/index.js fehlt — lokal `pnpm test:e2e` (baut selbst) oder vorher `pnpm build`.')
  test.describe.configure({ mode: 'serial' })

  let app: Awaited<ReturnType<typeof electron.launch>>
  let fenster: Awaited<ReturnType<typeof app.firstWindow>>
  let elternordner: string
  let personId: string
  let editor: Locator

  test.beforeAll(async () => {
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-reiter-namen-'))
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
  async function formen(): Promise<readonly Form[]> {
    return z.object({ namen: z.array(FormSchema) }).parse(await aufrufen('abfrage:person.detail', { personId })).namen
  }

  async function nachnamen(): Promise<readonly string[]> {
    return (await formen()).flatMap((form) => form.teile.filter((teil) => teil.art === 'nachname').map((teil) => teil.wert))
  }

  /** Zahl der angewendeten Schritte dieser Person im Verlauf = Tiefe des Undo-Stapels (zurückgenommene und
   * danach verworfene Schritte zählen nicht). */
  async function verlaufAnzahl(): Promise<number> {
    const eintraege = z.array(z.object({ status: z.string() })).parse(await aufrufen('abfrage:journal.verlauf', { grenze: 200, personId }))
    return eintraege.filter((eintrag) => eintrag.status === 'angewendet').length
  }

  /** Klickt einen Menüpunkt im Hauptprozess als eigene Aufgabe der Ereignisschleife (ablauf-13). */
  async function menuepunktKlicken(kuerzel: string): Promise<void> {
    await app.evaluate(({ Menu }, gesucht) => {
      const menue = Menu.getApplicationMenu()
      if (menue === null) throw new Error('kein Anwendungsmenü')
      const eintrag = menue.items.flatMap((oben) => oben.submenu?.items ?? []).find((unten) => unten.accelerator === gesucht)
      if (eintrag === undefined) throw new Error(`Menüpunkt ${gesucht} fehlt`)
      if (!eintrag.enabled) throw new Error(`Menüpunkt ${gesucht} ist deaktiviert`)
      return new Promise<void>((fertig, fehlgeschlagen) => {
        setImmediate(() => {
          try {
            eintrag.click()
            fertig()
          } catch (fehler: unknown) {
            fehlgeschlagen(fehler)
          }
        })
      })
    }, kuerzel)
  }

  function karte(name: string): Locator {
    return editor.getByRole('article', { name, exact: true })
  }

  function modal(titel: 'Namensform bearbeiten' | 'Neue Namensform'): Locator {
    return fenster.getByRole('dialog', { name: titel, exact: true })
  }

  test('Form anlegen, Nachname ändern, Übernehmen; ⌘Z nimmt genau diesen Schritt zurück', async () => {
    test.setTimeout(60_000)
    await app.evaluate(({ dialog }, gewaehlt) => {
      dialog.showOpenDialog = (() => Promise.resolve({ canceled: false, filePaths: [gewaehlt] })) as typeof dialog.showOpenDialog
    }, elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Reiter-Namen-Test')
    await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()
    await expect(fenster.getByRole('table')).toBeVisible()
    personId = z.object({ id: z.string() }).parse(await aufrufen('befehl:person.anlegen', { privat: 0, ist_platzhalter: 0 })).id

    await fenster.locator('.wz-datentabelle__koerper [role="row"]').click()
    await fenster.getByRole('dialog', { name: 'Profil', exact: true }).getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    editor = fenster.getByRole('dialog', { name: 'Person bearbeiten', exact: true })
    await editor.getByRole('tab', { name: /^Namen/ }).click()
    await expect(editor.getByText('Noch keine Namensform erfasst.')).toBeVisible()

    await editor.getByRole('button', { name: '+ Namensform', exact: true }).click()
    const neu = modal('Neue Namensform')
    await neu.getByRole('textbox', { name: /^Vorname/ }).fill('Karl')
    await neu.getByRole('textbox', { name: /^Nachname/ }).fill('Gutnoff')
    await expect(neu.locator('.wz-namensform-modal__vorschau-text')).toHaveText('Karl Gutnoff')
    await neu.getByRole('button', { name: 'Übernehmen', exact: true }).click()
    await expect(neu).toHaveCount(0)
    await expect(karte('Karl Gutnoff')).toBeVisible()
    await expect(editor.getByRole('heading', { level: 1 })).toHaveText('Karl Gutnoff')
    expect(await nachnamen()).toEqual(['Gutnoff'])
    const [angelegt] = await formen()
    const teilIds = angelegt?.teile.map((teil) => teil.id)

    const verlaufVorher = await verlaufAnzahl()
    await karte('Karl Gutnoff').getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    const bearbeiten = modal('Namensform bearbeiten')
    await bearbeiten.getByRole('textbox', { name: /^Nachname/ }).fill('Gutnow')
    await bearbeiten.getByRole('button', { name: 'Übernehmen', exact: true }).click()
    await expect(bearbeiten).toHaveCount(0)
    await expect(karte('Karl Gutnow')).toBeVisible()
    expect(await nachnamen()).toEqual(['Gutnow'])
    // Unveränderte Teile behalten ihre ID (namensteil.aendern statt Neuanlage).
    expect((await formen())[0]?.teile.map((teil) => teil.id)).toEqual(teilIds)
    expect(await verlaufAnzahl()).toBe(verlaufVorher + 1)

    await menuepunktKlicken('CmdOrCtrl+Z')
    await expect(karte('Karl Gutnoff')).toBeVisible()
    await expect.poll(nachnamen).toEqual(['Gutnoff'])
    // Genau dieser Schritt: die Form selbst bleibt, mit denselben Teilen.
    expect(await formen()).toHaveLength(1)
    expect((await formen())[0]?.teile.map((teil) => teil.id)).toEqual(teilIds)
    await expect.poll(verlaufAnzahl).toBe(verlaufVorher)
  })

  test('zehn Tastenanschläge im Modal, dann Übernehmen: genau ein Undo-Schritt, Zähler stimmt', async () => {
    const verlaufVorher = await verlaufAnzahl()
    await karte('Karl Gutnoff').getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    const bearbeiten = modal('Namensform bearbeiten')
    const feld = bearbeiten.getByRole('textbox', { name: /^Nachname/ })
    await feld.click()
    await feld.press('End')
    // Zehn Anschläge: acht Zeichen, Rücktaste, ein Zeichen. Nichts ist geschrieben, bevor übernommen wird.
    await feld.pressSequentially('-Schmidx', { delay: 30 })
    await feld.press('Backspace')
    await feld.press('t')
    await expect(feld).toHaveValue('Gutnoff-Schmidt')
    expect(await verlaufAnzahl()).toBe(verlaufVorher)
    await bearbeiten.getByRole('button', { name: 'Übernehmen', exact: true }).click()
    await expect(karte('Karl Gutnoff-Schmidt')).toBeVisible()
    expect(await verlaufAnzahl()).toBe(verlaufVorher + 1)
    await expect(editor.getByRole('tab', { name: /^Namen/ }).locator('.wz-zaehler')).toHaveText(String((await formen()).length))

    // Ein Undo nimmt alle zehn Anschläge zurück.
    await menuepunktKlicken('CmdOrCtrl+Z')
    await expect(karte('Karl Gutnoff')).toBeVisible()
    await expect.poll(nachnamen).toEqual(['Gutnoff'])
    await expect.poll(verlaufAnzahl).toBe(verlaufVorher)
  })

  test('Hauptname wechseln und Entfernen über die Kartenaktionen', async () => {
    await aufrufen('befehl:namensform.uebernehmen', {
      personId,
      formId: null,
      kopf: { rolle: 'sonstiges', sprache: 'ru', schrift: 'cyrl' },
      teile: [
        { art: 'vorname', wert: 'Карл', istRufname: false },
        { art: 'nachname', wert: 'Гутнов', istRufname: false },
      ],
    })
    await expect(karte('Карл Гутнов')).toBeVisible()
    await expect(editor.getByRole('tab', { name: /^Namen/ }).locator('.wz-zaehler')).toHaveText('2')
    await expect(karte('Karl Gutnoff').getByRole('button', { name: 'Als Hauptname', exact: true })).toHaveCount(0)

    await karte('Карл Гутнов').getByRole('button', { name: 'Als Hauptname', exact: true }).click()
    await expect(editor.getByRole('heading', { level: 1 })).toHaveText('Карл Гутнов')
    await expect.poll(async () => (await formen()).filter((form) => form.ist_bevorzugt).map((form) => form.sprache)).toEqual(['ru'])
    // Kartenfolge E10: der Hauptname steht zuerst.
    await expect(editor.locator('.wz-namensform-karte__titel')).toHaveText(['Карл Гутнов', 'Karl Gutnoff'])

    await karte('Karl Gutnoff').getByRole('button', { name: 'Entfernen', exact: true }).click()
    await expect(karte('Karl Gutnoff')).toHaveCount(0)
    await expect.poll(async () => (await formen()).length).toBe(1)
    await expect(editor.getByRole('tab', { name: /^Namen/ }).locator('.wz-zaehler')).toHaveText('1')
  })

  test('Abbrechen: ohne Änderung sofort, mit Änderung erst nach der Nachfrage', async () => {
    const verlaufVorher = await verlaufAnzahl()
    await karte('Карл Гутнов').getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    const bearbeiten = modal('Namensform bearbeiten')
    await bearbeiten.getByRole('button', { name: 'Abbrechen', exact: true }).click()
    await expect(bearbeiten).toHaveCount(0)
    await expect(fenster.getByRole('alertdialog')).toHaveCount(0)

    await karte('Карл Гутнов').getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    const feld = bearbeiten.getByRole('textbox', { name: /^Nachname/ })
    await feld.fill('Гутнова')
    await feld.press('Escape')
    const nachfrage = fenster.getByRole('alertdialog', { name: 'Änderungen verwerfen?', exact: true })
    await expect(nachfrage).toBeVisible()
    await expect(nachfrage.getByRole('button', { name: 'Weiter bearbeiten', exact: true })).toBeFocused()
    await nachfrage.getByRole('button', { name: 'Weiter bearbeiten', exact: true }).click()
    await expect(nachfrage).toHaveCount(0)
    await expect(feld).toHaveValue('Гутнова')

    await bearbeiten.getByRole('button', { name: 'Abbrechen', exact: true }).click()
    await nachfrage.getByRole('button', { name: 'Verwerfen', exact: true }).click()
    await expect(bearbeiten).toHaveCount(0)
    expect(await nachnamen()).toEqual(['Гутнов'])
    expect(await verlaufAnzahl()).toBe(verlaufVorher)
  })

  test('⌘Z bei offenem Modal verwirft den Entwurf mit Hinweis; Übernehmen schreibt das Undo nicht zurück', async () => {
    await karte('Карл Гутнов').getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    const bearbeiten = modal('Namensform bearbeiten')
    await bearbeiten.getByRole('textbox', { name: /^Nachname/ }).fill('Gutnov')
    await bearbeiten.getByRole('button', { name: 'Übernehmen', exact: true }).click()
    await expect(karte('Карл Gutnov')).toBeVisible()

    await karte('Карл Gutnov').getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    await bearbeiten.getByRole('textbox', { name: /^Vorname/ }).fill('Karl')
    await menuepunktKlicken('CmdOrCtrl+Z')
    await expect(bearbeiten.getByRole('status')).toContainText('Rückgängig')
    await expect(bearbeiten.getByRole('textbox', { name: /^Nachname/ })).toHaveValue('Гутнов')
    await expect(bearbeiten.getByRole('textbox', { name: /^Vorname/ })).toHaveValue('Карл')
    await expect.poll(nachnamen).toEqual(['Гутнов'])

    const verlaufVorher = await verlaufAnzahl()
    await bearbeiten.getByRole('button', { name: 'Übernehmen', exact: true }).click()
    await expect(bearbeiten).toHaveCount(0)
    await expect(karte('Карл Гутнов')).toBeVisible()
    expect(await nachnamen()).toEqual(['Гутнов'])
    expect(await verlaufAnzahl()).toBe(verlaufVorher)
  })

  test('Umschrift bearbeiten: Teil ändern, Übernehmen — umschrift_von und rolle unverändert, genau ein Undo-Schritt', async () => {
    const [haupt] = await formen()
    if (haupt === undefined) throw new Error('Hauptform fehlt')
    const umschriftId = z.object({ id: z.string() }).parse(
      await aufrufen('befehl:namensform.uebernehmen', {
        personId,
        formId: null,
        kopf: { rolle: null, umschriftVon: haupt.id, umschriftNorm: 'iso9', schrift: 'latn' },
        teile: [
          { art: 'vorname', wert: 'Karl', istRufname: false },
          { art: 'nachname', wert: 'Gutnov', istRufname: false },
        ],
      }),
    ).id
    const UmschriftSchema = z.object({ id: z.string(), rolle: z.string().nullable(), umschrift_von: z.string().nullable(), umschrift_norm: z.string().nullable() })
    const umschrift = async (): Promise<z.infer<typeof UmschriftSchema> | undefined> =>
      z.object({ namen: z.array(UmschriftSchema) }).parse(await aufrufen('abfrage:person.detail', { personId })).namen.find((form) => form.id === umschriftId)
    expect(await umschrift()).toEqual({ id: umschriftId, rolle: null, umschrift_von: haupt.id, umschrift_norm: 'iso9' })

    const umschriftKarte = karte('Karl Gutnov')
    await expect(umschriftKarte).toContainText('Umschrift von Карл Гутнов')
    const verlaufVorher = await verlaufAnzahl()
    await umschriftKarte.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    const bearbeiten = modal('Namensform bearbeiten')
    await expect(bearbeiten).toContainText('Umschrift von Карл Гутнов')
    await expect(bearbeiten.getByRole('combobox', { name: 'Namenstyp' })).toHaveCount(0)
    await expect(bearbeiten.getByRole('checkbox')).toHaveCount(0)
    await bearbeiten.getByRole('textbox', { name: /^Nachname/ }).fill('Gutnow')
    await bearbeiten.getByRole('button', { name: 'Übernehmen', exact: true }).click()
    await expect(bearbeiten).toHaveCount(0)
    await expect(karte('Karl Gutnow')).toBeVisible()
    expect(await umschrift()).toEqual({ id: umschriftId, rolle: null, umschrift_von: haupt.id, umschrift_norm: 'iso9' })
    expect(await verlaufAnzahl()).toBe(verlaufVorher + 1)

    await menuepunktKlicken('CmdOrCtrl+Z')
    await expect(karte('Karl Gutnov')).toBeVisible()
    await expect.poll(verlaufAnzahl).toBe(verlaufVorher)
    expect(await umschrift()).toEqual({ id: umschriftId, rolle: null, umschrift_von: haupt.id, umschrift_norm: 'iso9' })
  })
})
