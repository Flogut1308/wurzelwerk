import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { z } from 'zod'
import { AUTOSAVE_DEBOUNCE_MS } from '../../src/shared/autosave'
import { KOALESZENZ_FENSTER_MS, KoaleszenzTakt, POLL_INTERVALL_MS, SCHREIB_FRIST_MS } from './koaleszenz-takt'

/**
 * AP-1.30 PR 9b (Reiter „Person"), langsames Gate über die echte Oberfläche:
 *
 * - Abnahme „Feldänderung ≤ 1 s gespeichert und ⌘Z stellt sie zurück" am vorhandenen Geburtsdatum.
 * - Abnahme „je Reiter … zehn Tastenanschläge in < 2 s = ein Undo-Schritt" am vorhandenen
 *   Geburtsdatum (Muster `ablauf-07-autosave-koaleszenz.spec.ts`: jeder Anschlag wird einzeln
 *   geschrieben, der Abstand zweier Schreibvorgänge bleibt unter dem Koaleszenz-Fenster).
 * - K (docs/80 §33 V-130-9-entscheidungen): erstes Schreiben in ein leeres Feld legt an, eine
 *   Folgeänderung ändert — zwei Undo-Schritte, festgehalten.
 *
 * Undo über `befehl:journal.undo` statt ⌘Z (wie ablauf-07: das Menükürzel ist unter Playwright nicht
 * deterministisch auslösbar; der Kanal ist derselbe Weg, den das Menü nimmt). Zusicherungen an
 * DOM-State und `abfrage:person.detail`, kein Log-Datei-Lesen.
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')

/**
 * Reserve über das Koaleszenz-Fenster hinaus, wenn ein Schritt BEWUSST nicht mit dem vorigen
 * verschmelzen soll (`KOALESZENZ_FENSTER_MS + RAND_MS` warten). Der Takt der Anschlagfolgen selbst
 * steht in `./koaleszenz-takt.ts`.
 */
const RAND_MS = 250

/** Abnahme 1a: „Feldänderung erscheint nach ≤ 1 s als ‚Gespeichert'". */
const GESPEICHERT_FRIST_MS = 1000

const DetailSchema = z.object({
  grunddaten: z.array(
    z.object({
      praedikat: z.string(),
      aussagen: z.array(z.object({ aussage_id: z.string(), datum: z.object({ wert1: z.string().nullable() }).nullable() })),
    }),
  ),
})

/** Modifikator und Originaltext der Datumsgruppe (U-130-9b-unlesbar). */
const EtwaSchema = z.object({
  grunddaten: z.array(
    z.object({
      praedikat: z.string(),
      aussagen: z.array(z.object({ datum: z.object({ modifikator: z.string().nullable(), originaltext: z.string().nullable() }).nullable() })),
    }),
  ),
})

