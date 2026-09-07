import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'

/**
 * AP-0.5, Abnahme: "user_version größer als SCHEMA_VERSION → PROJEKT_NEUERE_SCHEMAVERSION,
 * Abbruch." Simuliert eine Datei, die mit einer neueren Programmversion erstellt wurde.
 */
describe('main/datenbank/migration/laeufer — neuere Schemaversion als das Programm', () => {
  it('user_version über der Zielversion wirft PROJEKT_NEUERE_SCHEMAVERSION statt zu migrieren', () => {
    const db = new Database(':memory:')
    try {
      db.pragma('user_version = 99')

      try {
        migrieren(db)
        expect.unreachable()
      } catch (u) {
        expect(u).toBeInstanceOf(WurzelFehler)
        if (u instanceof WurzelFehler) {
          expect(u.code).toBe('PROJEKT_NEUERE_SCHEMAVERSION')
        }
      }

      expect(db.pragma('user_version', { simple: true })).toBe(99)
    } finally {
      db.close()
    }
  })
})
