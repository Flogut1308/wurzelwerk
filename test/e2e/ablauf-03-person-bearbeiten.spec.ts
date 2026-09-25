import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

/**
 * AP-1.14a (S-20, erste echte Schreibmaske), langsames Gate (nicht Teil von `pnpm pruefe`),
 * Muster `ablauf-02-profil.spec.ts`: frisches Projekt, eine Person OHNE Namen über die
 * IPC-Brücke anlegen (`befehl:person.anlegen`, `namen: []` — es gibt noch keine Import-/
 * Anlege-Ansicht für Personen), Liste lädt, Zeile klicken → Profil, „Bearbeiten", einen Namen
 * ERGÄNZEN (Vor-/Nachname, über die echte Oberfläche) → der neue Name wird zum EINZIGEN
 * `name`-Datensatz dieser Person und damit `person_flach.anzeigename` — im Lesezweig ("Fertig")
 * sichtbar als H1. Zuletzt Undo über die IPC-Brücke → Zustand davor (Name wieder weg, H1 wieder
 * leer).
 *
 * Zusicherungen an DOM-State (kein Log-Datei-Lesen, ENOENT-Flake auf frischem Runner,
 * `docs/80_Offene_Fragen.md`); hover-/fokus-deterministisch (kein Hover-Zustand geprüft).
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')

test.describe('Ablauf 03 — Person bearbeiten (Kernfelder)', () => {
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
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-person-bearbeiten-'))
    app = await electron.launch({ args: [HAUPTPROZESS_EINSTIEG] })
    fenster = await app.firstWindow()
  })

  test.afterAll(async () => {
    await app.close()
    rmSync(elternordner, { recursive: true, force: true })
  })

  /** Stubbt den nativen Ordnerdialog im Hauptprozess (AP-1.26, Muster `ablauf-02-profil.spec.ts`). */
  async function dialogLiefert(pfad: string): Promise<void> {
    await app.evaluate(({ dialog }, gewaehlt) => {
      dialog.showOpenDialog = (() => Promise.resolve({ canceled: false, filePaths: [gewaehlt] })) as typeof dialog.showOpenDialog
    }, pfad)
  }

  test('Bearbeiten-Zustand: Namen ergänzen, im Lesezweig sichtbar, Undo nimmt es zurück', async () => {
    // Start-Ansicht: neues Projekt anlegen (echte Oberfläche, wie ablauf-01/ablauf-02).
    await dialogLiefert(elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Bearbeitentest')
    await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()
    await expect(fenster.getByRole('table')).toBeVisible()

    // Person OHNE Namen über die IPC-Brücke anlegen (keine Anlege-Ansicht für Personen in diesem
    // Auftrag) — `person_flach.anzeigename` ist darum zunächst `''` (TRIM zweier NULL-Spalten).
    const anlegenErgebnis = await fenster.evaluate(
      async () => window.wurzelwerk.aufrufen('befehl:person.anlegen', { privat: 0, ist_platzhalter: 0 }),
    )
    expect(anlegenErgebnis.ok).toBe(true)

    // `ereignis:datenGeaendert` invalidiert den Query-Cache — die Liste lädt von selbst, genau
    // eine Datenzeile (der Körper-`rowgroup`, NICHT die Kopfzeile — beide tragen `role="row"`).
    const zeile = fenster.locator('.wz-datentabelle__koerper [role="row"]')
    await expect(zeile).toHaveCount(1)

    await zeile.click()
    const profil = fenster.getByRole('dialog', { name: 'Profil', exact: true })
    await expect(profil).toBeVisible()
    // Leerer Anzeigename: die Überschrift zeigt den Ersatztext (AP-1.30 PR 2, §32 V-4-ohne-namen).
    await expect(profil.getByRole('heading', { level: 1 })).toHaveText('(ohne Namen)')

    // In den Editor wechseln — seit AP-1.30 PR 7b eine EIGENE Ansicht (docs/80 §33
    // V-130-7-ansicht): der Dialog „Person bearbeiten" ersetzt die Lesesicht, die Lesesicht ist
    // solange nicht im Dokument (kein zweiter, verdeckter Dialog).
    await profil.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    const editor = fenster.getByRole('dialog', { name: 'Person bearbeiten', exact: true })
    await expect(editor).toBeVisible()
    await expect(profil).toHaveCount(0)
    await expect(editor.getByRole('button', { name: 'Fertig', exact: true })).toBeVisible()
    await expect(editor.getByText('Änderungen werden sofort gespeichert.')).toBeVisible()
    await expect(editor.getByRole('heading', { level: 1 })).toHaveText('(ohne Namen)')

    // Namen ergänzen im Reiter „Namen": das feste "neuen Namen erfassen"-Formular (die Person hat
    // noch KEINE Namenszeile, darum ist es das EINZIGE Vorkommen dieser Beschriftungen im Dialog).
    await editor.getByRole('tab', { name: /^Namen/ }).click()
    await editor.getByLabel('Vorname(n)', { exact: true }).fill('Minna')
    await editor.getByLabel('Nachname', { exact: true }).fill('Muster')
    const hinzufuegen = editor.getByRole('button', { name: 'Name hinzufügen', exact: true })
    await expect(hinzufuegen).toBeEnabled()
    await hinzufuegen.click()

    // `befehl:name.anlegen` committet sofort (kein Speichern-Knopf) — nach der `ereignis:
    // datenGeaendert`-Invalidierung erscheint die neue Zeile in der Namensliste.
    await expect(editor.locator('input[value="Minna"]')).toBeVisible()
    await expect(editor.locator('input[value="Muster"]')).toBeVisible()

    // Zurück in die Lesesicht — KEIN eigener "Namen"-Abschnitt dort (AP-1.14a-Scope), aber die
    // Person hat jetzt GENAU eine Namenszeile: sie wird `person_flach.anzeigename` und damit die
    // H1 der Profilseite. Das ist "neuer Name in der Lesesicht sichtbar" (derselbe
    // `usePersonDetail`-Schlüssel speist beide Ansichten, kein zweiter Datenweg).
    await editor.getByRole('button', { name: 'Fertig', exact: true }).click()
    await expect(editor).toHaveCount(0)
    await expect(profil.getByRole('heading', { name: 'Minna Muster', level: 1 })).toBeVisible()

    // Undo über die IPC-Brücke (keine Menü-Tastenkürzel-Simulation nötig/deterministisch genug in
    // Electron+Playwright) — nimmt die letzte rücknehmbare Transaktion zurück (`name.anlegen`),
    // NICHT `person.anlegen` davor.
    const undoErgebnis = await fenster.evaluate(async () => window.wurzelwerk.aufrufen('befehl:journal.undo', null))
    expect(undoErgebnis.ok).toBe(true)

    // Zustand vorher: keine Namenszeile mehr, die H1 zeigt wieder den Ersatztext. Die Zeilenzahl in
    // der Liste bleibt bei 1 (die Person selbst ist nicht zurückgenommen worden).
    await expect(profil.getByRole('heading', { level: 1 })).toHaveText('(ohne Namen)')
    await expect(zeile).toHaveCount(1)
  })
})
