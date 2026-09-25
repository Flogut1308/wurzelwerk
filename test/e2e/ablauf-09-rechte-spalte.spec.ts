import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { z } from 'zod'
import { AUTOSAVE_DEBOUNCE_MS } from '../../src/shared/autosave'

/**
 * AP-1.30 (PR 8), langsames Gate: rechte Spalte „Zustand" von „Person bearbeiten" (Artboard 1a)
 * über die echte Oberfläche, bei 1280 px Fensterbreite.
 *
 * - Vollständigkeit: Zeilen = `person.detail.kernangaben.aufschluesselung` (Id, Zustand,
 *   Reihenfolge), Prozentwert = `kernangaben.prozent` — die Spalte rechnet nichts selbst (ADR-031).
 * - Offene Punkte: Klick wählt den Reiter des Punkts und setzt den Fokus (Feld, sonst Inhaltsbereich).
 * - Verlauf: nach einer Änderung steht ein neuer Eintrag oben, Import ohne Dateipfad.
 * - Bei 1000 px keine Spalte (Overlay erst mit PR 15).
 *
 * Zusicherungen an DOM-State und `abfrage:*`-Ergebnisse (kein Log-Datei-Lesen, ENOENT-Flake).
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')
const FIXTURE_ERNA_WALTER = join(__dirname, '../../fixtures/import/v1/gueltig/eigenstaendig/import-erna-und-walter-wruck.json')

const detailSchema = z.object({
  kernangaben: z
    .object({
      prozent: z.number(),
      aufschluesselung: z.array(z.object({ id: z.string(), zustand: z.string() })),
    })
    .nullable(),
  offene_punkte: z.array(z.object({ reiter: z.string(), feld: z.string() })),
})

test.describe('Ablauf 09 — Person bearbeiten: rechte Spalte', () => {
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
  let emulation: Awaited<ReturnType<ReturnType<typeof fenster.context>['newCDPSession']>> | undefined

  test.beforeAll(async () => {
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-rechte-spalte-'))
    app = await electron.launch({ args: [HAUPTPROZESS_EINSTIEG] })
    fenster = await app.firstWindow()
    await fenster.waitForLoadState('load')
  })

  test.afterAll(async () => {
    await app.close()
    rmSync(elternordner, { recursive: true, force: true })
  })

  /** Ansichtsgröße über CDP emulieren statt das Fenster zu vergrößern: 1280×800 passt nicht auf den
   * Bildschirm des macOS-CI-Runners (macOS klemmt das Fenster, `innerWidth` erreicht 1280 nie —
   * Referenzbilder-Lauf 36194961731, `bildvergleich.spec.ts`). Die Emulation ist bildschirmunabhängig. */
  async function fensterbreite(breite: number, hoehe: number): Promise<void> {
    // Sitzung offen lassen: die Emulation gilt nur, solange ihre CDP-Sitzung verbunden ist.
    emulation ??= await fenster.context().newCDPSession(fenster)
    await emulation.send('Emulation.setDeviceMetricsOverride', { width: breite, height: hoehe, deviceScaleFactor: 0, mobile: false })
    await fenster.waitForFunction((groesse) => window.innerWidth === groesse.breite && window.innerHeight === groesse.hoehe, { breite, hoehe })
  }

  test('Vollständigkeit = Daten, Sprung zu offenem Punkt, Verlauf nach Änderung, keine Spalte bei 1000 px', async () => {
    test.setTimeout(90_000)
    await fensterbreite(1280, 800)
    await app.evaluate(({ dialog }, gewaehlt) => {
      dialog.showOpenDialog = (() => Promise.resolve({ canceled: false, filePaths: [gewaehlt] })) as typeof dialog.showOpenDialog
    }, elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Rechte Spalte')
    await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()
    await expect(fenster.getByRole('table')).toBeVisible()
    const importErgebnis = await fenster.evaluate(async (pfad) => window.wurzelwerk.aufrufen('befehl:import.ausfuehren', { pfad }), FIXTURE_ERNA_WALTER)
    expect(importErgebnis).toMatchObject({ ok: true })

    await fenster.locator('[role="row"]:has-text("Walter Wruck")').click()
    const profil = fenster.getByRole('dialog', { name: 'Profil', exact: true })
    await profil.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    const editor = fenster.getByRole('dialog', { name: 'Person bearbeiten', exact: true })
    await expect(editor).toBeVisible()

    const liste = await fenster.evaluate(async () =>
      window.wurzelwerk.aufrufen('abfrage:person.liste', {
        sortierung: 'nachname',
        richtung: 'auf',
        seite: 1,
        proSeite: 50,
        filter: { platzhalter: 'alle', privat: 'alle', nurWiderspruch: false },
      }),
    )
    const listeSchema = z.object({ ok: z.literal(true), daten: z.object({ zeilen: z.array(z.object({ person_id: z.string(), anzeigename: z.string() })) }) })
    const walterId = listeSchema.parse(liste).daten.zeilen.find((zeile) => zeile.anzeigename === 'Walter Wruck')?.person_id
    if (walterId === undefined) throw new Error('Walter nicht gefunden')
    const detailRoh = await fenster.evaluate(async (id) => window.wurzelwerk.aufrufen('abfrage:person.detail', { personId: id }), walterId)
    if (!detailRoh.ok) throw new Error('abfrage:person.detail fehlgeschlagen')
    const detail = detailSchema.parse(detailRoh.daten)
    const kernangaben = detail.kernangaben
    if (kernangaben === null) throw new Error('Walter ist kein Platzhalter — kernangaben erwartet')

    // Vollständigkeit: Zeilen und Prozent aus der Abfrage.
    const spalte = editor.getByRole('complementary', { name: 'Zustand der Person' })
    await expect(spalte).toBeVisible()
    const zeilen = spalte.locator('[data-kernangabe]')
    await expect(zeilen).toHaveCount(kernangaben.aufschluesselung.length)
    const gezeigt = await zeilen.evaluateAll((elemente) => elemente.map((e) => [e.getAttribute('data-kernangabe'), e.getAttribute('data-zustand')]))
    expect(gezeigt).toEqual(kernangaben.aufschluesselung.map((e) => [e.id, e.zustand]))
    await expect(spalte.getByText(`${String(kernangaben.prozent)} %`, { exact: true })).toBeVisible()
    await expect(spalte).not.toContainText('der Kernangaben belegt')

    // Verlauf: der Import steht als ein Eintrag, ohne Dateipfad.
    const verlauf = spalte.locator('.wz-editor-rechte-spalte__verlauf-eintrag')
    await expect(verlauf.first()).toContainText('Import')
    await expect(spalte).not.toContainText('.json')

    // Offener Punkt: Klick wählt den Reiter und setzt den Fokus.
    const erster = detail.offene_punkte[0]
    if (erster === undefined) throw new Error('Walter hat offene Punkte erwartet (Mutter fehlt / Kind ohne Partnerschaft)')
    await expect(spalte.locator('.wz-editor-rechte-spalte__punkt')).toHaveCount(detail.offene_punkte.length)
    await spalte.locator('.wz-editor-rechte-spalte__punkt').first().click()
    const reiterDom = erster.reiter.replace(/_/g, '-')
    await expect(editor.locator(`#person-bearbeiten-reiter-${reiterDom}`)).toHaveAttribute('aria-selected', 'true')
    const fokusId = await fenster.evaluate(() => document.activeElement?.id ?? '')
    expect([`person-bearbeiten-feld-${erster.feld}`, `person-bearbeiten-inhalt-${reiterDom}`]).toContain(fokusId)

    // Nach einer Änderung (Notiz) steht ein neuer Eintrag oben.
    const vorher = await verlauf.count()
    await editor.getByRole('tab', { name: /^Notizen/ }).click()
    const notiz = editor.getByRole('textbox', { name: 'Notiz', exact: true })
    await notiz.fill('Bergmann auf Zollverein')
    await expect(verlauf.first()).toContainText('Personenfeld geändert', { timeout: AUTOSAVE_DEBOUNCE_MS * 20 })
    await expect(verlauf.first().locator('.wz-editor-rechte-spalte__zeit')).toHaveText('gerade eben')
    expect(await verlauf.count()).toBeGreaterThanOrEqual(Math.min(vorher + 1, 3))

    // Unter 1100 px keine Spalte.
    await fensterbreite(1000, 600)
    await expect(spalte).toBeHidden()
  })
})
