import { describe, expect, it } from 'vitest'
import { schemaAbzugFrischerDatenbank } from '../../skripte/schema-dump'

/**
 * AP-0.5, §9.4: `pnpm schema:dump` muss bei zweifachem Aufruf bitgleich sein — sonst wäre der
 * Schemavergleich in `test/migration/historisch.test.ts` selbst nicht deterministisch.
 */
describe('skripte/schema-dump — Stabilität', () => {
  it('zwei Aufrufe auf frischen Datenbanken liefern denselben Abzug', () => {
    const ersterAbzug = schemaAbzugFrischerDatenbank()
    const zweiterAbzug = schemaAbzugFrischerDatenbank()
    expect(ersterAbzug).toBe(zweiterAbzug)
    expect(ersterAbzug.length).toBeGreaterThan(0)
  })
})
