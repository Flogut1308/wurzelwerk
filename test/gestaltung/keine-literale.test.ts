// Querläufer „Design-Fundament übernehmen" (Wissen/58) · CLAUDE.md §5, docs/71_Designsystem.md §7.
// Themenfähigkeit hängt daran, dass Farbe NUR über Rollen aus tokens.css kommt. Ein Hex-, rgb()-
// oder hsl()-Wert in einer anderen CSS-Datei umgeht den Token-Vertrag und überlebt den
// Themenwechsel nicht (§1.7 Regel 2). Diese Prüfung wächst mit: jede künftige Bausteindatei fällt
// hier auf, sobald sie eine Farbe direkt schreibt.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const rendererWurzel = fileURLToPath(new URL('../../src/renderer', import.meta.url))
const TOKENS_DATEI = 'tokens.css'
const FARB_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g

function cssDateien(wurzel: string): string[] {
  const gefunden: string[] = []
  for (const eintrag of readdirSync(wurzel, { withFileTypes: true })) {
    const pfad = join(wurzel, eintrag.name)
    if (eintrag.isDirectory()) gefunden.push(...cssDateien(pfad))
    else if (eintrag.name.endsWith('.css') && eintrag.name !== TOKENS_DATEI) gefunden.push(pfad)
  }
  return gefunden
}

describe('CSS außerhalb tokens.css — keine Farbliterale (docs/71 §1.7 Regel 2)', () => {
  it('enthält in keiner Renderer-CSS-Datei außer tokens.css einen Hex-, rgb()- oder hsl()-Wert', () => {
    const treffer: string[] = []
    for (const datei of cssDateien(rendererWurzel)) {
      const ohneKommentare = readFileSync(datei, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      const funde = ohneKommentare.match(FARB_LITERAL)
      if (funde !== null) {
        const relativ = datei.slice(datei.indexOf('src/renderer'))
        treffer.push(`${relativ}: ${[...new Set(funde)].join(', ')}`)
      }
    }
    expect(treffer, `Farbliterale außerhalb tokens.css:\n${treffer.join('\n')}`).toEqual([])
  })
})
