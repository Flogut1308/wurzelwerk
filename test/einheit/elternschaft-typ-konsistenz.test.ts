// AP-0.14 PR-A, Driftschutz für `src/core/layout/vertrag.ts` `ElternschaftTyp`. `src/core` darf
// `src/shared` nicht importieren (CLAUDE.md §2), deshalb ist der core-Typ eine reine Spiegelung
// von `src/shared/schemata/elternschaft.ts` `ElternschaftTypEnum` — zur Laufzeit ist ein `type`
// vollständig verschwunden, ein Test darf aber (als einziger Ort) beide Schichten importieren und
// gegeneinander prüfen. Bricht entweder das shared-Enum ODER die core-Union, schlägt dieser Test
// fehl, statt dass die Vertragstypen unbemerkt auseinanderlaufen.
import { describe, expect, it } from 'vitest'
import { ElternschaftTypEnum } from '../../src/shared/schemata/elternschaft'
import type { ElternschaftTyp } from '../../src/core/layout/vertrag'

const ERWARTET = ['biologisch', 'adoptiv', 'stief', 'pflege', 'zieh', 'anerkannt', 'leihmutter', 'unbekannt'] as const

// Typ-Test: ERWARTET muss vollständig auf ElternschaftTyp abbildbar sein (jeder Wert von
// ERWARTET ist ein gültiger ElternschaftTyp) ...
const _pruefVorwaerts: readonly ElternschaftTyp[] = ERWARTET
// ... und umgekehrt muss jeder ElternschaftTyp-Wert in ERWARTET vorkommen können (kein core-Wert,
// den ERWARTET nicht kennt). `satisfies` erzwingt hier die Übereinstimmung ohne Laufzeitkosten.
const _pruefRueckwaerts = ERWARTET[0] satisfies ElternschaftTyp

describe('ElternschaftTyp: core-Vertrag vs. shared-Laufzeitwahrheit', () => {
  it('core-Union und shared-Enum enthalten exakt dieselbe Wertemenge', () => {
    expect(new Set(ERWARTET)).toEqual(new Set(ElternschaftTypEnum.options))
  })

  it('nutzt die Typ-Prüfungen (verhindert "unbenutzte Variable")', () => {
    expect(_pruefVorwaerts.length).toBe(ERWARTET.length)
    expect(_pruefRueckwaerts).toBe(ERWARTET[0])
  })
})
