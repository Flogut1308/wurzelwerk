// AP-1.11 (ADR-027): jedes ausgelieferte Symbol-SVG ist normiert — nur `currentColor`, kein
// `<script>`, kein externer Verweis (`href`/`xlink:href`/`<image>`). NICHT als primärer Rot-Beleg
// verwendet (Auftragstext): ohne vorhandene SVG-Dateien liefe diese Prüfung leer und damit
// fälschlich grün — `erwarteMindestensEineDatei()` schließt genau das aus, unabhängig davon, ob
// `readdirSync` bei fehlendem Ordner wirft oder eine leere Liste liefert.
import { readFileSync, readdirSync, type Dirent } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SYMBOLE_WURZEL = fileURLToPath(new URL('../../src/renderer/gestaltung/symbole', import.meta.url))

function svgDateien(wurzel: string): readonly string[] {
  let eintraege: readonly Dirent[]
  try {
    eintraege = readdirSync(wurzel, { withFileTypes: true })
  } catch {
    return []
  }
  const gefunden: string[] = []
  for (const eintrag of eintraege) {
    const pfad = join(wurzel, eintrag.name)
    if (eintrag.isDirectory()) gefunden.push(...svgDateien(pfad))
    else if (eintrag.name.endsWith('.svg')) gefunden.push(pfad)
  }
  return gefunden
}

/** Jede Festfarbe außer `currentColor` — Hex, `rgb()`/`rgba()`, benannte Farben in `fill`/`stroke`. */
const FESTFARBE = /\b(?:fill|stroke)\s*=\s*"(?!currentColor")[^"]*"/g
const UNERWUENSCHT: readonly { readonly muster: RegExp; readonly beschreibung: string }[] = [
  { muster: /<script/i, beschreibung: '<script>' },
  { muster: /\bhref\s*=/i, beschreibung: 'href' },
  { muster: /xlink:href/i, beschreibung: 'xlink:href' },
  { muster: /<image/i, beschreibung: '<image>' },
]

describe('Symbol-SVG — normiert und sauber (AP-1.11, ADR-027)', () => {
  const dateien = svgDateien(SYMBOLE_WURZEL)

  it('mindestens ein SVG ist vorhanden (sonst wäre diese Prüfung leer und fälschlich grün)', () => {
    expect(dateien.length).toBeGreaterThan(0)
  })

  it.each(dateien.length > 0 ? dateien : ['(keine Datei — siehe vorherigen Test)'])('%s trägt viewBox="0 0 256 256"', (pfad) => {
    const inhalt = readFileSync(pfad, 'utf8')
    expect(inhalt).toContain('viewBox="0 0 256 256"')
  })

  it.each(dateien.length > 0 ? dateien : ['(keine Datei — siehe vorherigen Test)'])('%s hat keine Festfarbe außer currentColor', (pfad) => {
    const inhalt = readFileSync(pfad, 'utf8')
    const funde = inhalt.match(FESTFARBE)
    expect(funde, `Festfarbe(n) in ${pfad}: ${String(funde)}`).toBeNull()
  })

  it.each(dateien.length > 0 ? dateien : ['(keine Datei — siehe vorherigen Test)'])('%s enthält kein Skript und keinen externen Verweis', (pfad) => {
    const inhalt = readFileSync(pfad, 'utf8')
    for (const { muster, beschreibung } of UNERWUENSCHT) {
      expect(muster.test(inhalt), `${pfad} enthält ${beschreibung}`).toBe(false)
    }
  })
})
