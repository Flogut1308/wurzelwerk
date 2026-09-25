// AP-1.30 PR 2 (docs/80_Offene_Fragen.md §32 V-4-ohne-namen) — rot zuerst (CLAUDE.md §5): eine
// Person ohne Namensform hat den Anzeigenamen `''`. Der Renderer zeigt dafür „(ohne Namen)" statt
// einer leeren Stelle; Platzhalter behalten „Platzhalter" (A-17). Die Entscheidung trifft EINE reine
// Funktion; sichtbare Texte bleiben in `allgemein.json` (ADR-011).
import { describe, expect, it } from 'vitest'
import allgemein from '../../src/shared/i18n/de/allgemein.json'
import {
  PERSONENNAME_SCHLUESSEL,
  personennameAnzeige,
  personennameIstErsatz,
  personennameText,
} from '../../src/renderer/bausteine/personenname-anzeige'

const ALLGEMEIN: Readonly<Record<string, string>> = allgemein

/** Übersetzer aus der echten Ressource — ein fehlender Schlüssel fällt als Fehler auf, nicht als
 * stiller Rückfall auf den Schlüsseltext. */
function tAllgemein(schluessel: string): string {
  const wert = ALLGEMEIN[schluessel]
  if (wert === undefined) throw new Error(`Schlüssel "${schluessel}" fehlt in allgemein.json`)
  return wert
}

describe('personennameAnzeige (§32 V-4-ohne-namen)', () => {
  it('ein gepflegter Name bleibt unverändert', () => {
    expect(personennameAnzeige({ anzeigename: 'Anna Beispiel', ist_platzhalter: false })).toEqual({ art: 'name', text: 'Anna Beispiel' })
  })

  it('leerer Name → ohne_namen', () => {
    expect(personennameAnzeige({ anzeigename: '', ist_platzhalter: false })).toEqual({ art: 'ohne_namen', schluessel: PERSONENNAME_SCHLUESSEL.ohne_namen })
  })

  it('Name nur aus Leerraum gilt als leer (trim)', () => {
    expect(personennameAnzeige({ anzeigename: ' \t ' }).art).toBe('ohne_namen')
  })

  it('Platzhalter gewinnt vor dem Namen — mit leerem und mit gepflegtem Anzeigenamen (A-17)', () => {
    expect(personennameAnzeige({ anzeigename: '', ist_platzhalter: true })).toEqual({ art: 'platzhalter', schluessel: PERSONENNAME_SCHLUESSEL.platzhalter })
    expect(personennameAnzeige({ anzeigename: 'Anna Beispiel', ist_platzhalter: true }).art).toBe('platzhalter')
  })

  it('ohne ist_platzhalter-Angabe (Prüfhinweise, Informant) zählt nur der Name', () => {
    expect(personennameAnzeige({ anzeigename: 'Anna Beispiel' }).art).toBe('name')
    expect(personennameAnzeige({ anzeigename: '' }).art).toBe('ohne_namen')
  })
})

describe('personennameText / personennameIstErsatz', () => {
  it('übersetzt den Ersatz über den Übersetzer des Aufrufers, den Namen unverändert', () => {
    expect(personennameText({ anzeigename: '' }, tAllgemein)).toBe('(ohne Namen)')
    expect(personennameText({ anzeigename: '', ist_platzhalter: true }, tAllgemein)).toBe('Platzhalter')
    expect(personennameText({ anzeigename: 'Anna Beispiel', ist_platzhalter: false }, tAllgemein)).toBe('Anna Beispiel')
  })

  it('Ersatz ja für Platzhalter und leeren Namen, nein für einen Namen', () => {
    expect(personennameIstErsatz({ anzeigename: '' })).toBe(true)
    expect(personennameIstErsatz({ anzeigename: 'x', ist_platzhalter: true })).toBe(true)
    expect(personennameIstErsatz({ anzeigename: 'x', ist_platzhalter: false })).toBe(false)
  })

  it('jeder Ersatzschlüssel steht in allgemein.json (ADR-011)', () => {
    for (const schluessel of Object.values(PERSONENNAME_SCHLUESSEL)) {
      expect(allgemein).toHaveProperty(schluessel)
    }
  })
})
