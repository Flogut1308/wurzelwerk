import { describe, expect, it } from 'vitest'

/**
 * AP-0.16: belegt, dass Vitest im `test/budget/`-Verzeichnis wirklich Tests findet und ausführt,
 * damit der Jobname „Leistungsbudgets" nicht lügt, bis AP-1.6/AP-1.8 die echten Budgets bringen.
 * Nur eine untere Schranke (`performance.now()` ist monoton) — kein Zeitbudget als Obergrenze,
 * das auf langsamer CI nichtdeterministisch rot würde (CLAUDE.md §13).
 */
describe('Budget-Gerüst', () => {
  it('misst eine Zeitspanne ohne obere Schranke', () => {
    const start = performance.now()
    const ende = performance.now()
    expect(ende - start).toBeGreaterThanOrEqual(0)
  })
})
