// AP-0.7 PR-A, test/einheit/suche-schriftsysteme.test.ts (ADR-014, C-16/C-17). Prüft das
// Zusammenspiel Trigger -> suche_fts: eine Person mit einem kyrillischen Original-Namenseintrag
// und einem transliterierten Geschwistereintrag - eine FTS-Abfrage mit der lateinischen Umschrift
// muss den kyrillischen Datensatz finden (das ist der ganze Zweck der dritten FTS-Ebene
// "umschrift", 55_Architektur.md §5.2). Direktes INSERT statt Befehlsbus, da der erst AP-0.9 kommt
// (Auftrag). v3 ist nicht als Migration registriert (PR-A-Entscheidung) - darum wendet dieser Test
// docs/schema/0003_abgeleitet.sql direkt an, siehe test/einheit/_hilfen-abgeleitet.ts.
import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { frischeDatenbankMitAbgeleitetemSchema } from './_hilfen-abgeleitet'

interface TrefferZeile {
  readonly rowid: number
}

describe('suche_fts: Schriftsystem-übergreifende Suche (AP-0.7, ADR-014)', () => {
  it('Eingabe "Scerbakov" findet den Datensatz mit kyrillischem Original über den Umschrift-Geschwistereintrag', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const personId = uuidv7()
      db.prepare('INSERT INTO person (id, privat, ist_platzhalter) VALUES (@id, 0, 0)').run({ id: personId })

      const kyrillischeId = uuidv7()
      db.prepare(
        `INSERT INTO name (id, person_id, typ, schrift, nachname, original_text)
         VALUES (@id, @personId, 'geburtsname', 'cyrl', @nachname, @originalText)`,
      ).run({ id: kyrillischeId, personId, nachname: 'Щербаков', originalText: 'Щербаков' })

      const umschriftId = uuidv7()
      db.prepare(
        `INSERT INTO name (id, person_id, typ, schrift, umschrift_von, nachname, original_text)
         VALUES (@id, @personId, 'transliteriert', 'latn', @umschriftVon, @nachname, @originalText)`,
      ).run({ id: umschriftId, personId, umschriftVon: kyrillischeId, nachname: 'Scerbakov', originalText: 'Scerbakov' })

      const kyrillischeQuelle = db
        .prepare<{ readonly quelleId: string }, { readonly rowid: number }>(
          "SELECT rowid FROM suche_fts_quelle WHERE quelle_typ = 'name' AND quelle_id = @quelleId",
        )
        .get({ quelleId: kyrillischeId })
      expect(kyrillischeQuelle).toBeDefined()

      const treffer = db
        .prepare<[], TrefferZeile>("SELECT rowid FROM suche_fts WHERE suche_fts MATCH 'Scerbakov'")
        .all()
      const trefferRowids = treffer.map((zeile) => zeile.rowid)

      expect(kyrillischeQuelle).not.toBeUndefined()
      if (kyrillischeQuelle !== undefined) {
        expect(trefferRowids).toContain(kyrillischeQuelle.rowid)
      }
    } finally {
      db.close()
    }
  })

  it('Kein Treffer mehr nach Löschen des Umschrift-Geschwistereintrags (fan-out räumt den alten Indexeintrag korrekt ab)', () => {
    // Bewusst eine Umschrift, die suchnormalform() aus dem kyrillischen Original NICHT selbst
    // produzieren würde ("Shcherbakoff" statt des automatischen "scerbakov") - so testet dieser
    // Fall wirklich den Umschrift-Fan-out und nicht (versehentlich) die davon unabhängige
    // Normalform-Transliteration, die für den kyrillischen Eintrag ohnehin weiterhin träfe.
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const personId = uuidv7()
      db.prepare('INSERT INTO person (id, privat, ist_platzhalter) VALUES (@id, 0, 0)').run({ id: personId })

      const kyrillischeId = uuidv7()
      db.prepare(
        `INSERT INTO name (id, person_id, typ, schrift, nachname, original_text)
         VALUES (@id, @personId, 'geburtsname', 'cyrl', @nachname, @originalText)`,
      ).run({ id: kyrillischeId, personId, nachname: 'Щербаков', originalText: 'Щербаков' })

      const umschriftId = uuidv7()
      db.prepare(
        `INSERT INTO name (id, person_id, typ, schrift, umschrift_von, nachname, original_text)
         VALUES (@id, @personId, 'transliteriert', 'latn', @umschriftVon, @nachname, @originalText)`,
      ).run({
        id: umschriftId,
        personId,
        umschriftVon: kyrillischeId,
        nachname: 'Shcherbakoff',
        originalText: 'Shcherbakoff',
      })

      const vorherTreffer = db
        .prepare<[], TrefferZeile>("SELECT rowid FROM suche_fts WHERE suche_fts MATCH 'Shcherbakoff'")
        .all()
      expect(vorherTreffer.length).toBeGreaterThan(0)

      db.prepare('DELETE FROM name WHERE id = @id').run({ id: umschriftId })

      const treffer = db
        .prepare<[], TrefferZeile>("SELECT rowid FROM suche_fts WHERE suche_fts MATCH 'Shcherbakoff'")
        .all()

      expect(treffer).toEqual([])
      expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
    } finally {
      db.close()
    }
  })
})
