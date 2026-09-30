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
      dialog.showOpenDialog = (() => Promise.resolve({ canceled: false, filePaths: [gewaehlt] })) as typeof dialog.showOpenDialog // Testattrappe: liefert nur den Teil der Rückgabe, den der Projektdialog liest
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

/**
 * AP-1.30 PR 11c-2 (A-02): die Fassung des alten Ablaufs 11 für den Reiter „Person". Der Reiter Namen
 * schreibt seit PR 11c-1 nur noch beim Übernehmen; der Reiter Person schreibt den Hauptnamen weiter per
 * Autosave über die flache Brücke (`name.aendern`) — dort entstehen die Zwischenstände, an denen früher der
 * bisherige Rufname als zusätzlicher Vorname angehängt wurde („Karl Fritz Friedrich"). Geprüft über die echte
 * Oberfläche mit Pausen über der Debounce-Frist (jeder Zwischenstand wird geschrieben):
 *
 * 1. Der Rufname markiert den umgeschriebenen Vornamen („Friedrich" → „Fritz"): nichts wird angehängt.
 *    Dass die Markierung dabei heute verloren geht, ist ein Fehler (docs/80 §33 U-130-11c2-rufname-verlust,
 *    Schutz in PR 11e); das Soll sichert der eigene Ablauf unten zu (mit `test.fail()` im Rumpf), nicht dieser.
 * 2. Der Rufname markiert einen ANDEREN Vornamen („Fritz", Karl → Carl umgeschrieben): er bleibt an seiner
 *    Position, nichts wird angehängt.
 */
type App = Awaited<ReturnType<typeof electron.launch>>
type Fenster = Awaited<ReturnType<App['firstWindow']>>

interface Sitzung {
  readonly app: App
  readonly fenster: Fenster
  readonly elternordner: string
}

/** App je `describe` (eigenes Projekt je Ablauf); die Werte gibt es erst ab `beforeAll`. */
function sitzungEinrichten(praefix: string): Sitzung {
  let app: App | undefined
  let fenster: Fenster | undefined
  let elternordner: string | undefined
  test.beforeAll(async () => {
    elternordner = mkdtempSync(join(tmpdir(), praefix))
    app = await electron.launch({ args: [HAUPTPROZESS_EINSTIEG] })
    fenster = await app.firstWindow()
  })
  test.afterAll(async () => {
    await app?.close()
    if (elternordner !== undefined) rmSync(elternordner, { recursive: true, force: true })
  })
  return {
    get app(): App {
      if (app === undefined) throw new Error('Sitzung vor beforeAll benutzt')
      return app
    },
    get fenster(): Fenster {
      if (fenster === undefined) throw new Error('Sitzung vor beforeAll benutzt')
      return fenster
    },
    get elternordner(): string {
      if (elternordner === undefined) throw new Error('Sitzung vor beforeAll benutzt')
      return elternordner
    },
  }
}

function e2eVoraussetzung(): void {
  const einstiegFehlt = !existsSync(HAUPTPROZESS_EINSTIEG)
  if (einstiegFehlt && process.env['CI'] !== undefined) {
    throw new Error(
      'out/main/index.js fehlt im CI-Lauf — das E2E-Gate würde stillschweigend überspringen. ' +
        '`test:e2e` muss zuvor bauen (electron-vite build).',
    )
  }
  test.skip(einstiegFehlt, 'out/main/index.js fehlt — lokal `pnpm test:e2e` (baut selbst) oder vorher `pnpm build`.')
}

async function gespeicherterNameIn(sitzung: Sitzung, personId: string): Promise<z.infer<typeof NameSchema>> {
  const ergebnis = await sitzung.fenster.evaluate(async (id) => window.wurzelwerk.aufrufen('abfrage:person.detail', { personId: id }), personId)
  if (!ergebnis.ok) throw new Error('abfrage:person.detail fehlgeschlagen')
  // `aufrufen()` ist im Preload kanalunabhängig auf `Ergebnis<unknown>` typisiert — per Zod prüfen.
  const name = z.object({ namen: z.array(NameSchema) }).parse(ergebnis.daten).namen[0]
  if (name === undefined) throw new Error('kein Name gespeichert')
  return name
}

/** Fall 1 bis zum Endstand der Oberfläche: Projekt, Person „Karl Friedrich Gutnoff" mit Rufname „Friedrich",
 * im Reiter Person „Friedrich" langsam zu „Fritz" umschreiben (jeder Zwischenstand wird geschrieben). */
