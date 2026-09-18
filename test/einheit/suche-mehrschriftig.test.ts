// AP-1.6 PR1, C-16/C-17, ADR-014: rote Tests für `abfrage:suche` (src/main/abfragen/suche.ts) —
// VOR der Implementierung geschrieben (CLAUDE.md §5). Prüft die drei FTS5-Ebenen
// (original/umschrift/normalform, 55_Architektur.md §5.2) einzeln + zusammen sowie die Kölner
// Phonetik als schwächere zweite Quelle (`quelle: 'phonetik'`). Direktes INSERT statt Befehlsbus,
// analog test/einheit/suche-schriftsysteme.test.ts (der Bus ist für Lesevorgänge ohnehin nicht
// zuständig).
import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import type Database from 'better-sqlite3'
import { frischeDatenbankMitAbgeleitetemSchema } from './_hilfen-abgeleitet'
import { suche } from '../../src/main/abfragen/suche'

function personMitNamenAnlegen(
  db: Database.Database,
  optionen: {
    readonly nachname: string
    readonly originalText?: string
    readonly schrift?: 'latn' | 'cyrl'
  },
): string {
  const personId = uuidv7()
  db.prepare('INSERT INTO person (id, privat, ist_platzhalter) VALUES (@id, 0, 0)').run({ id: personId })
  db.prepare(
    `INSERT INTO name (id, person_id, typ, schrift, nachname, original_text)
     VALUES (@id, @personId, 'geburtsname', @schrift, @nachname, @originalText)`,
  ).run({
    id: uuidv7(),
    personId,
    schrift: optionen.schrift ?? null,
    nachname: optionen.nachname,
    originalText: optionen.originalText ?? optionen.nachname,
  })
  return personId
}

function umschriftAnlegen(db: Database.Database, personId: string, kyrillischeId: string, nachname: string): void {
  db.prepare(
    `INSERT INTO name (id, person_id, typ, schrift, umschrift_von, nachname, original_text)
     VALUES (@id, @personId, 'transliteriert', 'latn', @umschriftVon, @nachname, @originalText)`,
  ).run({ id: uuidv7(), personId, umschriftVon: kyrillischeId, nachname, originalText: nachname })
}

