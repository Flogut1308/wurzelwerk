// AP-0.13: reine Berichtstext-Logik für den Menüpunkt „Wartung → Datenbestand prüfen“
// (`src/main/wartung/datenbestand-pruefen.ts`) - ohne Electron, mit einem Übersetzer-Stub statt der
// echten i18next-Instanz (analog zu `test/einheit/menue-undo-beschriftung.test.ts`). Die eigentliche
// Anzeige (`dialog.showMessageBox`) ist bewusst NICHT Teil dieses Tests - eine dünne, nicht
// getestete Hülle laut Auftrag (Berechnung strikt getrennt von Anzeige).
import { describe, expect, it } from 'vitest'
import { berichtNachrichtBauen } from '../../src/main/wartung/datenbestand-pruefen'
import type { DatenbestandBericht } from '../../src/main/datenbank/integritaet'

/** Stub statt der echten i18next-Instanz: macht Schlüssel UND Interpolationsoptionen im Rückgabewert sichtbar. */
function tStub(schluessel: string, optionen?: Record<string, unknown>): string {
  return optionen === undefined ? schluessel : `${schluessel}(${JSON.stringify(optionen)})`
}

const BERICHT_UNAUFFAELLIG: DatenbestandBericht = {
  integrityCheckFunde: [],
  fremdschluesselFunde: [],
  ableitungAbweichung: { betroffeneTabellen: [] },
  zyklusGefunden: false,
}

describe('berichtNachrichtBauen() (AP-0.13, Menüpunkt „Wartung → Datenbestand prüfen“)', () => {
  it('unauffälliger Bericht: nur der "keine Funde"-Schlüssel, kein Fund-Text', () => {
    const { titel, nachricht } = berichtNachrichtBauen(tStub, BERICHT_UNAUFFAELLIG)

    expect(titel).toBe('wartung_datenbestandPruefen_titel')
    expect(nachricht).toBe('wartung_datenbestandPruefen_keineFunde')
  })

  it('integrity_check-Fund: Gesamtanzahl + Integritäts-Zeile + Schnappschuss-Wegweiser, keine Ableitungs-/Zyklus-Zeile', () => {
    const bericht: DatenbestandBericht = { ...BERICHT_UNAUFFAELLIG, integrityCheckFunde: ['x'] }
    const { nachricht } = berichtNachrichtBauen(tStub, bericht)

    expect(nachricht).toContain('wartung_datenbestandPruefen_funde({"anzahl":1})')
    expect(nachricht).toContain('wartung_datenbestandPruefen_integritaet({"anzahl":1})')
    expect(nachricht).toContain('wartung_datenbestandPruefen_wegweiserSchnappschuss')
    expect(nachricht).not.toContain('wartung_datenbestandPruefen_ableitung')
    expect(nachricht).not.toContain('wartung_datenbestandPruefen_zyklus')
  })

  it('fremdschluesselFunde: Gesamtanzahl + Fremdschlüssel-Zeile mit korrekter Anzahl', () => {
    const bericht: DatenbestandBericht = {
      ...BERICHT_UNAUFFAELLIG,
      fremdschluesselFunde: [
        { tabelle: 'name', rowid: 1, ziel: 'person' },
        { tabelle: 'name', rowid: 2, ziel: 'person' },
      ],
    }
    const { nachricht } = berichtNachrichtBauen(tStub, bericht)

    expect(nachricht).toContain('wartung_datenbestandPruefen_funde({"anzahl":2})')
    expect(nachricht).toContain('wartung_datenbestandPruefen_fremdschluessel({"anzahl":2})')
  })

  it('Ableitungsabweichung: nennt die betroffenen Tabellen UND den Neuaufbau-Wegweiser', () => {
    const bericht: DatenbestandBericht = {
      ...BERICHT_UNAUFFAELLIG,
      ableitungAbweichung: { betroffeneTabellen: ['person_flach', 'name_phonetik'] },
    }
    const { nachricht } = berichtNachrichtBauen(tStub, bericht)

    expect(nachricht).toContain('wartung_datenbestandPruefen_ableitung({"tabellen":"person_flach, name_phonetik"})')
    expect(nachricht).toContain('wartung_datenbestandPruefen_wegweiserNeuaufbau')
  })

  it('Zyklus gefunden: eigene Zeile', () => {
    const bericht: DatenbestandBericht = { ...BERICHT_UNAUFFAELLIG, zyklusGefunden: true }
    const { nachricht } = berichtNachrichtBauen(tStub, bericht)

    expect(nachricht).toContain('wartung_datenbestandPruefen_zyklus')
  })

  it('mehrere Funde gleichzeitig: Gesamtanzahl zählt über alle vier Kategorien (zyklusGefunden zählt als 1)', () => {
    const bericht: DatenbestandBericht = {
      integrityCheckFunde: ['a'],
      fremdschluesselFunde: [{ tabelle: 'name', rowid: 1, ziel: 'person' }],
      ableitungAbweichung: { betroffeneTabellen: ['person_flach'] },
      zyklusGefunden: true,
    }
    const { nachricht } = berichtNachrichtBauen(tStub, bericht)

    expect(nachricht).toContain('wartung_datenbestandPruefen_funde({"anzahl":4})')
  })
})
