// AP-1.30 PR 11-0b (docs/80 §33 V-130-11-0b; A-02, A-19) — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025).
// Zwei Produktivbefunde, die der Befehlsfolge-Generator (`_befehlsfolge-uebernehmen.ts`) unter Last gefunden
// hat; zuerst als `it.fails` eingecheckt (rot, eiserne Regel §5), seit den Fixes #205
// (V-130-fix-uebernehmen-e3) und #206 (V-130-fix-umschrift-selbstbezug) grüne `it`.
//
// U-130-11-0b-e3-zwischenstand: `namensform.uebernehmen` entschied E3 (`original_text` folgt den Teilen nur,
// wenn er VORHER eine automatische Montage war) je Einzelschritt statt einmal für den Aufruf. Eine wortgetreue
// Schreibung, die in einem Zwischenstand zufällig der Montage gleicht, wird ab dort nachgeführt — „Anna" an einer
// Form ohne Teile wurde mit den Zielteilen [Anna, Nowak] zu „Anna Nowak": nach dem Anlegen von „Anna" glich der
// Text der Montage, das Anlegen von „Nowak" führte ihn nach.
//
// U-130-11-0b-selbstbezug: `name.aendern` (flache Brücke) prüfte `umschriftVon` nur auf Existenz; mit der EIGENEN
// ID brach das Schreiben mit `SQLITE_CORRUPT_VTAB` ab. Jetzt: `VALIDIERUNG_UMSCHRIFT_BEZUG`, Index heil.
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import type Database from 'better-sqlite3'
import { fuehreAus } from '../../src/main/befehle/bus'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'
import { frischeMigrierteDatenbank } from './_frische-datenbank'

function originalText(db: Database.Database, formId: string): unknown {
  return db.prepare('SELECT original_text FROM name_form WHERE id = @formId').get({ formId })
}

/** Eine Form ohne Teile mit dem wortgetreuen Text `text`. */
function formMitText(db: Database.Database, text: string): { readonly personId: string; readonly formId: string } {
  const { id: personId } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
  const { id: formId } = fuehreAus(db, 'namensform.anlegen', { personId, rolle: 'geburtsname' })
  fuehreAus(db, 'namensform.aendern', { id: formId, originalText: text })
  return { personId, formId }
}

describe('Befunde aus der Übernehmen-Last (V-130-11-0b)', () => {
  it('U-130-11-0b-e3-zwischenstand: eine wortgetreue Schreibung bleibt, auch wenn ein Zwischenstand ihr gleicht', () => {
    const db = frischeMigrierteDatenbank()
    try {
      const { personId, formId } = formMitText(db, 'Anna')
      fuehreAus(db, 'namensform.uebernehmen', {
        personId,
        formId,
        kopf: {},
        teile: [
          { art: 'vorname', wert: 'Anna', istRufname: false },
          { art: 'nachname', wert: 'Nowak', istRufname: false },
        ],
      })
      expect(originalText(db, formId)).toEqual({ original_text: 'Anna' })
    } finally {
      db.close()
    }
  })

  it('Grenze des Befunds: eine Schreibung, die keinem Zwischenstand gleicht, bleibt', () => {
    const db = frischeMigrierteDatenbank()
    try {
      const { personId, formId } = formMitText(db, 'Joh. Georg Müller alias Miller')
      fuehreAus(db, 'namensform.uebernehmen', {
        personId,
        formId,
        kopf: {},
        teile: [
          { art: 'vorname', wert: 'Anna', istRufname: false },
          { art: 'nachname', wert: 'Nowak', istRufname: false },
        ],
      })
      expect(originalText(db, formId)).toEqual({ original_text: 'Joh. Georg Müller alias Miller' })
    } finally {
      db.close()
    }
  })

  it('U-130-11-0b-selbstbezug: name.aendern mit umschriftVon = eigene ID lässt den Suchindex heil', () => {
    const db = frischeMigrierteDatenbank()
    try {
      const { id: personId } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      const flach = { typ: 'transliteriert', vornamen: 'Karl', nachname: 'Nowak' } as const
      const { id } = fuehreAus(db, 'name.anlegen', { personId, ...flach })
      let fehler: unknown
      try {
        fuehreAus(db, 'name.aendern', { id, ...flach, umschriftVon: id })
      } catch (e) {
        fehler = e
      }
      // Abgewiesen mit dem genauen Code, der Index bleibt heil.
      expect(fehler instanceof WurzelFehler ? fehler.code : fehler).toBe('VALIDIERUNG_UMSCHRIFT_BEZUG')
      expect(() => db.prepare(`INSERT INTO suche_fts (suche_fts) VALUES ('integrity-check')`).run()).not.toThrow()
    } finally {
      db.close()
    }
  })
})
