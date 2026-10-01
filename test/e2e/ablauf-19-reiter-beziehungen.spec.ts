import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type Locator } from '@playwright/test'
import { z } from 'zod'

/**
 * A-07, C-26, AP-1.30 PR 12c (docs/80 §33 V-130-12-*), langsames Gate: der Reiter „Beziehungen" über die
 * echte App. Szenario: Paul (P) mit Vater, Mutter, Vollgeschwister Anna, Halbgeschwister Hans (über eine
 * zweite Mutter), Partnerin Maria (Q), Kind Karl von P und Q, Kind Klara nur von P.
 *
 * - Gruppen und Beschriftungen, Reiterzähler (verschiedene Personen ohne Geschwister) und Punkt.
 * - Typwechsel einer Kante und ⌘Z: die Notiz der Kante bleibt (`elternschaft.aendern` ersetzt die Zeile).
 * - Zwei Typwechsel = zwei Undo-Schritte (kein Textfeld, keine Koaleszenz).
 * - Klaras Kante und die Partnerschaft mit Maria trennen: beide Personen bleiben abfragbar, die Beziehung
 *   ist weg, ⌘Z stellt sie her; Abbrechen ändert nichts.
 *
 * Menü-Undo über den Menüpunkt im Hauptprozess, per `setImmediate` als eigene Aufgabe (Muster
 * `menuepunktKlicken` in ablauf-13/18, docs/80 §33 V-130-ci-ablauf13). Daten über `window.wurzelwerk.aufrufen`
 * im Fenster. Zusicherungen an DOM-State und `abfrage:*`-Ergebnisse (kein Log-Datei-Lesen).
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')

const DetailSchema = z.object({
  beziehungen: z.array(
    z.object({ person_id: z.string(), richtung: z.string(), kante_id: z.string(), kantentyp: z.string(), kante_notiz: z.string().nullable() }),
  ),
  geschwister: z.array(z.object({ person_id: z.string(), art: z.string() })),
  partnerschaften: z.array(z.object({ id: z.string(), partner_ids: z.array(z.string()), kind_ids: z.array(z.string()) })),
  kinder_ohne_partnerschaft: z.array(z.string()),
})
type Detail = z.infer<typeof DetailSchema>

test.describe('Ablauf 19 — Reiter Beziehungen: Gruppen, Typwechsel, Trennen', () => {
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
  let editor: Locator
  const ids = { p: '', vater: '', mutter: '', anna: '', hans: '', maria: '', karl: '', klara: '' }

  test.beforeAll(async () => {
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-reiter-beziehungen-'))
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

  async function neuePerson(vornamen: string, nachname: string, geschlecht: 'M' | 'F'): Promise<string> {
    const id = z.object({ id: z.string() }).parse(await aufrufen('befehl:person.anlegen', { privat: 0, ist_platzhalter: 0, geschlecht })).id
    await aufrufen('befehl:name.anlegen', { personId: id, typ: 'geburtsname', vornamen, nachname })
    return id
  }

  async function detail(personId: string = ids.p): Promise<Detail> {
    return DetailSchema.parse(await aufrufen('abfrage:person.detail', { personId }))
  }

  /** Die Elternkante von P zu `elternteilId` (genau eine im Szenario). */
  async function elternKante(elternteilId: string): Promise<Detail['beziehungen'][number]> {
    const kante = (await detail()).beziehungen.find((b) => b.richtung === 'elternteil' && b.person_id === elternteilId)
    if (kante === undefined) throw new Error('Elternkante fehlt')
    return kante
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

  const abschnitt = (name: 'Eltern' | 'Partnerschaften' | 'Geschwister'): Locator => editor.getByRole('region', { name, exact: true })
  const typFeld = (name: string): Locator => editor.getByRole('combobox', { name: `Art der Verbindung zu ${name}`, exact: true })
  const trennenKnopf = (name: string): Locator => editor.getByRole('button', { name: `Trennen: ${name}`, exact: true })
  const trennenModal = (): Locator => fenster.getByRole('dialog', { name: 'Verbindung trennen?', exact: true })
  const reiter = (): Locator => editor.getByRole('tab', { name: /^Beziehungen/ })

  test('Szenario anlegen, Reiter öffnen: Gruppen, Beschriftungen, Zähler und Punkt', async () => {
    test.setTimeout(90_000)
    await app.evaluate(({ dialog }, gewaehlt) => {
      dialog.showOpenDialog = (() => Promise.resolve({ canceled: false, filePaths: [gewaehlt] })) as typeof dialog.showOpenDialog
    }, elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Reiter-Beziehungen-Test')
    await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()
    await expect(fenster.getByRole('table')).toBeVisible()

    ids.p = await neuePerson('Paul', 'Gutnoff', 'M')
    ids.vater = await neuePerson('Friedrich', 'Gutnoff', 'M')
    ids.mutter = await neuePerson('Emma', 'Wruck', 'F')
    const zweiteMutter = await neuePerson('Berta', 'Klein', 'F')
    ids.anna = await neuePerson('Anna', 'Gutnoff', 'F')
    ids.hans = await neuePerson('Hans', 'Gutnoff', 'M')
    ids.maria = await neuePerson('Maria', 'Quast', 'F')
    ids.karl = await neuePerson('Karl', 'Gutnoff', 'M')
    ids.klara = await neuePerson('Klara', 'Gutnoff', 'F')

    const eltern = async (elternteilId: string, kindId: string, notiz?: string): Promise<void> => {
      await aufrufen('befehl:elternschaft.anlegen', { elternteilId, kindId, typ: 'biologisch', konfidenz: 3, ...(notiz === undefined ? {} : { notiz }) })
    }
    await eltern(ids.vater, ids.p, 'laut Taufbuch')
    await eltern(ids.mutter, ids.p)
    await eltern(ids.vater, ids.anna)
    await eltern(ids.mutter, ids.anna)
    await eltern(ids.vater, ids.hans)
    await eltern(zweiteMutter, ids.hans)
    await aufrufen('befehl:partnerschaft.anlegen', { typ: 'ehe_zivil', beteiligte: [{ personId: ids.p }, { personId: ids.maria }], konfidenz: 3 })
    await eltern(ids.p, ids.karl)
    await eltern(ids.maria, ids.karl)
    await eltern(ids.p, ids.klara)

    const stand = await detail()
    expect(stand.geschwister.map((g) => [g.person_id, g.art]).sort()).toEqual(
      [
        [ids.anna, 'voll'],
        [ids.hans, 'halb'],
      ].sort(),
    )
    expect(stand.kinder_ohne_partnerschaft).toEqual([ids.klara])

    await fenster.locator('[role="row"]:has-text("Paul Gutnoff")').click()
    await fenster.getByRole('dialog', { name: 'Profil', exact: true }).getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    editor = fenster.getByRole('dialog', { name: 'Person bearbeiten', exact: true })
    await reiter().click()
    await expect(reiter()).toHaveAttribute('aria-selected', 'true')

    // Eltern: Vater und Mutter besetzt, kein offener Platz.
    await expect(abschnitt('Eltern').getByRole('listitem')).toHaveCount(2)
    await expect(abschnitt('Eltern').getByRole('listitem').first()).toContainText('Vater')
    await expect(abschnitt('Eltern').getByRole('listitem').first()).toContainText('Friedrich Gutnoff')
    await expect(abschnitt('Eltern').getByRole('listitem').nth(1)).toContainText('Mutter')
    await expect(abschnitt('Eltern').getByRole('listitem').nth(1)).toContainText('Emma Wruck')
    await expect(abschnitt('Eltern')).not.toContainText('nicht zugeordnet')

    // Partnerschaften: Karte mit Maria und Karl darunter; Klara ohne Partnerschaft mit Hinweis.
    const karte = abschnitt('Partnerschaften').locator('.wz-reiter-beziehungen__karte')
    await expect(karte).toHaveCount(1)
    await expect(karte).toContainText('Maria Quast')
    await expect(karte).toContainText('Ehe (standesamtlich)')
    await expect(karte).toContainText('Kind aus dieser Verbindung · 1')
    await expect(karte).toContainText('Karl Gutnoff')
    const ohne = abschnitt('Partnerschaften').locator('.wz-reiter-beziehungen__kinder-ohne')
    await expect(ohne).toContainText('Kinder ohne Partnerschaft')
    await expect(ohne).toContainText('Klara Gutnoff')
    await expect(ohne).toContainText('Klara Gutnoff ist als Kind erfasst, gehört aber zu keiner Partnerschaft.')

    // Geschwister: abgeleitet, ohne Bedienelemente, Art als Text.
    const geschwister = abschnitt('Geschwister')
    await expect(geschwister).toContainText('aus Beziehung abgeleitet')
    await expect(geschwister.getByRole('listitem')).toHaveCount(2)
    await expect(geschwister.getByRole('listitem').filter({ hasText: 'Anna Gutnoff' })).toContainText('Vollgeschwister')
    await expect(geschwister.getByRole('listitem').filter({ hasText: 'Hans Gutnoff' })).toContainText('Halbgeschwister')
    await expect(geschwister.getByRole('button')).toHaveCount(0)
    await expect(geschwister.getByRole('combobox')).toHaveCount(0)

    // „+ Beziehung" ist gesperrt und nennt den Grund.
    await expect(editor.getByRole('button', { name: '+ Beziehung', exact: true })).toBeDisabled()
    await expect(editor).toContainText('kommt mit „Person anlegen“')

    // Zähler: Vater, Mutter, Maria, Karl, Klara (Geschwister zählen nicht); Punkt: Kind ohne Partnerschaft.
    await expect(reiter().locator('.wz-zaehler')).toHaveText('5')
    await expect(reiter().locator('.wz-reiterleiste__punkt')).toHaveCount(1)
  })

  test('Typwechsel einer Kante: die Notiz bleibt, ⌘Z nimmt genau diesen Schritt zurück', async () => {
    const vorher = await elternKante(ids.vater)
    expect(vorher).toMatchObject({ kantentyp: 'biologisch', kante_notiz: 'laut Taufbuch' })

    await typFeld('Friedrich Gutnoff').selectOption('adoptiv')
    await expect.poll(async () => (await elternKante(ids.vater)).kantentyp).toBe('adoptiv')
    expect((await elternKante(ids.vater)).kante_notiz).toBe('laut Taufbuch')
    await expect(typFeld('Friedrich Gutnoff')).toHaveValue('adoptiv')

    await menuepunktKlicken('CmdOrCtrl+Z')
    await expect.poll(async () => (await elternKante(ids.vater)).kantentyp).toBe('biologisch')
    expect((await elternKante(ids.vater)).kante_notiz).toBe('laut Taufbuch')
    await expect(typFeld('Friedrich Gutnoff')).toHaveValue('biologisch')
  })

  test('zwei Typwechsel sind zwei Undo-Schritte', async () => {
    await typFeld('Friedrich Gutnoff').selectOption('adoptiv')
    await expect.poll(async () => (await elternKante(ids.vater)).kantentyp).toBe('adoptiv')
    await typFeld('Friedrich Gutnoff').selectOption('stief')
    await expect.poll(async () => (await elternKante(ids.vater)).kantentyp).toBe('stief')

    await menuepunktKlicken('CmdOrCtrl+Z')
    await expect.poll(async () => (await elternKante(ids.vater)).kantentyp).toBe('adoptiv')
    await menuepunktKlicken('CmdOrCtrl+Z')
    await expect.poll(async () => (await elternKante(ids.vater)).kantentyp).toBe('biologisch')
    expect((await elternKante(ids.vater)).kante_notiz).toBe('laut Taufbuch')
  })

  test('Abbrechen im Trennen-Modal ändert nichts', async () => {
    const vorher = await detail()
    await trennenKnopf('Klara Gutnoff').click()
    const modal = trennenModal()
    await expect(modal).toContainText('Nur die Verbindung zwischen Paul Gutnoff und Klara Gutnoff wird getrennt')
    await expect(modal).toContainText('bleiben erhalten')
    await modal.getByRole('button', { name: 'Abbrechen', exact: true }).click()
    await expect(modal).toHaveCount(0)
    expect(await detail()).toEqual(vorher)
    await expect(abschnitt('Partnerschaften')).toContainText('Klara Gutnoff')

    // Auch Escape schreibt nichts.
    await trennenKnopf('Klara Gutnoff').click()
    await expect(modal).toBeVisible()
    await fenster.keyboard.press('Escape')
    await expect(modal).toHaveCount(0)
    expect(await detail()).toEqual(vorher)
  })

  test('Klaras Kante trennen: beide Personen bleiben, die Beziehung ist weg, ⌘Z stellt sie her', async () => {
    await trennenKnopf('Klara Gutnoff').click()
    await trennenModal().getByRole('button', { name: 'Verbindung trennen', exact: true }).click()
    await expect(trennenModal()).toHaveCount(0)

    await expect(abschnitt('Partnerschaften')).not.toContainText('Klara Gutnoff')
    await expect(abschnitt('Partnerschaften').locator('.wz-reiter-beziehungen__kinder-ohne')).toHaveCount(0)
    const nach = await detail()
    expect(nach.beziehungen.some((b) => b.person_id === ids.klara)).toBe(false)
    expect(nach.kinder_ohne_partnerschaft).toEqual([])
    // Beide Personen sind weiter abfragbar (aufrufen wirft bei einem Fehlschlag).
    expect((await detail(ids.klara)).beziehungen.some((b) => b.person_id === ids.p)).toBe(false)
    await expect(reiter().locator('.wz-zaehler')).toHaveText('4')

    await menuepunktKlicken('CmdOrCtrl+Z')
    await expect(abschnitt('Partnerschaften')).toContainText('Klara Gutnoff')
    expect((await detail()).kinder_ohne_partnerschaft).toEqual([ids.klara])
    expect((await detail(ids.klara)).beziehungen.some((b) => b.person_id === ids.p && b.richtung === 'elternteil')).toBe(true)
    await expect(reiter().locator('.wz-zaehler')).toHaveText('5')
  })

  test('Partnerschaft mit Maria trennen: beide Personen bleiben, Karl wandert zu den Kindern ohne Partnerschaft, ⌘Z stellt her', async () => {
    await trennenKnopf('Maria Quast').click()
    await expect(trennenModal()).toContainText('Nur die Verbindung zwischen Paul Gutnoff und Maria Quast wird getrennt')
    await trennenModal().getByRole('button', { name: 'Verbindung trennen', exact: true }).click()
    await expect(trennenModal()).toHaveCount(0)

    await expect(abschnitt('Partnerschaften').locator('.wz-reiter-beziehungen__karte')).toHaveCount(0)
    await expect(abschnitt('Partnerschaften').locator('.wz-reiter-beziehungen__kinder-ohne')).toContainText('Karl Gutnoff')
    const nach = await detail()
    expect(nach.partnerschaften).toEqual([])
    expect(nach.beziehungen.some((b) => b.richtung === 'partner')).toBe(false)
    expect((await detail(ids.maria)).partnerschaften).toEqual([])
    expect((await detail(ids.karl)).beziehungen.some((b) => b.person_id === ids.p)).toBe(true)

    await menuepunktKlicken('CmdOrCtrl+Z')
    const karte = abschnitt('Partnerschaften').locator('.wz-reiter-beziehungen__karte')
    await expect(karte).toContainText('Maria Quast')
    await expect(karte).toContainText('Karl Gutnoff')
    const wieder = await detail()
    expect(wieder.partnerschaften).toHaveLength(1)
    expect(wieder.partnerschaften[0]?.partner_ids).toEqual([ids.maria])
    expect(wieder.partnerschaften[0]?.kind_ids).toEqual([ids.karl])
  })
})
