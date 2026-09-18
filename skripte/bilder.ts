// `pnpm bilder` (AP-1.11, 72_Screens_und_Flows.md S-19, „ansehen, nicht klicken"): startet die
// gebaute App (aus `out/`, wie `test:e2e`/`skripte/screenshot-hauptfenster.mjs`), öffnet die
// Zustandsbibliothek über denselben Kanal wie der native Menüpunkt „Entwicklung →
// Zustandsbibliothek" (Begründung: `test/e2e/zustandsbibliothek.spec.ts`-Kopfkommentar), fotografiert
// sie in allen vier Kombinationen (hell/dunkel × Standarddichte/kompakt) und schreibt daneben eine
// `kontaktabzug.html`, die alle vier nebeneinander zeigt.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from '@playwright/test'
import { VIER_KOMBINATIONEN, bilderDateiname, kombinationImDomSetzen, type BilderKombination } from './bilder-hilfen'

const REPO_WURZEL = fileURLToPath(new URL('..', import.meta.url))
const HAUPTPROZESS_EINSTIEG = join(REPO_WURZEL, 'out/main/index.js')
const BILDER_ORDNER = join(REPO_WURZEL, 'artefakte/bilder')

function kombinationBeschriftung(kombination: BilderKombination): string {
  return `${kombination.theme} · ${kombination.dichte}`
}

function kontaktabzugHtml(): string {
  const kacheln = VIER_KOMBINATIONEN.map(
    (kombination) =>
      `    <figure>\n      <img src="${bilderDateiname(kombination)}" alt="Zustandsbibliothek — ${kombinationBeschriftung(kombination)}" />\n      <figcaption>${kombinationBeschriftung(kombination)}</figcaption>\n    </figure>`,
  ).join('\n')
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Wurzelwerk — Zustandsbibliothek, Kontaktabzug</title>
  <style>
    body { font-family: sans-serif; background: #1c1a17; color: #e8e5de; margin: 0; padding: 24px; }
    .raster { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    figure { margin: 0; }
    img { width: 100%; border: 1px solid #555; display: block; }
    figcaption { margin-top: 8px; text-align: center; }
  </style>
</head>
<body>
  <h1>Zustandsbibliothek — vier Aufnahmen</h1>
  <div class="raster">
${kacheln}
  </div>
</body>
</html>
`
}

async function hauptlauf(): Promise<void> {
  mkdirSync(BILDER_ORDNER, { recursive: true })

  const app = await electron.launch({ args: [HAUPTPROZESS_EINSTIEG] })
  try {
    const fenster = await app.firstWindow()
    await fenster.waitForLoadState('load')

    await app.evaluate(({ BrowserWindow }) => {
      for (const fensterHandle of BrowserWindow.getAllWindows()) {
        fensterHandle.webContents.send('ereignis:zustandsbibliothekOeffnen', null)
      }
    })
    await fenster.locator('[data-testid="wz-zustandsbibliothek"]').waitFor({ state: 'visible' })

    for (const kombination of VIER_KOMBINATIONEN) {
      await fenster.evaluate(kombinationImDomSetzen, kombination)
      const zielpfad = join(BILDER_ORDNER, bilderDateiname(kombination))
      // KEIN `fullPage: true`: die Seite ist deutlich länger als 16384px (Chromiums Limit für die
      // Bitmap-Größe einer Aufnahme) — darüber wiederholt sich der untere Teil der Aufnahme
      // (empirisch geprüft, 18.09.2026). Ein Viewport-Ausschnitt vom zurückgesetzten Seitenanfang
      // (`kombinationImDomSetzen`) reicht als Checkpoint „ansehen, nicht klicken" (72 §S-19).
      await fenster.screenshot({ path: zielpfad })
      console.log(`Bild gespeichert: ${zielpfad}`)
    }
  } finally {
    await app.close()
  }

  const kontaktabzugPfad = join(BILDER_ORDNER, 'kontaktabzug.html')
  writeFileSync(kontaktabzugPfad, kontaktabzugHtml(), 'utf8')
  console.log(`Kontaktabzug geschrieben: ${kontaktabzugPfad}`)
}

// Kein Top-Level-`await` (esbuild/tsx transformiert dieses Skript beim Direktaufruf als CJS —
// "Top-level await is currently not supported with the 'cjs' output format", geprüft 18.09.2026).
hauptlauf().catch((fehler: unknown) => {
  console.error(fehler)
  process.exitCode = 1
})
