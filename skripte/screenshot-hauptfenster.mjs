// Startet die gebaute App (aus out/, siehe electron-vite build) und speichert einen
// Screenshot des Hauptfensters. Läuft in der CI unter windows-latest als Baseline-Gate
// für die Windows-Rückmeldung aus ADR-012 / ADR-025 Punkt 3.
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { _electron as electron } from '@playwright/test'

const zielpfad = process.argv[2] ?? 'artefakte/hauptfenster.png'

await mkdir(path.dirname(zielpfad), { recursive: true })

const app = await electron.launch({ args: ['.'] })
const fenster = await app.firstWindow()
await fenster.waitForLoadState('load')
await fenster.getByText('Wurzelwerk').first().waitFor({ state: 'visible' })
await fenster.screenshot({ path: zielpfad })
await app.close()

console.log(`Screenshot gespeichert: ${zielpfad}`)
