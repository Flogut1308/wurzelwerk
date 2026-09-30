// AP-1.30 PR 11-1 (A-02; docs/design/Entwicklungsvorgaben Person bearbeiten & Medien.md §8, Abnahme 2a;
// Entscheidungen V-130-11-E2/E3): der Anzeigetext einer Form wertet `name_form.reihenfolge` aus. Bei
// `nachname_zuerst` lautet die Wortfolge Titel, Präfix, Nachname, Vornamen, Vatersname, Zusatz — die
// ossetische Form zeigt „Гуытнаты Карл". Bei `NULL` oder `vorname_zuerst` bleibt die bisherige Folge
// (Titel Vornamen Vatersname Präfix Nachname Zusatz) bitgleich. Reine Kern-Eingabe; Liste und
// Profilkopf deckt test/einheit/anzeigename-leser.test.ts ab. Rot zuerst (CLAUDE.md §5).
import { describe, expect, it } from 'vitest'
import { anzeigenameFuer, anzeigetextVon, hatAnzeigetext, sortierName, type AnzeigeForm } from '../../src/core/name/anzeigename'
import type { GeladenerTeil } from '../../src/core/name/zerlegung'

function teil(art: GeladenerTeil['art'], wert: string, sortierIndex = 0): GeladenerTeil {
  return { art, wert, istRufname: false, sortierIndex }
}

function form(ueberschreibung: Partial<AnzeigeForm> & Pick<AnzeigeForm, 'formId'>): AnzeigeForm {
  return { sprache: null, schrift: null, istBevorzugt: true, umschriftVon: null, originalText: null, teile: [], ...ueberschreibung }
}

const OSSETISCH: readonly GeladenerTeil[] = [teil('vorname', 'Карл'), teil('nachname', 'Гуытнаты')]
const ALLE_ARTEN: readonly GeladenerTeil[] = [
  teil('suffix', 'Jr.'),
  teil('vorname', 'Iwan', 0),
  teil('vorname', 'Karl', 1),
  teil('nachname', 'Iwanow'),
  teil('titel', 'Dr.'),
  teil('vatersname', 'Petrowitsch'),
  teil('praefix', 'von'),
]
const HEUTIGE_FOLGE = 'Dr. Iwan Karl Petrowitsch von Iwanow Jr.'

describe('anzeigetextVon wertet name_form.reihenfolge aus (AP-1.30 PR 11-1)', () => {
  it('Abnahme 2a: die ossetische Form mit nachname_zuerst zeigt „Гуытнаты Карл"', () => {
    const f = form({ formId: 'os', sprache: 'os', reihenfolge: 'nachname_zuerst', teile: OSSETISCH })
    expect(anzeigetextVon(f)).toBe('Гуытнаты Карл')
    expect(anzeigenameFuer([f])).toEqual({ text: 'Гуытнаты Карл', quelle: 'hauptname', formId: 'os' })
  })

  it('nachname_zuerst mit allen Teilarten: Titel, Präfix, Nachname, Vornamen, Vatersname, Zusatz', () => {
    expect(anzeigetextVon(form({ formId: 'f', reihenfolge: 'nachname_zuerst', teile: ALLE_ARTEN }))).toBe('Dr. von Iwanow Iwan Karl Petrowitsch Jr.')
  })

  it('reihenfolge NULL ergibt den heutigen Text bitgleich', () => {
    expect(anzeigetextVon(form({ formId: 'f', reihenfolge: null, teile: ALLE_ARTEN }))).toBe(HEUTIGE_FOLGE)
    expect(anzeigetextVon(form({ formId: 'f', teile: ALLE_ARTEN }))).toBe(HEUTIGE_FOLGE)
    expect(anzeigetextVon({ teile: ALLE_ARTEN, originalText: null })).toBe(HEUTIGE_FOLGE)
  })

  it('vorname_zuerst ergibt den heutigen Text bitgleich', () => {
    expect(anzeigetextVon(form({ formId: 'f', reihenfolge: 'vorname_zuerst', teile: ALLE_ARTEN }))).toBe(HEUTIGE_FOLGE)
    expect(anzeigetextVon(form({ formId: 'f', reihenfolge: 'vorname_zuerst', teile: OSSETISCH }))).toBe('Карл Гуытнаты')
  })

  it('ohne Bestandteile bleibt original_text wortgetreu, auch bei nachname_zuerst', () => {
    expect(anzeigetextVon(form({ formId: 'f', reihenfolge: 'nachname_zuerst', originalText: 'Карл Гуытнаты' }))).toBe('Карл Гуытнаты')
    expect(hatAnzeigetext(form({ formId: 'f', reihenfolge: 'nachname_zuerst' }))).toBe(false)
  })

  it('der Sortiername hängt nicht an der Reihenfolge', () => {
    expect(sortierName(form({ formId: 'f', reihenfolge: 'nachname_zuerst', teile: OSSETISCH }))).toBe('Гуытнаты, Карл')
  })

  it('Umschrift-Stufe: die Reihenfolge der gewählten Form gilt, nicht die der Hauptform', () => {
    const haupt = form({ formId: 'h', reihenfolge: 'nachname_zuerst', teile: OSSETISCH })
    const umschrift = form({ formId: 'u', istBevorzugt: false, umschriftVon: 'h', teile: [teil('vorname', 'Karl'), teil('nachname', 'Gutnaty')] })
    expect(anzeigenameFuer([haupt, umschrift])).toEqual({ text: 'Karl Gutnaty', quelle: 'umschrift', formId: 'u' })
  })
})
