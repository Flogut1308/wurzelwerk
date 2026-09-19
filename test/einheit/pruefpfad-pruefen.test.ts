// AP-0.7, test/einheit/pruefpfad-pruefen.test.ts: reine Entscheidungslogik von
// skripte/pruefpfad-pruefen.ts (ADR-025 + Nachtrag AP-0.7). Diese Datei ist selbst NICHT der
// geschützte Prüfpfad (liegt unter test/einheit/, nicht test/schema/invarianten/golden) - sie
// prüft nur das Skript, das den geschützten Prüfpfad überwacht.
//
// AP-0.25 PR-4-Ergänzung: drei bisherige Lücken des Skripts.
//   (1) test/migration/** war nirgends erfasst.
//   (2) src/main/datenbank/migration/registrierung.ts (die Prüfsummen-Wahrheit, ADR-025 nennt sie
//       geschützt) zählte nur als Produktivcode, nie als geschützt.
//   (3) Von test/invarianten INDIREKT importierte Helfer außerhalb der drei Schutz-Wurzeln
//       (test/hilfsmittel/fixture-laden.ts, test/hilfsmittel/fixture-bauen.ts,
//       test/einheit/_hilfen-abgeleitet.ts) waren ungeschützt.
//
// ADR-028-Ergänzung: test/golden/bilder/** (Bildvergleich-Referenzbilder) ist vom harten
// src-Mischverbot ausgenommen - Sichtbaselines wandern legitim mit der UI mit (kette-ui.md §3.3).
// Alle anderen test/golden/-Pfade (Layout-/Logik-Goldens) und test/invarianten/ bleiben
// ausnahmslos geschützt.
import { describe, expect, it } from 'vitest'
import { ermittleIndirektGeschuetzteHelfer, pruefpfadAuswerten } from '../../skripte/pruefpfad-pruefen'

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
    expect(ergebnis.schemaBedingtGeaendert).toBe(true)
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
    expect(ergebnis.schemaBedingtGeaendert).toBe(false)
  })

  it('erkennt eine Migrationsdatei nur im erwarteten vierstelligen Namensschema unter docs/schema/', () => {
    const ohneMigration = pruefpfadAuswerten(['docs/schema/README.md', 'test/schema/vollstaendigkeit.test.ts', 'src/x.ts'])
    expect(ohneMigration.enthaeltMigrationsAenderung).toBe(false)
    expect(ohneMigration.unzulaessigeVermischung).toBe(true)
  })
})

describe('test/migration und registrierung.ts sind schema-artig geschützt (AP-0.25 PR-4)', () => {
  it('meldet eine Vermischung, wenn test/migration sich ohne begleitende Migrationsdatei mit Produktivcode ändert', () => {
    const ergebnis = pruefpfadAuswerten(['test/migration/historisch.test.ts', 'src/main/datenbank/verbindung.ts'])
    expect(ergebnis.unzulaessigeVermischung).toBe(true)
    expect(ergebnis.schemaBedingtGeaendert).toBe(true)
  })

  it('erlaubt test/migration zusammen mit Produktivcode, wenn eine neue docs/schema/00NN_*.sql-Migration dabei ist', () => {
    const ergebnis = pruefpfadAuswerten([
      'docs/schema/0004_neu.sql',
      'test/migration/historisch.test.ts',
      'src/main/datenbank/verbindung.ts',
    ])
    expect(ergebnis.unzulaessigeVermischung).toBe(false)
    expect(ergebnis.schemaBedingtGeaendert).toBe(true)
  })

  it('meldet eine Vermischung, wenn registrierung.ts sich ohne Migrationsdatei mit Produktivcode ändert', () => {
    const ergebnis = pruefpfadAuswerten([
      'src/main/datenbank/migration/registrierung.ts',
      'src/main/datenbank/verbindung.ts',
    ])
    expect(ergebnis.unzulaessigeVermischung).toBe(true)
    expect(ergebnis.schemaBedingtGeaendert).toBe(true)
  })

  it('erlaubt registrierung.ts zusammen mit Produktivcode, wenn eine neue Migrationsdatei dabei ist', () => {
    const ergebnis = pruefpfadAuswerten([
      'docs/schema/0004_neu.sql',
      'src/main/datenbank/migration/registrierung.ts',
      'src/main/datenbank/verbindung.ts',
    ])
    expect(ergebnis.unzulaessigeVermischung).toBe(false)
  })

  it('test/invarianten bleibt ausnahmslos geschützt, selbst wenn zusätzlich test/migration und eine Migrationsdatei beteiligt sind', () => {
    const ergebnis = pruefpfadAuswerten([
      'docs/schema/0004_neu.sql',
      'test/migration/historisch.test.ts',
      'test/invarianten/zyklusfreiheit.test.ts',
      'src/main/datenbank/verbindung.ts',
    ])
    expect(ergebnis.unzulaessigeVermischung).toBe(true)
  })
})

