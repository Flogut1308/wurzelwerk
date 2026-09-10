// AP-0.12 — Determinismus des Massendaten-Generators (`fixtures/generiert/generator.ts`) UND ein
// leichter Smoke-Test für alle acht handgebauten Fixture-Bäume (`test/hilfsmittel/fixture-laden.ts`).
// Die VOLLE Invariante (Integritätsprüfung, Zyklusfreiheit, Ableitungsvergleich je Fixture) folgt in
// einem eigenen PR als `test/invarianten/fixture-gesund.test.ts` (geschützter Prüfpfad, ADR-025) —
// hier nur `integrity_check`, ein reiner SQLite-Strukturcheck ohne fachliche Aussage.
//
// Dump-Helfer BEWUSST aus `test/hilfsmittel/kanonischer-abzug.ts` (eigenständig nachgebaut), NICHT
// aus `test/invarianten/_kanonischer-abzug.ts` importiert — letzteres ist geschützter Prüfpfad
// (CLAUDE.md §13) und darf nicht von `test/einheit/` aus referenziert werden.
import { describe, expect, it } from 'vitest'
import { generiere } from '../../fixtures/generiert/generator'
import { fixtureLaden, type FixtureName } from '../hilfsmittel/fixture-laden'
import { kanonischerAbzug } from '../hilfsmittel/kanonischer-abzug'

const ALLE_FIXTURE_NAMEN: readonly FixtureName[] = [
  'minimal',
  'mehrfachehe',
  'adoption',
  'cousinenheirat',
  'fehlende-daten',
  'kaputte-kodierung',
  'unscharfe-datumsangaben',
  'kyrillisch-polnisch',
]

describe('generiere: Determinismus (AP-0.12-Abnahme)', () => {
  it('zwei Läufe mit gleicher Größe und gleichem Seed liefern einen bitgleichen kanonischen Abzug', () => {
    const ersterLauf = generiere(200, 12345)
    const zweiterLauf = generiere(200, 12345)
    try {
      expect(kanonischerAbzug(ersterLauf)).toBe(kanonischerAbzug(zweiterLauf))
    } finally {
      ersterLauf.close()
      zweiterLauf.close()
    }
  })

  it('erzeugt tatsächlich Personen, Namen und Elternschaften (kein leerer Abzug)', () => {
    const db = generiere(200, 12345)
    try {
      const anzahlPersonen = db.prepare<[], { readonly anzahl: number }>('SELECT COUNT(*) AS anzahl FROM person').get()
      const anzahlNamen = db.prepare<[], { readonly anzahl: number }>('SELECT COUNT(*) AS anzahl FROM name').get()
      const anzahlElternschaften = db
        .prepare<[], { readonly anzahl: number }>('SELECT COUNT(*) AS anzahl FROM elternschaft')
        .get()
      expect(anzahlPersonen?.anzahl).toBe(200)
      expect(anzahlNamen?.anzahl).toBe(200)
      expect(anzahlElternschaften?.anzahl).toBeGreaterThan(0)
    } finally {
      db.close()
    }
  })

  it('verschiedene Seeds liefern verschiedene kanonische Abzüge', () => {
    const ersterLauf = generiere(200, 1)
    const zweiterLauf = generiere(200, 2)
    try {
      expect(kanonischerAbzug(ersterLauf)).not.toBe(kanonischerAbzug(zweiterLauf))
    } finally {
      ersterLauf.close()
      zweiterLauf.close()
    }
  })

  // Baut als einziger Test hier den 2000-Personen-Korpus (AP-0.12-Pflichtgröße). Der Aufbau samt
  // trigger-gepflegter Ableitungstabellen und kanonischem Abzug dauert auf dem langsamen
  // Windows-CI-Runner ~7 s und lief so in Vitests 5000-ms-Default-Timeout (macOS schnell genug).
  // Ein Timing-abhängiger Fehlschlag ist eine nichtdeterministisch rote Prüfung (CLAUDE.md §13,
  // ADR-025) — darum hier ein expliziter, großzügiger Timeout; die Assertion bleibt unverändert.
  it(
    'verschiedene Größen (bei gleichem Seed) liefern verschiedene kanonische Abzüge',
    () => {
      const kleinerLauf = generiere(200, 42)
      const groessererLauf = generiere(2000, 42)
      try {
        expect(kanonischerAbzug(kleinerLauf)).not.toBe(kanonischerAbzug(groessererLauf))
      } finally {
        kleinerLauf.close()
        groessererLauf.close()
      }
    },
    30000,
  )
})

describe('fixtureLaden: Smoke-Test für alle acht Fixture-Bäume', () => {
  it.each(ALLE_FIXTURE_NAMEN)('%s besteht integrity_check', (name) => {
    const db = fixtureLaden(name)
    try {
      const ergebnis = db.pragma('integrity_check', { simple: true })
      expect(ergebnis).toBe('ok')
    } finally {
      db.close()
    }
  })

  it.each(ALLE_FIXTURE_NAMEN)('%s enthält mindestens eine Person', (name) => {
    const db = fixtureLaden(name)
    try {
      const zeile = db.prepare<[], { readonly anzahl: number }>('SELECT COUNT(*) AS anzahl FROM person').get()
      expect(zeile?.anzahl).toBeGreaterThan(0)
    } finally {
      db.close()
    }
  })
})
