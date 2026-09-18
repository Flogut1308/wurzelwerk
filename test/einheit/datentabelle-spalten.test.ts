// AP-1.6 Stufe 3 (C-16 „Spaltenwahl"), CLAUDE.md §5 eiserne Regel: erst der Test.
import { describe, expect, it } from 'vitest'
import {
  ALLE_DATENTABELLE_SPALTEN,
  spalteUmschalten,
  spaltenRasterVorlage,
} from '../../src/renderer/bausteine/datentabelle-spalten'

describe('spalteUmschalten (src/renderer/bausteine/datentabelle-spalten.ts, AP-1.6)', () => {
  it('blendet eine sichtbare Spalte aus', () => {
    const ergebnis = spalteUmschalten(ALLE_DATENTABELLE_SPALTEN, 'geburtsort')
    expect(ergebnis).toEqual(['name', 'lebensdaten', 'konfidenz'])
  })

  it('blendet eine ausgeblendete Spalte wieder ein — an ihrer Standardposition, nicht ans Ende', () => {
    const ohneLebensdaten: readonly ('name' | 'lebensdaten' | 'geburtsort' | 'konfidenz')[] = ['name', 'geburtsort', 'konfidenz']
    const ergebnis = spalteUmschalten(ohneLebensdaten, 'lebensdaten')
    expect(ergebnis).toEqual(['name', 'lebensdaten', 'geburtsort', 'konfidenz'])
  })

  it('lässt die letzte verbleibende Spalte unverändert sichtbar', () => {
    const ergebnis = spalteUmschalten(['name'], 'name')
    expect(ergebnis).toEqual(['name'])
  })

  it('zweimaliges Umschalten derselben Spalte ergibt wieder den Ausgangszustand', () => {
    const einmal = spalteUmschalten(ALLE_DATENTABELLE_SPALTEN, 'konfidenz')
    const zweimal = spalteUmschalten(einmal, 'konfidenz')
    expect(zweimal).toEqual(ALLE_DATENTABELLE_SPALTEN)
  })
})

describe('spaltenRasterVorlage (src/renderer/bausteine/datentabelle-spalten.ts, AP-1.6)', () => {
  it('liefert für alle Spalten vier durch Leerzeichen getrennte Rasterwerte', () => {
    const vorlage = spaltenRasterVorlage(ALLE_DATENTABELLE_SPALTEN)
    expect(vorlage.split(' ').length).toBeGreaterThanOrEqual(4)
  })

  it('folgt der Standardreihenfolge unabhängig von der Reihenfolge im Eingabe-Array', () => {
    const vorlageStandard = spaltenRasterVorlage(['name', 'lebensdaten'])
    const vorlageVertauscht = spaltenRasterVorlage(['lebensdaten', 'name'])
    expect(vorlageVertauscht).toBe(vorlageStandard)
  })

  it('enthält nur die Breiten der übergebenen Spalten', () => {
    const vorlage = spaltenRasterVorlage(['name'])
    expect(vorlage).toBe('minmax(200px, 2fr)')
  })
})
