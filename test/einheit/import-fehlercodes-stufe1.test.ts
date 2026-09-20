// AP-1.3a, 56_Import_Vertrag.md §4 Stufe 1 + §5 (Fehlermeldungsformat). Jede Fixture unter
// fixtures/import/v1/fehlerhaft/ trägt GENAU EINE Verletzung, kodiert im Dateinamen
// (`imp-1xx-*.json`). `pruefeStufe1` muss für jede Datei GENAU den erwarteten Code liefern —
// nicht mehr (sonst wäre die Verletzung nicht isoliert) und nicht weniger (sonst würde die Regel
// gar nicht greifen).
//
// Seit AP-1.3b liegen in DEMSELBEN Ordner zusätzlich `imp-2xx-*.json`-Fixturen (Stufe 2,
// Referenzen/Struktur, geprüft in `import-fehlercodes-stufe2.test.ts` über `pruefeImport()`). Sie
// sind bewusst schema-GÜLTIG (nur eine Stufe-2-Regel verletzt) — `pruefeStufe1` allein akzeptiert
// sie, darum filtert dieser Test hier gezielt auf `imp-1xx-*` und lässt die 2xx-Dateien für die
// eigene, dafür zuständige Prüfung.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { pruefeStufe1 } from '../../src/main/import/validierung'
import { ALLE_IMP_CODES, type ImpCode } from '../../src/shared/import/imp-codes'
import importRessourcen from '../../src/shared/i18n/de/import.json'

const FEHLERHAFT_ORDNER = fileURLToPath(new URL('../../fixtures/import/v1/fehlerhaft', import.meta.url))
const GUELTIG_ORDNER = fileURLToPath(new URL('../../fixtures/import/v1/gueltig', import.meta.url))

const IMP_CODE_MUSTER = /imp-(\d{3})/i

function erwarteterCodeAusDateiname(dateiname: string): ImpCode {
  const treffer = IMP_CODE_MUSTER.exec(dateiname)
  if (treffer === null || treffer[1] === undefined) {
    throw new Error(`Dateiname ${dateiname} trägt keinen erkennbaren IMP-Code.`)
  }
  const code = `IMP-${treffer[1]}`
  const gefunden = ALLE_IMP_CODES.find((eintrag) => eintrag === code)
  if (gefunden === undefined) {
    throw new Error(`Dateiname ${dateiname} trägt einen Code (${code}), der nicht in ALLE_IMP_CODES steht.`)
  }
  return gefunden
}

function jsonDateien(ordner: string): readonly string[] {
  return readdirSync(ordner)
    .filter((name) => name.endsWith('.json'))
    .sort()
}

// Rekursiv, weil `gueltig/` seit AP-1.27 in `eigenstaendig/` und `braucht-bestand/` aufgeteilt
// ist — ein flacher `readdirSync` fände unter `gueltig/` selbst gar keine `.json`-Dateien mehr.
function jsonDateienRekursiv(ordner: string): readonly string[] {
  return readdirSync(ordner, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.json'))
    .sort()
}

const STUFE1_CODES = ALLE_IMP_CODES.filter((code) => code.startsWith('IMP-1'))
const fehlerhafteDateien = jsonDateien(FEHLERHAFT_ORDNER).filter((name) => /^imp-1\d{2}-/.test(name))

describe('Stufe-1-Fehlercodes: jede Fehlerfixture löst genau ihren Code aus (§4, §5)', () => {
  it('deckt jeden Stufe-1-Code aus ALLE_IMP_CODES mit mindestens einer Fixture ab', () => {
    const abgedeckt = new Set(fehlerhafteDateien.map(erwarteterCodeAusDateiname))
    for (const code of STUFE1_CODES) {
      expect(abgedeckt.has(code), `Kein Fixture für ${code}`).toBe(true)
    }
  })

  it.each(fehlerhafteDateien)('%s löst genau den im Dateinamen kodierten Code aus', (dateiname) => {
    const erwartet = erwarteterCodeAusDateiname(dateiname)
    const pfad = join(FEHLERHAFT_ORDNER, dateiname)
    const rohtext = readFileSync(pfad, 'utf8')

    const ergebnis = pruefeStufe1(rohtext, dateiname)

    expect(ergebnis.akzeptiert).toBe(false)
    expect(ergebnis.befunde.map((befund) => befund.code)).toEqual([erwartet])
  })

  it.each(jsonDateienRekursiv(GUELTIG_ORDNER))('%s (gültig) wird akzeptiert, ohne Befunde', (dateiname) => {
    const pfad = join(GUELTIG_ORDNER, dateiname)
    const rohtext = readFileSync(pfad, 'utf8')

    const ergebnis = pruefeStufe1(rohtext, dateiname)

    expect(ergebnis.akzeptiert).toBe(true)
    expect(ergebnis.befunde).toEqual([])
  })

  it.each(ALLE_IMP_CODES)('import.json hat einen vollständigen Eintrag für %s (§5: titel/beschreibung/was_tun)', (code) => {
    const schluessel = code.replace('-', '_')
    // Zugriff über eine index-signaturierte Sicht statt eines `keyof`-`as` — strukturell gültig,
    // weil das importierte JSON-Objekt (nur bekannte IMP_10x-Schlüssel) einem
    // `Record<string, … | undefined>` entspricht.
    const fehlerEintraege: Record<string, { readonly titel: string; readonly beschreibung: string; readonly was_tun: string } | undefined> = importRessourcen.fehler
    const eintrag = fehlerEintraege[schluessel]

    expect(eintrag, `Kein i18n-Eintrag für ${code}`).toBeDefined()
    if (eintrag === undefined) return
    expect(eintrag.titel.trim().length).toBeGreaterThan(0)
    expect(eintrag.beschreibung.trim().length).toBeGreaterThan(0)
    expect(eintrag.was_tun.trim().length).toBeGreaterThan(0)
  })
})
