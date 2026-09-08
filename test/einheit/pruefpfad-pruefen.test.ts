// AP-0.7, test/einheit/pruefpfad-pruefen.test.ts: reine Entscheidungslogik von
// skripte/pruefpfad-pruefen.ts (ADR-025 + Nachtrag AP-0.7). Diese Datei ist selbst NICHT der
// geschützte Prüfpfad (liegt unter test/einheit/, nicht test/schema/invarianten/golden) - sie
// prüft nur das Skript, das den geschützten Prüfpfad überwacht.
import { describe, expect, it } from 'vitest'
import { pruefpfadAuswerten } from '../../skripte/pruefpfad-pruefen'

describe('pruefpfadAuswerten (ADR-025 + AP-0.7-Nachtrag)', () => {
  it('meldet keine Vermischung ohne geschützte Pfade', () => {
    const ergebnis = pruefpfadAuswerten(['src/core/name/suchnormalform.ts', 'test/einheit/suchnormalform.test.ts'])
    expect(ergebnis.unzulaessigeVermischung).toBe(false)
  })

  it('meldet eine Vermischung, wenn test/invarianten und src/ im selben Vergleich stehen', () => {
    const ergebnis = pruefpfadAuswerten(['test/invarianten/abgeleitet-gleich.test.ts', 'src/main/datenbank/trigger.ts'])
    expect(ergebnis.unzulaessigeVermischung).toBe(true)
  })

  it('meldet eine Vermischung, wenn test/golden und src/ im selben Vergleich stehen', () => {
    const ergebnis = pruefpfadAuswerten(['test/golden/layout.test.ts', 'src/core/layout/vertrag.ts'])
    expect(ergebnis.unzulaessigeVermischung).toBe(true)
  })

  it('meldet eine Vermischung, wenn test/schema und src/ sich ändern, aber KEINE Migrationsdatei dabei ist', () => {
    const ergebnis = pruefpfadAuswerten(['test/schema/vollstaendigkeit.test.ts', 'src/main/repositories/basis.ts'])
    expect(ergebnis.unzulaessigeVermischung).toBe(true)
    expect(ergebnis.enthaeltMigrationsAenderung).toBe(false)
  })

  it('ADR-025-Nachtrag: test/schema und src/ dürfen sich zusammen ändern, wenn eine docs/schema/00NN_*.sql-Migration dabei ist', () => {
    const ergebnis = pruefpfadAuswerten([
      'docs/schema/0003_abgeleitet.sql',
      'test/schema/vollstaendigkeit.test.ts',
      'src/main/repositories/basis.ts',
    ])
    expect(ergebnis.unzulaessigeVermischung).toBe(false)
    expect(ergebnis.enthaeltMigrationsAenderung).toBe(true)
    expect(ergebnis.schemaTestsGeaendert).toBe(true)
  })

  it('ADR-025-Nachtrag gilt NICHT für test/invarianten oder test/golden, selbst mit Migrationsdatei', () => {
    const mitInvarianten = pruefpfadAuswerten([
      'docs/schema/0003_abgeleitet.sql',
      'test/invarianten/abgeleitet-gleich.test.ts',
      'src/main/repositories/basis.ts',
    ])
    expect(mitInvarianten.unzulaessigeVermischung).toBe(true)

    const mitGolden = pruefpfadAuswerten([
      'docs/schema/0003_abgeleitet.sql',
      'test/golden/layout.test.ts',
      'src/main/repositories/basis.ts',
    ])
    expect(mitGolden.unzulaessigeVermischung).toBe(true)
  })

  it('eine Migrationsdatei ohne begleitende test/schema-Änderung bleibt einfach unzulässige Vermischung, falls andere geschützte Pfade betroffen sind', () => {
    const ergebnis = pruefpfadAuswerten(['docs/schema/0003_abgeleitet.sql', 'src/main/repositories/basis.ts'])
    expect(ergebnis.unzulaessigeVermischung).toBe(false)
    expect(ergebnis.schemaTestsGeaendert).toBe(false)
  })

  it('erkennt eine Migrationsdatei nur im erwarteten vierstelligen Namensschema unter docs/schema/', () => {
    const ohneMigration = pruefpfadAuswerten(['docs/schema/README.md', 'test/schema/vollstaendigkeit.test.ts', 'src/x.ts'])
    expect(ohneMigration.enthaeltMigrationsAenderung).toBe(false)
    expect(ohneMigration.unzulaessigeVermischung).toBe(true)
  })
})
