import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from '../../src/main/datenbank/migration/registrierung'
import { MANIFEST_SCHEMAVERSION } from '../../src/shared/konstanten'

/**
 * AP-0.5: Zwei Quellen der Wahrheit für "welche Schemaversion", aus Grenzgründen (§2) getrennt —
 * `MANIFEST_SCHEMAVERSION` (String, `src/shared`) darf nicht aus `src/main` importieren, obwohl
 * er inhaltlich `String(SCHEMA_VERSION)` (Integer, `src/main/datenbank/migration/registrierung.ts`)
 * entsprechen MUSS. Dieser Test hält beide Seiten maschinell synchron: eine neue Migration ohne
 * angepasste `MANIFEST_SCHEMAVERSION` fällt hier sofort auf.
 */
describe('Schemaversion-Konsistenz zwischen shared/konstanten und main/datenbank/migration', () => {
  it('MANIFEST_SCHEMAVERSION entspricht String(SCHEMA_VERSION)', () => {
    expect(MANIFEST_SCHEMAVERSION).toBe(String(SCHEMA_VERSION))
  })
})
