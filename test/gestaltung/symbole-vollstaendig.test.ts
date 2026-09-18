// AP-1.11 (ADR-027): der Symbolsatz ist eine kuratierte, generierte Registry — jeder Name der
// typisierten Liste (`ALLE_SYMBOLE`) hat eine Datei, jede Datei einen Namen, keine Waise. Diese
// Prüfung ist bewusst der PRIMÄRE Rot-Beleg (CLAUDE.md §5): vor der Umsetzung existiert weder
// `src/renderer/gestaltung/symbole/namen.ts` noch `registrierung.generiert.ts`, der Import wirft
// (`ENOENT`/„Cannot find module"), nicht erst eine Assertion.
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ALLE_SYMBOLE, type SymbolName } from '../../src/renderer/gestaltung/symbole/namen'
import { SYMBOLE_FILL, SYMBOLE_REGULAR } from '../../src/renderer/gestaltung/symbole/registrierung.generiert'

const SYMBOLE_WURZEL = fileURLToPath(new URL('../../src/renderer/gestaltung/symbole', import.meta.url))

/** Dateinamen (ohne `.svg`) aus einem Unterordner — leer, wenn der Ordner (noch) nicht existiert. */
function dateiNamenOhneEndung(unterordner: string): readonly string[] {
  let eintraege: readonly string[]
  try {
    eintraege = readdirSync(`${SYMBOLE_WURZEL}/${unterordner}`)
  } catch {
    return []
  }
  return eintraege.filter((datei) => datei.endsWith('.svg')).map((datei) => datei.slice(0, -'.svg'.length))
}

/** Die zwei selbst gezeichneten Symbole (ADR-027 „zwei Lücken bleiben und werden gezeichnet") —
 * erkennbar getrennt unter `symbole/eigen/`, kein Phosphor-Bezugsname. */
const EIGENE_SYMBOLE: readonly SymbolName[] = ['trauung', 'beerdigung']

describe('Symbolsatz — Name ↔ Datei ↔ Registry, keine Waise (AP-1.11, ADR-027)', () => {
  it('ALLE_SYMBOLE ist nicht leer', () => {
    expect(ALLE_SYMBOLE.length).toBeGreaterThan(0)
  })

  it.each(ALLE_SYMBOLE)('%s hat eine physische Regular-Datei (regular/ oder eigen/)', (name) => {
    const istEigen = (EIGENE_SYMBOLE as readonly string[]).includes(name)
    const ordner = istEigen ? 'eigen' : 'regular'
    expect(dateiNamenOhneEndung(ordner), `${name} fehlt unter symbole/${ordner}/`).toContain(name)
  })

  it.each(ALLE_SYMBOLE)('%s hat einen nicht-leeren Eintrag in SYMBOLE_REGULAR', (name) => {
    expect(SYMBOLE_REGULAR[name]?.length ?? 0).toBeGreaterThan(0)
  })

  it.each(ALLE_SYMBOLE)('%s hat einen nicht-leeren Eintrag in SYMBOLE_FILL', (name) => {
    expect(SYMBOLE_FILL[name]?.length ?? 0).toBeGreaterThan(0)
  })

  it('keine Waise unter symbole/regular/ — jede Datei dort ist ein bekannter Name', () => {
    const dateien = dateiNamenOhneEndung('regular')
    for (const datei of dateien) {
      expect(ALLE_SYMBOLE, `regular/${datei}.svg hat keinen Namen in ALLE_SYMBOLE`).toContain(datei)
    }
  })

  it('keine Waise unter symbole/eigen/ — jede Datei dort ist ein bekannter, als eigen geführter Name', () => {
    const dateien = dateiNamenOhneEndung('eigen')
    for (const datei of dateien) {
      expect(EIGENE_SYMBOLE, `eigen/${datei}.svg ist nicht in EIGENE_SYMBOLE geführt`).toContain(datei)
    }
  })

  it('keine Waise unter symbole/fill/ — jede Datei dort ist ein bekannter, NICHT-eigener Name (eigen hat kein physisches Fill)', () => {
    const dateien = dateiNamenOhneEndung('fill')
    for (const datei of dateien) {
      expect(ALLE_SYMBOLE, `fill/${datei}.svg hat keinen Namen in ALLE_SYMBOLE`).toContain(datei)
      expect(EIGENE_SYMBOLE, `fill/${datei}.svg gehört zu einem eigenen Symbol — das hat kein physisches Fill`).not.toContain(datei)
    }
  })

  it('SYMBOLE_REGULAR und SYMBOLE_FILL haben exakt die Schlüsselmenge von ALLE_SYMBOLE (keine zusätzlichen, keine fehlenden)', () => {
    expect(Object.keys(SYMBOLE_REGULAR).sort()).toEqual([...ALLE_SYMBOLE].sort())
    expect(Object.keys(SYMBOLE_FILL).sort()).toEqual([...ALLE_SYMBOLE].sort())
  })
})
