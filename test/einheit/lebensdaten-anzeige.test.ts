// AP-1.10 PR-A (U-1.6-lebensdaten-unschaerfe) — rot zuerst (CLAUDE.md §5): vor der Implementierung
// geschrieben. Deckt die Unschärfefälle aus dem Formatierer (AP-1.1, `src/core/datum/formatierer.ts`)
// über `src/renderer/bausteine/lebensdaten-anzeige.ts` ab — "etwa 1890 – 1961" statt nur "1890 –
// 1961" (docs/72_Screens_und_Flows.md S-05).
import { describe, expect, it } from 'vitest'
import { datumsgruppeZuDatumswert, lebensdatenAnzeige, lebensdatenFormatergebnis } from '../../src/renderer/bausteine/lebensdaten-anzeige'
import type { PersonListeDatumsgruppe } from '../../src/shared/schemata/person-liste'

function gruppe(ueberschreibung: Partial<PersonListeDatumsgruppe> = {}): PersonListeDatumsgruppe {
  return {
    kalender: 'gregorian',
    modifikator: 'exakt',
    praezision: 'jahr',
    wert1: '1890',
    wert2: null,
    originaltext: null,
    sortVon: 2411480,
    sortBis: 2411480,
    ...ueberschreibung,
  }
}

describe('datumsgruppeZuDatumswert (AP-1.10 PR-A)', () => {
  it('liefert null für eine fehlende Datumsgruppe', () => {
    expect(datumsgruppeZuDatumswert(null)).toBeNull()
  })

  it('lässt wert2/originaltext bei null-Werten weg statt sie auf undefined zu setzen (exactOptionalPropertyTypes)', () => {
    const ergebnis = datumsgruppeZuDatumswert(gruppe())
    expect(ergebnis).not.toBeNull()
    expect(Object.hasOwn(ergebnis as object, 'wert2')).toBe(false)
    expect(Object.hasOwn(ergebnis as object, 'originaltext')).toBe(false)
  })

  it('übernimmt wert2/originaltext, wenn gesetzt', () => {
    const ergebnis = datumsgruppeZuDatumswert(gruppe({ modifikator: 'zwischen', wert1: '1750', wert2: '1760', originaltext: 'zwischen 1750 und 1760' }))
    expect(ergebnis?.wert2).toBe('1760')
    expect(ergebnis?.originaltext).toBe('zwischen 1750 und 1760')
  })
})

describe('lebensdatenFormatergebnis (AP-1.10 PR-A, deckt sich mit src/core/datum/formatierer.ts)', () => {
  it('liefert null ohne Datumsgruppe', () => {
    expect(lebensdatenFormatergebnis(null)).toBeNull()
  })

  it('Modifikator "etwa": datum:um mit dem Jahr', () => {
    const ergebnis = lebensdatenFormatergebnis(gruppe({ modifikator: 'etwa', wert1: '1890' }))
    expect(ergebnis).toEqual({ schluessel: 'datum:um', werte: { jahr: '1890' } })
  })

  it('Modifikator "exakt", Präzision "jahr": datum:jahr', () => {
    const ergebnis = lebensdatenFormatergebnis(gruppe({ modifikator: 'exakt', praezision: 'jahr', wert1: '1961' }))
    expect(ergebnis).toEqual({ schluessel: 'datum:jahr', werte: { jahr: '1961' } })
  })

  it('ein gesetzter Originaltext gewinnt immer', () => {
    const ergebnis = lebensdatenFormatergebnis(gruppe({ originaltext: '1750/51' }))
    expect(ergebnis).toEqual({ schluessel: 'datum:originaltext', werte: { text: '1750/51' } })
  })
})

describe('lebensdatenAnzeige (AP-1.10 PR-A, verkettet bereits übersetzte Texte)', () => {
  it('Unschärfe sichtbar: "etwa 1890" – "1961" → "etwa 1890 – 1961" (S-05-Beispielzeile)', () => {
    expect(lebensdatenAnzeige('etwa 1890', '1961')).toBe('etwa 1890 – 1961')
  })

  it('nur Geburt bekannt', () => {
    expect(lebensdatenAnzeige('1890', null)).toBe('1890 – ')
  })

  it('nur Tod bekannt', () => {
    expect(lebensdatenAnzeige(null, '1961')).toBe(' – 1961')
  })

  it('beide unbekannt: leere Zeichenkette', () => {
    expect(lebensdatenAnzeige(null, null)).toBe('')
  })
})
