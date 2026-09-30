// AP-1.30 Bugfix U-130-randleerraum-altbestand (A-02, A-19; docs/80 §33 V-130-fix-randleerraum): die EINE
// Regel für „Wert eines Namensteils unverändert" — genutzt vom Handler `namensform.uebernehmen` und vom Modal
// (`namensform-entwurf.ts`). Vorher hatten beide eine eigene Regel, die bei ungetrimmtem Altbestand
// („Gutnoff " aus der flachen Brücke) auseinanderlief.
import { describe, expect, it } from 'vitest'
import { teilWertUnveraendert } from '../../src/core/name/teilwert'

const NBSP = ' '

describe('teilWertUnveraendert (gespeichert, entwurf)', () => {
  it('(1) gleicher Rohwert: unverändert — auch ungetrimmter Altbestand', () => {
    expect(teilWertUnveraendert('Gutnoff', 'Gutnoff')).toBe(true)
    expect(teilWertUnveraendert('Gutnoff ', 'Gutnoff ')).toBe(true)
    expect(teilWertUnveraendert(' Hans Peter ', ' Hans Peter ')).toBe(true)
  })

  it('(2) beide leer bzw. nur Leerraum: unverändert', () => {
    for (const gespeichert of ['', ' ', '\t', '  ', NBSP]) {
      for (const entwurf of ['', ' ', '\t', '   ', NBSP]) {
        expect(teilWertUnveraendert(gespeichert, entwurf)).toBe(true)
      }
    }
  })

  it('(3) gleicher getrimmter Wert und der Entwurf trägt Randleerraum: unverändert', () => {
    expect(teilWertUnveraendert('Gutnoff', 'Gutnoff ')).toBe(true)
    expect(teilWertUnveraendert('Gutnoff', ' Gutnoff')).toBe(true)
    expect(teilWertUnveraendert('Gutnoff', 'Gutnoff\t')).toBe(true)
    expect(teilWertUnveraendert('Gutnoff ', 'Gutnoff  ')).toBe(true)
    expect(teilWertUnveraendert('Gutnoff ', ' Gutnoff')).toBe(true)
  })

  it('(4) sonst geändert — die Bereinigung von ungetrimmtem Altbestand ist eine Änderung', () => {
    expect(teilWertUnveraendert('Gutnoff ', 'Gutnoff')).toBe(false)
    expect(teilWertUnveraendert(' Gutnoff', 'Gutnoff')).toBe(false)
    expect(teilWertUnveraendert('Gutnoff', 'Gutnow')).toBe(false)
    expect(teilWertUnveraendert('Gutnoff', 'Gutnow ')).toBe(false)
    expect(teilWertUnveraendert('Gutnoff', '')).toBe(false)
    expect(teilWertUnveraendert('Gutnoff ', ' ')).toBe(false)
    expect(teilWertUnveraendert('', 'Gutnoff')).toBe(false)
    expect(teilWertUnveraendert(' ', 'Gutnoff')).toBe(false)
  })

  it('Leerraum im Inneren zählt nicht als Randleerraum', () => {
    expect(teilWertUnveraendert('Hans Peter', 'Hans  Peter')).toBe(false)
    expect(teilWertUnveraendert('Hans  Peter', 'Hans Peter')).toBe(false)
  })

  it('NBSP (U+00A0) ist laut String.prototype.trim Leerraum und zählt wie ein Leerzeichen', () => {
    // Befund: ECMAScript `trim` entfernt WhiteSpace inkl. U+00A0 und U+FEFF sowie LineTerminator.
    expect(`Gutnoff${NBSP}`.trim()).toBe('Gutnoff')
    expect(teilWertUnveraendert('Gutnoff', `Gutnoff${NBSP}`)).toBe(true)
    expect(teilWertUnveraendert(`Gutnoff${NBSP}`, 'Gutnoff')).toBe(false)
    expect(teilWertUnveraendert(`Gutnoff${NBSP}`, `Gutnoff${NBSP}`)).toBe(true)
    expect(teilWertUnveraendert(`Gutnoff${NBSP}`, 'Gutnoff ')).toBe(true)
  })
})
