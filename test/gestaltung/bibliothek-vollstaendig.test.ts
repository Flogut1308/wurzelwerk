// AP-1.11 (72_Screens_und_Flows.md S-19): jeder komponenten-exportierende Baustein aus
// `src/renderer/bausteine/` steht in der Zustandsbibliotheks-Registry — ein neuer Baustein ohne
// Eintrag ist rot, sonst verwahrlost die Bibliothek genau dann, wenn sie gebraucht wird. Registry
// und Zustandsbibliothek-Seite teilen dieselbe Liste (`ZUSTANDSBIBLIOTHEK_EINTRAEGE`), dieser Test
// prüft nur die Vollständigkeit der Liste gegen den tatsächlichen Dateibestand.
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ZUSTANDSBIBLIOTHEK_EINTRAEGE } from '../../src/renderer/ansichten/zustandsbibliothek/registrierung'

const BAUSTEINE_WURZEL = fileURLToPath(new URL('../../src/renderer/bausteine', import.meta.url))

/** Nur `.tsx`-Dateien direkt in `bausteine/` exportieren eine Komponente — `.css` und reine
 * Logikmodule (`*-logik.ts`, `*-sortierung.ts`, `*-format.ts`, `*-spalten.ts`) sind keine
 * Bausteine im Sinn von S-19. */
function komponentenDateiNamen(): readonly string[] {
  return readdirSync(BAUSTEINE_WURZEL, { withFileTypes: true })
    .filter((eintrag) => eintrag.isFile() && eintrag.name.endsWith('.tsx'))
    .map((eintrag) => eintrag.name.slice(0, -'.tsx'.length))
}

describe('Zustandsbibliothek — Registry vollständig (S-19, AP-1.11)', () => {
  it('ZUSTANDSBIBLIOTHEK_EINTRAEGE ist nicht leer', () => {
    expect(ZUSTANDSBIBLIOTHEK_EINTRAEGE.length).toBeGreaterThan(0)
  })

  it.each(komponentenDateiNamen())('Baustein "%s" steht in der Zustandsbibliotheks-Registry', (name) => {
    expect(ZUSTANDSBIBLIOTHEK_EINTRAEGE, `"${name}" (src/renderer/bausteine/${name}.tsx) fehlt in der Zustandsbibliothek`).toContain(name)
  })

  it('keine Waise: jeder Registry-Eintrag entspricht einer tatsächlichen Bausteindatei', () => {
    const dateien = komponentenDateiNamen()
    for (const eintrag of ZUSTANDSBIBLIOTHEK_EINTRAEGE) {
      expect(dateien, `Registry-Eintrag "${eintrag}" hat keine Datei src/renderer/bausteine/${eintrag}.tsx`).toContain(eintrag)
    }
  })
})