describe('abfrage:suche (AP-1.6 PR1, ADR-014)', () => {
  it('Original-Ebene: die exakte, geschriebene Namensform findet den Datensatz (quelle: volltext)', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      personMitNamenAnlegen(db, { nachname: 'Schmidt' })

      const ergebnis = suche(db, { text: 'Schmidt', grenze: 10 })

      expect(ergebnis.treffer).toHaveLength(1)
      expect(ergebnis.treffer[0]?.anzeigename).toBe('Schmidt')
      expect(ergebnis.treffer[0]?.quelle).toBe('volltext')
    } finally {
      db.close()
    }
  })

  it('Umschrift-Ebene: die lateinische Umschrift findet den Datensatz mit kyrillischem Original', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const personId = uuidv7()
      db.prepare('INSERT INTO person (id, privat, ist_platzhalter) VALUES (@id, 0, 0)').run({ id: personId })
      const kyrillischeId = uuidv7()
      db.prepare(
        `INSERT INTO name (id, person_id, typ, schrift, nachname, original_text)
         VALUES (@id, @personId, 'geburtsname', 'cyrl', @nachname, @originalText)`,
      ).run({ id: kyrillischeId, personId, nachname: 'Щербаков', originalText: 'Щербаков' })
      umschriftAnlegen(db, personId, kyrillischeId, 'Scerbakov')

      const ergebnis = suche(db, { text: 'Scerbakov', grenze: 10 })

      expect(ergebnis.treffer.map((treffer) => treffer.person_id)).toContain(personId)
      const eigenerTreffer = ergebnis.treffer.find((treffer) => treffer.person_id === personId)
      expect(eigenerTreffer?.quelle).toBe('volltext')
    } finally {
      db.close()
    }
  })

  it('und umgekehrt: die kyrillische Originalschreibung findet denselben Datensatz direkt (Original-Ebene)', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const personId = uuidv7()
      db.prepare('INSERT INTO person (id, privat, ist_platzhalter) VALUES (@id, 0, 0)').run({ id: personId })
      const kyrillischeId = uuidv7()
      db.prepare(
        `INSERT INTO name (id, person_id, typ, schrift, nachname, original_text)
         VALUES (@id, @personId, 'geburtsname', 'cyrl', @nachname, @originalText)`,
      ).run({ id: kyrillischeId, personId, nachname: 'Щербаков', originalText: 'Щербаков' })
      umschriftAnlegen(db, personId, kyrillischeId, 'Scerbakov')

      const ergebnis = suche(db, { text: 'Щербаков', grenze: 10 })

      expect(ergebnis.treffer.map((treffer) => treffer.person_id)).toContain(personId)
    } finally {
      db.close()
    }
  })

  it('Normalform-Ebene: eine diakritikafreie Eingabe findet einen Namen mit Umlaut (Wróbel/Wrobel)', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const personId = personMitNamenAnlegen(db, { nachname: 'Wróbel' })

      const ergebnis = suche(db, { text: 'Wrobel', grenze: 10 })

      expect(ergebnis.treffer.map((treffer) => treffer.person_id)).toContain(personId)
    } finally {
      db.close()
    }
  })

  it('Zusammen: eine Anfrage aus zwei Wörtern findet nur die Person, bei der beide Wörter vorkommen', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const passendeId = uuidv7()
      db.prepare('INSERT INTO person (id, privat, ist_platzhalter) VALUES (@id, 0, 0)').run({ id: passendeId })
      db.prepare(
        `INSERT INTO name (id, person_id, typ, nachname, vornamen, original_text)
         VALUES (@id, @personId, 'geburtsname', 'Krause', 'Anna', 'Anna Krause')`,
      ).run({ id: uuidv7(), personId: passendeId })
      personMitNamenAnlegen(db, { nachname: 'Krause' })

      const ergebnis = suche(db, { text: 'Anna Krause', grenze: 10 })

      expect(ergebnis.treffer.map((treffer) => treffer.person_id)).toEqual([passendeId])
    } finally {
      db.close()
    }
  })

  it('Kölner Phonetik als schwächere zweite Quelle: "Meyer" findet "Maier" (quelle: phonetik), Volltext-Treffer bleibt "volltext"', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const meyerId = personMitNamenAnlegen(db, { nachname: 'Meyer' })
      const maierId = personMitNamenAnlegen(db, { nachname: 'Maier' })

      const ergebnis = suche(db, { text: 'Meyer', grenze: 10 })

      const meyerTreffer = ergebnis.treffer.find((treffer) => treffer.person_id === meyerId)
      const maierTreffer = ergebnis.treffer.find((treffer) => treffer.person_id === maierId)
      expect(meyerTreffer?.quelle).toBe('volltext')
      expect(maierTreffer?.quelle).toBe('phonetik')
    } finally {
      db.close()
    }
  })

  it('dedupliziert je Person: eine Person, die sowohl per Volltext als auch phonetisch träfe, erscheint nur einmal (als volltext)', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const meyerId = personMitNamenAnlegen(db, { nachname: 'Meyer' })

      const ergebnis = suche(db, { text: 'Meyer', grenze: 10 })

      const treffer = ergebnis.treffer.filter((eintrag) => eintrag.person_id === meyerId)
      expect(treffer).toHaveLength(1)
      expect(treffer[0]?.quelle).toBe('volltext')
    } finally {
      db.close()
    }
  })

  it('ein Apostroph im gesuchten Namen bricht die Anfrage nicht (O\'Brien)', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const personId = personMitNamenAnlegen(db, { nachname: "O'Brien" })

      expect(() => suche(db, { text: "O'Brien", grenze: 10 })).not.toThrow()
      const ergebnis = suche(db, { text: "O'Brien", grenze: 10 })
      expect(ergebnis.treffer.map((treffer) => treffer.person_id)).toContain(personId)
    } finally {
      db.close()
    }
  })

  it('liefert eine leere Trefferliste für eine leere Suchanfrage, ohne zu werfen', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      personMitNamenAnlegen(db, { nachname: 'Schmidt' })

      expect(() => suche(db, { text: '   ', grenze: 10 })).not.toThrow()
      expect(suche(db, { text: '   ', grenze: 10 }).treffer).toEqual([])
    } finally {
      db.close()
    }
  })
})
