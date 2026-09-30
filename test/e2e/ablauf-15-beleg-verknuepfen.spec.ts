import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { z } from 'zod'
import { AUTOSAVE_DEBOUNCE_MS } from '../../src/shared/autosave'

/**
 * AP-1.30 PR 9d (Beleg-Wähler im Reiter Person; B-01/B-02/S-08; docs/80 §33 V-130-9d), langsames
 * Gate über die echte Oberfläche:
 *
 * - Person mit Geburtsdatum-Aussage, Quelle mit Zitat → „Beleg verknüpfen" → Quelle suchen → Zitat
 *   wählen: nach ≤ 1 s steht der Chip da, `person.detail` liefert genau einen Beleg an der Aussage.
 * - Ein Undo nimmt NUR die Verknüpfung zurück; das Zitat bleibt in der Quelle.
 * - Tippen im Datumsfeld (Debounce läuft) und sofort „Beleg verknüpfen": beides ist gespeichert.
 *
 * Undo über `befehl:journal.undo` statt ⌘Z (wie ablauf-07/-10: das Menükürzel ist unter Playwright
 * nicht deterministisch auslösbar; der Kanal ist derselbe Weg, den das Menü nimmt). Zusicherungen an
 * DOM-State und den Abfragen, kein Log-Datei-Lesen.
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')

/** Abnahme: die Verknüpfung erscheint nach ≤ 1 s. */
const SICHTBAR_FRIST_MS = 1000

const BelegeSchema = z.object({
  grunddaten: z.array(
    z.object({
      praedikat: z.string(),
      belegzahl: z.number(),
      aussagen: z.array(
        z.object({
          aussage_id: z.string(),
          datum: z.object({ wert1: z.string().nullable() }).nullable(),
          belege: z.array(z.object({ zitat_id: z.string() })),
        }),
      ),
    }),
  ),
})

