// AP-1.3b, 56_Import_Vertrag.md §5 Punkt 4: `bauePositionsindex` bildet JSON-Pfade auf 1-basierte
// Zeilennummern ab. Fester, von Hand nachgezählter Text (kein Fixture-Datei-Umweg) — deckt
// verschachteltes Feld, Array-Element, mehrfach vorkommenden Schlüsselnamen (an verschiedenen
// Pfaden/Zeilen) und ein Feld auf der LETZTEN Zeile (ohne abschließenden Zeilenumbruch) ab.
import { describe, expect, it } from 'vitest'
import { bauePositionsindex, pfadFormat } from '../../src/core/import/positionsindex'

// Zeile:
// 1  {
// 2    "a": { "b": "verschachtelt" },
// 3    "liste": [
// 4      "erstes",
// 5      "zweites"
// 6    ],
// 7    "wiederholt": 1,
// 8    "vgl": { "wiederholt": 2 },
// 9    "letztes": "am Ende" }        <- letzte Zeile, KEIN abschließendes \n
const TEXT = [
  '{',
  '  "a": { "b": "verschachtelt" },',
  '  "liste": [',
  '    "erstes",',
  '    "zweites"',
  '  ],',
  '  "wiederholt": 1,',
  '  "vgl": { "wiederholt": 2 },',
  '  "letztes": "am Ende" }',
].join('\n')

describe('bauePositionsindex (§5 Punkt 4)', () => {
  const index = bauePositionsindex(TEXT)

  it('findet ein verschachteltes Feld auf seiner eigenen Zeile', () => {
    expect(index.zeileFuer(pfadFormat(['a', 'b']))).toBe(2)
  })

  it('findet Array-Elemente auf ihrer jeweils eigenen Zeile', () => {
    expect(index.zeileFuer(pfadFormat(['liste', 0]))).toBe(4)
    expect(index.zeileFuer(pfadFormat(['liste', 1]))).toBe(5)
  })

  it('unterscheidet denselben Schlüsselnamen an verschiedenen Pfaden/Zeilen', () => {
    expect(index.zeileFuer(pfadFormat(['wiederholt']))).toBe(7)
    expect(index.zeileFuer(pfadFormat(['vgl', 'wiederholt']))).toBe(8)
  })

  it('findet ein Feld auf der letzten Zeile (ohne abschließenden Zeilenumbruch)', () => {
    expect(index.zeileFuer(pfadFormat(['letztes']))).toBe(9)
  })

  it('liefert undefined für einen im Text nicht vorhandenen Pfad', () => {
    expect(index.zeileFuer('nicht.vorhanden')).toBeUndefined()
  })
})

// hueter-Auflage PR #56: das benannte Kernrisiko — String-Escapes und Struktur-Zeichen (`{`/`[`/`"`)
// IM WERT — war bisher nicht testfixiert. Zeile:
// 1  {
// 2    "mit_escapes": "wert mit \" anführung, \\ backslash, { klammer, [ liste",
// 3    "danach": "folgezeile"
// 4  }
const TEXT_MIT_ESCAPES = [
  '{',
  '  "mit_escapes": "wert mit \\" anführung, \\\\ backslash, { klammer, [ liste",',
  '  "danach": "folgezeile"',
  '}',
].join('\n')

describe('bauePositionsindex: String-Escapes verwirren den Scanner nicht (hueter-Auflage PR #56)', () => {
  const index = bauePositionsindex(TEXT_MIT_ESCAPES)

  it('überliest das escapte Anführungszeichen (\\") und den escapten Backslash (\\\\) im Stringwert selbst korrekt', () => {
    expect(index.zeileFuer(pfadFormat(['mit_escapes']))).toBe(2)
  })

  it('lässt sich von {, [ und " IM Stringwert nicht als Struktur täuschen — das Folgefeld liegt auf der richtigen Zeile', () => {
    expect(index.zeileFuer(pfadFormat(['danach']))).toBe(3)
  })
})
