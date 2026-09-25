// AP-1.30 PR 7c (docs/80 §33 V-130-7-tasten): Tasten 1…8 wählen im Editor den Reiter. Registriert
// zentral in `src/main/menue/tastenkuerzel.ts` (CLAUDE.md §11); der Hauptprozess beobachtet
// `before-input-event` OHNE `preventDefault()` und meldet nur bloße Ziffern der oberen Reihe —
// erkannt über `code` (physische Taste, AZERTY-fest), nie über `key`.
import { describe, expect, it } from 'vitest'
import { REITER } from '../../src/core/person/reiter'
import { KONTEXTTASTEN, kontexttasteErkennen, type KontexttastenEingabe } from '../../src/main/menue/tastenkuerzel'

function eingabe(teil: Partial<KontexttastenEingabe>): KontexttastenEingabe {
  return {
    type: 'keyDown',
    code: 'Digit1',
    isAutoRepeat: false,
    isComposing: false,
    shift: false,
    control: false,
    alt: false,
    meta: false,
    ...teil,
  }
}

describe('kontexttasteErkennen (Tasten 1…8, V-130-7-tasten)', () => {
  it('Digit1…Digit8 ohne Modifikator wählen Reiter 0…7', () => {
    for (let i = 0; i < 8; i += 1) {
      expect(kontexttasteErkennen(eingabe({ code: `Digit${i + 1}` }))).toEqual({ aktion: 'reiterWaehlen', reiterIndex: i })
    }
  })

  it('AZERTY: die Taste „1" meldet key „&", code Digit1 — sie wählt Reiter 1 (Erkennung über code, nie key)', () => {
    // Electrons `Input` trägt `key` mit; die Erkennung darf es nicht auswerten (hueter #161).
    const azerty = { ...eingabe({ code: 'Digit1' }), key: '&' }
    expect(kontexttasteErkennen(azerty)).toEqual({ aktion: 'reiterWaehlen', reiterIndex: 0 })
    const azertyZwei = { ...eingabe({ code: 'Digit2' }), key: 'é' }
    expect(kontexttasteErkennen(azertyZwei)).toEqual({ aktion: 'reiterWaehlen', reiterIndex: 1 })
  })

  it('Digit9, Digit0 und der Ziffernblock sind keine Kontexttaste', () => {
    expect(kontexttasteErkennen(eingabe({ code: 'Digit9' }))).toBeNull()
    expect(kontexttasteErkennen(eingabe({ code: 'Digit0' }))).toBeNull()
    expect(kontexttasteErkennen(eingabe({ code: 'Numpad1' }))).toBeNull()
    expect(kontexttasteErkennen(eingabe({ code: 'KeyA' }))).toBeNull()
  })

  it('jeder Modifikator schließt aus (Shift+1 = „!", Ctrl/Cmd/Alt+1, AltGr = Ctrl+Alt)', () => {
    expect(kontexttasteErkennen(eingabe({ shift: true }))).toBeNull()
    expect(kontexttasteErkennen(eingabe({ control: true }))).toBeNull()
    expect(kontexttasteErkennen(eingabe({ meta: true }))).toBeNull()
    expect(kontexttasteErkennen(eingabe({ alt: true }))).toBeNull()
    expect(kontexttasteErkennen(eingabe({ control: true, alt: true }))).toBeNull()
  })

  it('Tastenwiederholung, Loslassen und IME-Komposition lösen nichts aus', () => {
    expect(kontexttasteErkennen(eingabe({ isAutoRepeat: true }))).toBeNull()
    expect(kontexttasteErkennen(eingabe({ type: 'keyUp' }))).toBeNull()
    expect(kontexttasteErkennen(eingabe({ isComposing: true }))).toBeNull()
  })

  it('die Tabelle deckt genau die acht Reiter in Reihenfolge ab (eine Quelle, Doku des Kürzels)', () => {
    expect(KONTEXTTASTEN.map((taste) => taste.reiterIndex)).toEqual(REITER.map((_, index) => index))
    expect(new Set(KONTEXTTASTEN.map((taste) => taste.code)).size).toBe(REITER.length)
  })
})
