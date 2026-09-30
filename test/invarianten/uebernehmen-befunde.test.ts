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
import { kanonischerAbzug } from './_kanonischer-abzug'

interface Teil {
  readonly id: string
  readonly art: 'vorname' | 'nachname' | 'vatersname' | 'praefix' | 'suffix' | 'titel'
  readonly wert: string
  readonly ist_rufname: number
}

function teileDerForm(db: Database.Database, formId: string): readonly Teil[] {
  return db
    .prepare<{ readonly formId: string }, Teil>('SELECT id, art, wert, ist_rufname FROM name_part WHERE name_form_id = @formId ORDER BY art, sortier_index')
    .all({ formId })
}

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

  // U-130-11-0b-leerraum-teil (hueter #209 H1, behoben in #212): ein gespeicherter Teil aus reinem Leerraum
  // (Vatersname ' ' aus `name.anlegen`) entfiel, wenn die Zielliste ihn UNVERÄNDERT zurückschickte — mit
  // Transaktion; und ein leerer Eintrag mit unbekannter bzw. fremder ID oder mit anderer Art wurde ohne Fehler
  // verworfen.
  it('U-130-11-0b-leerraum-teil: ein unverändert zurückgeschickter Leerraum-Teil bleibt, ohne Transaktion', () => {
    const db = frischeMigrierteDatenbank()
    try {
      const { id: personId } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      const { id: formId } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl', nachname: 'Nowak', vatersname: ' ' })
      const teile = teileDerForm(db, formId)
      const leerraum = teile.find((t) => t.wert.trim() === '')
      expect(leerraum, 'Vorbedingung: name.anlegen schreibt einen Leerraum-Teil').toBeDefined()
      const abzug = kanonischerAbzug(db)
      fuehreAus(db, 'namensform.uebernehmen', {
        personId,
        formId,
        kopf: {},
        teile: teile.map((t) => ({ id: t.id, art: t.art, wert: t.wert, istRufname: t.ist_rufname === 1 })),
      })
      expect(kanonischerAbzug(db), 'unveränderter Aufruf: kein Schreibvorgang, keine Transaktion').toBe(abzug)
    } finally {
      db.close()
    }
  })

  it('U-130-11-0b-leerraum-teil: ein leerer Eintrag mit unbekannter bzw. fremder ID oder anderer Art wird abgewiesen, ohne Rückstand', () => {
    const db = frischeMigrierteDatenbank()
    try {
      const { id: personId } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
      const { id: formId } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Karl', nachname: 'Nowak' })
      const { id: andereForm } = fuehreAus(db, 'name.anlegen', { personId, typ: 'ehename', vornamen: 'Karl', nachname: 'Müller' })
      const eigene = teileDerForm(db, formId).map((t) => ({ id: t.id, art: t.art, wert: t.wert, istRufname: false }))
      const fremd = teileDerForm(db, andereForm)[0]
      const nachname = eigene.find((t) => t.art === 'nachname')
      if (fremd === undefined || nachname === undefined) throw new Error('Vorbedingung: beide Formen tragen Teile.')
      const faelle = [
        { erwartet: 'NICHT_GEFUNDEN_NAMENSTEIL', teile: [...eigene, { id: 'unbekannte-teil-id', art: 'nachname' as const, wert: ' ', istRufname: false }] },
        { erwartet: 'NICHT_GEFUNDEN_NAMENSTEIL', teile: [...eigene, { id: fremd.id, art: fremd.art, wert: '', istRufname: false }] },
        {
          erwartet: 'VALIDIERUNG_NAMENSTEIL_ART_ABWEICHEND',
          teile: [...eigene.filter((t) => t.id !== nachname.id), { id: nachname.id, art: 'suffix' as const, wert: '', istRufname: false }],
        },
      ] as const
      for (const fall of faelle) {
        const abzug = kanonischerAbzug(db)
        let fehler: unknown
        try {
          fuehreAus(db, 'namensform.uebernehmen', { personId, formId, kopf: {}, teile: fall.teile })
        } catch (e) {
          fehler = e
        }
        expect(fehler instanceof WurzelFehler ? fehler.code : fehler).toBe(fall.erwartet)
        expect(kanonischerAbzug(db)).toBe(abzug)
      }
    } finally {
      db.close()
    }
  })
})
