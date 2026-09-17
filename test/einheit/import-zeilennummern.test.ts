// AP-1.3b, 56_Import_Vertrag.md §5 Punkt 4: jeder Befund trägt die Zeilennummer seiner
// Fundstelle im Rohtext, ermittelt über den Positionsindex (`src/core/import/positionsindex.ts`).
// Diese Fixture ist absichtlich zeilenscharf formatiert (siehe Datei) — die erwartete Zeile 13 ist
// gegen den tatsächlichen Dateiinhalt nachgezählt, nicht geschätzt.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { pruefeImport, type BestandsKontext } from '../../src/main/import/validierung'

const FIXTURE_PFAD = fileURLToPath(new URL('../../fixtures/import/v1/fehlerhaft/imp-201-tmp-kennung-fehlt.json', import.meta.url))

const LEERER_KONTEXT: BestandsKontext = {
  kennungVorhanden: () => false,
  mediumVorhanden: () => false,
}

describe('Positionsindex: Fundstellen tragen die richtige Zeilennummer (§5 Punkt 4)', () => {
  it('IMP-201 zeigt auf die Zeile der Referenz "tmp:q-fehlt" (Zeile 13 der Fixture)', () => {
    const rohtext = readFileSync(FIXTURE_PFAD, 'utf8')

    const bericht = pruefeImport(rohtext, 'imp-201-tmp-kennung-fehlt.json', LEERER_KONTEXT)

    expect(bericht.befunde).toHaveLength(1)
    const [befund] = bericht.befunde
    expect(befund?.code).toBe('IMP-201')
    expect(befund?.pfad).toBe('personen[0].belege[0].quelle')
    expect(befund?.datei).toBe('imp-201-tmp-kennung-fehlt.json')
    expect(befund?.zeile).toBe(13)
  })
})
