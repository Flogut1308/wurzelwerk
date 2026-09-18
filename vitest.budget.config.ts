import { defineConfig } from 'vitest/config'
import { basisTest } from './vitest.config'

// Nur die Leistungsbudgets (`pnpm test:budget`, langsames Gate / Torwächter vor dem Merge,
// CLAUDE.md §13). Bewusst getrennt vom schnellen Gate (vitest.config.ts), damit die
// maschinenabhängigen Timing-Messungen die blockierende Jede-Iteration-Prüfung nicht
// nichtdeterministisch rot machen. Überschreitungen sind lokal ein Fehler, in der CI nur eine
// Warnung (CLAUDE.md §3) — diese Unterscheidung trifft der Budget-Test selbst.
export default defineConfig({
  test: {
    ...basisTest,
    include: ['test/budget/**/*.test.ts'],
    exclude: ['node_modules/**'],
  },
})
