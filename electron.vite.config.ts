import { cpSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const REPO_ROOT = dirname(fileURLToPath(import.meta.url))

/**
 * Kopiert `docs/schema/**` byteweise nach `out/main/docs/schema` (AP-0.17-SPIKE, empirisch
 * geprüft): im unverpackten Lauf `electron out/main/index.js` (`pnpm test:e2e`, Vorstufe von
 * `pnpm build`) liefert `app.getAppPath()` das Verzeichnis des Einstiegsskripts (`out/main`),
 * nicht das Repo-Root — anders als bei `pnpm dev` (`electron-vite dev` startet aus dem
 * Repo-Root, `docs/schema` liegt dort bereits). Für die gepackte App (`electron-builder`) landet
 * `docs/schema` stattdessen unverändert im asar-Root (`electron-builder.yml`, `files:`); dieser
 * Kopierschritt betrifft nur die Dev-/E2E-Auflösung aus `out/main`. `cpSync` kopiert Rohbytes ohne
 * Transformation — die Migrations-Prüfsummen (`src/main/datenbank/migration/registrierung.ts`)
 * bleiben unberührt.
 */
function migrationsSqlKopierenPlugin(): Plugin {
  return {
    name: 'wurzelwerk-migrations-sql-kopieren',
    closeBundle() {
      const quelle = join(REPO_ROOT, 'docs', 'schema')
      const ziel = join(REPO_ROOT, 'out', 'main', 'docs', 'schema')
      if (existsSync(quelle)) {
        cpSync(quelle, ziel, { recursive: true })
      }
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), migrationsSqlKopierenPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
  },
})
