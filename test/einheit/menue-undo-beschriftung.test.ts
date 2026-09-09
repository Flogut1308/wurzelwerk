// AP-0.10 PR-A2: reine Beschriftungslogik der zwei Journal-Menüpunkte (Rückgängig/Wiederholen,
// `src/main/menue/menue.ts`) - ohne Electron, mit einem Übersetzer-Stub statt der echten
// `menueI18n`-Instanz (analog zu `test/einheit/pruefpfad-pruefen.test.ts`, das ebenfalls nur die
// reine Entscheidungslogik eines Hauptprozess-Moduls prüft).
import { describe, expect, it } from 'vitest'
import { journalMenueBeschriftung } from '../../src/main/menue/menue'
import type { JournalStatusNutzlast } from '../../src/shared/ipc/vertrag'

/**
 * Stub statt der echten i18next-Instanz: gibt den Schlüssel selbst zurück, macht aber `ns`- und
 * `beschreibung`-Optionen im Rückgabewert sichtbar, damit ein Test ohne echte Übersetzungsressourcen
 * prüfen kann, WELCHER Schlüssel mit WELCHEN Optionen aufgerufen wurde.
 */
function tStub(schluessel: string, optionen?: Record<string, unknown>): string {
  if (typeof optionen?.ns === 'string') {
    return `[${optionen.ns}:${schluessel}]`
  }
  if (typeof optionen?.beschreibung === 'string') {
    return `${schluessel}(${optionen.beschreibung})`
  }
  return schluessel
}

describe('journalMenueBeschriftung() (AP-0.10, 55_Architektur.md §4.7)', () => {
  it('kein Projekt offen (status: undefined): beide Einträge ausgegraut, Standardbeschriftung', () => {
    const eintraege = journalMenueBeschriftung(tStub, undefined)

    expect(eintraege.rueckgaengig).toEqual({ label: 'journal.rueckgaengig', enabled: false })
    expect(eintraege.wiederholen).toEqual({ label: 'journal.wiederholen', enabled: false })
  })

  it('weder Undo noch Redo möglich: beide Einträge ausgegraut', () => {
    const status: JournalStatusNutzlast = {
      undoMoeglich: false,
      redoMoeglich: false,
      undoBeschreibung: null,
      redoBeschreibung: null,
    }
    const eintraege = journalMenueBeschriftung(tStub, status)

    expect(eintraege.rueckgaengig).toEqual({ label: 'journal.rueckgaengig', enabled: false })
    expect(eintraege.wiederholen).toEqual({ label: 'journal.wiederholen', enabled: false })
  })

  it('Undo möglich, aber ohne Beschreibung: schlichte Beschriftung, trotzdem enabled', () => {
    const status: JournalStatusNutzlast = {
      undoMoeglich: true,
      redoMoeglich: false,
      undoBeschreibung: null,
      redoBeschreibung: null,
    }
    const eintraege = journalMenueBeschriftung(tStub, status)

    expect(eintraege.rueckgaengig).toEqual({ label: 'journal.rueckgaengig', enabled: true })
  })

  it('Undo möglich MIT Ziel: „Rückgängig: <übersetzte Beschreibung>“, enabled', () => {
    const status: JournalStatusNutzlast = {
      undoMoeglich: true,
      redoMoeglich: false,
      undoBeschreibung: 'journal.person_angelegt',
      redoBeschreibung: null,
    }
    const eintraege = journalMenueBeschriftung(tStub, status)

    // `undoBeschreibung` trägt ein "<namensraum>.<schlüssel>"-Präfix (hier: `journal`) — die
    // Funktion übersetzt es MIT explizitem `ns`, bevor sie es in `rueckgaengig_mit_ziel`
    // interpoliert (s. `transaktionsBeschreibungUebersetzen` in `src/main/menue/menue.ts`).
    expect(eintraege.rueckgaengig).toEqual({
      label: 'journal.rueckgaengig_mit_ziel([journal:person_angelegt])',
      enabled: true,
    })
  })

  it('Redo möglich MIT Ziel: „Wiederholen: <übersetzte Beschreibung>“, enabled', () => {
    const status: JournalStatusNutzlast = {
      undoMoeglich: false,
      redoMoeglich: true,
      undoBeschreibung: null,
      redoBeschreibung: 'journal.person_geloescht',
    }
    const eintraege = journalMenueBeschriftung(tStub, status)

    expect(eintraege.wiederholen).toEqual({
      label: 'journal.wiederholen_mit_ziel([journal:person_geloescht])',
      enabled: true,
    })
  })
})
