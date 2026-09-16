// AP-1.3a, 56_Import_Vertrag.md §3.1/§4 IMP-105: `zusammenfassung` wird gegen die tatsächlichen
// Arraylängen gegengeprüft — der häufigste Ausfall bei maschinell erzeugten Dateien ist eine
// abgeschnittene Datei, keine Syntaxverletzung. Diese Prüfung läuft erst NACH einer sauberen
// Schemaprüfung (§4 Stufe 1 Reihenfolge (d)), darum die Gegenprobe: eine gültige Fixture darf
// niemals IMP-105 auslösen.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { pruefeStufe1 } from '../../src/main/import/validierung'

const FEHLERHAFT_ORDNER = fileURLToPath(new URL('../../fixtures/import/v1/fehlerhaft', import.meta.url))
const GUELTIG_ORDNER = fileURLToPath(new URL('../../fixtures/import/v1/gueltig', import.meta.url))

function jsonDateien(ordner: string): readonly string[] {
  return readdirSync(ordner)
    .filter((name) => name.endsWith('.json'))
    .sort()
}

describe('IMP-105 — zusammenfassung gegen tatsächliche Anzahl (§3.1, §4)', () => {
  it.each(jsonDateien(FEHLERHAFT_ORDNER).filter((name) => name.startsWith('imp-105')))('%s löst genau IMP-105 aus', (dateiname) => {
    const pfad = join(FEHLERHAFT_ORDNER, dateiname)
    const rohtext = readFileSync(pfad, 'utf8')

    const ergebnis = pruefeStufe1(rohtext, dateiname)

    expect(ergebnis.akzeptiert).toBe(false)
    expect(ergebnis.befunde.map((befund) => befund.code)).toEqual(['IMP-105'])
  })

  it.each(jsonDateien(GUELTIG_ORDNER))('%s (gültig) löst KEIN IMP-105 aus', (dateiname) => {
    const pfad = join(GUELTIG_ORDNER, dateiname)
    const rohtext = readFileSync(pfad, 'utf8')

    const ergebnis = pruefeStufe1(rohtext, dateiname)

    expect(ergebnis.befunde.some((befund) => befund.code === 'IMP-105')).toBe(false)
  })
})
