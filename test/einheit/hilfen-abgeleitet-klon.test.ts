// AP-1.3c — Beleg-Test (kein geschützter Prüfpfad, CLAUDE.md §13/ADR-025: weder
// `test/invarianten/` noch `test/golden/` noch `test/schema/`). Prüft NICHT die abl_*-Trigger
// selbst (das tut weiterhin ausschließlich `test/invarianten/abgeleitet-gleich.test.ts`), sondern
// dass der neue Klon-Pfad in `frischeDatenbankMitAbgeleitetemSchema()`
// (test/einheit/_hilfen-abgeleitet.ts) sich in jeder für diesen Test relevanten Hinsicht
// UNUNTERSCHEIDBAR vom bisherigen Direktpfad verhält:
//   1. identisches Schema (`sqlite_master`, fängt fehlende Trigger/vocab/fts5-Shadow-Tabellen),
//   2. identische Pragmas (foreign_keys, busy_timeout, user_version, integrity_check,
//      foreign_key_check, journal_kontext.aktiv),
//   3. wertgleiche SQL-Funktionen (uuid7/suchnormalform/koelner_phonetik),
//   4. wertgleiches Trigger-/FTS5-Verhalten nach derselben Aktionsfolge (stärkster Beleg: beweist,
//      dass `vocab`/fts5 und die `abl_*`-Trigger nach serialize()/deserialize tatsächlich arbeiten),
//   5. FK-Durchsetzung auf dem Klon (fängt hart ab, falls `foreign_keys` nach dem Deserialize
//      versehentlich OFF wäre).
import { describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { SCHEMA_VERSION } from '../../src/main/datenbank/migration/registrierung'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { journalAus } from '../../src/main/journal/kontext'
import { alleAbgeleitetenNeuAufbauen } from '../../src/main/datenbank/trigger'
import {
  frischeDatenbankMitAbgeleitetemSchema,
  sucheFtsInhaltAbzug,
  verwaisteFtsEintraegeAnzahl,
} from './_hilfen-abgeleitet'
import { aktionAusfuehren, aktionenArbitrary, basisDatenAnlegen, neuerZustand } from '../invarianten/_modell-abgeleitet'
import fc from 'fast-check'

/** Referenz: derselbe Aufbau, den `frischeDatenbankMitAbgeleitetemSchema()` VOR AP-1.3c direkt ausführte. */
function referenzDatenbankAufbauen(): Database.Database {
  const db = oeffnen(':memory:')
  migrieren(db)
  db.exec("CREATE VIRTUAL TABLE vocab USING fts5vocab('suche_fts', 'instance')")
  journalAus(db, 'hilfen-abgeleitet-klon.test.ts: Referenzaufbau über den alten Direktpfad (Beleg-Test AP-1.3c).')
  return db
}

interface SchemaZeile {
  readonly type: string
  readonly name: string
  readonly tbl_name: string
  readonly sql: string | null
}

function schemaAbzug(db: Database.Database): readonly SchemaZeile[] {
  return db
    .prepare<[], SchemaZeile>('SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name')
    .all()
}

function pragmaEinfach(db: Database.Database, name: string): unknown {
  return db.pragma(name, { simple: true })
}

function journalKontextAktiv(db: Database.Database): number {
  const zeile = db.prepare<[], { readonly aktiv: number }>('SELECT aktiv FROM journal_kontext WHERE id = 1').get()
  if (zeile === undefined) {
    throw new Error('journal_kontext-Zeile id=1 fehlt (Beleg-Test-Voraussetzung verletzt)')
  }
  return zeile.aktiv
}

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('Beleg: Klon-Pfad von frischeDatenbankMitAbgeleitetemSchema() verhält sich wie der alte Direktpfad (AP-1.3c)', () => {
  it('Schema (sqlite_master) ist zeichenweise identisch', () => {
    const referenz = referenzDatenbankAufbauen()
    const klon = frischeDatenbankMitAbgeleitetemSchema()
    try {
      expect(schemaAbzug(klon)).toEqual(schemaAbzug(referenz))
    } finally {
      referenz.close()
      klon.close()
    }
  })

  it('Pragmas sind auf dem Klon identisch gesetzt', () => {
    const klon = frischeDatenbankMitAbgeleitetemSchema()
    try {
      expect(pragmaEinfach(klon, 'foreign_keys')).toBe(1)
      expect(pragmaEinfach(klon, 'busy_timeout')).toBe(5000)
      expect(pragmaEinfach(klon, 'user_version')).toBe(SCHEMA_VERSION)
      expect(pragmaEinfach(klon, 'integrity_check')).toBe('ok')
      expect(klon.pragma('foreign_key_check')).toEqual([])
      expect(journalKontextAktiv(klon)).toBe(0)
    } finally {
      klon.close()
    }
  })

  it('SQL-Funktionen liefern auf Referenz und Klon dieselben Werte', () => {
    const referenz = referenzDatenbankAufbauen()
    const klon = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const uuidReferenz = referenz.prepare<[], { readonly wert: string }>('SELECT uuid7() AS wert').get()?.wert
      const uuidKlon = klon.prepare<[], { readonly wert: string }>('SELECT uuid7() AS wert').get()?.wert
      expect(uuidReferenz).toMatch(UUID_V7_REGEX)
      expect(uuidKlon).toMatch(UUID_V7_REGEX)

      const suchnormalformArgument = { arg: 'Müller-Schröder' }
      const suchnormalformReferenz = referenz
        .prepare<{ readonly arg: string }, { readonly wert: string }>('SELECT suchnormalform(@arg) AS wert')
        .get(suchnormalformArgument)?.wert
      const suchnormalformKlon = klon
        .prepare<{ readonly arg: string }, { readonly wert: string }>('SELECT suchnormalform(@arg) AS wert')
        .get(suchnormalformArgument)?.wert
      expect(suchnormalformKlon).toBe(suchnormalformReferenz)

      const phonetikArgument = { arg: 'Meyer' }
      const phonetikReferenz = referenz
        .prepare<{ readonly arg: string }, { readonly wert: string }>('SELECT koelner_phonetik(@arg) AS wert')
        .get(phonetikArgument)?.wert
      const phonetikKlon = klon
        .prepare<{ readonly arg: string }, { readonly wert: string }>('SELECT koelner_phonetik(@arg) AS wert')
        .get(phonetikArgument)?.wert
      expect(phonetikKlon).toBe(phonetikReferenz)
    } finally {
      referenz.close()
      klon.close()
    }
  })

  it('FK-Durchsetzung greift auf dem Klon (ungültiger Fremdschlüssel wirft)', () => {
    const klon = frischeDatenbankMitAbgeleitetemSchema()
    try {
      expect(() =>
        klon
          .prepare('INSERT INTO ortsname (id, ort_id, name) VALUES (@id, @ortId, @name)')
          .run({ id: 'beleg-test-ortsname', ortId: 'nicht-existierender-ort', name: 'Belegstadt' }),
      ).toThrow()
    } finally {
      klon.close()
    }
  })

  it('Verhaltensgleichheit: dieselbe feste Aktionsfolge ergibt auf Referenz und Klon identische abgeleitete Abzüge', () => {
    // Feste, kurze, aus aktionenArbitrary()/basisDatenAnlegen()/aktionAusfuehren() gezogene Folge
    // (kein neuer fast-check-Lauf hier — der Bitgleichheits-Beweis über beliebige Folgen bleibt
    // Sache von test/invarianten/abgeleitet-gleich.test.ts, geschützter Prüfpfad). `sample()` mit
    // festem Seed liefert reproduzierbar dieselbe kurze Folge (CLAUDE.md §4: kein Math.random).
    const [aktionen] = fc.sample(aktionenArbitrary(), { numRuns: 1, seed: 20260917 })
    if (aktionen === undefined) {
      throw new Error('fc.sample lieferte keine Aktionsfolge (Beleg-Test-Voraussetzung verletzt)')
    }

    const referenz = referenzDatenbankAufbauen()
    const klon = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const referenzZustand = neuerZustand()
      const { quelleId: referenzQuelleId } = basisDatenAnlegen(referenz)
      for (const aktion of aktionen) {
        aktionAusfuehren(referenz, referenzZustand, referenzQuelleId, aktion)
      }

      const klonZustand = neuerZustand()
      const { quelleId: klonQuelleId } = basisDatenAnlegen(klon)
      for (const aktion of aktionen) {
        aktionAusfuehren(klon, klonZustand, klonQuelleId, aktion)
      }

      expect(verwaisteFtsEintraegeAnzahl(referenz)).toBe(0)
      expect(verwaisteFtsEintraegeAnzahl(klon)).toBe(0)

      const referenzPersonFlach = referenz
        .prepare('SELECT person_id, anzeigename, geburt_jahr, tod_jahr, hat_widerspruch FROM person_flach ORDER BY person_id')
        .all()
      const klonPersonFlach = klon
        .prepare('SELECT person_id, anzeigename, geburt_jahr, tod_jahr, hat_widerspruch FROM person_flach ORDER BY person_id')
        .all()
      // Zufällige IDs (uuid7 je Testlauf) machen die Zeilen selbst nicht identisch — verglichen
      // wird darum die Anzahl UND (über sucheFtsInhaltAbzug/suche_fts_quelle unten) der Fan-out.
      expect(klonPersonFlach.length).toBe(referenzPersonFlach.length)

      const referenzQuelleAbzug = referenz
        .prepare<[], { readonly quelle_typ: string }>('SELECT quelle_typ FROM suche_fts_quelle ORDER BY quelle_typ')
        .all()
      const klonQuelleAbzug = klon
        .prepare<[], { readonly quelle_typ: string }>('SELECT quelle_typ FROM suche_fts_quelle ORDER BY quelle_typ')
        .all()
      expect(klonQuelleAbzug.length).toBe(referenzQuelleAbzug.length)

      // Der eigentliche Beleg, dass vocab/fts5 nach serialize()/deserialize arbeitet: die
      // Trigger-gepflegten Abzüge müssen mit einem vollständigen Neuaufbau auf BEIDEN
      // Datenbanken bitgleich sein (dieselbe Zusicherung wie im geschützten Prüfpfad, hier nur
      // als Beleg für den Klon-Mechanismus, nicht als Ersatz dafür).
      const referenzInkrementell = sucheFtsInhaltAbzug(referenz)
      alleAbgeleitetenNeuAufbauen(referenz)
      expect(sucheFtsInhaltAbzug(referenz)).toBe(referenzInkrementell)

      const klonInkrementell = sucheFtsInhaltAbzug(klon)
      alleAbgeleitetenNeuAufbauen(klon)
      expect(sucheFtsInhaltAbzug(klon)).toBe(klonInkrementell)

      expect(klon.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
      expect(referenz.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
    } finally {
      referenz.close()
      klon.close()
    }
  })
})
