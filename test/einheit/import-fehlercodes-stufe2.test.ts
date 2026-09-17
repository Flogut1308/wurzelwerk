// AP-1.3b, 56_Import_Vertrag.md §4 Stufe 2 (IMP-201…IMP-209) + §5 (Zeile). Jede Fixture unter
// fixtures/import/v1/fehlerhaft/imp-2xx-*.json trägt GENAU EINE Stufe-2-Verletzung und ist
// ansonsten schema- UND stufe-2-gültig. Getestet über den vollständigen Ablauf `pruefeImport()`
// (Stufe 1 → Stufe 2), mit einem injizierten `BestandsKontext`, der Bestand und Medienordner
// bewusst leer meldet (`kennungVorhanden`/`mediumVorhanden` beide `() => false`) — genau darum
// dürfen die NICHT-202/208-Fixturen weder `db:`-Referenzen noch Medien enthalten, sonst würden
// sie unter diesem Kontext zusätzlich (fälschlich) IMP-202/IMP-208 auslösen.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { pruefeImport, type BestandsKontext } from '../../src/main/import/validierung'
import { ALLE_IMP_CODES, type ImpCode } from '../../src/shared/import/imp-codes'
import importRessourcen from '../../src/shared/i18n/de/import.json'

const FEHLERHAFT_ORDNER = fileURLToPath(new URL('../../fixtures/import/v1/fehlerhaft', import.meta.url))

const IMP_CODE_MUSTER = /imp-(\d{3})/i

const LEERER_KONTEXT: BestandsKontext = {
  kennungVorhanden: () => false,
  mediumVorhanden: () => false,
}

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

const STUFE2_CODES = ALLE_IMP_CODES.filter((code) => code.startsWith('IMP-2'))
const stufe2Dateien = jsonDateien(FEHLERHAFT_ORDNER).filter((name) => /^imp-2\d{2}-/.test(name))

describe('Stufe-2-Fehlercodes: jede Fixture löst genau ihren Code aus (§4, §5)', () => {
  it('deckt jeden Stufe-2-Code aus ALLE_IMP_CODES mit mindestens einer Fixture ab', () => {
    const abgedeckt = new Set(stufe2Dateien.map(erwarteterCodeAusDateiname))
    for (const code of STUFE2_CODES) {
      expect(abgedeckt.has(code), `Kein Fixture für ${code}`).toBe(true)
    }
  })

  it.each(stufe2Dateien)('%s löst genau den im Dateinamen kodierten Code aus', (dateiname) => {
    const erwartet = erwarteterCodeAusDateiname(dateiname)
    const pfad = join(FEHLERHAFT_ORDNER, dateiname)
    const rohtext = readFileSync(pfad, 'utf8')

    const bericht = pruefeImport(rohtext, dateiname, LEERER_KONTEXT)

    expect(bericht.akzeptiert).toBe(false)
    expect(bericht.befunde.map((befund) => befund.code)).toEqual([erwartet])
  })

  it.each(STUFE2_CODES)('import.json hat einen vollständigen Eintrag für %s (§5: titel/beschreibung/was_tun)', (code) => {
    const schluessel = code.replace('-', '_')
    // Zugriff über eine index-signaturierte Sicht statt eines `keyof`-`as` — strukturell gültig,
    // weil das importierte JSON-Objekt (nur bekannte IMP_2xx-Schlüssel) einem
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
