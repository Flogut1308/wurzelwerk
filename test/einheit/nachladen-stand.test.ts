// U-130-nachladen-undo-vor-echo (docs/80 §33): der Nachladen-Stand, mit dem
// `useEntwurfMitVerzoegertemCommit` eine Rücknahme erkennt, auch wenn sich sein `wert` nicht ändert.
// `planen` ist hier eine Warteschlange, die der Test von Hand abarbeitet (im Renderer
// `notifyManager.schedule` von TanStack).
import { describe, expect, it, vi } from 'vitest'
import { istRuecknahme, nachladenMelderErzeugen, wartetAufRuecknahme } from '../../src/renderer/brücke/nachladen-stand'

function warteschlange(): { readonly planen: (aufgabe: () => void) => void; readonly abarbeiten: () => void } {
  const aufgaben: (() => void)[] = []
  return {
    planen: (aufgabe) => {
      aufgaben.push(aufgabe)
    },
    abarbeiten: () => {
      for (const aufgabe of aufgaben.splice(0)) aufgabe()
    },
  }
}

describe('Nachladen-Stand nach Rücknahmen (U-130-nachladen-undo-vor-echo)', () => {
  it('nur Undo und Redo sind Rücknahmen', () => {
    expect(istRuecknahme('journal.undo')).toBe(true)
    expect(istRuecknahme('journal.redo')).toBe(true)
    expect(istRuecknahme('person.feldSetzen')).toBe(false)
    expect(istRuecknahme('import.ausfuehren')).toBe(false)
  })

  it('eine Rücknahme wartet, bis ihre Invalidierung abgeschlossen und der Planer gelaufen ist', () => {
    const w = warteschlange()
    const melder = nachladenMelderErzeugen(w.planen)
    expect(wartetAufRuecknahme(melder.lesen())).toBe(false)
    const fertig = melder.invalidierungBegonnen(true)
    expect(melder.lesen()).toEqual({ fremdNr: 1, geladenNr: 0 })
    expect(wartetAufRuecknahme(melder.lesen())).toBe(true)
    fertig()
    expect(wartetAufRuecknahme(melder.lesen())).toBe(true) // erst nach dem Planer
    w.abarbeiten()
    expect(melder.lesen()).toEqual({ fremdNr: 1, geladenNr: 1 })
    expect(wartetAufRuecknahme(melder.lesen())).toBe(false)
  })

  it('eine andere Invalidierung zählt nicht hoch', () => {
    const w = warteschlange()
    const melder = nachladenMelderErzeugen(w.planen)
    const vorher = melder.lesen()
    melder.invalidierungBegonnen(false)()
    w.abarbeiten()
    expect(melder.lesen()).toBe(vorher)
  })

  it('eine abgebrochene frühere Invalidierung zieht nicht nach, solange eine spätere läuft', () => {
    const w = warteschlange()
    const melder = nachladenMelderErzeugen(w.planen)
    const undoFertig = melder.invalidierungBegonnen(true)
    const spaeterFertig = melder.invalidierungBegonnen(false)
    undoFertig() // vorzeitig, weil die spätere Invalidierung den Abruf abgebrochen hat
    w.abarbeiten()
    expect(wartetAufRuecknahme(melder.lesen())).toBe(true)
    spaeterFertig()
    w.abarbeiten()
    expect(melder.lesen()).toEqual({ fremdNr: 1, geladenNr: 1 })
  })

  it('zwei Rücknahmen hintereinander: nachgezogen wird auf die letzte', () => {
    const w = warteschlange()
    const melder = nachladenMelderErzeugen(w.planen)
    const erste = melder.invalidierungBegonnen(true)
    const zweite = melder.invalidierungBegonnen(true)
    erste()
    zweite()
    w.abarbeiten()
    expect(melder.lesen()).toEqual({ fremdNr: 2, geladenNr: 2 })
  })

  it('Abonnenten hören jede Änderung, gleiche Stände liefern dieselbe Referenz, Abmelden wirkt', () => {
    const w = warteschlange()
    const melder = nachladenMelderErzeugen(w.planen)
    const bei = vi.fn()
    const abmelden = melder.abonnieren(bei)
    const fertig = melder.invalidierungBegonnen(true)
    expect(bei).toHaveBeenCalledTimes(1)
    const zwischen = melder.lesen()
    expect(melder.lesen()).toBe(zwischen)
    fertig()
    fertig() // doppelter Aufruf ist wirkungslos
    w.abarbeiten()
    expect(bei).toHaveBeenCalledTimes(2)
    abmelden()
    melder.invalidierungBegonnen(true)
    expect(bei).toHaveBeenCalledTimes(2)
  })
})
