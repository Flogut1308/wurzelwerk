// AP-1.34 PR-C1b (Fund beim Einbau von `aussage_zitat.aendern`): jeder Befehl trägt einen
// Beschreibungsschlüssel `journal.<name>` (src/main/befehle/registrierung.ts), den der Journal-
// Verlauf über `src/shared/i18n/de/journal.json` in Text wandelt (ADR-011). Ein fehlender Eintrag
// fiel bisher keinem Test auf (Mutationsprobe) — der Verlauf hätte den rohen Schlüssel gezeigt.
// Alle Beschreibungen hängen heute nicht von der Nutzlast ab; ein künftiger nutzlastabhängiger
// Schlüssel würde hier ohne Nutzlast aufgerufen und müsste dann eigens geprüft werden.
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))

import { REGISTRIERUNG, type BefehlName } from '../../src/main/befehle/registrierung'
import journal from '../../src/shared/i18n/de/journal.json'

const texte: Readonly<Record<string, string>> = journal

const befehle = Object.keys(REGISTRIERUNG) as BefehlName[] // Object.keys liefert string[]; die Schlüssel sind genau BefehlName (Typ von REGISTRIERUNG)

describe('Journal-Beschreibung jedes Befehls hat einen deutschen Text', () => {
  it.each(befehle)('%s', (name) => {
    // Kontravariant: jede `(ein: X) => string` ist eine `(...ein: never[]) => string` — Aufruf ohne Nutzlast.
    const beschreibung: (...ein: never[]) => string = REGISTRIERUNG[name].beschreibung
    const schluessel = beschreibung()
    expect(schluessel.startsWith('journal.')).toBe(true)
    const text = texte[schluessel.slice('journal.'.length)]
    expect(text?.trim().length ?? 0).toBeGreaterThan(0)
  })
})
