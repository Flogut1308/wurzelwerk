import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

/**
 * AP-1.15 PR-A (S-20-Fortsetzung, Variante A), langsames Gate (nicht Teil von `pnpm pruefe`),
 * Muster `ablauf-03-person-bearbeiten.spec.ts`: frisches Projekt, ZWEI Personen mit Namen über die
 * IPC-Brücke anlegen (Hauptperson + Pate — es gibt noch keine Import-/Anlege-Ansicht für Personen),
 * Liste lädt, Hauptperson-Zeile klicken → Profil → „Bearbeiten" → im Ereignis-Neu-Formular eine
 * Taufe MIT Datum/Ort/Konfidenz UND einem weiteren Beteiligten (der Pate, über den echten
 * `Personenwaehler` gesucht) anlegen → das Ereignis erscheint bei BEIDEN Personen (Rolle
 * `Hauptperson` bzw. `Pate/Patin`) → beim Paten die Beteiligung entfernen → das Ereignis besteht
 * bei der Hauptperson weiter, beim Paten ist es weg (Variante A: NUR die `beteiligung`-Zeile
 * verschwindet, das Ereignis selbst bleibt bestehen).
 *
 * Zusicherungen an DOM-State (kein Log-Datei-Lesen, ENOENT-Flake auf frischem Runner,
 * `docs/80_Offene_Fragen.md`); hover-/fokus-deterministisch (kein Hover-Zustand geprüft).
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')

test.describe('Ablauf 05 — Ereignis mit Rollenbeteiligung erfassen', () => {
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
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-ereignis-erfassen-'))
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

  /** Legt eine Person MIT Namen über die IPC-Brücke an (keine Anlege-Ansicht für Personen in
   * diesem Auftrag, Muster `ablauf-03-person-bearbeiten.spec.ts`) — liefert die `person.id`.
   * `originalText` MUSS gesetzt sein, damit `abfrage:suche` (Volltext gegen `suche_fts.original`,
   * `src/main/abfragen/suche.ts`) den Namen überhaupt findet: die `normalform`-Spalte entfernt
   * jeden Leerraum (`suchnormalform()`, `src/core/name/suchnormalform.ts` §3 — "Pauline Patin"
   * wird zu einem einzigen Token "paulinepatin"), ein Teiltext-Treffer auf EIN Wort braucht darum
   * die unveränderte `original`-Spalte. */
  async function personMitNamenAnlegen(vornamen: string, nachname: string): Promise<string> {
    const personId: string = await fenster.evaluate(async (namen: { readonly vornamen: string; readonly nachname: string }): Promise<string> => {
      const anlegenErgebnis = await window.wurzelwerk.aufrufen('befehl:person.anlegen', { privat: 0, ist_platzhalter: 0 })
      if (!anlegenErgebnis.ok) throw new Error('person.anlegen fehlgeschlagen')
      // Cast ist sicher: die vorstehende `if (!anlegenErgebnis.ok)`-Prüfung hat die `ok:true`-
      // Variante bereits geprüft (Muster `ablauf-00-beenden.spec.ts`, CLAUDE.md §4) — `window.
      // wurzelwerk.aufrufen()` selbst ist im Preload bewusst kanalunabhängig auf `Ergebnis<unknown>`
      // typisiert (`src/renderer/brücke/global.d.ts`).
      const angelegtePersonId = (anlegenErgebnis as { ok: true; daten: { id: string } }).daten.id
      const nameErgebnis = await window.wurzelwerk.aufrufen('befehl:name.anlegen', {
        personId: angelegtePersonId,
        typ: 'geburtsname',
        vornamen: namen.vornamen,
        nachname: namen.nachname,
        originalText: `${namen.vornamen} ${namen.nachname}`,
      })
      if (!nameErgebnis.ok) throw new Error('name.anlegen fehlgeschlagen')
      return angelegtePersonId
    }, { vornamen, nachname })
    return personId
  }

  test('Taufe mit Hauptperson + Pate anlegen, Beteiligung des Paten wieder entfernen', async () => {
    // Deutlich mehr Schritte als ablauf-02/03 (zwei Personen anlegen, zweimal in ein Profil
    // wechseln, ein mehrteiliges Formular ausfüllen inkl. zweier Tippsuchen) — der Playwright-
    // Standardwert von 30s reicht dafür knapp nicht (Muster `bildvergleich.spec.ts`).
    test.setTimeout(60_000)

    // Start-Ansicht: neues Projekt anlegen (echte Oberfläche, wie ablauf-01/02/03).
    await dialogLiefert(elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Ereignistest')
    await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()
    await expect(fenster.getByRole('table')).toBeVisible()

    await personMitNamenAnlegen('Anna', 'Haupt')
    await personMitNamenAnlegen('Pauline', 'Patin')

    // `ereignis:datenGeaendert` invalidiert den Query-Cache — die Liste lädt von selbst.
    await expect(fenster.getByText('Anna Haupt')).toBeVisible()
    await expect(fenster.getByText('Pauline Patin')).toBeVisible()

    const hauptZeile = fenster.locator('[role="row"]:has-text("Anna Haupt")')
    await hauptZeile.click()

    const profil = fenster.getByRole('dialog', { name: 'Profil', exact: true })
    await expect(profil).toBeVisible()
    await expect(profil.getByRole('heading', { name: 'Anna Haupt', level: 1 })).toBeVisible()

    // AP-1.30 PR 7b: „Bearbeiten" öffnet den Editor als eigene Ansicht; die Ereignisse stehen
    // (vorläufig) im Reiter „Leben".
    await profil.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    const editor = fenster.getByRole('dialog', { name: 'Person bearbeiten', exact: true })
    await expect(editor.getByRole('button', { name: 'Fertig', exact: true })).toBeVisible()
    await editor.getByRole('tab', { name: /^Leben/ }).click()

    // Ereignis-Neu-Formular: Typ, Datum, Ort (als neuen Ort anlegen), Konfidenz. Über
    // Struktur-Selektoren statt `getByLabel` — `Formularfeld` umschließt mehrteilige Moleküle
    // (`Datumsfeld`/`Ortsfeld`) in EINEM `<label>`, dessen A11y-Namensberechnung dadurch weitere
    // Kindtexte (z. B. den Kalender-Umschalt-Knopf) miteinsammelt; `getByLabel` löst darum nicht
    // zuverlässig nach der sichtbaren Beschriftung allein auf.
    const ereignisFelder = editor.locator('.wz-profil-bearbeiten-ereignisse__felder')
    await ereignisFelder.locator('select').first().selectOption('taufe')
    await ereignisFelder.locator('.wz-datumsfeld input').fill('14.3.1850')
    await ereignisFelder.locator('.wz-ortsfeld input').fill('Kwidzyn')
    const ortNeuAnlegenZeile = editor.locator('.wz-ortsfeld__zeile--neuAnlegen')
    await expect(ortNeuAnlegenZeile).toBeVisible()
    await ortNeuAnlegenZeile.click()
    await editor.getByRole('radio', { name: 'Konfidenz: gesichert', exact: true }).click()

    // Weiterer Beteiligter: der Pate, über den echten Personenwaehler gesucht.
    await editor.getByRole('button', { name: '+ Beteiligten', exact: true }).click()
    const weitererBeteiligter = editor.locator('.wz-profil-bearbeiten-ereignisse__beteiligter')
    await weitererBeteiligter.locator('.wz-personenwaehler input').fill('Pauline')
    const pateZeile = weitererBeteiligter.locator('.wz-personenwaehler__zeile--treffer', { hasText: 'Pauline Patin' })
    await expect(pateZeile).toBeVisible()
    await pateZeile.click()
    await weitererBeteiligter.locator('select').selectOption('pate')

    const absenden = editor.getByRole('button', { name: 'Ereignis anlegen', exact: true })
    await expect(absenden).toBeEnabled()
    await absenden.click()

    // Bei der Hauptperson: eine Zeile mit "Taufe"/"Hauptperson" in der Bearbeiten-Liste.
    const hauptZeileEreignis = editor.locator('.wz-profil-bearbeiten-ereignisse__zeile', { hasText: 'Taufe' })
    await expect(hauptZeileEreignis).toBeVisible()
    await expect(hauptZeileEreignis.getByText('Hauptperson', { exact: true })).toBeVisible()

    await editor.getByRole('button', { name: 'Schließen', exact: true }).click()
    await expect(editor).toHaveCount(0)
    await expect(profil).toHaveCount(0)

    // Beim Paten: dasselbe Ereignis mit Rolle "Pate/Patin" — sowohl im Lesezweig als auch im
    // Bearbeiten-Zustand (dort mit der "Beteiligung entfernen"-Schaltfläche).
    const pateListenzeile = fenster.locator('[role="row"]:has-text("Pauline Patin")')
    await pateListenzeile.click()
    const pateProfil = fenster.getByRole('dialog', { name: 'Profil', exact: true })
    await expect(pateProfil).toBeVisible()
    await expect(pateProfil.getByRole('heading', { name: 'Pauline Patin', level: 1 })).toBeVisible()
    await expect(pateProfil.getByText('Pate/Patin', { exact: true })).toBeVisible()

    await pateProfil.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    await editor.getByRole('tab', { name: /^Leben/ }).click()
    const pateZeileEreignis = editor.locator('.wz-profil-bearbeiten-ereignisse__zeile', { hasText: 'Taufe' })
    await expect(pateZeileEreignis).toBeVisible()
    await pateZeileEreignis.getByRole('button', { name: 'Beteiligung entfernen', exact: true }).click()

    // Variante A: NUR die Beteiligung des Paten verschwindet — beim Paten bleibt KEIN Ereignis mehr.
    await expect(editor.getByText('Noch kein Ereignis erfasst.', { exact: true })).toBeVisible()

    await editor.getByRole('button', { name: 'Schließen', exact: true }).click()
    await expect(editor).toHaveCount(0)
    await expect(pateProfil).toHaveCount(0)

    // Bei der Hauptperson besteht das Ereignis unverändert weiter (das `ereignis` selbst wurde
    // NICHT gelöscht, nur die eine `beteiligung`-Zeile des Paten).
    await hauptZeile.click()
    const hauptProfilErneut = fenster.getByRole('dialog', { name: 'Profil', exact: true })
    await expect(hauptProfilErneut).toBeVisible()
    await expect(hauptProfilErneut.getByText('Taufe', { exact: true })).toBeVisible()
  })

  // AP-1.30 Bugfix U-130-9b-ereignis-ungefaehr: ein ungefähres Datum („um 1890", modifikator
  // `etwa`) muss durch den Vertrag kommen (`original_text` ist dort Pflicht, IMP-106). Baut auf
  // dem vorigen Test auf (gleiches Projekt, Profil der Hauptperson ist offen) — darum `serial`.
  test('Ereignis mit „um 1890" anlegen', async () => {
    test.setTimeout(60_000)
    const profil = fenster.getByRole('dialog', { name: 'Profil', exact: true })
    await expect(profil.getByRole('heading', { name: 'Anna Haupt', level: 1 })).toBeVisible()

    await profil.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    const editor = fenster.getByRole('dialog', { name: 'Person bearbeiten', exact: true })
    await expect(editor.getByRole('button', { name: 'Fertig', exact: true })).toBeVisible()
    await editor.getByRole('tab', { name: /^Leben/ }).click()

    const ereignisFelder = editor.locator('.wz-profil-bearbeiten-ereignisse__felder')
    await ereignisFelder.locator('select').first().selectOption('konfirmation')
    await ereignisFelder.locator('.wz-datumsfeld input').fill('um 1890')
    await editor.getByRole('radio', { name: 'Konfidenz: gesichert', exact: true }).click()

    const absenden = editor.getByRole('button', { name: 'Ereignis anlegen', exact: true })
    await expect(absenden).toBeEnabled()
    await absenden.click()

    // Vor dem Fix lehnte `befehl:ereignis.anlegen` das Datum ab — es entstand keine Zeile.
    const zeile = editor.locator('.wz-profil-bearbeiten-ereignisse__zeile', { hasText: 'Konfirmation' })
    await expect(zeile).toBeVisible()
    await expect(zeile.getByText('1890', { exact: true })).toBeVisible()
  })
})
