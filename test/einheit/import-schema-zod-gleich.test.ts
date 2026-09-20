// Fitnessfunktion für AP-1.3a (56_Import_Vertrag.md §4 Stufe 1): JSON-Schema (der veröffentlichte
// Vertrag, per Ajv geprüft) und Zod (die Laufzeitprüfung) müssen über den ganzen Fixture-Korpus
// zum SELBEN Urteil kommen. Eine zu weite Zod-Zusage — z. B. ein `additionalProperties:false`, das
// als `z.object` statt `z.strictObject` nachgebaut wurde — fällt sonst nie auf, weil Zod allein
// nie gegen etwas anderes verglichen wird. `gueltig/`-Dateien müssen zusätzlich tatsächlich gültig
// sein (kein leerer Ordner, der den Test vakuos grün macht).
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020'
import { describe, expect, it } from 'vitest'
import { importDateiSchema } from '../../src/shared/schemata/import-v1'

const FIXTURES_WURZEL = fileURLToPath(new URL('../../fixtures/import/v1', import.meta.url))
const SCHEMA_PFAD = fileURLToPath(new URL('../../docs/import-vertrag/wurzelwerk-import-v1.schema.json', import.meta.url))

const ajv = new Ajv2020({ allErrors: true, strict: false })
const vertragsSchema: object = JSON.parse(readFileSync(SCHEMA_PFAD, 'utf8'))
const ajvValidiere = ajv.compile(vertragsSchema)

function jsonDateien(ordner: string): readonly string[] {
  return readdirSync(ordner)
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(ordner, name))
    .sort()
}

// Rekursiv, weil `gueltig/` seit AP-1.27 in `eigenstaendig/` und `braucht-bestand/` aufgeteilt
// ist — ein flacher `readdirSync` fände unter `gueltig/` selbst gar keine `.json`-Dateien mehr.
function jsonDateienRekursiv(ordner: string): readonly string[] {
  return readdirSync(ordner, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(ordner, name))
    .sort()
}

const gueltigeDateien = jsonDateienRekursiv(join(FIXTURES_WURZEL, 'gueltig'))
const fehlerhafteDateien = jsonDateien(join(FIXTURES_WURZEL, 'fehlerhaft'))
const alleDateien = [...gueltigeDateien, ...fehlerhafteDateien]

/** Ergebnis eines `JSON.parse`-Versuchs, ohne zu werfen (IMP-101-Fixture ist ABSICHTLICH kein
 * gültiges JSON — dafür gibt es keinen Ajv-/Zod-Vergleich, siehe unten). */
function parseVersuch(rohtext: string): { readonly ok: true; readonly daten: unknown } | { readonly ok: false } {
  try {
    return { ok: true, daten: JSON.parse(rohtext) }
  } catch {
    return { ok: false }
  }
}

describe('JSON-Schema und Zod urteilen über den Fixture-Korpus gleich (56_Import_Vertrag.md §4)', () => {
  it('hat mindestens drei gültige und mindestens sieben fehlerhafte Fixture-Dateien (kein vakuoser Test)', () => {
    expect(gueltigeDateien.length).toBeGreaterThanOrEqual(3)
    expect(fehlerhafteDateien.length).toBeGreaterThanOrEqual(7)
  })

  it.each(alleDateien)('urteilt für %s identisch (oder ist absichtlich kein gültiges JSON, IMP-101)', (pfad) => {
    const rohtext = readFileSync(pfad, 'utf8')
    const versuch = parseVersuch(rohtext)

    // Kein gültiges JSON: weder Ajv noch Zod können hier überhaupt urteilen — das ist die
    // IMP-101-Fixture, deren Fehler VOR jedem Schemavergleich liegt (§4 Stufe 1, Reihenfolge (a)).
    if (!versuch.ok) {
      expect(pfad).toContain('imp-101')
      return
    }

    const ajvGueltig = ajvValidiere(versuch.daten)
    const zodGueltig = importDateiSchema.safeParse(versuch.daten).success

    expect(zodGueltig, `Zod und Ajv weichen bei ${pfad} voneinander ab (Ajv: ${ajvGueltig}, Zod: ${zodGueltig})`).toBe(ajvGueltig)
  })

  it.each(gueltigeDateien)('%s ist tatsächlich gültig', (pfad) => {
    const rohtext = readFileSync(pfad, 'utf8')
    const daten: unknown = JSON.parse(rohtext)

    expect(ajvValidiere(daten)).toBe(true)
    expect(importDateiSchema.safeParse(daten).success).toBe(true)
  })
})