describe('ADR-028: test/golden/bilder (Bildvergleich-Baselines) ist vom harten src-Mischverbot ausgenommen', () => {
  it('erlaubt ein Referenzbild unter test/golden/bilder zusammen mit src/ im selben Vergleich', () => {
    const ergebnis = pruefpfadAuswerten(['test/golden/bilder/liste-hell-darwin.png', 'src/renderer/x.tsx'])
    expect(ergebnis.unzulaessigeVermischung).toBe(false)
  })

  it('ein Referenzbild unter test/golden/bilder allein ist ohnehin keine Vermischung', () => {
    const ergebnis = pruefpfadAuswerten(['test/golden/bilder/x.png'])
    expect(ergebnis.unzulaessigeVermischung).toBe(false)
  })

  it('Regression: test/invarianten bleibt trotz ADR-028 ausnahmslos geschützt', () => {
    const ergebnis = pruefpfadAuswerten(['test/invarianten/zyklusfreiheit.test.ts', 'src/main/repositories/basis.ts'])
    expect(ergebnis.unzulaessigeVermischung).toBe(true)
  })

  it('Regression: ein Layout-Golden unter test/golden/ (außerhalb von bilder/) bleibt ausnahmslos geschützt', () => {
    const ergebnis = pruefpfadAuswerten(['test/golden/layout/generationen.json', 'src/core/layout/vertrag.ts'])
    expect(ergebnis.unzulaessigeVermischung).toBe(true)
  })
})

describe('indirekt von test/invarianten importierte Helfer sind geschützt (AP-0.25 PR-4)', () => {
  it('ermittelt die von test/invarianten indirekt importierten Helfer außerhalb der drei Schutz-Wurzeln', () => {
    const helfer = ermittleIndirektGeschuetzteHelfer()
    const dateien = helfer.map((eintrag) => eintrag.datei)

    expect(dateien).toContain('test/hilfsmittel/fixture-laden.ts')
    expect(dateien).toContain('test/hilfsmittel/fixture-bauen.ts')
    expect(dateien).toContain('test/einheit/_hilfen-abgeleitet.ts')

    for (const eintrag of helfer) {
      expect(eintrag.modus).toBe('immer')
    }
  })

  it('lehnt einen Vergleich ab, der test/hilfsmittel/fixture-laden.ts zusammen mit Produktivcode ändert', () => {
    const helfer = ermittleIndirektGeschuetzteHelfer()
    const ergebnis = pruefpfadAuswerten(['test/hilfsmittel/fixture-laden.ts', 'src/main/repositories/basis.ts'], helfer)
    expect(ergebnis.unzulaessigeVermischung).toBe(true)
  })

  it('lehnt einen Vergleich ab, der test/einheit/_hilfen-abgeleitet.ts zusammen mit Produktivcode ändert', () => {
    const helfer = ermittleIndirektGeschuetzteHelfer()
    const ergebnis = pruefpfadAuswerten(['test/einheit/_hilfen-abgeleitet.ts', 'src/main/repositories/basis.ts'], helfer)
    expect(ergebnis.unzulaessigeVermischung).toBe(true)
  })

  it('ohne die zusätzliche Helfer-Liste bleibt derselbe Vergleich unerkannt (Beleg für die ursprüngliche Lücke)', () => {
    const ergebnis = pruefpfadAuswerten(['test/hilfsmittel/fixture-laden.ts', 'src/main/repositories/basis.ts'])
    expect(ergebnis.unzulaessigeVermischung).toBe(false)
  })
})
