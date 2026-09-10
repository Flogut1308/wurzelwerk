// AP-0.14 PR-B, test/schema/layout-vertrag.test.ts (CLAUDE.md §13 / ADR-025 geschützter
// Prüfpfad). Reist bewusst ALLEIN, ohne Produktivcode: der geprüfte `src/core/layout/vertrag.ts`
// ist bereits über PR-A (#25) auf `main`, dieser Test kommt als isolierter Folge-PR — eine
// Invariante/Schemazusicherung wird nie im selben PR wie ihr Produktivcode geändert.
//
// 55_Architektur.md §8: In Phase 0 entsteht NUR der Typsatz der Layout-Engine, keine
// Implementierung. Dieser Test friert das ein — das Modul darf zur Laufzeit nichts exportieren
// (kein `const`, keine Funktion, kein Default-Export), damit niemand hier versehentlich in
// Phase 1 mit der Engine anfängt. Die Implementierung von `BerechneLayout` gehört in Phase 2.
import { describe, expect, it } from 'vitest'
import * as vertrag from '../../src/core/layout/vertrag'

describe('Layout-Vertrag ist reine Typ-Andockstelle (AP-0.14, 55_Architektur.md §8)', () => {
  it('exportiert zur Laufzeit nichts — nur Typen', () => {
    // Ein reines Typ-Modul wird zu einem leeren Modulobjekt kompiliert. Jeder Laufzeitschlüssel
    // wäre ein `const`/eine Funktion/ein Default-Export und damit der Anfang einer Implementierung.
    expect(Object.keys(vertrag)).toEqual([])
  })

  it('trägt keine `berechneLayout`-Implementierung (Abnahme AP-0.14)', () => {
    // Nur der Typ `BerechneLayout` existiert; ein gleichnamiger Wert `berechneLayout` entstünde
    // erst mit der Phase-2-Engine. `hasOwnProperty` prüft die Laufzeit ohne Typzugriff auf die
    // Namespace-Form (die den Schlüssel gar nicht kennt).
    expect(Object.prototype.hasOwnProperty.call(vertrag, 'berechneLayout')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(vertrag, 'default')).toBe(false)
  })
})
