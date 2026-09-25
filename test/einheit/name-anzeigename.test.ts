// AP-1.33: test/einheit/name-anzeigename.test.ts — deckt die reine Kern-Funktion `anzeigenameFuer`
// (Rückfallkette Sprache → Umschrift → Hauptname) + `sortierName` (Nachname, Vornamen; Präfix zählt
// NICHT mit) aus src/core/name/anzeigename.ts ab. Kein Node/SQL — reine Datenstruktur-Eingabe.
import { describe, expect, it } from 'vitest'
import { anzeigenameFuer, hatAnzeigetext, sortierName, type AnzeigeForm } from '../../src/core/name/anzeigename'
import type { GeladenerTeil } from '../../src/core/name/zerlegung'

function teil(art: GeladenerTeil['art'], wert: string, sortierIndex = 0, istRufname = false): GeladenerTeil {
  return { art, wert, istRufname, sortierIndex }
}

function form(ueberschreibung: Partial<AnzeigeForm> & Pick<AnzeigeForm, 'formId'>): AnzeigeForm {
  return {
    sprache: null,
    schrift: null,
    istBevorzugt: false,
    umschriftVon: null,
    originalText: null,
    teile: [],
    ...ueberschreibung,
  }
}

describe('sortierName (src/core/name/anzeigename.ts, AP-1.33)', () => {
  it('setzt "Nachname, Vornamen" und lässt das Präfix aus der Sortierung heraus', () => {
    const f = form({
      formId: 'f1',
      teile: [
        teil('titel', 'Dr.'),
        teil('vorname', 'Karl', 0),
        teil('vorname', 'Friedrich', 1, true),
        teil('praefix', 'von'),
        teil('nachname', 'Gutnoff'),
        teil('suffix', 'Jr.'),
      ],
    })
    expect(sortierName(f)).toBe('Gutnoff, Karl Friedrich')
  })

  it('ohne Nachname bleibt es bei den Vornamen', () => {
    expect(sortierName(form({ formId: 'f2', teile: [teil('vorname', 'Bruder', 0), teil('vorname', 'Konrad', 1)] }))).toBe('Bruder Konrad')
  })
})

describe('anzeigenameFuer (Rückfallkette, AP-1.33)', () => {
  const original = form({ formId: 'orig', sprache: 'ru', istBevorzugt: true, teile: [teil('nachname', 'Ivanov')] })
  const umschrift = form({ formId: 'um', sprache: 'ru', umschriftVon: 'orig', teile: [teil('nachname', 'Iwanow')] })

  it('liefert null ohne jede Form', () => {
    expect(anzeigenameFuer([])).toBeNull()
  })

  it('bevorzugt die Form der gewünschten Sprache (quelle: sprache)', () => {
    const de = form({ formId: 'de', sprache: 'de', teile: [teil('nachname', 'Schmidt')] })
    const ergebnis = anzeigenameFuer([original, de], 'de')
    expect(ergebnis).toEqual({ text: 'Schmidt', quelle: 'sprache', formId: 'de' })
  })

  it('fällt ohne Sprachtreffer auf die Umschrift zurück (quelle: umschrift)', () => {
    const ergebnis = anzeigenameFuer([original, umschrift], 'en')
    expect(ergebnis).toEqual({ text: 'Iwanow', quelle: 'umschrift', formId: 'um' })
  })

  it('fällt ohne Sprache/Umschrift auf den Hauptnamen zurück (quelle: hauptname)', () => {
    const ergebnis = anzeigenameFuer([original])
    expect(ergebnis).toEqual({ text: 'Ivanov', quelle: 'hauptname', formId: 'orig' })
  })
})

// Vorarbeiten AP-1.30, PR 2 (hueter #125, H5): „Name vorhanden" steht im Kern.
describe('hatAnzeigetext (Nachtrag ADR-031, V-D1-name-vorhanden)', () => {
  it('Bestandteile oder original_text zählen, reine Leerzeichen und nichts nicht', () => {
    expect(hatAnzeigetext(form({ formId: 'f', teile: [teil('nachname', 'Muster')] }))).toBe(true)
    expect(hatAnzeigetext(form({ formId: 'f', originalText: 'Hans der Schmied' }))).toBe(true)
    expect(hatAnzeigetext(form({ formId: 'f', originalText: '   ' }))).toBe(false)
    expect(hatAnzeigetext(form({ formId: 'f' }))).toBe(false)
  })
})
