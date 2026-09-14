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
    // Eigener --user-data-dir: isoliert `app.getPath('logs')`/`wurzelwerk.log` dieses Tests von
    // parallel laufenden E2E-Specs (die sonst dieselbe Standard-Log-Datei teilen würden) und hält
    // die Einzelinstanz-Sperre für beide (sequenziellen) Instanzen dieses Tests konsistent.
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

      const logOrdner = await app2.evaluate(({ app: elektronApp }) => elektronApp.getPath('logs'))
      const logInhalt = readFileSync(join(logOrdner, 'wurzelwerk.log'), 'utf8')
      expect(logInhalt).not.toContain('projekt_sperre_verwaist')
    } finally {
      await app2.close()
    }
  })
})
