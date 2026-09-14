import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MIGRATIONEN, migrationsDateiPfad, pruefsummeBerechnen } from '../../src/main/datenbank/migration/registrierung'

/**
 * AP-0.17: `migrationsDateiPfad` löst die SQL-Datei über ein **übergebenes** Basisverzeichnis auf,
 * nicht mehr über eine Annahme über `process.cwd()`. Nur so kann der Aufrufer im gepackten Prozess
 * `app.getAppPath()` und in Vitest das Repo-Wurzelverzeichnis einsetzen — eine Auflösung für
 * Entwicklung, Test und Paket (55_Architektur.md §9.3, 57_Phase0_Arbeitspakete.md AP-0.17).
 *
 * Das echte Repo-`docs/schema` (Basis für Prüfsumme/LF) wird hier aus `process.cwd()` gebildet
 * (Vitest läuft mit cwd = Repo-Root, vitest.config.ts) — das ist der Test, der die reale Datei
 * kennt, nicht die zu prüfende Funktion.
 */
const REPO_SCHEMA_BASIS = join(process.cwd(), 'docs', 'schema')

describe('main/datenbank/migration/registrierung — Pfadauflösung', () => {
  /**
   * Der eigentliche Rot-Beleg dieses Pakets: die Funktion darf `process.cwd()` NICHT mehr annehmen,
   * sondern hängt die Datei ans übergebene Basisverzeichnis. Reine Pfadlogik, braucht keine Datei —
   * die alte Ein-Argument-Fassung ignoriert den Basisparameter und baut stattdessen
   * `join(process.cwd(), 'docs', 'schema', <basis>)`, was hier abweicht.
   */
  it('hängt die Datei an das übergebene Basisverzeichnis (keine process.cwd()-Annahme)', () => {
    const fremdesPaket = join('/', 'beliebig', 'paket', 'ressourcen', 'docs', 'schema')
    expect(migrationsDateiPfad(fremdesPaket, '0001_grundgeruest.sql')).toBe(
      join(fremdesPaket, '0001_grundgeruest.sql'),
    )
  })
})

describe('main/datenbank/migration/registrierung — Prüfsummen', () => {
  it.each(MIGRATIONEN)('Migration $version ($datei): eingetragene Prüfsumme stimmt mit der Datei überein', (eintrag) => {
    const rohInhalt = readFileSync(migrationsDateiPfad(REPO_SCHEMA_BASIS, eintrag.datei))
    const berechnet = pruefsummeBerechnen(rohInhalt)
    expect(berechnet, `Erwartete Prüfsumme für ${eintrag.datei}: ${berechnet} (eingetragen: ${eintrag.pruefsumme})`).toBe(
      eintrag.pruefsumme,
    )
  })

  /**
   * Regressionsschutz für den Windows-CI-Fund: checkt git eine `.sql` mit CRLF aus (autocrlf),
   * weichen die Rohbytes von der auf macOS/LF berechneten Prüfsumme ab → `PROJEKT_MIGRATION_GEAENDERT`
   * beim Öffnen jeder Projektdatei. `.gitattributes` erzwingt `eol=lf`; dieser Test macht ein
   * versehentliches CR im Repo sichtbar, bevor es die Prüfsumme bricht.
   */
  it.each(MIGRATIONEN)('Migration $version ($datei): enthält keine CR-Bytes (LF-only)', (eintrag) => {
    const rohInhalt = readFileSync(migrationsDateiPfad(REPO_SCHEMA_BASIS, eintrag.datei))
    expect(rohInhalt.includes(0x0d), `${eintrag.datei} enthält CR (0x0D) — .gitattributes eol=lf greift nicht`).toBe(false)
  })
})
