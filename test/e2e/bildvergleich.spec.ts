import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { kombinationImDomSetzen, VIER_KOMBINATIONEN } from '../../skripte/bilder-hilfen'

/**
 * AP-1.25 (57_Phase0_Arbeitspakete.md „AP-1.25 — Bildvergleichs-Gate"), geschützter Prüfpfad
 * (ADR-025) für die Referenzbilder unter `test/golden/bilder/`: „ohne dieses Gate kann ein
 * späteres Paket einen fertigen Bildschirm still verändern, und niemand sieht es, bis jemand
 * hinschaut". Deckt die fünf im Auftrag genannten Motive ab: Zustandsbibliothek (hell/dunkel ×
 * beide Dichten), Startansicht, Liste, Profil, Importansichten (je hell/dunkel — die
 * „sinnvolle Standardkombination", AP-1.25).
 *
 * **Nur macOS vergleicht pixelgenau** (ADR-012): Schriftrasterung unter Windows unterscheidet
 * sich, ein Vergleich dort wäre nichtdeterministisch rot und würde nach `CLAUDE.md` §13
 * „wegoptimiert". Der bestehende Windows-Screenshot (`skripte/screenshot-hauptfenster.mjs`,
 * `.github/workflows/ci.yml` Job „pruefen") bleibt unverändert ein reines Artefakt, ohne
 * Vergleich — bewusste MVP-/CI-Kosten-Entscheidung, s. `docs/80_Offene_Fragen.md` §22.
 *
 * **Determinismus:** feste Fenster-Inhaltsgröße (`setContentSize`, unabhängig von der
 * persistierten Fenstergeometrie aus `geometrie-speicher.ts`), `animations: 'disabled'`,
 * `caret: 'hide'`, `scrollTo(0, 0)` vor jeder Aufnahme (über `kombinationImDomSetzen`, dieselbe
 * Funktion wie `skripte/bilder.ts`/`zustandsbibliothek.spec.ts`). Die Zustandsbibliothek ist mit
 * allen Beispielabschnitten deutlich höher als Chromiums 16384-px-Bitmaplimit — deshalb **kein**
 * `fullPage: true`, sondern ein Viewport-Ausschnitt vom zurückgesetzten Seitenanfang (identische
 * Begründung wie in `skripte/bilder.ts`).
 *
 * **Reihenfolge bewusst gewählt:** die Import-Ansicht wird per „Prüfen" (Trockenlauf, schreibt
 * nichts nach `import_lauf`, `src/main/import/trockenlauf.ts`) aufgenommen, BEVOR dieselbe
 * Fixture-Datei tatsächlich importiert wird (für die Liste) — sonst zeigte der Bericht beim
 * zweiten Anlauf „bereits importiert" statt des sauberen Erstberichts.
 *
 * **Der echte Import läuft über den Assistenten selbst** (Knopf „Importieren" NACH „Prüfen",
 * genau wie ein echter Nutzer es täte), NICHT über einen separaten, rohen
 * `window.wurzelwerk.aufrufen('befehl:import.ausfuehren', …)`-Aufruf in einem eigenen Test. Beobachtet
 * auf CI (PR #71): der rohe IPC-Aufruf lieferte dort gelegentlich `{ ok: false }` — vermutlich, weil
 * er der Sondierungs-Transaktion des vorherigen „Prüfen" keinen UI-vermittelten Abschluss abwartete.
 * Der Assistent wartet selbst auf die `useImportAusfuehren`-Mutation (React Query) und wechselt erst
 * danach zur „Ergebnis"-Ansicht — `expect(...).toBeVisible()` auf deren Überschrift ist damit eine
 * echte, deterministische Wartung auf den fertigen Import, keine feste Pause.
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')
const FIXTURE_ERNA_WALTER = join(__dirname, 'fixtures/import-erna-und-walter-wruck.json')

/** Feste Fenster-Inhaltsgröße — unabhängig von der plattformübergreifend persistierten
 * Fenstergeometrie (`geometrie-speicher.ts`), sonst wäre die Bildgröße vom letzten `pnpm dev`/
 * `pnpm build`-Lauf auf dieser Maschine abhängig. Belegt (CI-Log, PR #71): dev-Fenster 1280×857,
 * CI-Fenster 1024×643 — beides Reste der persistierten Geometrie, nicht dieses Tests. 1000×600 ist
 * bewusst **kleiner** als beide beobachteten Größen, also reines Verkleinern statt eines
 * Bildschirm-Clampings (kein CI-Runner mit weniger als 1000×600 sichtbarer Fläche beobachtet).
 * Nur `setContentSize` zu rufen reicht NICHT — der Aufruf kehrt zurück, bevor der Renderer die
 * neue Größe tatsächlich übernommen hat; deshalb wird unten zusätzlich auf `window.innerWidth`
 * gewartet, bevor irgendetwas aufgenommen wird. */
const FENSTER_BREITE = 1000
const FENSTER_HOEHE = 600

