import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

/**
 * AP-0.17, langsames Gate (nicht Teil von `pnpm pruefe`): Der Roundtrip „Projekt anlegen →
 * schließen → wieder öffnen" gegen die **gebaute** App. Das ist zugleich das Abnahmekriterium
 * „Phase 0 ist fertig, wenn …" (57_Phase0_Arbeitspakete.md), das bisher nur unter `pnpm dev` galt.
 *
 * Anlegen und Öffnen lesen die Migrations-SQL (`docs/schema/*.sql`) und `trigger_generiert.sql`;
 * fehlt die Bündelung oder rät der Pfad falsch, scheitert genau dieser Ablauf. Hinweis: `test:e2e`
 * startet `out/main/index.js` (electron-vite build) mit cwd/`getAppPath` = Repo-Root — die
 * asar-Auflösung der gepackten App belegt erst ein `pnpm build`-Lauf (menschlich angesehen, PR).
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')

test.describe('Ablauf 00 — Projekt anlegen und wieder öffnen', () => {
  const einstiegFehlt = !existsSync(HAUPTPROZESS_EINSTIEG)
  // Analog ablauf-00-start: In der CI baut `test:e2e` selbst — ein fehlender Einstieg wäre ein
  // stillschweigend übersprungenes Gate (ADR-025), also ein Fehler, keine Nachricht. Lokal bequem.
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
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-'))
    app = await electron.launch({ args: [HAUPTPROZESS_EINSTIEG] })
    fenster = await app.firstWindow()
  })

  test.afterAll(async () => {
    await app.close()
    rmSync(elternordner, { recursive: true, force: true })
  })

  test('anlegen liefert die aktuelle Schemaversion, schließen und erneutes Öffnen gelingt', async () => {
    const anlegen = await fenster.evaluate(
      async (arg) => window.wurzelwerk.aufrufen('befehl:projekt.anlegen', arg),
      { elternordner, name: 'Testprojekt' },
    )
    expect(anlegen).toMatchObject({ ok: true, daten: { name: 'Testprojekt', schemaversion: '4' } })

    // Pfad des frisch angelegten Projekts für das erneute Öffnen.
    const projektPfad = (anlegen as { ok: true; daten: { pfad: string } }).daten.pfad

    const schliessen = await fenster.evaluate(async () => window.wurzelwerk.aufrufen('befehl:projekt.schliessen', null))
    expect(schliessen).toMatchObject({ ok: true })

    const oeffnen = await fenster.evaluate(
      async (pfad) => window.wurzelwerk.aufrufen('befehl:projekt.oeffnen', { pfad }),
      projektPfad,
    )
    expect(oeffnen).toMatchObject({ ok: true, daten: { status: 'geoeffnet', projekt: { schemaversion: '4' } } })
  })
})
