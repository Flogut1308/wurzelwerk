// AP-1.27: `fixtures/import/v1/gueltig/eigenstaendig/` verspricht per Namen, dass jede Fixture
// darin gegen ein FRISCH migriertes, leeres Projekt fehlerfrei importierbar ist — keine `db:`-
// Referenz auf eine bereits vorhandene Person, kein fehlendes Medium. Das unterscheidet sie von
// `gueltig/braucht-bestand/` (z. B. `beispiel-3-interview.json`, das eine bereits vorhandene
// Person voraussetzt, §2.1). Diese Datei prüft das Versprechen über Stufe 1 + 2
// (`importPruefen()`, `src/main/import/pruefen.ts`) — nicht den Schreibpfad selbst (der ist an
// anderer Stelle geprüft, u. a. `test/invarianten/trockenlauf-gleich-import.test.ts`).
//
// Muster (frisches Projekt) analog `test/invarianten/trockenlauf-gleich-import.test.ts`:
// `mkdtempSync` + `oeffnen()` + `migrieren()`.
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { importPruefen } from '../../src/main/import/pruefen'

const EIGENSTAENDIG_ORDNER = fileURLToPath(new URL('../../fixtures/import/v1/gueltig/eigenstaendig/', import.meta.url))

function eigenstaendigeFixturePfade(): readonly string[] {
  return readdirSync(EIGENSTAENDIG_ORDNER)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => join(EIGENSTAENDIG_ORDNER, name))
}

describe('Fixture-Korpus: gueltig/eigenstaendig/ importiert fehlerfrei gegen ein frisches, leeres Projekt (AP-1.27)', () => {
  // Absicherung gegen einen leeren/verschobenen Ordner (CLAUDE.md §13: additive Tests, keine
  // leere Prüfung, die stillschweigend nichts prüft).
  it('mindestens drei Fixture-Dateien liegen unter fixtures/import/v1/gueltig/eigenstaendig/', () => {
    expect(eigenstaendigeFixturePfade().length).toBeGreaterThanOrEqual(3)
  })

  describe('je Fixture', () => {
    let ordner: string

    beforeEach(() => {
      ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-fixture-eigenstaendig-'))
    })

    afterEach(() => {
      rmSync(ordner, { recursive: true, force: true })
    })

    it.each(eigenstaendigeFixturePfade())('%s wird gegen ein frisches Projekt akzeptiert, ohne Befunde', (pfad) => {
      const db = oeffnen(join(ordner, 'baum.sqlite'))
      try {
        migrieren(db)
        const bericht = importPruefen(db, pfad)

        expect(bericht.akzeptiert, `${pfad}: ${JSON.stringify(bericht.befunde)}`).toBe(true)
        expect(bericht.befunde).toEqual([])
      } finally {
        db.close()
      }
    })
  })
})