const AUFNAHME_OPTIONEN = { animations: 'disabled', caret: 'hide' } as const

test.describe('Bildvergleich — Referenzmotive (AP-1.25)', () => {
  test.skip(process.platform !== 'darwin', 'nur macOS vergleicht pixelgenau (ADR-012)')

  const einstiegFehlt = !existsSync(HAUPTPROZESS_EINSTIEG)
  // Analog den übrigen ablauf-*-Specs: in der CI baut `test:e2e` selbst (`electron-vite build`) —
  // ein fehlender Einstieg wäre dort ein stillschweigend übersprungenes Gate (ADR-025).
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
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-bildvergleich-'))
    app = await electron.launch({ args: [HAUPTPROZESS_EINSTIEG] })
    fenster = await app.firstWindow()
    await fenster.waitForLoadState('load')

    // Feste Inhaltsgröße setzen, bevor irgendetwas aufgenommen wird (bleibt für die gesamte
    // Sitzung unverändert — kein weiterer OS-Fenstereingriff in diesem Test).
    await app.evaluate(
      ({ BrowserWindow }, groesse) => {
        for (const fensterHandle of BrowserWindow.getAllWindows()) {
          fensterHandle.setContentSize(groesse.breite, groesse.hoehe)
        }
      },
      { breite: FENSTER_BREITE, hoehe: FENSTER_HOEHE },
    )

    // `setContentSize` kehrt zurück, bevor der Renderer die neue Größe übernommen hat — ohne
    // diese Wartung entstünden die Aufnahmen weiter in der vorherigen (persistierten) Größe.
    await fenster.waitForFunction(
      (groesse) => window.innerWidth === groesse.breite && window.innerHeight === groesse.hoehe,
      { breite: FENSTER_BREITE, hoehe: FENSTER_HOEHE },
    )
  })

  test.afterAll(async () => {
    await app.close()
    rmSync(elternordner, { recursive: true, force: true })
  })

  /** Setzt Thema/Dichte, scrollt zurück an den Seitenanfang, nimmt die Aufnahme. `clip` schneidet
   * bei Bedarf einen nichtdeterministischen Teilbereich heraus (s. Startansicht unten). */
  async function aufnahme(
    name: string,
    theme: 'hell' | 'dunkel',
    dichte: 'standard' | 'kompakt' = 'standard',
    clip?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  ): Promise<void> {
    await fenster.evaluate(kombinationImDomSetzen, { theme, dichte })
    await expect(fenster).toHaveScreenshot(`${name}.png`, clip === undefined ? AUFNAHME_OPTIONEN : { ...AUFNAHME_OPTIONEN, clip })
  }

  test('Startansicht', async () => {
    // Der Abschnitt „Zuletzt geöffnet" (`start-ansicht.tsx`) liest `abfrage:projekt.zuletzt" aus
    // einem echten, plattformweiten `electron-store` (kein Test-Fixture, keine isolierte
    // `userData`) — jeder frühere lokale Testlauf UND jeder andere e2e-Spec in derselben CI-Sitzung
    // (`ablauf-01`/`ablauf-02`/`ablauf-import-trockenlauf` legen je ein eigenes Projekt an) trägt
    // dort einen weiteren Eintrag mit einem zufälligen `mkdtemp`-Pfad ein. Nicht über eine feste
    // Fixture stillstellbar, ohne `src/` anzufassen (kein Kanal/keine Umgebungsvariable für eine
    // isolierte `userData` in Tests) — s. docs/80_Offene_Fragen.md §22. Der Ausweg bleibt
    // GANZ innerhalb dieses Tests: ein `clip` auf den oberen, vollständig statischen Teil der
    // Ansicht (Titel + „Neues Projekt" + „Projekt öffnen"), exakt bis zur Überschrift „Zuletzt
    // geöffnet" — deren eigene Y-Position hängt nur von den FESTEN Abschnitten darüber ab, nicht
    // von der (wechselnden) Listenlänge darunter.
    const zuletztUeberschrift = fenster.getByRole('heading', { name: 'Zuletzt geöffnet', level: 2 })
    const box = await zuletztUeberschrift.boundingBox()
    if (box === null) {
      throw new Error('Überschrift „Zuletzt geöffnet" nicht gefunden — Startansicht-Struktur hat sich geändert.')
    }
    const clip = { x: 0, y: 0, width: FENSTER_BREITE, height: Math.floor(box.y) }

    await aufnahme('startansicht-hell', 'hell', 'standard', clip)
    await aufnahme('startansicht-dunkel', 'dunkel', 'standard', clip)
  })

  test('Zustandsbibliothek — vier Kombinationen', async () => {
    await app.evaluate(({ BrowserWindow }) => {
      for (const fensterHandle of BrowserWindow.getAllWindows()) {
        fensterHandle.webContents.send('ereignis:zustandsbibliothekOeffnen', null)
      }
    })
    await fenster.locator('[data-testid="wz-zustandsbibliothek"]').waitFor({ state: 'visible' })

    for (const kombination of VIER_KOMBINATIONEN) {
      await aufnahme(`zustandsbibliothek-${kombination.theme}-${kombination.dichte}`, kombination.theme, kombination.dichte)
    }

    // Die Bibliothek zeigt auch eine Beispiel-Beleg-Schublade mit eigenem „Schließen"-Knopf —
    // gezielt der Kopfzeilen-Knopf (`role="banner"`) schließt die ganze Ansicht.
    await fenster.getByRole('banner').getByRole('button', { name: 'Schließen', exact: true }).click()
    await fenster.locator('[data-testid="wz-zustandsbibliothek"]').waitFor({ state: 'detached' })
  })

  test('Projekt anlegen', async () => {
    await fenster.getByPlaceholder('Übergeordneter Ordner').fill(elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Bildvergleichstest')
    await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()
    await expect(fenster.getByRole('table')).toBeVisible()
  })

  /** Stubbt den nativen Öffnen-Dialog im Hauptprozess (wie `ablauf-import-trockenlauf.spec.ts`). */
  async function dialogLiefert(pfad: string): Promise<void> {
    await app.evaluate(({ dialog }, gewaehlt) => {
      dialog.showOpenDialog = (() => Promise.resolve({ canceled: false, filePaths: [gewaehlt] })) as typeof dialog.showOpenDialog
    }, pfad)
  }

  test('Importansicht — Bericht (Trockenlauf), dann echter Import über denselben Assistenten', async () => {
    await dialogLiefert(FIXTURE_ERNA_WALTER)
    await fenster.getByRole('button', { name: 'Importieren …' }).click()
    await fenster.getByRole('button', { name: 'Datei wählen …' }).click()
    await expect(fenster.getByText(FIXTURE_ERNA_WALTER)).toBeVisible()
    await fenster.getByRole('button', { name: 'Prüfen' }).click()
    await expect(fenster.getByRole('heading', { name: 'Zusammenfassung' })).toBeVisible()

    await aufnahme('importansicht-hell', 'hell')
    await aufnahme('importansicht-dunkel', 'dunkel')

    // Echter Import über den Assistenten selbst (Knopf „Importieren" NACH „Prüfen", wie ein echter
    // Nutzer) statt eines rohen, separaten IPC-Aufrufs — s. Kopfkommentar zur Begründung (CI-Flake,
    // PR #71). Der Assistent wartet selbst auf `befehl:import.ausfuehren`; die Wartung auf die
    // „Ergebnis"-Überschrift ist die deterministische Zusicherung, dass der Import abgeschlossen ist.
    await fenster.getByRole('button', { name: 'Importieren', exact: true }).click()
    await expect(fenster.getByRole('heading', { name: 'Import abgeschlossen' })).toBeVisible()

    await fenster.getByRole('button', { name: 'Zur Liste' }).click()
    await expect(fenster.getByRole('table')).toBeVisible()
  })

  test('Liste — nach dem echten Import', async () => {
    await expect(fenster.getByText('Erna Wruck')).toBeVisible()
    await expect(fenster.getByText('Walter Wruck')).toBeVisible()

    await aufnahme('liste-hell', 'hell')
    await aufnahme('liste-dunkel', 'dunkel')
  })

  test('Profil', async () => {
    // Walter Wruck (bereits importiert, s. „Liste" oben) statt August Wruck
    // (`beispiel-2-widersprueche.json`, wie in `ablauf-02-profil.spec.ts`): Augusts
    // „Grunddaten"-Geburtsort trägt in der Aussage nur `wert_ref_id` (Verweis auf die `ort`-Zeile),
    // keinen `wert_text` — `aussageWertAnzeige()` (`src/main/abfragen/person-detail.ts`) fällt dann
    // auf die rohe UUID zurück, sichtbar im Profil. Eine echte, vorbestehende Anzeige-Lücke,
    // unabhängig von AP-1.25, aber sichtbar als **nichtdeterministischer Inhalt** (UUID v7, ändert
    // sich mit jedem Import) — nicht über eine Fixture stillstellbar, ohne `src/` anzufassen
    // (`docs/80_Offene_Fragen.md` §22). Walters einzige Aussage (`beruf: Bergmann`) trägt
    // `wert_text` und ist frei davon.
    await expect(fenster.getByText('Walter Wruck')).toBeVisible()

    const walterZeile = fenster.locator('[role="row"]:has-text("Walter Wruck")')
    await walterZeile.click()
    const profil = fenster.getByRole('dialog', { name: 'Profil', exact: true })
    await expect(profil).toBeVisible()
    await expect(profil.getByRole('heading', { name: 'Walter Wruck', level: 1 })).toBeVisible()

    await aufnahme('profil-hell', 'hell')
    await aufnahme('profil-dunkel', 'dunkel')

    await profil.getByRole('button', { name: 'Schließen', exact: true }).click()
  })
})
