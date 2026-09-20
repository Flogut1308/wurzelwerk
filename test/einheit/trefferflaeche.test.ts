// Checkpoint 1, Befund 1 (AP-1.28): `.wz-umschalter`/`.wz-kontrollkaestchen`/`.wz-optionsfeld`
// setzten `min-width`/`min-height: var(--wz-trefferflaeche-min)` DIREKT auf das sichtbare
// Element — die Spur/das Kästchen/der Kreis wurde dadurch auf 32×32 px aufgebläht, obwohl der
// Entwurf (design-export/…/Wurzelwerk Komponenten.dc.html Z. 224-253) kleinere Entwurfsmaße
// zeigt (Umschalter 38×22, Kontrollkästchen/Optionsfeld 18×18). Die Trefferfläche ≥32×32 muss
// vom sichtbaren Maß ENTKOPPELT werden (unsichtbares `::before`), sonst weicht das Erscheinungsbild
// vom Entwurf ab. Muster nach test/gestaltung/tokens-vollstaendig.test.ts (Blockextraktion per
// ausgeglichener Klammer, kein CSSOM — `environment: 'node'`).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function lesen(pfad: string): string {
  const roh = readFileSync(fileURLToPath(new URL(pfad, import.meta.url)), 'utf8')
  // Kommentare entfernen (wie test/gestaltung/tokens-vollstaendig.test.ts), damit ein
  // Begründungskommentar, der die abgelöste Deklaration zitiert, nicht fälschlich als noch
  // vorhandene Deklaration zählt.
  return roh.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Inhalt des ausgeglichenen `{…}`-Blocks direkt hinter dem GENAUEN Selektor `selektor {`. */
function blockInhalt(quelle: string, selektor: string): string {
  const nadel = `${selektor} {`
  const start = quelle.indexOf(nadel)
  if (start === -1) throw new Error(`Selektor fehlt: ${nadel}`)
  const auf = quelle.indexOf('{', start)
  if (auf === -1) throw new Error(`Kein { nach Selektor: ${selektor}`)
  let tiefe = 0
  for (let i = auf; i < quelle.length; i++) {
    if (quelle[i] === '{') tiefe += 1
    else if (quelle[i] === '}') {
      tiefe -= 1
      if (tiefe === 0) return quelle.slice(auf + 1, i)
    }
  }
  throw new Error(`Block nicht geschlossen: ${selektor}`)
}

/** Alle `{…}`-Blöcke, deren Selektorzeile exakt auf `selektor` endet (z. B. `…::before`). */
function bloeckeMitSelektorEnde(quelle: string, selektorEnde: string): readonly string[] {
  const treffer: string[] = []
  const muster = new RegExp(`([^{}]*?)\\{`, 'g')
  let m: RegExpExecArray | null
  while ((m = muster.exec(quelle)) !== null) {
    const selektorZeile = m[1]
    if (selektorZeile === undefined) continue
    const selektoren = selektorZeile.split(',').map((s) => s.trim())
    if (!selektoren.some((s) => s.endsWith(selektorEnde))) continue
    const auf = m.index + m[0].length - 1
    let tiefe = 0
    for (let i = auf; i < quelle.length; i++) {
      if (quelle[i] === '{') tiefe += 1
      else if (quelle[i] === '}') {
        tiefe -= 1
        if (tiefe === 0) {
          treffer.push(quelle.slice(auf + 1, i))
          break
        }
      }
    }
  }
  return treffer
}

const umschalterCss = lesen('../../src/renderer/bausteine/umschalter.css')
const kontrollkaestchenCss = lesen('../../src/renderer/bausteine/kontrollkaestchen.css')
const optionsfeldCss = lesen('../../src/renderer/bausteine/optionsfeld.css')
const schaltflaecheCss = lesen('../../src/renderer/bausteine/schaltflaeche.css')

const bausteine = [
  { name: 'umschalter', css: umschalterCss, hauptSelektor: '.wz-umschalter' },
  { name: 'kontrollkaestchen', css: kontrollkaestchenCss, hauptSelektor: '.wz-kontrollkaestchen' },
  { name: 'optionsfeld', css: optionsfeldCss, hauptSelektor: '.wz-optionsfeld' },
] as const

