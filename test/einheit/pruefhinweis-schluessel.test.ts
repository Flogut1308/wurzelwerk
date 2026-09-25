// AP-1.8 (F-07) / Vorarbeiten AP-1.30 Teil 3 (E5): jeder Bestandshinweis-Code hat seinen Text in
// `src/shared/i18n/de/pruefhinweise.json`; `ort_mit_datum` zusätzlich eine Handlungsanweisung.
import { describe, expect, it } from 'vitest'
import { BESTAND_HINWEIS_CODES } from '../../src/core/plausibilitaet/regeln'
import { pruefhinweisCodeSchluessel, pruefhinweisWasTunSchluessel } from '../../src/renderer/ansichten/liste/pruefhinweis-schluessel'
import pruefhinweiseTexte from '../../src/shared/i18n/de/pruefhinweise.json'

const texte: Readonly<Record<string, string>> = pruefhinweiseTexte

describe('Prüfhinweis-Texte', () => {
  it('jeder Code hat einen nichtleeren Text', () => {
    for (const code of BESTAND_HINWEIS_CODES) {
      expect(texte[pruefhinweisCodeSchluessel(code)] ?? '', code).not.toBe('')
    }
  })

  it('ort_mit_datum: Titel und Handlungsanweisung', () => {
    expect(texte[pruefhinweisCodeSchluessel('ort_mit_datum')]).toBe('Ort mit Datum – bitte prüfen')
    const wasTun = pruefhinweisWasTunSchluessel('ort_mit_datum')
    expect(wasTun).not.toBeNull()
    expect(texte[wasTun ?? ''] ?? '').not.toBe('')
    for (const code of BESTAND_HINWEIS_CODES) {
      const schluessel = pruefhinweisWasTunSchluessel(code)
      if (schluessel !== null) expect(texte[schluessel] ?? '', code).not.toBe('')
    }
  })
})
