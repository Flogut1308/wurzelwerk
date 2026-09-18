import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

/**
 * AP-1.7 PR-B, langsames Gate (nicht Teil von `pnpm pruefe`): „aus der Liste in das Profil, Beleg
 * öffnen, Widerspruch aufklappen, schließen und an der Ausgangsstelle landen" (`docs/arbeitspakete.md`
 * AP-1.7, Wissen/57_Phase0_Arbeitspakete.md:1194). Anlegen/Öffnen/Navigation über die echte
 * Oberfläche (analog `ablauf-01-import-und-liste.spec.ts`), der Import über die IPC-Brücke — es
 * gibt noch keine Import-Ansicht.
 *
 * Fixture: die bereits eingecheckte `fixtures/import/v1/gueltig/beispiel-2-widersprueche.json`
 * (Augusts zwei Todesdaten: Grabstein 1961, bevorzugt, mit Begründung, gegen Ernas Erinnerung
 * „58 oder 59" als 1958 erfasst) — bewusst NICHT kopiert (anders als `ablauf-01`s eigene
 * `import-erna-und-walter-wruck.json`-Fixture): diese Datei referenziert weder eine `db:`-Kennung
 * noch eine externe Mediendatei, ist also in einem frischen Projekt fehlerfrei importierbar, und
 * ein reines LESEN dieser Datei aus einem neuen Test nimmt nicht an den Prüfungen teil, die ALLE
 * Dateien unter `fixtures/import/v1/gueltig/` einsammeln (`import-schema-zod-gleich.test.ts`,
 * `import-fehlercodes-stufe1.test.ts`) — nur ein zusätzlich EINGECHECKTES File dort täte das
 * (`docs/80_Offene_Fragen.md`, U-1.6-e2e-fixture).
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')
const FIXTURE_PFAD = join(__dirname, '../../fixtures/import/v1/gueltig/beispiel-2-widersprueche.json')

test.describe('Ablauf 02 — Profil', () => {
  const einstiegFehlt = !existsSync(HAUPTPROZESS_EINSTIEG)
  // Analog ablauf-00-*/ablauf-01-*: in der CI baut `test:e2e` selbst (`electron-vite build`) — ein
  // fehlender Einstieg wäre dort ein stillschweigend übersprungenes Gate (ADR-025), kein Hinweis.
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
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-profil-'))
    app = await electron.launch({ args: [HAUPTPROZESS_EINSTIEG] })
    fenster = await app.firstWindow()
  })

  test.afterAll(async () => {
    await app.close()
    rmSync(elternordner, { recursive: true, force: true })
  })

  test('aus der Liste in das Profil, Beleg öffnen, Widerspruch aufklappen, schließen — zurück an der Ausgangsstelle', async () => {
    // Start-Ansicht: neues Projekt anlegen (echte Oberfläche, wie ablauf-01).
    await fenster.getByPlaceholder('Übergeordneter Ordner').fill(elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Profiltest')
    await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()
    await expect(fenster.getByRole('table')).toBeVisible()

    // Import über die IPC-Brücke (keine Import-Ansicht in diesem Auftrag).
    const importErgebnis = await fenster.evaluate(async (pfad) => window.wurzelwerk.aufrufen('befehl:import.ausfuehren', { pfad }), FIXTURE_PFAD)
    expect(importErgebnis).toMatchObject({ ok: true, daten: { zusammenfassung: { fehlerAnzahl: 0 } } })

    // `ereignis:datenGeaendert` invalidiert den Query-Cache — die Liste lädt von selbst.
    await expect(fenster.getByText('August Wruck')).toBeVisible()
    const augustZeile = fenster.locator('[role="row"]:has-text("August Wruck")')

    // OHNE Profil-Verdrahtung wäre der folgende Klick wirkungslos, und `getByRole('dialog', {
    // name: 'Profil' })` bliebe unsichtbar — das ist der Rot-Beweis dieser Spec (§5, CLAUDE.md):
    // vor der Verdrahtung von `aufZeileAusgewaehlt`/`ProfilAnsicht` (Commits „Liste an Profilseite
    // anschließen" / „Profilseite … ProfilAnsicht") schlägt genau diese Zeile fehl.
    await augustZeile.click()

    const profil = fenster.getByRole('dialog', { name: 'Profil', exact: true })
    await expect(profil).toBeVisible()
    await expect(profil.getByRole('heading', { name: 'August Wruck', level: 1 })).toBeVisible()

    // Grunddaten: Todesdatum zeigt den bevorzugten Wert (1961) und zwei Belege.
    await expect(profil.getByText('Todesdatum')).toBeVisible()
    await expect(profil.getByText('1961', { exact: true })).toBeVisible()

    // S-08: Belegdetail öffnen (Belegabzeichen der Todesdatum-Zeile, Belegzahl 2 — Grabstein +
    // Ernas Erinnerung, je eine `aussage_zitat`-Zeile).
    await profil.getByRole('button', { name: '2 Belege', exact: true }).click()
    const belegSchublade = fenster.getByRole('dialog', { name: 'Belege: Todesdatum', exact: true })
    await expect(belegSchublade).toBeVisible()
    await expect(belegSchublade.getByText('AUGUST WRUCK 1890 - 1961')).toBeVisible()
    await expect(belegSchublade.getByText('der ist gestorben, als ich in die Schule kam, das war 58 oder 59')).toBeVisible()
    await belegSchublade.getByRole('button', { name: 'Schließen', exact: true }).click()
    await expect(belegSchublade).toHaveCount(0)

    // S-09: Widerspruchsansicht öffnen (WiderspruchZeichen der Todesdatum-Zeile) — zeigt BEIDE
    // Todesdaten, die bevorzugte (1961) mit ihrer Begründung, keine gelöscht (Leitprinzip 1).
    await profil.getByRole('button', { name: 'Widerspruch: konkurrierende Angaben', exact: true }).click()
    const widerspruchSchublade = fenster.getByRole('dialog', { name: 'Widerspruch: Todesdatum', exact: true })
    await expect(widerspruchSchublade).toBeVisible()
    await expect(widerspruchSchublade.getByText('1961', { exact: true })).toBeVisible()
    await expect(widerspruchSchublade.getByText('1958', { exact: true })).toBeVisible()
    await expect(widerspruchSchublade.getByText('Bevorzugt', { exact: true })).toBeVisible()
    await expect(widerspruchSchublade.getByText('Der Grabstein ist die staerkere Quelle. Bevorzugt gegenueber Ernas Erinnerung.')).toBeVisible()
    await widerspruchSchublade.getByRole('button', { name: 'Schließen', exact: true }).click()
    await expect(widerspruchSchublade).toHaveCount(0)

    // Gesundheitsblock ist adaptiv: `beispiel-2-widersprueche.json` trägt keine Diagnosen/
    // Risikofaktoren für August — der Abschnitt erscheint darum nicht (C-04).
    await expect(profil.getByText('Gesundheit', { exact: true })).toHaveCount(0)

    // Profil schließen — zurück an der exakten Ausgangsstelle: die Liste ist wieder sichtbar, die
    // August-Zeile trägt wieder den Fokus (`ProfilAnsicht`s Fokusfang/-rückgabe, kein erneuter Klick).
    await profil.getByRole('button', { name: 'Schließen', exact: true }).click()
    await expect(profil).toHaveCount(0)
    await expect(fenster.getByRole('table')).toBeVisible()
    await expect(augustZeile).toBeFocused()
  })
})
