// AP-0.15/AP-1.30, docs/80 §33 U-130-verdichtung-nul: der Gruppenschlüssel von
// `verdichteAenderungen()` trennt `tabelle` und `datensatzId` mit U+0000. Bis zu diesem Folgepunkt
// stand das Trennzeichen als wörtliches NUL-Byte im Quelltext (git hielt die Datei für binär); jetzt
// steht dort die Escape-Sequenz `\u0000` — der Laufzeitwert ist identisch. Diese Tests sichern, dass
// die Trennung für realistische Schlüssel (Tabellennamen aus der Journal-Liste, UUID-Kennungen)
// eindeutig bleibt, und dass die Quelldatei selbst kein Steuerzeichen mehr enthält.
//
// Bewusst NICHT gepinnt: enthält `tabelle` oder `datensatzId` selbst U+0000, KANN der Schlüssel
// kollidieren (('a', 'b\u0000c') und ('a\u0000b', 'c') ergeben denselben Schlüssel). Beide Felder
// stammen aus festen Tabellennamen bzw. UUID v7 (F-05), ein NUL darin ist im Datenbestand nicht
// erreichbar — gemeldet als eigener Befund, nicht hier festgeschrieben.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { verdichteAenderungen, type AenderungEintrag } from '../../src/core/journal/koaleszenz-verdichtung'

const REPO_WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function einfuegen(tabelle: string, datensatzId: string): AenderungEintrag {
  return { tabelle, datensatzId, operation: 'insert', wertAltJson: null, wertNeuJson: '{"v":1}' }
}

function loeschen(tabelle: string, datensatzId: string): AenderungEintrag {
  return { tabelle, datensatzId, operation: 'delete', wertAltJson: '{"v":1}', wertNeuJson: null }
}

describe('verdichteAenderungen() — Gruppenschlüssel (tabelle, datensatzId)', () => {
  it('Präfix-Verschiebung zwischen tabelle und datensatzId bildet zwei Gruppen', () => {
    // Ohne Trennzeichen wären beide Schlüssel "abc"; insert+delete in derselben Gruppe entfiele.
    const alt = [einfuegen('ab', 'c')]
    const neu = [loeschen('a', 'bc')]
    expect(verdichteAenderungen(alt, neu)).toEqual([...alt, ...neu])
  })

  it('gleiche datensatzId in verschiedenen Tabellen bildet zwei Gruppen', () => {
    const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
    const alt = [einfuegen('person', id)]
    const neu = [loeschen('name', id)]
    expect(verdichteAenderungen(alt, neu)).toEqual([...alt, ...neu])
  })

  it('gleiche (tabelle, datensatzId) bildet eine Gruppe (insert+delete entfällt)', () => {
    const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
    expect(verdichteAenderungen([einfuegen('person', id)], [loeschen('person', id)])).toEqual([])
  })
})

describe('koaleszenz-verdichtung.ts — Quelltext ohne Steuerzeichen', () => {
  it('enthält kein NUL-Byte und kein anderes Steuerzeichen außer \\t, \\n, \\r', () => {
    const inhalt = readFileSync(join(REPO_WURZEL, 'src', 'core', 'journal', 'koaleszenz-verdichtung.ts'))
    const funde: number[] = []
    inhalt.forEach((byte, index) => {
      const erlaubt = byte === 0x09 || byte === 0x0a || byte === 0x0d
      if ((byte < 0x20 && !erlaubt) || byte === 0x7f) funde.push(index)
    })
    expect(funde).toEqual([])
  })
})
