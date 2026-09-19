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
 * **Nur der CI-macOS-Referenzrunner vergleicht pixelgenau, dev nicht** (PR #71, Nachzug):
 * selbst mit den deterministischen Rendering-Flags unten bleibt zwischen einem lokal (dev-)
 * erzeugten Screenshot und einem CI-erzeugten Screenshot eine Restrasterung von ~1–3 % — bei
 * `threshold: 0` (playwright.config.ts, nötig um einen Ein-Token-Regress zu fangen) reicht das,
 * um jeden dev-Lauf gegen eine CI-Baseline nichtdeterministisch rot zu machen. Die Baselines
 * unter `test/golden/bilder/` sind darum als **CI-Referenzrunner-erzeugt** deklariert
 * (`docs/80_Offene_Fragen.md` §22), und der Vergleich selbst läuft nur dort:
 * `test.skip(process.platform !== 'darwin' || !(process.env.CI || process.env.BILDER_ERNEUERN), …)`
 * überspringt lokal (weder `CI` noch `BILDER_ERNEUERN` gesetzt), lässt aber `pnpm bilder:erneuern`
 * (setzt `BILDER_ERNEUERN=1`) und jeden echten CI-Lauf (setzt `CI=true`) durch — auf macOS.
 *
 * **Determinismus:** feste Fenster-Inhaltsgröße (`setContentSize`, unabhängig von der
 * persistierten Fenstergeometrie aus `geometrie-speicher.ts`), `animations: 'disabled'`,
 * `caret: 'hide'`, `scrollTo(0, 0)` vor jeder Aufnahme (über `kombinationImDomSetzen`, dieselbe
 * Funktion wie `skripte/bilder.ts`/`zustandsbibliothek.spec.ts`). Die Zustandsbibliothek ist mit
 * allen Beispielabschnitten deutlich höher als Chromiums 16384-px-Bitmaplimit — deshalb **kein**
 * `fullPage: true`, sondern ein Viewport-Ausschnitt vom zurückgesetzten Seitenanfang (identische
 * Begründung wie in `skripte/bilder.ts`).
 *
 * **Zwei unabhängige Electron-Instanzen (PR #71, Nachzug):** Die zustandsfreien Motive (Start,
 * Zustandsbibliothek, Projekt anlegen, Importbericht-Trockenlauf) laufen in einer gemeinsamen
 * Instanz — sie berühren keine importierten Daten. Liste und Profil brauchen dagegen einen
 * ECHTEN, geladenen Import (Erna/Walter Wruck sichtbar) und liefen bisher in derselben Instanz,
 * NACH dem Trockenlauf-Motiv (Sondierung, `src/main/import/trockenlauf.ts`, endet mit
 * `ROLLBACK`). Beobachtet auf CI (PR #71): dieser geteilte Ablauf lud die Daten dort gelegentlich
 * nicht zuverlässig (Walter Wruck nicht gefunden), obwohl `ablauf-01-import-und-liste.spec.ts` im
 * selben CI-Lauf mit ihrer eigenen, frischen Instanz zuverlässig grün importiert. Liste/Profil
 * bekommen darum jetzt genau deren bewährte Sequenz: eine eigene, frische Electron-Instanz mit
 * eigenem Projekt, echter Import über den rohen Kanal `befehl:import.ausfuehren` (kein
 * UI-Assistent nötig, da hier nicht der Assistent selbst das Motiv ist) und
 * `expect(...).toBeVisible()`-Wartungen statt fester Pausen — Reliabilität vor Geschwindigkeit,
 * eine zusätzliche Instanz ist deren Preis.
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

/**
 * Chromium-Startflags NUR für dieses Gate (eigener `electron.launch`-Aufruf je Instanz unten —
 * jede e2e-Spec-Datei startet ihre eigene Electron-Instanz, keine gemeinsame Launch-Hilfsfunktion
 * betroffen). Ohne diese Flags unterschieden sich auf CI (PR #71) 94–99 % der Pixel zwischen
 * dev-Lauf und CI-Lauf, trotz gepinnter 1000×600-Fenstergröße — eine klassische
 * Farbmanagement-/Subpixel-Differenz, die `threshold: 0` nie tolerieren würde:
 * - `--force-color-profile=srgb`: entfernt die Display-Farbprofil-Differenz (wahrscheinliche
 *   Hauptursache der ~99 %).
 * - `--disable-lcd-text` / `--font-render-hinting=none`: entfernt Subpixel-Text-Rasterisierung,
 *   die je nach Font-Backend der Maschine leicht abweicht.
 * - `--hide-scrollbars`: entfernt die (plattformabhängige) Scrollbalken-Darstellung aus der Aufnahme.
 * Reine Chromium-Kommandozeilenschalter, von Electron direkt durchgereicht — kein `src/main`-Code
 * nötig, um sie zu setzen.
 */
const DETERMINISTISCHES_RENDERING_FLAGS = ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none', '--hide-scrollbars']

/** Setzt Thema/Dichte, scrollt zurück an den Seitenanfang, nimmt die Aufnahme. `clip` schneidet
 * bei Bedarf einen nichtdeterministischen Teilbereich heraus (s. Startansicht unten). Nimmt
 * `fenster` als Parameter statt eines Modul-weiten Zustands, damit beide Electron-Instanzen
 * (s. Kopfkommentar) dieselbe Aufnahmefunktion teilen. */
async function aufnahme(
  fenster: Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>['firstWindow']>>,
  name: string,
  theme: 'hell' | 'dunkel',
  dichte: 'standard' | 'kompakt' = 'standard',
  clip?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): Promise<void> {
  await fenster.evaluate(kombinationImDomSetzen, { theme, dichte })
  await expect(fenster).toHaveScreenshot(`${name}.png`, clip === undefined ? AUFNAHME_OPTIONEN : { ...AUFNAHME_OPTIONEN, clip })
}

/** `setContentSize` kehrt zurück, bevor der Renderer die neue Größe übernommen hat — ohne diese
 * Wartung entstünden die Aufnahmen weiter in der vorherigen (persistierten) Größe. Von beiden
 * Instanzen genutzt (s. Kopfkommentar), deshalb als gemeinsame Funktion statt Duplikat. */
async function fensterAufFesteGroesseSetzen(
  app: Awaited<ReturnType<typeof electron.launch>>,
  fenster: Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>['firstWindow']>>,
): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, groesse) => {
      for (const fensterHandle of BrowserWindow.getAllWindows()) {
        fensterHandle.setContentSize(groesse.breite, groesse.hoehe)
      }
    },
    { breite: FENSTER_BREITE, hoehe: FENSTER_HOEHE },
  )

  await fenster.waitForFunction(
    (groesse) => window.innerWidth === groesse.breite && window.innerHeight === groesse.hoehe,
    { breite: FENSTER_BREITE, hoehe: FENSTER_HOEHE },
  )
}

