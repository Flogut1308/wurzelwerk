// AP-0.7 PR-A, test/einheit/suchnormalform.test.ts (CLAUDE.md §5 eiserne Regel: erst der Test).
// Die vier Dokumentationsbeispiele aus dem freigegebenen Plan (ADR-014, C-16): Kölner-Phonetik ist
// ein eigener Test, hier geht es nur um die diakritika-/schriftsystemfreie Sortier-/Suchnormalform.
import { describe, expect, it } from 'vitest'
import { suchnormalform } from '../../src/core/name/suchnormalform'

describe('suchnormalform (src/core/name/suchnormalform.ts, AP-0.7)', () => {
  it('entfernt lateinische Diakritika: Wróbel -> wrobel', () => {
    expect(suchnormalform('Wróbel')).toBe('wrobel')
  })

  it('transliteriert Kyrillisch nach ISO-9-naher Vorgabe: Щербаков -> scerbakov', () => {
    expect(suchnormalform('Щербаков')).toBe('scerbakov')
  })

  it('entfernt Umlaut-Diakritika: Müller -> muller', () => {
    expect(suchnormalform('Müller')).toBe('muller')
  })

  it('entfernt Apostrophe: d’Aboville -> daboville (auch d\'Aboville mit geradem Apostroph)', () => {
    expect(suchnormalform("d'Aboville")).toBe('daboville')
    expect(suchnormalform('d’Aboville')).toBe('daboville')
  })

  it('entfernt Bindestriche und Leerzeichen', () => {
    expect(suchnormalform('Anna-Maria Müller')).toBe('annamariamuller')
  })

  it('ist bei leerem Text leer', () => {
    expect(suchnormalform('')).toBe('')
  })
})
