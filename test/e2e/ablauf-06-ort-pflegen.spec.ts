import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

/**
 * AP-1.16 PR-C (docs/71_Designsystem.md §3.2), langsames Gate (nicht Teil von `pnpm pruefe`),
 * Muster `ablauf-05-ereignis-erfassen.spec.ts`: frisches Projekt, eine Person über die IPC-Brücke
 * anlegen, Profil → „Bearbeiten" → im Ereignis-Neu-Formular über das `Ortsfeld` einen neuen Ort
 * anlegen ("Marienwerder") → über den kontextuellen „Ort bearbeiten"-Link die Orte-Pflege-Ansicht
 * öffnen → dort einen zweiten (späteren) Namen mit Gültigkeit ("Kwidzyn", ab 9.5.1945) erfassen,
 * den bestehenden Namen ("Marienwerder") auf "bis 8.5.1945" begrenzen, je eine politische UND eine
 * kirchliche Zugehörigkeit sowie eine externe Kennung hinzufügen → zurück im `Ortsfeld`: ein
 * Ereignisdatum VOR 1945 gesetzt, nach "Kwidzyn" gesucht (historischer Name) — der Vorschlag zeigt
 * trotzdem den 1850 gültigen Namen "Marienwerder" MIT der politischen Hierarchiezeile.
 *
 * Zusicherungen an DOM-State (kein Log-Datei-Lesen, ENOENT-Flake auf frischem Runner,
 * `docs/80_Offene_Fragen.md`); hover-/fokus-deterministisch (kein Hover-Zustand geprüft). Der
 * bestehende Namenseintrag wird über `useEntwurfMitVerzoegertemCommit` debounced committet (600ms,
 * `profil-bearbeiten-debounce.ts`) — statt eines willkürlichen `waitForTimeout` schließt dieser
 * Test die Schublade (Unmount-Flush, hueter-Auflage AP-1.14a #1) und öffnet sie erneut, EIN
 * deterministischer React-Lebenszyklus-Schritt statt einer Zeitspanne.
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')

test.describe('Ablauf 06 — Ort pflegen (Namen, Zugehörigkeit, externe Kennung)', () => {
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
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-ort-pflegen-'))
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

  test('Ort über die Pflege-Ansicht anreichern, datumsgültiger Name wird korrekt angezeigt', async () => {
    // Mehr Schritte als ablauf-02/03, ähnlich ablauf-05 — der Playwright-Standardwert von 30s
    // reicht knapp nicht (Muster `bildvergleich.spec.ts`/`ablauf-05-ereignis-erfassen.spec.ts`).
    test.setTimeout(60_000)

    // Start-Ansicht: neues Projekt anlegen (echte Oberfläche, wie ablauf-01/02/03/05).
    await dialogLiefert(elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Ortpflegetest')
    await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()
    await expect(fenster.getByRole('table')).toBeVisible()

    // Person OHNE Namen über die IPC-Brücke anlegen (keine Anlege-Ansicht für Personen in diesem
    // Auftrag, Muster `ablauf-03-person-bearbeiten.spec.ts`).
    const anlegenErgebnis = await fenster.evaluate(async () => window.wurzelwerk.aufrufen('befehl:person.anlegen', { privat: 0, ist_platzhalter: 0 }))
    expect(anlegenErgebnis.ok).toBe(true)

    const zeile = fenster.locator('.wz-datentabelle__koerper [role="row"]')
    await expect(zeile).toHaveCount(1)
    await zeile.click()

    const profil = fenster.getByRole('dialog', { name: 'Profil', exact: true })
    await expect(profil).toBeVisible()
    await profil.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    await expect(profil.getByRole('button', { name: 'Fertig', exact: true })).toBeVisible()

    // Ereignis-Neu-Formular: einen neuen Ort "Marienwerder" anlegen (Muster ablauf-05).
    const ereignisFelder = profil.locator('.wz-profil-bearbeiten-ereignisse__felder')
    await ereignisFelder.locator('.wz-ortsfeld input').fill('Marienwerder')
    const ortNeuAnlegenZeile = profil.locator('.wz-ortsfeld__zeile--neuAnlegen')
    await expect(ortNeuAnlegenZeile).toBeVisible()
    await ortNeuAnlegenZeile.click()

    // Der kontextuelle Einstiegspunkt (docs/80_Offene_Fragen.md): erst NACH der Ortsauswahl
    // erreichbar, KEIN globaler Header-„Orte"-Eintrag.
    const ortBearbeitenLink = ereignisFelder.getByRole('button', { name: 'Ort bearbeiten', exact: true })
    await expect(ortBearbeitenLink).toBeVisible()
    await ortBearbeitenLink.click()

    let ortSchublade = fenster.getByRole('dialog', { name: 'Ort bearbeiten', exact: true })
    await expect(ortSchublade).toBeVisible()

    // Namen-Abschnitt: genau eine Zeile ("Marienwerder", der primäre Name aus `ort.anlegen`).
    const namenAbschnitt = ortSchublade.locator('.wz-ort-bearbeiten__abschnitt', { hasText: 'Namen' }).first()
    await expect(namenAbschnitt.locator('.wz-ort-bearbeiten__zeile')).toHaveCount(1)

    // Zweiten Namen "Kwidzyn" MIT Gültigkeit ab 9.5.1945 hinzufügen (§3.2-Beispiel).
    const namenNeuFormular = ortSchublade.locator('.wz-ort-bearbeiten__neu', { hasText: 'Namen hinzufügen' })
    const namenNeuInputs = namenNeuFormular.locator('input')
    await namenNeuInputs.nth(0).fill('Kwidzyn')
    await namenNeuInputs.nth(1).fill('1945-05-09')
    await namenNeuFormular.locator('select').selectOption('ja')
    await namenNeuFormular.getByRole('button', { name: 'Namen hinzufügen', exact: true }).click()
    await expect(namenAbschnitt.locator('.wz-ort-bearbeiten__zeile')).toHaveCount(2)

    // Politische Zugehörigkeit hinzufügen: "Kreis Marienwerder" als neuen übergeordneten Ort.
    const zugehoerigkeitForm = ortSchublade.locator('.wz-ort-bearbeiten__neu', { hasText: 'Zugehörigkeit hinzufügen' })
    await zugehoerigkeitForm.locator('.wz-ortsfeld input').fill('Kreis Marienwerder')
    const politischNeuAnlegen = zugehoerigkeitForm.locator('.wz-ortsfeld__zeile--neuAnlegen')
    await expect(politischNeuAnlegen).toBeVisible()
    await politischNeuAnlegen.click()
    await zugehoerigkeitForm.getByRole('button', { name: 'Zugehörigkeit hinzufügen', exact: true }).click()
    await expect(ortSchublade.locator('.wz-ort-bearbeiten__zeile', { hasText: 'Kreis Marienwerder' })).toBeVisible()

    // Kirchliche Zugehörigkeit hinzufügen: "Bistum Kulm" — GETRENNT von der politischen Kette.
    await zugehoerigkeitForm.locator('select').first().selectOption('kirchlich')
    await zugehoerigkeitForm.locator('.wz-ortsfeld input').fill('Bistum Kulm')
    const kirchlichNeuAnlegen = zugehoerigkeitForm.locator('.wz-ortsfeld__zeile--neuAnlegen')
    await expect(kirchlichNeuAnlegen).toBeVisible()
    await kirchlichNeuAnlegen.click()
    await zugehoerigkeitForm.getByRole('button', { name: 'Zugehörigkeit hinzufügen', exact: true }).click()
    await expect(ortSchublade.locator('.wz-ort-bearbeiten__zeile', { hasText: 'Bistum Kulm' })).toBeVisible()

    // Externe Kennung hinzufügen (System GOV ist voreingestellt).
    const externeIdForm = ortSchublade.locator('.wz-ort-bearbeiten__neu', { hasText: 'Externe Kennung hinzufügen' })
    await externeIdForm.locator('input').fill('GOV-1234')
    await externeIdForm.getByRole('button', { name: 'Externe Kennung hinzufügen', exact: true }).click()
    await expect(ortSchublade.locator('.wz-ort-bearbeiten__zeile', { hasText: 'GOV-1234' })).toBeVisible()

    // Den bestehenden "Marienwerder"-Namen auf "bis 8.5.1945" begrenzen (§3.2-Beispiel:
    // Marienwerder bis 1945, Kwidzyn ab 1945) — debounced committet, s. Kopfkommentar.
    const marienwerderZeile = namenAbschnitt.locator('.wz-ort-bearbeiten__zeile').filter({ has: fenster.locator('input[value="Marienwerder"]') })
    await marienwerderZeile.locator('input').nth(2).fill('1945-05-08')

    // Schublade schließen (Unmount-Flush des ausstehenden Debounce-Commits) und wieder öffnen —
    // deterministisch statt eines willkürlichen Zeitablaufs.
    await ortSchublade.getByRole('button', { name: 'Schließen', exact: true }).click()
    await expect(ortSchublade).toHaveCount(0)
    await ortBearbeitenLink.click()
    ortSchublade = fenster.getByRole('dialog', { name: 'Ort bearbeiten', exact: true })
    await expect(ortSchublade).toBeVisible()
    // `abfrage:ort.detail` neu geladen (die Seitenschublade wurde komplett neu gemountet) — die
    // vor dem Schließen geflushte Änderung ist tatsächlich in der Datenbank angekommen.
    const marienwerderZeileNeuGeladen = ortSchublade
      .locator('.wz-ort-bearbeiten__zeile')
      .filter({ has: fenster.locator('input[value="Marienwerder"]') })
    await expect(marienwerderZeileNeuGeladen.locator('input').nth(2)).toHaveValue('1945-05-08')
    await ortSchublade.getByRole('button', { name: 'Schließen', exact: true }).click()
    await expect(ortSchublade).toHaveCount(0)

    // Zurück im Ereignis-Neu-Formular: ein Ereignisdatum VOR 1945 setzen, dann nach "Kwidzyn"
    // suchen (historischer Name) — der Vorschlag muss den 1850 gültigen Namen "Marienwerder"
    // zeigen, NICHT "Kwidzyn", PLUS die politische Hierarchiezeile (docs/71 §3.2).
    await ereignisFelder.locator('.wz-datumsfeld input').fill('14.3.1850')
    await ereignisFelder.locator('.wz-ortsfeld input').fill('Kwidzyn')
    const datumsgueltigerTreffer = profil.locator('.wz-ortsfeld__zeile--treffer')
    await expect(datumsgueltigerTreffer).toContainText('Marienwerder')
    await expect(datumsgueltigerTreffer).not.toContainText('Kwidzyn')
    await expect(datumsgueltigerTreffer).toContainText('Kreis Marienwerder')
  })
})
