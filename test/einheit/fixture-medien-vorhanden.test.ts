// AP-1.27: jede gültige Import-Fixture (`fixtures/import/v1/gueltig/**`) verspricht mit ihrem
// eigenen `medien[].relativer_pfad`, dass an genau diesem Pfad (relativ zur Importdatei, §3.8)
// eine Datei liegt — sonst zeigt IMP-208 ("Medium nicht gefunden") jeden Versuch ab, die Fixture
// tatsächlich zu importieren. `fehlerhaft/` bleibt hier bewusst ausgenommen: `imp-208-medium-
// nicht-gefunden.json` verletzt genau diese Regel ABSICHTLICH (das ist ihr einziger Zweck).
//
// Rekursiv, weil `gueltig/` in zwei Unterordner aufgeteilt ist (`eigenstaendig/`,
// `braucht-bestand/`, AP-1.27) — ein flacher `readdirSync` fände unter `gueltig/` selbst gar keine
// `.json`-Dateien mehr.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { importDateiSchema } from '../../src/shared/schemata/import-v1'

const GUELTIG_ORDNER = fileURLToPath(new URL('../../fixtures/import/v1/gueltig/', import.meta.url))

function gueltigeFixturePfade(): readonly string[] {
  return readdirSync(GUELTIG_ORDNER, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => join(GUELTIG_ORDNER, name))
}

describe('Fixture-Korpus: jedes referenzierte Medium liegt tatsächlich neben der Importdatei (AP-1.27, §3.8)', () => {
  it('mindestens drei gültige Fixture-Dateien liegen unter fixtures/import/v1/gueltig/ (kein vakuoser Test)', () => {
    expect(gueltigeFixturePfade().length).toBeGreaterThanOrEqual(3)
  })

  it.each(gueltigeFixturePfade())('%s: jedes medien[].relativer_pfad existiert', (pfad) => {
    const rohtext = readFileSync(pfad, 'utf8')
    const ergebnis = importDateiSchema.safeParse(JSON.parse(rohtext))
    expect(ergebnis.success, `${pfad} ist kein gültiger Import gegen das Zod-Schema`).toBe(true)
    if (!ergebnis.success) return

    const ordner = dirname(pfad)
    for (const medium of ergebnis.data.medien ?? []) {
      const zielpfad = join(ordner, medium.relativer_pfad)
      expect(existsSync(zielpfad), `${pfad}: medien[].relativer_pfad "${medium.relativer_pfad}" fehlt (${zielpfad})`).toBe(true)
    }
  })
})
