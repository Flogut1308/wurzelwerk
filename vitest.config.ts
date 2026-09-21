import { defineConfig } from 'vitest/config'

// Gemeinsame Testeinstellungen für das schnelle Gate (vitest.config.ts) und die Leistungsbudgets
// (vitest.budget.config.ts).
export const basisTest = {
  environment: 'node' as const,
  // Globale Zeitgrenze pro Test/Hook: 60 s statt Vitest-Default 5 s. Die VACUUM-INTO-schweren
  // Schnappschuss-/Aufbewahrungs-/Undo-Tests (AP-0.11, AP-1.5) und die historischen Migrationstests
  // kopieren ganze SQLite-Dateien; auf einem ausgelasteten Windows-CI-Runner steigt ihre Laufzeit
  // belegt um das ~4-fache (undo-bitgleich 64 s statt ~15 s), wodurch `import-undo-klein` und
  // `undo-nach-neustart` bei 20 s nichtdeterministisch rissen (belegt AP-1.15, mehrere kette-ui-Läufe;
  // CLAUDE.md §13: eine nichtdeterministisch rote Prüfung wird von der Loop "wegoptimiert"). 60 s gibt
  // klare Marge über die beobachteten Lastspitzen, ohne echte Hänger unangemessen zu verdecken. Die
  // schwersten Property-/Großimport-Tests behalten eigene, höhere Per-Test-Timeouts
  // (`undo-bitgleich` 180 s, `import-undo-gross` 60 s) — die decken den Fall ab, wo selbst 60 s nicht reichen.
  testTimeout: 60000,
  hookTimeout: 60000,
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
    // `.test.tsx` zusätzlich zu `.test.ts` (AP-1.11): Atom-Tests rendern über `renderToStaticMarkup`
    // (react-dom/server) echtes JSX — das braucht die `tsx`-Lade-Regel von esbuild, die `.ts`-Dateien
    // nicht bekommen (dort würde `<Symbol .../>` als TS-Typ-Assertion fehlschlagen).
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    exclude: ['test/e2e/**', 'test/budget/**', 'node_modules/**'],
  },
})
