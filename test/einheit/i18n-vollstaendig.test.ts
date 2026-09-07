import { describe, expect, it } from 'vitest'
import { ALLE_FEHLERCODES } from '../../src/shared/fehler/codes'
import fehlerRessourcen from '../../src/shared/i18n/de/fehler.json'

/**
 * Erzwingt §7: jeder Fehlercode braucht einen i18n-Schlüssel `.titel` und `.was_tun`, und
 * `was_tun` ist eine Handlungsanweisung, keine leere Zeichenkette. `ALLE_FEHLERCODES` ist die
 * einzige Quelle der Wahrheit (codes.ts) — dieser Test läuft gegen jeden Code, der dort jemals
 * ergänzt wird, ohne dass die Testdatei angefasst werden muss.
 */
describe('i18n-Ressourcen für Fehlercodes (§7, ADR-011)', () => {
  it.each(ALLE_FEHLERCODES)('hat einen vollständigen Eintrag für %s', (code) => {
    const eintrag = fehlerRessourcen[code]

    expect(eintrag).toBeDefined()
    expect(eintrag.titel.trim().length).toBeGreaterThan(0)
    expect(eintrag.was_tun.trim().length).toBeGreaterThan(0)
  })
})
