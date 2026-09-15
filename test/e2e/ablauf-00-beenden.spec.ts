import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

/**
 * AP-0.18, langsames Gate (nicht Teil von `pnpm pruefe`): Rot-Beleg für den Defekt, den dieses
 * Arbeitspaket behebt — `src/main/index.ts` registrierte kein `before-quit`, darum blieb
 * `projekt.lock` beim normalen Beenden liegen und `db.close()` lief nie. Jeder Neustart erkannte
 * den Vorlauf fälschlich als unsauber (Sperre `verwaist`, AP-0.13-Absturzerkennung damit
 * funktional wirkungslos). Ohne die Verdrahtung aus `src/main/lebenszyklus.ts` schlägt die erste
 * Zusicherung unten fehl (`projekt.lock` bliebe liegen).
 *
 * Beenden wird bewusst über `app.evaluate(({ app }) => app.quit())` ausgelöst, nicht über
 * `app.close()`: `app.quit()` durchläuft genau den `before-quit`-Pfad, den dieses AP verdrahtet —
 * `app.close()` schließt nur die Fenster von außen und ist kein Ersatz für diese Zusicherung.
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')

test.describe('Ablauf 00 — Geordnetes Beenden und Einzelinstanz', () => {
  const einstiegFehlt = !existsSync(HAUPTPROZESS_EINSTIEG)
  // Analog ablauf-00-start/-projekt: in der CI ist ein fehlender Einstieg ein Fehler, kein
  // stillschweigend übersprungenes Gate (ADR-025). Lokal bleibt das Überspringen bequem.
  if (einstiegFehlt && process.env['CI'] !== undefined) {
    throw new Error(
      'out/main/index.js fehlt im CI-Lauf — das E2E-Gate würde stillschweigend überspringen. ' +
        '`test:e2e` muss zuvor bauen (electron-vite build).',
    )
  }
  test.skip(einstiegFehlt, 'out/main/index.js fehlt — lokal `pnpm test:e2e` (baut selbst) oder vorher `pnpm build`.')

  let elternordner: string
  let userDataDir: string

  test.beforeAll(() => {
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-beenden-'))
    // Eigener --user-data-dir hält die Einzelinstanz-Sperre für beide (sequenziellen) Instanzen
    // dieses Tests konsistent. Hinweis: `app.getPath('logs')` liegt auf macOS unter
    // `~/Library/Logs/<appName>` und wird von --user-data-dir NICHT verschoben — die Log-Datei ist
    // also prozessübergreifend geteilt; die Prüfung unten trägt dem Rechnung (s. dort).
    userDataDir = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-userdata-'))
  })

  test.afterAll(() => {
    rmSync(elternordner, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  })

  test('app.quit() schließt das Projekt geordnet — die Sperre bleibt nicht liegen', async () => {
    const app = await electron.launch({ args: [HAUPTPROZESS_EINSTIEG, `--user-data-dir=${userDataDir}`] })
    const fenster = await app.firstWindow()

    const anlegen = await fenster.evaluate(
      async (arg) => window.wurzelwerk.aufrufen('befehl:projekt.anlegen', arg),
      { elternordner, name: 'Beendentest' },
    )
    expect(anlegen).toMatchObject({ ok: true, daten: { name: 'Beendentest' } })

    // Cast ist sicher: die toMatchObject-Zusicherung oben hat die `ok:true`-Variante bereits
    // geprüft (analog ablauf-00-projekt.spec.ts, CLAUDE.md §4).
    const projektPfad = (anlegen as { ok: true; daten: { pfad: string } }).daten.pfad
    expect(existsSync(join(projektPfad, 'projekt.lock'))).toBe(true)

    // Log-Pfad NOCH aus der ersten Instanz holen (nach dem Quit ist die CDP-Verbindung weg). Der
    // Ort ist auf macOS geteilt (`~/Library/Logs/<appName>`, s. beforeAll) — er wird unten nach dem
    // Beenden gelöscht, damit die `verwaist`-Prüfung nur die zweite Instanz sieht, nicht Altzeilen
    // dieses oder früherer Läufe. Playwright läuft hier seriell (workers: 1), kein Nebenschreiber.
    const logDatei = join(await app.evaluate(({ app: elektronApp }) => elektronApp.getPath('logs')), 'wurzelwerk.log')

    const prozessBeendet = new Promise<void>((resolve) => {
      const kindprozess = app.process()
      if (kindprozess.exitCode !== null) {
        resolve()
        return
      }
      kindprozess.once('exit', () => resolve())
    })

    // Die CDP-Verbindung kann abreißen, sobald der Hauptprozess während des `evaluate`-Aufrufs
    // tatsächlich beendet — das ist kein Testfehler, sondern die erwartete Reihenfolge.
    await app.evaluate(({ app: elektronApp }) => elektronApp.quit()).catch(() => undefined)
    await prozessBeendet

    expect(existsSync(join(projektPfad, 'projekt.lock'))).toBe(false)

    // Log leeren: ab hier kann nur die zweite Instanz schreiben. Ohne das würde die Prüfung unten
    // auch Altzeilen (erste Instanz, frühere Läufe) sehen — der Ort ist geteilt (s. beforeAll).
    rmSync(logDatei, { force: true })

    // Zweite Instanz, gleicher --user-data-dir: öffnet dasselbe Projekt erneut. War die Sperre
    // sauber entfernt (geordnetes Beenden), erkennt projekt-dienst.ts sie nicht als `verwaist`.
    const app2 = await electron.launch({ args: [HAUPTPROZESS_EINSTIEG, `--user-data-dir=${userDataDir}`] })
    try {
      const fenster2 = await app2.firstWindow()
      const oeffnen = await fenster2.evaluate(
        async (pfad) => window.wurzelwerk.aufrufen('befehl:projekt.oeffnen', { pfad }),
        projektPfad,
      )
      expect(oeffnen).toMatchObject({ ok: true, daten: { status: 'geoeffnet' } })

      // Öffnen eines sauber geschlossenen Projekts protokolliert nichts — die Log-Datei kann also
      // ganz fehlen. Genau das ist der Gutfall: keine Datei ⇒ keine `projekt_sperre_verwaist`-Zeile.
      // Nur ein liegengebliebenes `projekt.lock` (der Defekt dieses AP) würde beim erneuten Öffnen
      // die `verwaist`-Zeile erzeugen und die Datei anlegen.
      const logInhalt = existsSync(logDatei) ? readFileSync(logDatei, 'utf8') : ''
      expect(logInhalt).not.toContain('projekt_sperre_verwaist')
    } finally {
      await app2.close()
    }
  })
})
