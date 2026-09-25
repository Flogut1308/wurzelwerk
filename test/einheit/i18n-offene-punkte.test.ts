// AP-1.34 PR-C2c (ADR-011): jeder Meldungsschlüssel des Regelwerks offene Punkte — auch der
// inaktiven Regel `kein_portraet` — hat einen nicht leeren Text in `profil.json`.
import { describe, expect, it } from 'vitest'
import { OFFENE_PUNKTE_REGELN, OFFENE_PUNKTE_SCHLUESSEL } from '../../src/core/person/offene-punkte'
import profilRessourcen from '../../src/shared/i18n/de/profil.json'

const texte: Readonly<Record<string, unknown>> = profilRessourcen

describe('i18n offene Punkte (AP-1.34 PR-C2c)', () => {
  it.each(OFFENE_PUNKTE_SCHLUESSEL)('%s steht in profil.json', (schluessel) => {
    const text = texte[schluessel]
    expect(typeof text).toBe('string')
    expect(String(text).trim()).not.toBe('')
  })

  it('jede Regel verweist auf einen Schlüssel der geschlossenen Liste', () => {
    for (const regel of OFFENE_PUNKTE_REGELN) expect(OFFENE_PUNKTE_SCHLUESSEL).toContain(regel.meldungsschluessel)
  })

  it('Wortlaut des Entwurfs (Wurzelwerk Person bearbeiten, rechte Spalte)', () => {
    expect(texte['offener_punkt_sterbeort_fehlt']).toBe('Sterbeort fehlt')
    expect(texte['offener_punkt_mutter_nicht_zugeordnet']).toBe('Mutter nicht zugeordnet')
    expect(texte['offener_punkt_kein_portraet']).toBe('Kein Porträt hinterlegt')
  })
})
