// AP-1.33: test/einheit/name-anzeigename.test.ts — deckt die reine Kern-Funktion `anzeigenameFuer`
// (Rückfallkette Sprache → Umschrift → Hauptname) + `sortierName` (Nachname, Vornamen; Präfix zählt
// NICHT mit) aus src/core/name/anzeigename.ts ab. Kein Node/SQL — reine Datenstruktur-Eingabe.
import { describe, expect, it } from 'vitest'
import { anzeigenameFuer, anzeigetextVon, hatAnzeigetext, sortierName, type AnzeigeForm } from '../../src/core/name/anzeigename'
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

// Vorarbeiten AP-1.30 Teil 2, PR 2 (Eigentümer 25.09.2026, docs/80 §32 V-4-umschrift): die
// Umschrift-Stufe greift nur für eine Umschrift DER Hauptform, und nur mit Anzeigetext.
describe('Umschrift-Stufe nur für die Umschrift der Hauptform mit Anzeigetext (V-4-umschrift)', () => {
  it('die Umschrift einer Nebenform verdrängt den Hauptnamen nicht („Anna Schmidt", nicht „Anna Šmidt")', () => {
    const haupt = form({ formId: 'h', istBevorzugt: true, teile: [teil('vorname', 'Anna'), teil('nachname', 'Schmidt')] })
    const neben = form({ formId: 'n', schrift: 'Cyrl', teile: [teil('vorname', 'Анна'), teil('nachname', 'Шмидт')] })
    const nebenUmschrift = form({ formId: 'u', schrift: 'Latn', umschriftVon: 'n', teile: [teil('vorname', 'Anna'), teil('nachname', 'Šmidt')] })
    expect(anzeigenameFuer([haupt, neben, nebenUmschrift])).toEqual({ text: 'Anna Schmidt', quelle: 'hauptname', formId: 'h' })
  })

  it('die Umschrift der Hauptform mit Anzeigetext gewinnt weiter („Ivan Ivanov")', () => {
    const haupt = form({ formId: 'h', istBevorzugt: true, schrift: 'Cyrl', teile: [teil('vorname', 'Иван'), teil('nachname', 'Иванов')] })
    const umschrift = form({ formId: 'u', schrift: 'Latn', umschriftVon: 'h', teile: [teil('vorname', 'Ivan'), teil('nachname', 'Ivanov')] })
    expect(anzeigenameFuer([haupt, umschrift])).toEqual({ text: 'Ivan Ivanov', quelle: 'umschrift', formId: 'u' })
  })

  it('eine leere Umschrift der Hauptform verdrängt den Hauptnamen nicht (auch nicht aus reinen Leerzeichen)', () => {
    const haupt = form({ formId: 'h', istBevorzugt: true, teile: [teil('nachname', 'Иванов')] })
    const leer = form({ formId: 'u1', umschriftVon: 'h' })
    const leerzeichen = form({ formId: 'u2', umschriftVon: 'h', originalText: '  ', teile: [teil('nachname', ' ')] })
    expect(anzeigenameFuer([haupt, leer, leerzeichen])).toEqual({ text: 'Иванов', quelle: 'hauptname', formId: 'h' })
  })

  it('eine leere und eine gefüllte Umschrift der Hauptform: die gefüllte gewinnt', () => {
    const haupt = form({ formId: 'h', istBevorzugt: true, teile: [teil('nachname', 'Иванов')] })
    const leer = form({ formId: 'u1', umschriftVon: 'h' })
    const gefuellt = form({ formId: 'u2', umschriftVon: 'h', originalText: 'Ivanov' })
    expect(anzeigenameFuer([haupt, leer, gefuellt])).toEqual({ text: 'Ivanov', quelle: 'umschrift', formId: 'u2' })
  })

  it('ohne bevorzugte Form ist die Hauptform die Form der Stufe 3 (kleinste formId, §32 V-4b-hauptform)', () => {
    const a = form({ formId: 'a', teile: [teil('nachname', 'Иванов')] })
    const b = form({ formId: 'b', teile: [teil('nachname', 'Petrow')] })
    const umschriftVonA = form({ formId: 'c', umschriftVon: 'a', originalText: 'Ivanov' })
    const umschriftVonB = form({ formId: 'd', umschriftVon: 'b', originalText: 'Petrov' })
    expect(anzeigenameFuer([umschriftVonB, b, umschriftVonA, a])).toEqual({ text: 'Ivanov', quelle: 'umschrift', formId: 'c' })
    expect(anzeigenameFuer([b, umschriftVonB, a])).toEqual({ text: 'Иванов', quelle: 'hauptname', formId: 'a' })
  })

  it('ist die Hauptform selbst Umschrift einer anderen Form, meldet sie Stufe 3 (§32 V-4b-quelle)', () => {
    const quelle = form({ formId: 'q', schrift: 'Cyrl', teile: [teil('nachname', 'Иванов')] })
    const haupt = form({ formId: 'h', istBevorzugt: true, umschriftVon: 'q', teile: [teil('nachname', 'Ivanov')] })
    expect(anzeigenameFuer([quelle, haupt])).toEqual({ text: 'Ivanov', quelle: 'hauptname', formId: 'h' })
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

// Vorarbeiten AP-1.30, PR 3 (docs/80 §30 U-1.33-vatersname-anzeige, Eigentümer 25.09.2026): der
// Vatersname gehört in den Anzeigetext zwischen Vornamen und Nachname.
describe('Anzeigetext mit Vatersname (U-1.33-vatersname-anzeige)', () => {
  it('„Iwan Petrowitsch Iwanow" — Vatersname zwischen Vornamen und Nachname', () => {
    const f = form({ formId: 'f1', istBevorzugt: true, teile: [teil('nachname', 'Iwanow'), teil('vatersname', 'Petrowitsch'), teil('vorname', 'Iwan', 0)] })
    expect(anzeigenameFuer([f])?.text).toBe('Iwan Petrowitsch Iwanow')
    expect(anzeigetextVon(f)).toBe('Iwan Petrowitsch Iwanow')
  })

  it('mit Titel, Präfix und Zusatz: Titel Vornamen Vatersname Präfix Nachname Zusatz', () => {
    const f = form({
      formId: 'f1',
      teile: [teil('suffix', 'Jr.'), teil('nachname', 'Iwanow'), teil('praefix', 'von'), teil('vatersname', 'Petrowitsch'), teil('vorname', 'Iwan', 0), teil('titel', 'Dr.')],
    })
    expect(anzeigetextVon(f)).toBe('Dr. Iwan Petrowitsch von Iwanow Jr.')
  })

  it('nur ein Vatersname ist ein Anzeigetext, mehrere Vatersnamensteile in sortierIndex-Reihenfolge', () => {
    expect(anzeigetextVon(form({ formId: 'f1', teile: [teil('vatersname', 'Petrowitsch')] }))).toBe('Petrowitsch')
    expect(anzeigetextVon(form({ formId: 'f1', teile: [teil('vatersname', 'B', 1), teil('vatersname', 'A', 0)] }))).toBe('A B')
  })

  it('der Sortiername bleibt „Nachname, Vornamen" ohne Vatersname', () => {
    const f = form({ formId: 'f1', teile: [teil('nachname', 'Iwanow'), teil('vatersname', 'Petrowitsch'), teil('vorname', 'Iwan', 0)] })
    expect(sortierName(f)).toBe('Iwanow, Iwan')
  })
})
