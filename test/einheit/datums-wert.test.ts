// AP-1.30 PR 9a (D1): die reine Wertregel für direkt erfasste Aussagen (src/core/person/datums-wert.ts).
import { describe, expect, it } from 'vitest'
import { aussageWertVerletzung, DATUMS_PRAEDIKATE, istDatumsPraedikat } from '../../src/core/person/datums-wert'
import { ORTS_PRAEDIKATE } from '../../src/core/person/ort-wert'

describe('aussageWertVerletzung (AP-1.30 PR 9a, D1)', () => {
  it('die Datumsprädikate sind genau geburtsdatum und todesdatum und überschneiden sich nicht mit den Orts-Prädikaten', () => {
    expect([...DATUMS_PRAEDIKATE]).toEqual(['geburtsdatum', 'todesdatum'])
    for (const ort of ORTS_PRAEDIKATE) expect(istDatumsPraedikat(ort)).toBe(false)
    expect(istDatumsPraedikat('beruf')).toBe(false)
    expect(istDatumsPraedikat('')).toBe(false)
  })

  it('genau ein Wert ist überall gültig, mit oder ohne Datum', () => {
    for (const praedikat of ['beruf', 'geburtsdatum', 'geburtsort']) {
      expect(aussageWertVerletzung(praedikat, { anzahlWerte: 1, hatDatum: false })).toBeNull()
      expect(aussageWertVerletzung(praedikat, { anzahlWerte: 1, hatDatum: true })).toBeNull()
    }
  })

  it('zwei oder drei Werte sind überall ungültig — auch an Datumsprädikaten', () => {
    for (const praedikat of ['beruf', 'geburtsdatum', 'todesdatum']) {
      expect(aussageWertVerletzung(praedikat, { anzahlWerte: 2, hatDatum: true })).toBe('mehrere')
      expect(aussageWertVerletzung(praedikat, { anzahlWerte: 3, hatDatum: false })).toBe('mehrere')
    }
  })

  it('kein Wert: nur an Datumsprädikaten mit Datum gültig', () => {
    expect(aussageWertVerletzung('geburtsdatum', { anzahlWerte: 0, hatDatum: true })).toBeNull()
    expect(aussageWertVerletzung('todesdatum', { anzahlWerte: 0, hatDatum: true })).toBeNull()
    expect(aussageWertVerletzung('geburtsdatum', { anzahlWerte: 0, hatDatum: false })).toBe('keiner')
    expect(aussageWertVerletzung('beruf', { anzahlWerte: 0, hatDatum: true })).toBe('keiner')
    expect(aussageWertVerletzung('geburtsort', { anzahlWerte: 0, hatDatum: true })).toBe('keiner')
  })
})
