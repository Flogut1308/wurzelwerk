// AP-0.15/AP-1.30, docs/80 §33 U-130-verdichtung-nul: ein wörtliches Steuerzeichen im Quelltext
// (dort ein NUL-Byte in einem Template-Literal) lässt git die Datei als binär behandeln — Diffs und
// Reviews zeigen ihren Inhalt nicht mehr. Dieser Scan verbietet darum in allen Textquellen unter
// `src/`, `test/` und `skripte/` jedes Steuerzeichen außer `\t`, `\n`, `\r` (0x00–0x1F und 0x7F).
// Ein benötigtes Steuerzeichen gehört als Escape-Folge (`\u0000`, `\x1b`) in den Quelltext.
// Binärdateien (Schriften, Bilder) sind über die Endungsliste ausgenommen.
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const WURZELN = ['src', 'test', 'skripte'] as const
const TEXT_ENDUNGEN = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.css', '.json', '.html', '.svg'])
const UEBERSPRUNGEN = new Set(['node_modules'])

function textdateien(verzeichnis: string): readonly string[] {
  const ergebnis: string[] = []
  for (const eintrag of readdirSync(verzeichnis, { withFileTypes: true })) {
    const pfad = join(verzeichnis, eintrag.name)
    if (eintrag.isDirectory()) {
      if (!UEBERSPRUNGEN.has(eintrag.name)) ergebnis.push(...textdateien(pfad))
    } else if (eintrag.isFile() && TEXT_ENDUNGEN.has(extname(eintrag.name))) {
      ergebnis.push(pfad)
    }
  }
  return ergebnis
}

function istVerboten(byte: number): boolean {
  return (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) || byte === 0x7f
}

describe('Quelltext enthält keine Steuerzeichen (U-130-verdichtung-nul)', () => {
  const dateien = WURZELN.flatMap((wurzel) => textdateien(join(REPO_WURZEL, wurzel)))

  it('findet überhaupt Quelldateien (Schutz gegen einen leeren Scan)', () => {
    expect(dateien.length).toBeGreaterThan(100)
  })

  it('keine Textquelle enthält ein Steuerzeichen außer \\t, \\n, \\r', () => {
    const funde: string[] = []
    for (const datei of dateien) {
      const inhalt = readFileSync(datei)
      let zeile = 1
      for (const byte of inhalt) {
        if (byte === 0x0a) zeile += 1
        else if (istVerboten(byte)) {
          funde.push(`${relative(REPO_WURZEL, datei).split(sep).join('/')}:${zeile} (0x${byte.toString(16).padStart(2, '0')})`)
        }
      }
    }
    expect(funde).toEqual([])
  })
})
