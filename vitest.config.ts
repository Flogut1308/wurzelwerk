import { defineConfig } from 'vitest/config'

// Gemeinsame Testeinstellungen für das schnelle Gate (vitest.config.ts) und die Leistungsbudgets
// (vitest.budget.config.ts).
export const basisTest = {
  environment: 'node' as const,
  // Globale Zeitgrenze pro Test/Hook: 20 s statt Vitest-Default 5 s. Die VACUUM-INTO-schweren
  // Schnappschuss-/Aufbewahrungs-Tests (AP-0.11) und die historischen Migrationstests kopieren
  // ganze SQLite-Dateien und liefen auf dem Windows-CI-Runner belegt 7-13 s — der Default riss
  // dort nichtdeterministisch (CLAUDE.md §13: eine nichtdeterministisch rote Prüfung wird von der
  // Loop "wegoptimiert"). 20 s gibt klare Marge, ohne echte Hänger zu verdecken (AP-0.25).
  testTimeout: 20000,
  hookTimeout: 20000,
  coverage: {
    provider: 'v8' as const,
    include: ['src/**'],
  },
}

// Das schnelle Gate (`pnpm test`/`pnpm pruefe`) schließt `test/budget/**` bewusst aus: die
// Leistungsbudgets sind maschinenabhängige Timing-Messungen und gehören laut CLAUDE.md §13 in das
// langsame Gate `pnpm test:budget` (vitest.budget.config.ts), nicht in die blockierende
// Jede-Iteration-Prüfung — sonst reißt das Gate auf langsamen CI-Runnern nichtdeterministisch rot
// (AP-1.6: `test/budget/leistung.test.ts` lief auf windows-latest bei 28,9 ms > 20 ms Budget).
export default defineConfig({
  test: {
    ...basisTest,
    include: ['test/**/*.test.ts'],
    exclude: ['test/e2e/**', 'test/budget/**', 'node_modules/**'],
  },
})
