import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
const FIXTURE_PFAD = join(__dirname, '../../fixtures/import/v1/gueltig/beispiel-3-interview.json')

/**
 * `db:018f2c44-…` in der Fixture verweist auf einen BEREITS VORHANDENEN Datensatz
 * (`56_Import_Vertrag.md` §2.1) — ein frisch angelegtes Projekt kennt diese ID naturgemäß nicht,
 * und es gibt keinen öffentlichen IPC-Weg, eine Person mit einer vorgegebenen ID zu seeden (nur
 * `befehl:person.anlegen`, das seine eigene UUID vergibt; die geseedete Person aus
 * `test/einheit/import-schreiben-belege.test.ts` läuft über einen internen Repository-Aufruf, den
 * der Renderer nicht erreichen darf, §2). Unverändert importiert würde die Fixture darum mit
 * IMP-202 (unbekannte `db:`-Kennung) UND IMP-208 (die referenzierte Audiodatei liegt nicht neben
 * der eingecheckten Fixture) vollständig zurückgewiesen — `importGesperrt: true`, keine einzige
 * Person geschrieben (durch einen Probelauf gegen ein frisches, migriertes Projekt bestätigt).
 *
 * Für diesen Ablauf entsteht darum eine ABGELEITETE, eigenständige Kopie der Fixture in einem
 * Temp-Ordner: die `db:`-Kennung wird durch eine gleichwertige `tmp:`-Kennung ersetzt (Erna
 * entsteht dann als neue Person statt als Ergänzung eines vorhandenen Datensatzes — inhaltlich
 * bleiben es dieselben zwei Personen, Erna und Walter Wruck), und eine leere Platzhalterdatei
 * füllt den referenzierten Audiopfad. Die eingecheckte Originaldatei unter `fixtures/` bleibt
 * unangetastet (sie wird von `import-schreiben-belege.test.ts` mit genau der gegenteiligen
 * Erwartung — vorhandene `db:`-Person — verwendet).
 */
const DB_KENNUNG_ERNA = 'db:018f2c44-7a91-7c3e-9d10-5b6e7f801234'
const AUDIO_RELATIVER_PFAD = 'audio/2026-09-12-erna-wruck.m4a'

function eigenstaendigeImportdateiSchreiben(zielOrdner: string): string {
  const roh = readFileSync(FIXTURE_PFAD, 'utf8')
  const eigenstaendig = roh.split(DB_KENNUNG_ERNA).join('tmp:erna')
  const zielPfad = join(zielOrdner, 'import.json')
  writeFileSync(zielPfad, eigenstaendig, 'utf8')
  mkdirSync(join(zielOrdner, 'audio'), { recursive: true })
  writeFileSync(join(zielOrdner, AUDIO_RELATIVER_PFAD), '')
  return zielPfad
}

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
  let importOrdner: string

  test.beforeAll(async () => {
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-liste-'))
    importOrdner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-liste-import-'))
    app = await electron.launch({ args: [HAUPTPROZESS_EINSTIEG] })
    fenster = await app.firstWindow()
  })

  test.afterAll(async () => {
    await app.close()
    rmSync(elternordner, { recursive: true, force: true })
    rmSync(importOrdner, { recursive: true, force: true })
  })

  test('Projekt anlegen, importieren, Personen erscheinen in der Liste, Suche nach „Wruck" findet Treffer', async () => {
    // Start-Ansicht: neues Projekt anlegen (echte Oberfläche, keine IPC-Abkürzung — das prüft
    // zugleich die Start→Liste-Verdrahtung aus app.tsx, AP-1.6 Stufe 4).
    await fenster.getByPlaceholder('Übergeordneter Ordner').fill(elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Listentest')
    await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()

    // App wechselt auf die Listenansicht — leerer Bestand zeigt den „kein Projekt-Inhalt"-Leerzustand.
    await expect(fenster.getByRole('table')).toBeVisible()
    await expect(fenster.getByText('Noch keine Personen')).toBeVisible()

    // Import auslösen: keine Import-Ansicht in diesem Auftrag (s. Kopfkommentar), darum direkt über
    // die IPC-Brücke, wie ablauf-00-projekt.spec.ts es für Projekt-Befehle bereits tut.
    const importPfad = eigenstaendigeImportdateiSchreiben(importOrdner)
    const importErgebnis = await fenster.evaluate(async (pfad) => window.wurzelwerk.aufrufen('befehl:import.ausfuehren', { pfad }), importPfad)
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
  })
})