async function fallEinsUmschreiben(sitzung: Sitzung, projektname: string) {
  const { app, fenster, elternordner } = sitzung
  await app.evaluate(({ dialog }, gewaehlt) => {
    dialog.showOpenDialog = (() => Promise.resolve({ canceled: false, filePaths: [gewaehlt] })) as typeof dialog.showOpenDialog // Testattrappe: liefert nur den Teil der Rückgabe, den der Projektdialog liest
  }, elternordner)
  await fenster.getByPlaceholder('Projektname').fill(projektname)
  await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()
  await expect(fenster.getByRole('table')).toBeVisible()

  const anlegen = await fenster.evaluate(async () => window.wurzelwerk.aufrufen('befehl:person.anlegen', { privat: 0, ist_platzhalter: 0 }))
  if (!anlegen.ok) throw new Error('person.anlegen fehlgeschlagen')
  const personId = z.object({ id: z.string() }).parse(anlegen.daten).id
  const name = await fenster.evaluate(
    async (id) =>
      window.wurzelwerk.aufrufen('befehl:name.anlegen', { personId: id, typ: 'geburtsname', vornamen: 'Karl Friedrich', rufnameText: 'Friedrich', nachname: 'Gutnoff' }),
    personId,
  )
  expect(name.ok).toBe(true)
  expect(await gespeicherterNameIn(sitzung, personId)).toEqual({ vornamen: 'Karl Friedrich', rufname_text: 'Friedrich', rufname_index: 1 })

  await fenster.locator('.wz-datentabelle__koerper [role="row"]').click()
  await fenster.getByRole('dialog', { name: 'Profil', exact: true }).getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const editor = fenster.getByRole('dialog', { name: 'Person bearbeiten', exact: true })
  await expect(editor.getByRole('tab', { name: /^Person/ })).toHaveAttribute('aria-selected', 'true')
  const vornamen = editor.locator('#person-bearbeiten-hauptname-vornamen')
  const rufname = editor.locator('#person-bearbeiten-hauptname-rufname')
  await expect(vornamen).toHaveValue('Karl Friedrich')
  await expect(rufname.locator('option')).toHaveText(['nicht angegeben', 'Karl', 'Friedrich'])
  await expect(rufname).toHaveValue('1')

  await vornamen.click()
  await vornamen.press('End')
  await vornamen.press('Backspace')
  // Beleg, dass der Ablauf die Zwischenstände wirklich schreibt (sonst prüfte er nichts).
  await expect.poll(async () => (await gespeicherterNameIn(sitzung, personId)).vornamen).toBe('Karl Friedric')
  for (let i = 1; i < 'edrich'.length; i += 1) {
    await vornamen.press('Backspace')
    await fenster.waitForTimeout(AUTOSAVE_DEBOUNCE_MS * 2)
  }
  await vornamen.pressSequentially('tz', { delay: AUTOSAVE_DEBOUNCE_MS * 2 })
  // Nichts angehängt: genau die zwei umgeschriebenen Vornamen.
  await expect.poll(async () => (await gespeicherterNameIn(sitzung, personId)).vornamen).toBe('Karl Fritz')
  await expect(vornamen).toHaveValue('Karl Fritz')
  return { personId, vornamen, rufname }
}

test.describe('Ablauf 11 — Reiter Person: Vornamen langsam umschreiben mit gesetztem Rufnamen', () => {
  e2eVoraussetzung()
  const sitzung = sitzungEinrichten('wurzelwerk-e2e-rufname-person-')

  test('Vornamen im Reiter Person langsam umschreiben hängt den bisherigen Rufnamen nicht an', async () => {
    test.setTimeout(90_000)
    // Fall 1: „Friedrich" (Rufname) → „Fritz" — zugesichert ist nur, dass nichts angehängt wird.
    const { personId, vornamen, rufname } = await fallEinsUmschreiben(sitzung, 'Rufnametest-Person')

    // Fall 2: Rufname „Fritz" wählen, dann „Karl" → „Carl" langsam: der Rufname bleibt an Position 1.
    await rufname.selectOption({ label: 'Fritz' })
    await expect.poll(async () => gespeicherterNameIn(sitzung, personId)).toEqual({ vornamen: 'Karl Fritz', rufname_text: 'Fritz', rufname_index: 1 })
    await vornamen.click()
    // Pfeiltasten statt Home: Home setzt die Einfügemarke unter macOS nicht an den Anfang.
    for (let i = 0; i < 'Karl Fritz'.length; i += 1) await vornamen.press('ArrowLeft')
    await vornamen.press('Delete')
    await expect.poll(async () => (await gespeicherterNameIn(sitzung, personId)).vornamen).toBe('arl Fritz')
    await sitzung.fenster.waitForTimeout(AUTOSAVE_DEBOUNCE_MS * 2)
    await vornamen.pressSequentially('C', { delay: AUTOSAVE_DEBOUNCE_MS * 2 })
    await vornamen.blur()
    await expect.poll(async () => gespeicherterNameIn(sitzung, personId)).toEqual({ vornamen: 'Carl Fritz', rufname_text: 'Fritz', rufname_index: 1 })
    await expect(rufname).toHaveValue('1')
  })
})

/**
 * U-130-11c2-rufname-verlust (docs/80 §33, Befund für PR 11e): nach Fall 1 muss der Rufname am umgeschriebenen
 * Vornamen bleiben („Fritz", Position 1). Heute verliert die flache Brücke die Markierung
 * (`rufnameFuerAenderung`: der Rufname „Friedrich" gleicht im ersten Zwischenstand keinem Vornamen mehr).
 * Der Test sichert das SOLL zu. `test.fail()` steht erst im Rumpf, direkt vor der Soll-Zusicherung: ein Fehler
 * in `beforeAll` oder im Aufbau (`fallEinsUmschreiben`) bleibt rot, nur das verfehlte Soll gilt als erwartet;
 * ein erfülltes Soll wird rot („Expected to fail, but passed"). 11e entfernt den `test.fail()`-Aufruf im Rumpf;
 * die Erwartung bleibt.
 */
test.describe('Ablauf 11 — Reiter Person: Rufname bleibt am umgeschriebenen Vornamen (bekannter Fehler)', () => {
  e2eVoraussetzung()
  const sitzung = sitzungEinrichten('wurzelwerk-e2e-rufname-verlust-')

  test('U-130-11c2-rufname-verlust: nach „Friedrich" → „Fritz" bleibt der Rufname „Fritz" an Position 1', async () => {
    test.setTimeout(90_000)
    const { personId, rufname } = await fallEinsUmschreiben(sitzung, 'Rufnametest-Verlust')
    // Bekannter Fehler U-130-11c2-rufname-verlust (Befund für 11e): ab hier ist ein Fehlschlag erwartet.
    test.fail()
    await expect.poll(async () => gespeicherterNameIn(sitzung, personId)).toEqual({ vornamen: 'Karl Fritz', rufname_text: 'Fritz', rufname_index: 1 })
    await expect(rufname).toHaveValue('1')
  })
})

