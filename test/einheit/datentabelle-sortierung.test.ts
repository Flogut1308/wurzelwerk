// AP-1.6 Stufe 3 (C-16), CLAUDE.md §5 eiserne Regel: erst der Test.
import { describe, expect, it } from 'vitest'
import { ariaSortWert, sortierCaretSymbol, sortierungUmschalten } from '../../src/renderer/bausteine/datentabelle-sortierung'

describe('sortierungUmschalten (src/renderer/bausteine/datentabelle-sortierung.ts, AP-1.6)', () => {
  it('Klick auf dieselbe Spalte dreht die Richtung um: auf -> ab', () => {
    const naechster = sortierungUmschalten({ sortierung: 'nachname', richtung: 'auf' }, 'nachname')
    expect(naechster).toEqual({ sortierung: 'nachname', richtung: 'ab' })
  })

  it('Klick auf dieselbe Spalte dreht die Richtung um: ab -> auf', () => {
    const naechster = sortierungUmschalten({ sortierung: 'geburt', richtung: 'ab' }, 'geburt')
    expect(naechster).toEqual({ sortierung: 'geburt', richtung: 'auf' })
  })

  it('Klick auf eine andere Spalte wechselt die Sortierung und setzt die Richtung auf "auf" zurück', () => {
    const naechster = sortierungUmschalten({ sortierung: 'nachname', richtung: 'ab' }, 'tod')
    expect(naechster).toEqual({ sortierung: 'tod', richtung: 'auf' })
  })
})

describe('ariaSortWert (src/renderer/bausteine/datentabelle-sortierung.ts, AP-1.6)', () => {
  it('meldet "none" für eine nicht aktive Sortierspalte', () => {
    expect(ariaSortWert({ sortierung: 'nachname', richtung: 'auf' }, 'geburt')).toBe('none')
  })

  it('meldet "ascending" für die aktive Spalte bei Richtung "auf"', () => {
    expect(ariaSortWert({ sortierung: 'nachname', richtung: 'auf' }, 'nachname')).toBe('ascending')
  })

  it('meldet "descending" für die aktive Spalte bei Richtung "ab"', () => {
    expect(ariaSortWert({ sortierung: 'nachname', richtung: 'ab' }, 'nachname')).toBe('descending')
  })
})

/**
 * AP-1.11 (§14-Ergänzung, docs/80_Offene_Fragen.md): ein sichtbares Sortier-Caret für die aktive
 * Spalte über `Symbol` — vorher gab es außer `aria-sort` keinen visuellen Unicode-Platzhalter zu
 * "ersetzen", das Caret ist eine reine Ergänzung.
 */
describe('sortierCaretSymbol (src/renderer/bausteine/datentabelle-sortierung.ts, AP-1.11)', () => {
  it('liefert "caret-up" bei "ascending"', () => {
    expect(sortierCaretSymbol('ascending')).toBe('caret-up')
  })

  it('liefert "caret-down" bei "descending"', () => {
    expect(sortierCaretSymbol('descending')).toBe('caret-down')
  })

  it('liefert null bei "none" (keine Kopfzelle zeigt ein Caret für eine inaktive Spalte)', () => {
    expect(sortierCaretSymbol('none')).toBeNull()
  })
})
