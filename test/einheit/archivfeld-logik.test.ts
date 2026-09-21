// AP-1.17 PR-C1-Nachbesserung — Deckungslücke (Rot-Beweis-Fund, CLAUDE.md §5): `archivfeld-
// logik.ts` hatte keinen eigenen Test. Reine Umrechnungen/Tastaturnavigation, OHNE React/DOM/
// Netzwerk — kein Mock nötig (Muster `quelle-bearbeiten-logik.test.ts`).
import { describe, expect, it, vi } from 'vitest'
import {
  archivfeldNaechsterIndex,
  archivfeldNeuAnlegenEin,
  archivfeldZeileAktivieren,
  archivfeldZeilenAufbauen,
  type ArchivfeldZeile,
} from '../../src/renderer/bausteine/archivfeld-logik'
import type { ArchivTreffer } from '../../src/shared/schemata/archiv-suche'

function treffer(ueberschreibung: Partial<ArchivTreffer> = {}): ArchivTreffer {
  return { id: 'archiv-1', name: 'Landesarchiv', ...ueberschreibung }
}

describe('archivfeldZeilenAufbauen', () => {
  it('liefert NUR die feste Schlusszeile bei null Treffern', () => {
    expect(archivfeldZeilenAufbauen([])).toEqual([{ art: 'neuAnlegen' }])
  })

  it('hängt die feste Schlusszeile IMMER hinter alle Treffer', () => {
    const a = treffer({ id: 'a', name: 'Staatsarchiv Münster' })
    const b = treffer({ id: 'b', name: 'Bistumsarchiv Trier' })

    expect(archivfeldZeilenAufbauen([a, b])).toEqual([
      { art: 'treffer', treffer: a },
      { art: 'treffer', treffer: b },
      { art: 'neuAnlegen' },
    ])
  })
})

describe('archivfeldNaechsterIndex', () => {
  it('liefert null bei null Zeilen — unabhängig von Richtung/aktuellem Index', () => {
    expect(archivfeldNaechsterIndex(null, 'runter', 0)).toBeNull()
    expect(archivfeldNaechsterIndex(2, 'hoch', 0)).toBeNull()
  })

  it('startet ohne aktuellen Index bei „runter" auf der ersten Zeile', () => {
    expect(archivfeldNaechsterIndex(null, 'runter', 3)).toBe(0)
  })

  it('startet ohne aktuellen Index bei „hoch" auf der LETZTEN Zeile', () => {
    expect(archivfeldNaechsterIndex(null, 'hoch', 3)).toBe(2)
  })

  it('läuft „runter" normal weiter', () => {
    expect(archivfeldNaechsterIndex(0, 'runter', 3)).toBe(1)
    expect(archivfeldNaechsterIndex(1, 'runter', 3)).toBe(2)
  })

  it('läuft „hoch" normal weiter', () => {
    expect(archivfeldNaechsterIndex(2, 'hoch', 3)).toBe(1)
    expect(archivfeldNaechsterIndex(1, 'hoch', 3)).toBe(0)
  })

  it('läuft am Ende „runter" auf die erste Zeile um (Umlauf)', () => {
    expect(archivfeldNaechsterIndex(2, 'runter', 3)).toBe(0)
  })

  it('läuft am Anfang „hoch" auf die letzte Zeile um (Umlauf)', () => {
    expect(archivfeldNaechsterIndex(0, 'hoch', 3)).toBe(2)
  })
})

describe('archivfeldZeileAktivieren', () => {
  it('ruft bei einer Treffer-Zeile aufAusgewaehlt() MIT der Archiv-Id auf', () => {
    const aufAusgewaehlt = vi.fn()
    const aufNeuAnlegen = vi.fn()
    const zeile: ArchivfeldZeile = { art: 'treffer', treffer: treffer({ id: 'archiv-42' }) }

    archivfeldZeileAktivieren(zeile, { aufAusgewaehlt, aufNeuAnlegen })

    expect(aufAusgewaehlt).toHaveBeenCalledExactlyOnceWith('archiv-42')
    expect(aufNeuAnlegen).not.toHaveBeenCalled()
  })

  it('ruft bei der Schlusszeile „neuAnlegen" NUR aufNeuAnlegen() auf, ohne Argument', () => {
    const aufAusgewaehlt = vi.fn()
    const aufNeuAnlegen = vi.fn()
    const zeile: ArchivfeldZeile = { art: 'neuAnlegen' }

    archivfeldZeileAktivieren(zeile, { aufAusgewaehlt, aufNeuAnlegen })

    expect(aufNeuAnlegen).toHaveBeenCalledExactlyOnceWith()
    expect(aufAusgewaehlt).not.toHaveBeenCalled()
  })
})

describe('archivfeldNeuAnlegenEin', () => {
  it('baut die `befehl:archiv.anlegen`-Nutzlast NUR aus dem Namenstext', () => {
    expect(archivfeldNeuAnlegenEin('Landesarchiv Berlin')).toEqual({ name: 'Landesarchiv Berlin' })
  })

  it('reicht einen leeren Text unverändert durch (keine eigene Leerlauf-Prüfung hier)', () => {
    expect(archivfeldNeuAnlegenEin('')).toEqual({ name: '' })
  })
})