describe('Trefferfläche ≥32×32 von sichtbarer Größe entkoppelt (AP-1.28, Checkpoint 1 Befund 1)', () => {
  it.each(bausteine)(
    '$hauptSelektor: Hauptregel setzt kein min-width/min-height auf --wz-trefferflaeche-min mehr',
    ({ css, hauptSelektor }) => {
      const block = blockInhalt(css, hauptSelektor)
      expect(block).not.toMatch(/min-width:\s*var\(--wz-trefferflaeche-min\)/)
      expect(block).not.toMatch(/min-height:\s*var\(--wz-trefferflaeche-min\)/)
    },
  )

  it.each(bausteine)(
    '$hauptSelektor: ::before stellt die Trefferfläche ≥32×32 unsichtbar wieder her',
    ({ css, hauptSelektor }) => {
      const vorBloecke = bloeckeMitSelektorEnde(css, `${hauptSelektor}::before`)
      expect(vorBloecke.length, `${hauptSelektor}::before fehlt`).toBeGreaterThan(0)
      const vor = vorBloecke[0]
      if (vor === undefined) throw new Error('unreachable')
      expect(vor).toMatch(/width:\s*max\([^)]*var\(--wz-trefferflaeche-min\)[^)]*\)/)
      expect(vor).toMatch(/height:\s*max\([^)]*var\(--wz-trefferflaeche-min\)[^)]*\)/)
      expect(vor).toMatch(/position:\s*absolute/)
    },
  )

  it.each(bausteine)('$hauptSelektor: bleibt selbst position: relative', ({ css, hauptSelektor }) => {
    const block = blockInhalt(css, hauptSelektor)
    expect(block).toMatch(/position:\s*relative/)
  })

  it('Umschalter: sichtbare Spur behält das Entwurfsmaß 38×22 px (Beleg Z. 230-233)', () => {
    const block = blockInhalt(umschalterCss, '.wz-umschalter')
    expect(block).toMatch(/width:\s*38px;/)
    expect(block).toMatch(/height:\s*22px;/)
  })

  it('Umschalter: Schieber bleibt bei var(--wz-abstand-16)', () => {
    const block = blockInhalt(umschalterCss, '.wz-umschalter__schieber')
    expect(block).toMatch(/width:\s*var\(--wz-abstand-16\)/)
    expect(block).toMatch(/height:\s*var\(--wz-abstand-16\)/)
  })

  it('Kontrollkästchen: __haken behält 18×18 px mit --wz-radius-klein (Beleg Z. 236-239)', () => {
    const block = blockInhalt(kontrollkaestchenCss, '.wz-kontrollkaestchen__haken')
    expect(block).toMatch(/width:\s*18px;/)
    expect(block).toMatch(/height:\s*18px;/)
    expect(block).toMatch(/border-radius:\s*var\(--wz-radius-klein\)/)
  })

  it('Optionsfeld: __punkt behält 18×18 px (Beleg Z. 242-245)', () => {
    const block = blockInhalt(optionsfeldCss, '.wz-optionsfeld__punkt')
    expect(block).toMatch(/width:\s*18px;/)
    expect(block).toMatch(/height:\s*18px;/)
  })

  it('Optionsfeld: __punkt::after (Zustand „ein") behält 9×9 px', () => {
    const bloecke = bloeckeMitSelektorEnde(optionsfeldCss, '.wz-optionsfeld--ein .wz-optionsfeld__punkt::after')
    expect(bloecke.length).toBeGreaterThan(0)
    const block = bloecke[0]
    if (block === undefined) throw new Error('unreachable')
    expect(block).toMatch(/width:\s*9px;/)
    expect(block).toMatch(/height:\s*9px;/)
  })

  it('Wächter: Schaltfläche bleibt unangetastet — min-height UND min-width direkt auf .wz-schaltflaeche', () => {
    const block = blockInhalt(schaltflaecheCss, '.wz-schaltflaeche')
    expect(block).toMatch(/min-height:\s*var\(--wz-trefferflaeche-min\)/)
    expect(block).toMatch(/min-width:\s*var\(--wz-trefferflaeche-min\)/)
  })

  // AP-1.13 PR-A: `Konfidenzwaehler` (§3.4) hat kein dokumentiertes kleineres Entwurfsmaß für den
  // Knopf selbst (anders als Umschalter/Kontrollkästchen/Optionsfeld, deren SICHTBARE Spur/Kästchen
  // per Beleg kleiner als 32×32 sein muss) — der einfache, direkte Weg wie bei `.wz-schaltflaeche`
  // ist hier zulässig, kein `::before`-Muster nötig.
  it('Konfidenzwaehler: __stufe trägt min-height UND min-width direkt (wie .wz-schaltflaeche, kein ausgemessenes kleineres Entwurfsmaß)', () => {
    const konfidenzwaehlerCss = lesen('../../src/renderer/bausteine/konfidenzwaehler.css')
    const block = blockInhalt(konfidenzwaehlerCss, '.wz-konfidenzwaehler__stufe')
    expect(block).toMatch(/min-height:\s*var\(--wz-trefferflaeche-min\)/)
    expect(block).toMatch(/min-width:\s*var\(--wz-trefferflaeche-min\)/)
  })
})
