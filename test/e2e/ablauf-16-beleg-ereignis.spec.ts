import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { z } from 'zod'

/**
 * AP-1.30 PR 9d-2 (Beleg verknüpfen an Werten aus einem Ereignis; B-02; docs/80 §33 V-130-9d2),
 * langsames Gate über die echte Oberfläche:
 *
 * - Person mit Geburt NUR als Ereignis (Datum, kein Ort) → „Beleg verknüpfen" → Quelle suchen → Zitat
 *   wählen: Chip und Zähler am Ereigniswert stehen da, `person.detail.ereignis_existenz` liefert den
 *   Beleg an der Existenz-Aussage des Ereignisses mit `feld = 'datum'` (F1).
 * - Ein Undo nimmt NUR die Verknüpfung zurück; das Zitat bleibt in der Quelle.
 *
 * Undo über `befehl:journal.undo` statt ⌘Z (wie ablauf-07/-10/-15: das Menükürzel ist unter
 * Playwright nicht deterministisch auslösbar; der Kanal ist derselbe Weg, den das Menü nimmt).
 * Zusicherungen an DOM-State und den Abfragen, kein Log-Datei-Lesen.
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')

const ExistenzSchema = z.object({
  ereignis_existenz: z.array(
    z.object({
      ereignis_id: z.string(),
      aussage_id: z.string(),
      belege: z.array(z.object({ zitat_id: z.string(), feld: z.string().nullable() })),
    }),
  ),
})

test.describe('Ablauf 16 — Reiter Person: Beleg verknüpfen an einem Ereigniswert', () => {
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
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-beleg-ereignis-'))
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

  async function existenz(personId: string): Promise<z.infer<typeof ExistenzSchema>['ereignis_existenz']> {
    const ergebnis = await fenster.evaluate(async (id) => window.wurzelwerk.aufrufen('abfrage:person.detail', { personId: id }), personId)
    if (!ergebnis.ok) throw new Error('abfrage:person.detail fehlgeschlagen')
    // `aufrufen()` ist im Preload kanalunabhängig auf `Ergebnis<unknown>` typisiert — per Zod prüfen.
    return ExistenzSchema.parse(ergebnis.daten).ereignis_existenz
  }

  async function zitateDerQuelle(quelleId: string): Promise<readonly string[]> {
    const ergebnis = await fenster.evaluate(async (id) => window.wurzelwerk.aufrufen('abfrage:quelle.detail', { quelleId: id }), quelleId)
    if (!ergebnis.ok) throw new Error('abfrage:quelle.detail fehlgeschlagen')
    return z
      .object({ zitate: z.array(z.object({ id: z.string() })) })
      .parse(ergebnis.daten)
      .zitate.map((zitat) => zitat.id)
  }

  async function befehl(kanal: string, ein: unknown): Promise<string> {
    const ergebnis = await fenster.evaluate(async ([k, e]) => window.wurzelwerk.aufrufen(k, e), [kanal, ein] as const)
    if (!ergebnis.ok) throw new Error(`${kanal} fehlgeschlagen`)
    return z.object({ id: z.string() }).parse(ergebnis.daten).id
  }

  test('Geburt nur als Ereignis: Zitat wählen → Chip, Zähler, Beleg an der Existenz-Aussage mit feld datum; Undo entfernt ihn', async () => {
    test.setTimeout(90_000)
    await dialogLiefert(elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Beleg-Ereignis-Test')
    await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()
    await expect(fenster.getByRole('table')).toBeVisible()

    const personId = await befehl('befehl:person.anlegen', { privat: 0, ist_platzhalter: 0, lebend_status: 'lebend' })
    const ereignisId = await befehl('befehl:ereignis.anlegen', {
      typ: 'geburt',
      datum: { modifikator: 'exakt', praezision: 'jahr', wert1: '1850' },
      beteiligungen: [{ personId, rolle: 'kind' }],
      konfidenz: 3,
    })
    const quelleId = await befehl('befehl:quelle.anlegen', { typ: 'kirchenbuch', titel: 'Taufregister Marienwerder' })
    const zitatId = await befehl('befehl:zitat.anlegen', { quelleId, seite: '42' })

    const vorher = await existenz(personId)
    expect(vorher).toHaveLength(1)
    expect(vorher[0]).toMatchObject({ ereignis_id: ereignisId, belege: [] })
    const aussageId = vorher[0]?.aussage_id ?? ''

    const zeile = fenster.locator('.wz-datentabelle__koerper [role="row"]')
    await expect(zeile).toHaveCount(1)
    await zeile.click()
    const profil = fenster.getByRole('dialog', { name: 'Profil', exact: true })
    await profil.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    const editor = fenster.getByRole('dialog', { name: 'Person bearbeiten', exact: true })
    const geburt = editor.getByRole('region', { name: 'Geburt', exact: true })
    // Gesperrter Ereigniswert mit Herkunft, Zähler 0.
    await expect(geburt.getByText('aus dem Ereignis Geburt', { exact: true })).toBeVisible()
    const zaehler = geburt.locator('.wz-beleg-abzeichen').first()
    await expect(zaehler).toHaveText('0')

    await geburt.getByRole('button', { name: 'Beleg verknüpfen', exact: true }).click()
    const schublade = fenster.getByRole('dialog', { name: 'Belege: Geburt', exact: true })
    await expect(schublade.getByText('Geburtsdatum stammt aus dem Ereignis – der Beleg wird am Ereignis verknüpft.', { exact: true })).toBeVisible()
    await schublade.locator('#wz-beleg-waehler-suche').fill('Taufregister')
    await schublade.getByRole('button', { name: /Taufregister Marienwerder/ }).click()
    const zitat = schublade.getByRole('button', { name: 'Seite 42', exact: true })
    await expect(zitat).toBeVisible()
    await zitat.click()

    const chip = geburt.locator('.wz-beleg-zeile__chip', { hasText: 'Taufregister Marienwerder, S. 42' })
    await expect(chip).toBeVisible()
    await expect(zaehler).toHaveText('1')
    await expect(zitat).toHaveCount(0)
    expect(await existenz(personId)).toEqual([{ ereignis_id: ereignisId, aussage_id: aussageId, belege: [{ zitat_id: zitatId, feld: 'datum' }] }])
    // Die Schublade listet den Beleg am Ereigniswert mit „Verknüpfung entfernen".
    await expect(schublade.getByText('1850 · aus dem Ereignis Geburt', { exact: true })).toBeVisible()
    await expect(schublade.getByRole('button', { name: 'Verknüpfung entfernen', exact: true })).toHaveCount(1)

    const undo = await fenster.evaluate(async () => window.wurzelwerk.aufrufen('befehl:journal.undo', null))
    expect(undo.ok).toBe(true)
    await expect.poll(() => existenz(personId)).toEqual([{ ereignis_id: ereignisId, aussage_id: aussageId, belege: [] }])
    await expect(chip).toHaveCount(0)
    await expect(zaehler).toHaveText('0')
    expect(await zitateDerQuelle(quelleId)).toEqual([zitatId])
    await expect(schublade.getByRole('button', { name: 'Seite 42', exact: true })).toBeVisible()
    await schublade.getByRole('button', { name: 'Schließen', exact: true }).click()
  })
})