test.describe('Bildvergleich — Referenzmotive (AP-1.25)', () => {
  test.skip(process.platform !== 'darwin', 'nur macOS vergleicht pixelgenau (ADR-012)')
  test.skip(
    !(process.env['CI'] !== undefined || process.env['BILDER_ERNEUERN'] !== undefined),
    'Bildvergleich läuft nur auf dem CI-macOS-Referenzrunner (Rasterung dev↔CI nicht bitgleich, ADR-012)',
  )

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

  test.describe('Zustandsfreie Motive — Start, Zustandsbibliothek, Projekt anlegen, Importbericht', () => {
    let app: Awaited<ReturnType<typeof electron.launch>>
    let fenster: Awaited<ReturnType<typeof app.firstWindow>>
    let elternordner: string

    test.beforeAll(async () => {
      elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-bildvergleich-'))
      app = await electron.launch({ args: [HAUPTPROZESS_EINSTIEG, ...DETERMINISTISCHES_RENDERING_FLAGS] })
      fenster = await app.firstWindow()
      await fenster.waitForLoadState('load')

      // Feste Inhaltsgröße setzen, bevor irgendetwas aufgenommen wird (bleibt für die gesamte
      // Sitzung unverändert — kein weiterer OS-Fenstereingriff in diesem Test).
      await fensterAufFesteGroesseSetzen(app, fenster)
    })

    test.afterAll(async () => {
      await app.close()
      rmSync(elternordner, { recursive: true, force: true })
    })

    /** Stubbt den nativen Öffnen-Dialog im Hauptprozess (wie `ablauf-import-trockenlauf.spec.ts`). */
    async function dialogLiefert(pfad: string): Promise<void> {
      await app.evaluate(({ dialog }, gewaehlt) => {
        dialog.showOpenDialog = (() => Promise.resolve({ canceled: false, filePaths: [gewaehlt] })) as typeof dialog.showOpenDialog
      }, pfad)
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

      await aufnahme(fenster, 'startansicht-hell', 'hell', 'standard', clip)
      await aufnahme(fenster, 'startansicht-dunkel', 'dunkel', 'standard', clip)
    })

    test('Zustandsbibliothek — vier Kombinationen', async () => {
      await app.evaluate(({ BrowserWindow }) => {
        for (const fensterHandle of BrowserWindow.getAllWindows()) {
          fensterHandle.webContents.send('ereignis:zustandsbibliothekOeffnen', null)
        }
      })
      await fenster.locator('[data-testid="wz-zustandsbibliothek"]').waitFor({ state: 'visible' })

      for (const kombination of VIER_KOMBINATIONEN) {
        await aufnahme(fenster, `zustandsbibliothek-${kombination.theme}-${kombination.dichte}`, kombination.theme, kombination.dichte)
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

    test('Importansicht — Bericht (Trockenlauf)', async () => {
      // Nur der Bericht wird hier aufgenommen — kein echter Import mehr in dieser Instanz (s.
      // Kopfkommentar): Liste/Profil brauchen den echten, geladenen Import und laufen in einer
      // eigenen, isolierten Instanz weiter unten, damit dieses Trockenlauf-Motiv (Sondierung mit
      // `ROLLBACK`) den dortigen echten Import nicht mehr stören kann (PR #71).
      await dialogLiefert(FIXTURE_ERNA_WALTER)
      await fenster.getByRole('button', { name: 'Importieren …' }).click()
      await fenster.getByRole('button', { name: 'Datei wählen …' }).click()
      await expect(fenster.getByText(FIXTURE_ERNA_WALTER)).toBeVisible()
      await fenster.getByRole('button', { name: 'Prüfen' }).click()
      await expect(fenster.getByRole('heading', { name: 'Zusammenfassung' })).toBeVisible()

      await aufnahme(fenster, 'importansicht-hell', 'hell')
      await aufnahme(fenster, 'importansicht-dunkel', 'dunkel')
    })
  })

  test.describe('Liste und Profil — isolierte Instanz mit echtem Import', () => {
    let app: Awaited<ReturnType<typeof electron.launch>>
    let fenster: Awaited<ReturnType<typeof app.firstWindow>>
    let elternordner: string

    test.beforeAll(async () => {
      elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-bildvergleich-liste-'))
      app = await electron.launch({ args: [HAUPTPROZESS_EINSTIEG, ...DETERMINISTISCHES_RENDERING_FLAGS] })
      fenster = await app.firstWindow()
      await fenster.waitForLoadState('load')
      await fensterAufFesteGroesseSetzen(app, fenster)

      // Eigenes, frisches Projekt — wie `ablauf-01-import-und-liste.spec.ts`, echte Oberfläche für
      // Anlegen/Navigation.
      await fenster.getByPlaceholder('Übergeordneter Ordner').fill(elternordner)
      await fenster.getByPlaceholder('Projektname').fill('Bildvergleichstest Liste')
      await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()
      await expect(fenster.getByRole('table')).toBeVisible()

      // Echter Import über den rohen Kanal, exakt die auf CI bewährte Sequenz aus
      // `ablauf-01-import-und-liste.spec.ts` (s. Kopfkommentar) — kein UI-Assistent nötig, da hier
      // nicht der Assistent selbst das Motiv ist, sondern Liste/Profil mit geladenen Daten.
      const importErgebnis = await fenster.evaluate(
        async (pfad) => window.wurzelwerk.aufrufen('befehl:import.ausfuehren', { pfad }),
        FIXTURE_ERNA_WALTER,
      )
      expect(importErgebnis).toMatchObject({
        ok: true,
        daten: { zusammenfassung: { fehlerAnzahl: 0 }, importGesperrt: false },
      })

      // `ereignis:datenGeaendert` (ausgelöst vom Import) invalidiert den Query-Cache — die Liste
      // lädt die neu importierten Personen von selbst.
      await expect(fenster.getByText('Erna Wruck')).toBeVisible()
      await expect(fenster.getByText('Walter Wruck')).toBeVisible()
    })

    test.afterAll(async () => {
      await app.close()
      rmSync(elternordner, { recursive: true, force: true })
    })

    test('Liste — nach dem echten Import', async () => {
      await aufnahme(fenster, 'liste-hell', 'hell')
      await aufnahme(fenster, 'liste-dunkel', 'dunkel')
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
      const walterZeile = fenster.locator('[role="row"]:has-text("Walter Wruck")')
      await walterZeile.click()
      const profil = fenster.getByRole('dialog', { name: 'Profil', exact: true })
      await expect(profil).toBeVisible()
      await expect(profil.getByRole('heading', { name: 'Walter Wruck', level: 1 })).toBeVisible()

      await aufnahme(fenster, 'profil-hell', 'hell')
      await aufnahme(fenster, 'profil-dunkel', 'dunkel')

      await profil.getByRole('button', { name: 'Schließen', exact: true }).click()
    })
  })
})
