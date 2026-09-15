import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/e2e/**', 'node_modules/**'],
    environment: 'node',
    // Globale Zeitgrenze pro Test/Hook: 20 s statt Vitest-Default 5 s. Die VACUUM-INTO-schweren
    // Schnappschuss-/Aufbewahrungs-Tests (AP-0.11) und die historischen Migrationstests kopieren
    // ganze SQLite-Dateien und liefen auf dem Windows-CI-Runner belegt 7-13 s — der Default riss
    // dort nichtdeterministisch (CLAUDE.md §13: eine nichtdeterministisch rote Prüfung wird von der
    // Loop "wegoptimiert"). 20 s gibt klare Marge, ohne echte Hänger zu verdecken (AP-0.25).
    testTimeout: 20000,
    hookTimeout: 20000,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
    },
  },
})
