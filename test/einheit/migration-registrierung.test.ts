import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MIGRATIONEN, migrationsDateiPfad, pruefsummeBerechnen } from '../../src/main/datenbank/migration/registrierung'

/**
 * AP-0.5: Die Prüfsumme in der Registry muss zum tatsächlichen Byte-Inhalt der Migrationsdatei
 * passen — sonst würde `laeufer.ts` beim ersten echten Öffnen sofort `PROJEKT_MIGRATION_GEAENDERT`
 * werfen. Bei einer Abweichung druckt die Fehlermeldung den korrekt berechneten Wert, damit er
 * einmalig in `registrierung.ts` übernommen werden kann.
 */
describe('main/datenbank/migration/registrierung — Prüfsummen', () => {
  it.each(MIGRATIONEN)('Migration $version ($datei): eingetragene Prüfsumme stimmt mit der Datei überein', (eintrag) => {
    const rohInhalt = readFileSync(migrationsDateiPfad(eintrag.datei))
    const berechnet = pruefsummeBerechnen(rohInhalt)
    expect(berechnet, `Erwartete Prüfsumme für ${eintrag.datei}: ${berechnet} (eingetragen: ${eintrag.pruefsumme})`).toBe(
      eintrag.pruefsumme,
    )
  })
})
