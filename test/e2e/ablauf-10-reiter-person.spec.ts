import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { z } from 'zod'
import { AUTOSAVE_DEBOUNCE_MS } from '../../src/shared/autosave'

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

/** Wartezeit nach jedem bestätigten Schreiben, bevor der nächste Anschlag folgt (wie ablauf-07). */
const RAND_MS = 250

/** Koaleszenz-Fenster des Bus (`src/main/journal/koaleszenz.ts`). */
const KOALESZENZ_FENSTER_MS = 2000

/** Frist je Anschlag bis zum bestätigten Schreiben — Herleitung in ablauf-07 (`SCHREIB_FRIST_MS`). */
const SCHREIB_FRIST_MS = KOALESZENZ_FENSTER_MS - AUTOSAVE_DEBOUNCE_MS - RAND_MS

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

test.describe('Ablauf 10 — Reiter Person: Autosave und Undo', () => {
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

  test('Geburtsdatum: ≤ 1 s gespeichert, Undo stellt zurück; zehn Anschläge < 2 s = ein Undo-Schritt; leeres Feld = zwei Schritte (K)', async () => {
    test.setTimeout(90_000)
    await dialogLiefert(elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Reiter-Person-Test')
    await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()
    await expect(fenster.getByRole('table')).toBeVisible()

    const anlegen = await fenster.evaluate(async () => window.wurzelwerk.aufrufen('befehl:person.anlegen', { privat: 0, ist_platzhalter: 0, lebend_status: 'verstorben' }))
    if (!anlegen.ok) throw new Error('person.anlegen fehlgeschlagen')
    const personId = z.object({ id: z.string() }).parse(anlegen.daten).id
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
    let zuletztGeschrieben: number | null = null
    await datum.click()
    for (const ziffer of ziffern) {
      await datum.press('End')
      await datum.press('Shift+ArrowLeft')
      await datum.press(ziffer)
      await expect.poll(() => gespeicherteDaten(personId, 'geburtsdatum'), { timeout: SCHREIB_FRIST_MS, intervals: [50] }).toEqual([`190${ziffer}`])
      const jetzt = Date.now()
      if (zuletztGeschrieben !== null) expect(jetzt - zuletztGeschrieben).toBeLessThan(KOALESZENZ_FENSTER_MS)
      zuletztGeschrieben = jetzt
      await fenster.waitForTimeout(RAND_MS)
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
})