test.describe('Ablauf 10 — Reiter Person: Autosave und Undo', () => {
  // Der Fall „unlesbares Datum" setzt den offenen Editor aus dem ersten Fall fort.
  test.describe.configure({ mode: 'serial' })
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
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-reiter-person-'))
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

  /** `wert1` der Datumsgruppen aller Aussagen eines Prädikats (leer = keine Aussage). */
  async function gespeicherteDaten(personId: string, praedikat: string): Promise<readonly (string | null)[]> {
    const ergebnis = await fenster.evaluate(async (id) => window.wurzelwerk.aufrufen('abfrage:person.detail', { personId: id }), personId)
    if (!ergebnis.ok) throw new Error('abfrage:person.detail fehlgeschlagen')
    // `aufrufen()` ist im Preload kanalunabhängig auf `Ergebnis<unknown>` typisiert — per Zod prüfen.
    const daten = DetailSchema.parse(ergebnis.daten)
    return daten.grunddaten.filter((feld) => feld.praedikat === praedikat).flatMap((feld) => feld.aussagen.map((aussage) => aussage.datum?.wert1 ?? null))
  }

  async function undo(): Promise<void> {
    const ergebnis = await fenster.evaluate(async () => window.wurzelwerk.aufrufen('befehl:journal.undo', null))
    expect(ergebnis.ok).toBe(true)
  }

  let personIdGemerkt: string | null = null

  test('Geburtsdatum: ≤ 1 s gespeichert, Undo stellt zurück; zehn Anschläge < 2 s = ein Undo-Schritt; leeres Feld = zwei Schritte (K)', async () => {
    test.setTimeout(90_000)
    await dialogLiefert(elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Reiter-Person-Test')
    await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()
    await expect(fenster.getByRole('table')).toBeVisible()

    const anlegen = await fenster.evaluate(async () => window.wurzelwerk.aufrufen('befehl:person.anlegen', { privat: 0, ist_platzhalter: 0, lebend_status: 'verstorben' }))
    if (!anlegen.ok) throw new Error('person.anlegen fehlgeschlagen')
    const personId = z.object({ id: z.string() }).parse(anlegen.daten).id
    personIdGemerkt = personId
    const geburt = await fenster.evaluate(
      async (id) =>
        window.wurzelwerk.aufrufen('befehl:aussage.anlegen', {
          subjektTyp: 'person',
          subjektId: id,
          praedikat: 'geburtsdatum',
          datum: { kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', wert1: '1901' },
          konfidenz: 3,
        }),
      personId,
    )
    expect(geburt.ok).toBe(true)

    const zeile = fenster.locator('.wz-datentabelle__koerper [role="row"]')
    await expect(zeile).toHaveCount(1)
    await zeile.click()
    const profil = fenster.getByRole('dialog', { name: 'Profil', exact: true })
    await profil.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    const editor = fenster.getByRole('dialog', { name: 'Person bearbeiten', exact: true })
    await expect(editor.getByRole('tab', { name: /^Person/ })).toHaveAttribute('aria-selected', 'true')

    const datum = editor.locator('#person-bearbeiten-feld-geburtsdatum')
    await expect(datum).toHaveValue('1901')

    // 1) Eine Feldänderung ist nach ≤ 1 s gespeichert (Kopf „Gespeichert", Datenbank), Undo stellt zurück.
    await datum.click()
    await datum.press('End')
    await datum.press('Shift+ArrowLeft')
    const vorAnschlag = Date.now()
    await datum.press('5')
    await expect(editor.getByRole('status')).toHaveText('Gespeichert · gerade eben', { timeout: GESPEICHERT_FRIST_MS })
    await expect.poll(() => gespeicherteDaten(personId, 'geburtsdatum'), { timeout: GESPEICHERT_FRIST_MS, intervals: [25] }).toEqual(['1905'])
    expect(Date.now() - vorAnschlag).toBeLessThanOrEqual(GESPEICHERT_FRIST_MS + 250)
    await undo()
    await expect.poll(() => gespeicherteDaten(personId, 'geburtsdatum')).toEqual(['1901'])
    await expect(datum).toHaveValue('1901')

    // Das Fenster der Koaleszenz muss abgelaufen sein, sonst verschmölze das Folgende mit Schritt 1.
    await fenster.waitForTimeout(KOALESZENZ_FENSTER_MS + RAND_MS)

    // 2) Zehn einzeln geschriebene Anschläge (Abstand < 2 s) = ein Undo-Schritt. Jeder Anschlag ersetzt
    //    die letzte Ziffer des Jahres (markiert per Umschalt+Links), so bleibt jeder Stand ein Datum.
    expect(SCHREIB_FRIST_MS).toBeGreaterThan(AUTOSAVE_DEBOUNCE_MS)
    const ziffern = ['2', '3', '4', '5', '6', '7', '8', '9', '0', '2']
    const takt = new KoaleszenzTakt(fenster, personId)
    await datum.click()
    for (const ziffer of ziffern) {
      await datum.press('End')
      await datum.press('Shift+ArrowLeft')
      await datum.press(ziffer)
      await expect.poll(() => gespeicherteDaten(personId, 'geburtsdatum'), { timeout: SCHREIB_FRIST_MS, intervals: [POLL_INTERVALL_MS] }).toEqual([`190${ziffer}`])
      await takt.geschrieben()
    }
    await expect(datum).toHaveValue('1902')
    await undo()
    await expect.poll(() => gespeicherteDaten(personId, 'geburtsdatum')).toEqual(['1901'])
    await expect(datum).toHaveValue('1901')

    // 3) K: leeres Todesdatum — das erste Schreiben legt an, die Folgeänderung ändert; zwei Undo-Schritte.
    const tod = editor.locator('#person-bearbeiten-feld-todesdatum')
    await expect(tod).toHaveValue('')
    await tod.click()
    await tod.pressSequentially('1970')
    await expect.poll(() => gespeicherteDaten(personId, 'todesdatum'), { timeout: SCHREIB_FRIST_MS * 2 }).toEqual(['1970'])
    // Lesemodell nachgeladen (das Feld ist jetzt eine bestehende Angabe), dann ändern.
    await expect(editor.getByRole('radiogroup', { name: 'Sicherheit: Todesdatum', exact: true }).getByRole('radio', { checked: true })).toHaveCount(1)
    await tod.press('End')
    await tod.press('Shift+ArrowLeft')
    await tod.press('1')
    await expect.poll(() => gespeicherteDaten(personId, 'todesdatum'), { timeout: SCHREIB_FRIST_MS * 2 }).toEqual(['1971'])
    await undo()
    await expect.poll(() => gespeicherteDaten(personId, 'todesdatum')).toEqual(['1970'])
    await undo()
    await expect.poll(() => gespeicherteDaten(personId, 'todesdatum')).toEqual([])
    await expect(tod).toHaveValue('')
    // Das Geburtsdatum blieb von den beiden Undo-Schritten unberührt.
    expect(await gespeicherteDaten(personId, 'geburtsdatum')).toEqual(['1901'])
  })

  /**
   * AP-1.30 U-130-9b-unlesbar (docs/80 §33 V-130-unlesbar, Entscheidung B): ein nicht auflösbares
   * Datum geht nicht still verloren — Status „Nicht gespeichert — Datum nicht lesbar", „Fertig" fragt
   * nach, „Zurück zum Feld" behält die Eingabe, „Als ‚etwa 1788‘ …" speichert vertragsgültig mit dem
   * getippten Text als Originaltext und schließt den Editor.
   */
  test('unlesbares Datum: Status, Nachfrage bei „Fertig", als „etwa 1788" mit Originaltext speichern', async () => {
    const personId = personIdGemerkt
    if (personId === null) throw new Error('Der vorige Fall hat keine Person angelegt.')
    const editor = fenster.getByRole('dialog', { name: 'Person bearbeiten', exact: true })
    const datum = editor.locator('#person-bearbeiten-feld-geburtsdatum')
    await expect(datum).toHaveValue('1901')

    await datum.fill('31.02.1788')
    await expect(editor.getByRole('status')).toHaveText('Nicht gespeichert — Datum nicht lesbar')

    const fertig = editor.getByRole('button', { name: 'Fertig', exact: true })
    await fertig.click()
    const nachfrage = fenster.getByRole('alertdialog')
    await expect(nachfrage).toBeVisible()
    await expect(editor).toBeVisible()
    await nachfrage.getByRole('button', { name: 'Zurück zum Feld', exact: true }).click()
    await expect(nachfrage).toHaveCount(0)
    await expect(datum).toBeFocused()
    await expect(datum).toHaveValue('31.02.1788')
    expect(await gespeicherteDaten(personId, 'geburtsdatum')).toEqual(['1901'])

    await fertig.click()
    await nachfrage.getByRole('button', { name: 'Als ‚etwa 1788‘ mit Originaltext speichern', exact: true }).click()
    await expect(editor).toHaveCount(0)
    await expect.poll(() => gespeicherteDaten(personId, 'geburtsdatum')).toEqual(['1788'])
    const ergebnis = await fenster.evaluate(async (id) => window.wurzelwerk.aufrufen('abfrage:person.detail', { personId: id }), personId)
    if (!ergebnis.ok) throw new Error('abfrage:person.detail fehlgeschlagen')
    const gruppe = EtwaSchema.parse(ergebnis.daten).grunddaten.find((feld) => feld.praedikat === 'geburtsdatum')?.aussagen[0]?.datum
    expect(gruppe).toEqual({ modifikator: 'etwa', originaltext: '31.02.1788' })
  })
})

/** Hauptname (bevorzugte Form) und Kurzbeschreibungen aus `abfrage:person.detail` (PR 9c). */
const HauptnameSchema = z.object({
  kopf: z.object({ anzeigename: z.string() }),
  namen: z.array(z.object({ ist_bevorzugt: z.boolean(), vornamen: z.string().nullable(), nachname: z.string().nullable(), original_text: z.string().nullable() })),
  grunddaten: z.array(z.object({ praedikat: z.string(), aussagen: z.array(z.object({ wert_text: z.string().nullable() })) })),
})

/**
 * AP-1.30 PR 9c (Gruppe „Hauptname", docs/80 §33 V-130-9c), eigenes Projekt: Abnahme „Feldänderung
 * ≤ 1 s gespeichert", „zehn Anschläge < 2 s = ein Undo-Schritt" und „Undo stellt zurück" am Vornamen
 * des Hauptnamens (über die Namensbrücke, Koaleszenz je Vertragsfeld); E10 „tippen und sofort den
 * Reiter wechseln"; K an der Kurzbeschreibung (leeres Feld: anlegen + ändern = zwei Undo-Schritte,
 * danach koaleszierend). Der Hauptname trägt eine wortgetreue Schreibung (`original_text`), die jede
 * Änderung übersteht; der Kopf zeigt trotzdem den geänderten Vornamen (E7).
 */
test.describe('Ablauf 10 — Reiter Person: Hauptname und Kurzbeschreibung', () => {
  test.describe.configure({ mode: 'serial' })
  const einstiegFehlt = !existsSync(HAUPTPROZESS_EINSTIEG)
  test.skip(einstiegFehlt, 'out/main/index.js fehlt — lokal `pnpm test:e2e` (baut selbst) oder vorher `pnpm build`.')

  let app: Awaited<ReturnType<typeof electron.launch>>
  let fenster: Awaited<ReturnType<typeof app.firstWindow>>
  let elternordner: string
  let personId = ''

  test.beforeAll(async () => {
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-reiter-person-hauptname-'))
    app = await electron.launch({ args: [HAUPTPROZESS_EINSTIEG] })
    fenster = await app.firstWindow()
  })

  test.afterAll(async () => {
    await app.close()
    rmSync(elternordner, { recursive: true, force: true })
  })

  async function detail(): Promise<z.infer<typeof HauptnameSchema>> {
    const ergebnis = await fenster.evaluate(async (id) => window.wurzelwerk.aufrufen('abfrage:person.detail', { personId: id }), personId)
    if (!ergebnis.ok) throw new Error('abfrage:person.detail fehlgeschlagen')
    return HauptnameSchema.parse(ergebnis.daten)
  }

  async function hauptname(): Promise<{ readonly vornamen: string | null; readonly nachname: string | null; readonly original_text: string | null } | undefined> {
    return (await detail()).namen.find((name) => name.ist_bevorzugt)
  }

  async function vornamen(): Promise<string | null | undefined> {
    return (await hauptname())?.vornamen
  }

  async function kurzbeschreibungen(): Promise<readonly (string | null)[]> {
    return (await detail()).grunddaten.filter((feld) => feld.praedikat === 'kurzbeschreibung').flatMap((feld) => feld.aussagen.map((aussage) => aussage.wert_text))
  }

  async function undo(): Promise<void> {
    const ergebnis = await fenster.evaluate(async () => window.wurzelwerk.aufrufen('befehl:journal.undo', null))
    expect(ergebnis.ok).toBe(true)
  }

  const WORTGETREU = 'Carl Gutnoff (lt. Taufbuch)'

  test('Vorname im Reiter Person: ≤ 1 s gespeichert, zehn Anschläge < 2 s = ein Undo-Schritt, Undo stellt zurück', async () => {
    test.setTimeout(90_000)
    await app.evaluate(({ dialog }, gewaehlt) => {
      dialog.showOpenDialog = (() => Promise.resolve({ canceled: false, filePaths: [gewaehlt] })) as typeof dialog.showOpenDialog
    }, elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Reiter-Person-Hauptname')
    await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()
    await expect(fenster.getByRole('table')).toBeVisible()

    const anlegen = await fenster.evaluate(async () => window.wurzelwerk.aufrufen('befehl:person.anlegen', { privat: 0, ist_platzhalter: 0, lebend_status: 'lebend' }))
    if (!anlegen.ok) throw new Error('person.anlegen fehlgeschlagen')
    personId = z.object({ id: z.string() }).parse(anlegen.daten).id
    const name = await fenster.evaluate(
      async ({ id, originalText }) => window.wurzelwerk.aufrufen('befehl:name.anlegen', { personId: id, typ: 'geburtsname', vornamen: 'Karl', nachname: 'Gutnoff', originalText }),
      { id: personId, originalText: WORTGETREU },
    )
    expect(name.ok).toBe(true)

    const zeile = fenster.locator('.wz-datentabelle__koerper [role="row"]')
    await expect(zeile).toHaveCount(1)
    await zeile.click()
    const profil = fenster.getByRole('dialog', { name: 'Profil', exact: true })
    await profil.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    const editor = fenster.getByRole('dialog', { name: 'Person bearbeiten', exact: true })
    await expect(editor.getByRole('tab', { name: /^Person/ })).toHaveAttribute('aria-selected', 'true')
    await expect(editor.getByRole('heading', { name: 'Hauptname', exact: true, level: 2 })).toBeVisible()

    const feld = editor.locator('#person-bearbeiten-hauptname-vornamen')
    await expect(feld).toHaveValue('Karl')

    // 1) Eine Änderung ist nach ≤ 1 s gespeichert, Undo stellt zurück.
    await feld.click()
    await feld.press('End')
    await feld.press('Shift+ArrowLeft')
    const vorAnschlag = Date.now()
    await feld.press('a')
    await expect(editor.getByRole('status')).toHaveText('Gespeichert · gerade eben', { timeout: GESPEICHERT_FRIST_MS })
    await expect.poll(vornamen, { timeout: GESPEICHERT_FRIST_MS, intervals: [25] }).toBe('Kara')
    expect(Date.now() - vorAnschlag).toBeLessThanOrEqual(GESPEICHERT_FRIST_MS + 250)
    // E7: der Kopf zeigt den geänderten Vornamen, die wortgetreue Schreibung bleibt gespeichert.
    await expect(editor.getByRole('heading', { level: 1 })).toContainText('Kara Gutnoff')
    expect((await hauptname())?.original_text).toBe(WORTGETREU)
    await undo()
    await expect.poll(vornamen).toBe('Karl')
    await expect(feld).toHaveValue('Karl')

    await fenster.waitForTimeout(KOALESZENZ_FENSTER_MS + RAND_MS)

    // 2) Zehn einzeln geschriebene Anschläge (Abstand < 2 s) = ein Undo-Schritt.
    const buchstaben = ['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']
    const takt = new KoaleszenzTakt(fenster, personId)
    await feld.click()
    for (const buchstabe of buchstaben) {
      await feld.press('End')
      await feld.press('Shift+ArrowLeft')
      await feld.press(buchstabe)
      await expect.poll(vornamen, { timeout: SCHREIB_FRIST_MS, intervals: [POLL_INTERVALL_MS] }).toBe(`Kar${buchstabe}`)
      await takt.geschrieben()
    }
    await expect(feld).toHaveValue('Kark')
    await undo()
    await expect.poll(vornamen).toBe('Karl')
    await expect(feld).toHaveValue('Karl')
    const nachUndo = await hauptname()
    expect(nachUndo?.original_text).toBe(WORTGETREU)
    expect(nachUndo?.nachname).toBe('Gutnoff')
  })

  test('E10: tippen und sofort den Reiter wechseln — der Entwurf ist geschrieben', async () => {
    const editor = fenster.getByRole('dialog', { name: 'Person bearbeiten', exact: true })
    const nachname = editor.locator('#person-bearbeiten-hauptname-nachname')
    await expect(nachname).toHaveValue('Gutnoff')
    await nachname.fill('Gutnow')
    await editor.getByRole('tab', { name: /^Namen/ }).click()
    await expect.poll(async () => (await hauptname())?.nachname, { timeout: GESPEICHERT_FRIST_MS }).toBe('Gutnow')
    await editor.getByRole('tab', { name: /^Person/ }).click()
    await expect(editor.locator('#person-bearbeiten-hauptname-nachname')).toHaveValue('Gutnow')
  })

  test('Kurzbeschreibung in leeres Feld: zwei Undo-Schritte, dann koaleszierend', async () => {
    test.setTimeout(60_000)
    await fenster.waitForTimeout(KOALESZENZ_FENSTER_MS + RAND_MS)
    const editor = fenster.getByRole('dialog', { name: 'Person bearbeiten', exact: true })
    const feld = editor.locator('#person-bearbeiten-feld-kurzbeschreibung')
    await expect(feld).toHaveValue('')

    // Erstes Schreiben legt an …
    await feld.click()
    await feld.pressSequentially('Schmied')
    await expect.poll(kurzbeschreibungen, { timeout: SCHREIB_FRIST_MS * 2 }).toEqual(['Schmied'])
    await fenster.waitForTimeout(RAND_MS)

    // … jede Folgeänderung ändert DIESE Aussage; drei Anschläge in < 2 s fassen sich zusammen.
    const takt = new KoaleszenzTakt(fenster, personId)
    let erwartet = 'Schmied'
    for (const taste of ['Space', 'i', 'n']) {
      await feld.press(taste)
      erwartet += taste === 'Space' ? ' ' : taste
      await expect.poll(kurzbeschreibungen, { timeout: SCHREIB_FRIST_MS, intervals: [POLL_INTERVALL_MS] }).toEqual([erwartet])
      await takt.geschrieben()
    }
    await expect(feld).toHaveValue('Schmied in')

    await undo()
    await expect.poll(kurzbeschreibungen).toEqual(['Schmied'])
    await undo()
    await expect.poll(kurzbeschreibungen).toEqual([])
    await expect(feld).toHaveValue('')
    // Der Hauptname blieb von beiden Undo-Schritten unberührt.
    expect((await hauptname())?.nachname).toBe('Gutnow')
  })
})