test.describe('Ablauf 15 — Reiter Person: Beleg verknüpfen', () => {
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
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-beleg-'))
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

  /** Geburtsdatum-Aussage(n) der Person: Wert und Belege. */
  async function geburtsdatum(personId: string): Promise<{ readonly werte: readonly (string | null)[]; readonly belege: readonly string[]; readonly belegzahl: number }> {
    const ergebnis = await fenster.evaluate(async (id) => window.wurzelwerk.aufrufen('abfrage:person.detail', { personId: id }), personId)
    if (!ergebnis.ok) throw new Error('abfrage:person.detail fehlgeschlagen')
    // `aufrufen()` ist im Preload kanalunabhängig auf `Ergebnis<unknown>` typisiert — per Zod prüfen.
    const feld = BelegeSchema.parse(ergebnis.daten).grunddaten.find((kandidat) => kandidat.praedikat === 'geburtsdatum')
    if (feld === undefined) return { werte: [], belege: [], belegzahl: 0 }
    return {
      werte: feld.aussagen.map((aussage) => aussage.datum?.wert1 ?? null),
      belege: feld.aussagen.flatMap((aussage) => aussage.belege.map((beleg) => beleg.zitat_id)),
      belegzahl: feld.belegzahl,
    }
  }

  async function zitateDerQuelle(quelleId: string): Promise<readonly string[]> {
    const ergebnis = await fenster.evaluate(async (id) => window.wurzelwerk.aufrufen('abfrage:quelle.detail', { quelleId: id }), quelleId)
    if (!ergebnis.ok) throw new Error('abfrage:quelle.detail fehlgeschlagen')
    return z
      .object({ zitate: z.array(z.object({ id: z.string() })) })
      .parse(ergebnis.daten)
      .zitate.map((zitat) => zitat.id)
  }

  async function undo(): Promise<void> {
    const ergebnis = await fenster.evaluate(async () => window.wurzelwerk.aufrufen('befehl:journal.undo', null))
    expect(ergebnis.ok).toBe(true)
  }

  async function befehl(kanal: string, ein: unknown): Promise<string> {
    const ergebnis = await fenster.evaluate(async ([k, e]) => window.wurzelwerk.aufrufen(k, e), [kanal, ein] as const)
    if (!ergebnis.ok) throw new Error(`${kanal} fehlgeschlagen`)
    return z.object({ id: z.string() }).parse(ergebnis.daten).id
  }

  let personId = ''
  let quelleId = ''
  let zitatId = ''

  test('Quelle suchen, Zitat wählen: ≤ 1 s Chip, ein Beleg; ein Undo nimmt nur die Verknüpfung zurück', async () => {
    test.setTimeout(90_000)
    await dialogLiefert(elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Beleg-Test')
    await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()
    await expect(fenster.getByRole('table')).toBeVisible()

    personId = await befehl('befehl:person.anlegen', { privat: 0, ist_platzhalter: 0, lebend_status: 'verstorben' })
    await befehl('befehl:aussage.anlegen', {
      subjektTyp: 'person',
      subjektId: personId,
      praedikat: 'geburtsdatum',
      datum: { kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', wert1: '1901' },
      konfidenz: 3,
    })
    quelleId = await befehl('befehl:quelle.anlegen', { typ: 'kirchenbuch', titel: 'Taufregister Marienwerder' })
    zitatId = await befehl('befehl:zitat.anlegen', { quelleId, seite: '42' })

    const zeile = fenster.locator('.wz-datentabelle__koerper [role="row"]')
    await expect(zeile).toHaveCount(1)
    await zeile.click()
    const profil = fenster.getByRole('dialog', { name: 'Profil', exact: true })
    await profil.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    const editor = fenster.getByRole('dialog', { name: 'Person bearbeiten', exact: true })
    const geburt = editor.getByRole('region', { name: 'Geburt', exact: true })
    await expect(geburt.locator('#person-bearbeiten-feld-geburtsdatum')).toHaveValue('1901')

    await geburt.getByRole('button', { name: 'Beleg verknüpfen', exact: true }).click()
    const schublade = fenster.getByRole('dialog', { name: 'Belege: Geburt', exact: true })
    await schublade.locator('#wz-beleg-waehler-suche').fill('Taufregister')
    await schublade.getByRole('button', { name: /Taufregister Marienwerder/ }).click()
    const zitat = schublade.getByRole('button', { name: 'Seite 42', exact: true })
    await expect(zitat).toBeVisible()

    const vorKlick = Date.now()
    await zitat.click()
    const chip = geburt.locator('.wz-beleg-zeile__chip', { hasText: 'Taufregister Marienwerder, S. 42' })
    await expect(chip).toBeVisible({ timeout: SICHTBAR_FRIST_MS })
    expect(Date.now() - vorKlick).toBeLessThanOrEqual(SICHTBAR_FRIST_MS + 250)
    expect(await geburtsdatum(personId)).toEqual({ werte: ['1901'], belege: [zitatId], belegzahl: 1 })
    // Der Zähler zieht mit, das verknüpfte Zitat verschwindet aus der Auswahl (E9).
    // Erster Zähler der Gruppe = Geburtsdatum (der zweite gehört zum leeren Geburtsort).
    await expect(geburt.locator('.wz-beleg-abzeichen').first()).toHaveText('1')
    await expect(zitat).toHaveCount(0)

    await undo()
    await expect.poll(() => geburtsdatum(personId)).toEqual({ werte: ['1901'], belege: [], belegzahl: 0 })
    await expect(chip).toHaveCount(0)
    expect(await zitateDerQuelle(quelleId)).toEqual([zitatId])
    await expect(schublade.getByRole('button', { name: 'Seite 42', exact: true })).toBeVisible()
    await schublade.getByRole('button', { name: 'Schließen', exact: true }).click()
  })

  test('Tippen im Datumsfeld, sofort „Beleg verknüpfen": Datum und Verknüpfung sind gespeichert', async () => {
    test.setTimeout(60_000)
    const editor = fenster.getByRole('dialog', { name: 'Person bearbeiten', exact: true })
    const geburt = editor.getByRole('region', { name: 'Geburt', exact: true })
    const datum = geburt.locator('#person-bearbeiten-feld-geburtsdatum')
    await datum.click()
    await datum.press('End')
    await datum.press('Shift+ArrowLeft')
    const vorAnschlag = Date.now()
    await datum.press('5')
    await geburt.getByRole('button', { name: 'Beleg verknüpfen', exact: true }).click()
    // Der Klick fiel in den laufenden Debounce — sonst prüfte dieser Fall nichts.
    expect(Date.now() - vorAnschlag).toBeLessThan(AUTOSAVE_DEBOUNCE_MS)

    const schublade = fenster.getByRole('dialog', { name: 'Belege: Geburt', exact: true })
    await schublade.locator('#wz-beleg-waehler-suche').fill('Taufregister')
    await schublade.getByRole('button', { name: /Taufregister Marienwerder/ }).click()
    await schublade.getByRole('button', { name: 'Seite 42', exact: true }).click()

    await expect.poll(() => geburtsdatum(personId)).toEqual({ werte: ['1905'], belege: [zitatId], belegzahl: 1 })
    await expect(geburt.locator('.wz-beleg-zeile__chip', { hasText: 'Taufregister Marienwerder, S. 42' })).toBeVisible()
    await expect(datum).toHaveValue('1905')
  })
})
