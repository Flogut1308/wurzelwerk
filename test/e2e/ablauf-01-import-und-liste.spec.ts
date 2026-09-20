import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

/**
 * AP-1.6 Stufe 4, langsames Gate (nicht Teil von `pnpm pruefe`): „Projekt anlegen → importieren →
 * Personen erscheinen in der Liste → nach 'Wruck' suchen → Treffer" (`docs/arbeitspakete.md`
 * AP-1.6). Anlegen/Öffnen/Navigation laufen über die echte Oberfläche (Start- → Listenansicht,
 * `src/renderer/app.tsx`), der Import selbst über `window.wurzelwerk.aufrufen('befehl:import.
 * ausfuehren', …)` — es gibt noch keine Import-Ansicht (die kommt erst mit `src/renderer/ansichten
 * /import/`, AP-1.4, außerhalb dieses Auftrags), genau wie `ablauf-00-projekt.spec.ts` Projekt-
 * Befehle bereits direkt über die IPC-Brücke auslöst.
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')

/**
 * Eigene, self-contained e2e-Fixture (bewusst NICHT `fixtures/import/v1/gueltig/`, das von
 * `import-schema-zod-gleich.test.ts` und `import-fehlercodes-stufe1.test.ts` vollständig
 * durchlaufen wird — eine zusätzliche Datei dort würde ungewollt an deren Prüfungen teilnehmen,
 * `docs/80_Offene_Fragen.md` §17). Inhaltlich abgeleitet aus
 * `fixtures/import/v1/gueltig/beispiel-3-interview.json` (dieselben zwei Personen, Erna und
 * Walter Wruck), aber ohne die beiden Eigenschaften, die diese Originaldatei für einen frischen
 * Import ungeeignet machen (56_Import_Vertrag.md §2.1, IMP-202/IMP-208): die `db:018f2c44-…`-
 * Kennung (verweist auf einen bereits vorhandenen Datensatz, den es in einem frisch angelegten
 * Projekt naturgemäß nicht gibt) ist zu einer gleichwertigen `tmp:erna`-Kennung aufgelöst, und die
 * referenzierte Audiodatei liegt als mitgelieferte Platzhalterdatei direkt daneben. Die
 * eingecheckte Originaldatei unter `fixtures/` bleibt unangetastet (sie wird von
 * `import-schreiben-belege.test.ts` mit genau der gegenteiligen Erwartung — vorhandene
 * `db:`-Person — verwendet).
 */
const FIXTURE_PFAD = join(__dirname, 'fixtures/import-erna-und-walter-wruck.json')

test.describe('Ablauf 01 — Import und Liste', () => {
  const einstiegFehlt = !existsSync(HAUPTPROZESS_EINSTIEG)
  // Analog ablauf-00-*: in der CI baut `test:e2e` selbst (`electron-vite build`) — ein fehlender
  // Einstieg wäre dort ein stillschweigend übersprungenes Gate (ADR-025), kein Hinweis. Lokal
  // bleibt das Überspringen bequem.
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
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-liste-'))
    app = await electron.launch({ args: [HAUPTPROZESS_EINSTIEG] })
    fenster = await app.firstWindow()
  })

  test.afterAll(async () => {
    await app.close()
    rmSync(elternordner, { recursive: true, force: true })
  })

  /** Stubbt den nativen Ordnerdialog im Hauptprozess (AP-1.26: `src/main/dialoge.ts`, Muster wie
   * `ablauf-import-trockenlauf.spec.ts`) — „Neues Projekt" wählt den übergeordneten Ordner seit
   * AP-1.26 über den Systemdialog, nicht mehr über ein Pfadtextfeld. */
  async function dialogLiefert(pfad: string): Promise<void> {
    await app.evaluate(({ dialog }, gewaehlt) => {
      dialog.showOpenDialog = (() => Promise.resolve({ canceled: false, filePaths: [gewaehlt] })) as typeof dialog.showOpenDialog
    }, pfad)
  }

  test('Projekt anlegen, importieren, Personen erscheinen in der Liste, Suche nach „Wruck" findet Treffer', async () => {
    // Start-Ansicht: neues Projekt anlegen (echte Oberfläche, keine IPC-Abkürzung — das prüft
    // zugleich die Start→Liste-Verdrahtung aus app.tsx, AP-1.6 Stufe 4).
    await dialogLiefert(elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Listentest')
    await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()

    // App wechselt auf die Listenansicht — leerer Bestand zeigt den „kein Projekt-Inhalt"-Leerzustand.
    await expect(fenster.getByRole('table')).toBeVisible()
    await expect(fenster.getByText('Noch keine Personen')).toBeVisible()

    // Import auslösen: keine Import-Ansicht in diesem Auftrag (s. Kopfkommentar), darum direkt über
    // die IPC-Brücke, wie ablauf-00-projekt.spec.ts es für Projekt-Befehle bereits tut.
    const importErgebnis = await fenster.evaluate(async (pfad) => window.wurzelwerk.aufrufen('befehl:import.ausfuehren', { pfad }), FIXTURE_PFAD)
    expect(importErgebnis).toMatchObject({
      ok: true,
      daten: { zusammenfassung: { fehlerAnzahl: 0 }, importGesperrt: false },
    })

    // `ereignis:datenGeaendert` (ausgelöst vom Import) invalidiert den Query-Cache
    // (`DatenGeaendertBruecke`, app.tsx) — die Liste lädt die neu importierten Personen von selbst,
    // ohne einen manuellen Neuladen-Schritt in diesem Test.
    await expect(fenster.getByText('Erna Wruck')).toBeVisible()
    await expect(fenster.getByText('Walter Wruck')).toBeVisible()

    // Suche: Volltext über Original/Umschrift/Suchnormalform, hier reicht der einfachste Fall.
    await fenster.getByPlaceholder('Suchen…').fill('Wruck')
    await expect(fenster.getByText('2 Treffer')).toBeVisible()
    await expect(fenster.getByText('Erna Wruck')).toBeVisible()
    await expect(fenster.getByText('Walter Wruck')).toBeVisible()

    // Seit AP-1.10 PR-A (U-1.6-suche-ohne-filter-sortierung-seite) trägt `abfrage:suche` dieselben
    // Filter-/Sortier-/Seitenfelder wie `abfrage:person.liste` — Filterleiste und Spaltenkopf-
    // Sortierung bleiben darum auch während einer aktiven Suche bedienbar (kein sichtbares Sperren
    // mehr, s. Kommentare in `filterleiste.tsx`/`datentabelle.tsx`).
    await expect(fenster.getByRole('checkbox', { name: 'Platzhalter' })).toBeEnabled()
    await expect(fenster.getByRole('checkbox', { name: 'Privat' })).toBeEnabled()
    await expect(fenster.getByRole('checkbox', { name: 'Hat Widerspruch' })).toBeEnabled()
    await expect(fenster.getByRole('combobox', { name: 'Konfidenz mindestens' })).toBeEnabled()
    await expect(fenster.getByRole('button', { name: 'Name', exact: true })).toBeEnabled()

    // Suchfeld leeren: zurück auf `abfrage:person.liste`, die Kontrollen bleiben bedienbar.
    await fenster.getByPlaceholder('Suchen…').fill('')
    await expect(fenster.getByRole('checkbox', { name: 'Platzhalter' })).toBeEnabled()
    await expect(fenster.getByRole('button', { name: 'Name', exact: true })).toBeEnabled()
  })
})
