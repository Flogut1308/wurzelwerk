// AP-1.30 PR 8 (hueter #162, 5): die aus dem Menü nach src/shared gezogene Zerlegung der
// Transaktionsbeschreibung „<namensraum>.<schluessel>“ — Grenzfälle einzeln, damit eine geänderte
// Bedingung auffällt. Freie Texte (z. B. Importbeschreibungen) sind keine Schlüssel und bleiben Text.
import { describe, expect, it } from 'vitest'
import { transaktionsBeschreibungUebersetzen, transaktionsBeschreibungZerlegen, type BeschreibungUebersetzer } from '../../src/shared/i18n/transaktions-beschreibung'

describe('transaktionsBeschreibungZerlegen', () => {
  it('zerlegt am ersten Punkt in Namensraum und Schlüssel', () => {
    expect(transaktionsBeschreibungZerlegen('journal.person_angelegt')).toEqual({ namensraum: 'journal', schluessel: 'person_angelegt' })
    expect(transaktionsBeschreibungZerlegen('journal.name.geaendert')).toEqual({ namensraum: 'journal', schluessel: 'name.geaendert' })
  })

  it('ohne Punkt, mit Punkt am Anfang oder am Ende ist es kein Schlüssel', () => {
    expect(transaktionsBeschreibungZerlegen('Import')).toBeNull()
    expect(transaktionsBeschreibungZerlegen('.person_angelegt')).toBeNull()
    expect(transaktionsBeschreibungZerlegen('journal.')).toBeNull()
    expect(transaktionsBeschreibungZerlegen('')).toBeNull()
  })

  it('Übersetzen nutzt den Namensraum, freier Text bleibt unverändert', () => {
    const t: BeschreibungUebersetzer = (schluessel, optionen) => `${String(optionen?.['ns'])}:${schluessel}`
    expect(transaktionsBeschreibungUebersetzen(t, 'journal.person_angelegt')).toBe('journal:person_angelegt')
    expect(transaktionsBeschreibungUebersetzen(t, 'Import datei')).toBe('Import datei')
    expect(transaktionsBeschreibungUebersetzen(t, 'journal.')).toBe('journal.')
  })
})
