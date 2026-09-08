// AP-0.7 PR-A, hueter-Review-Auflage 1: Karteileiche in suche_fts beim Löschen eines
// fremdschriftlichen Originalnamens. Reproduktion: Person mit kyrillischem Original + lateinischem
// Umschrift-Geschwister (umschrift_von -> Original). Die Fremdschlüsselaktion
// `umschrift_von ... ON DELETE SET NULL` (docs/schema/0002_kern.sql) kappt die Geschwisterbeziehung
// des überlebenden Namens, BEVOR der AFTER-DELETE-Trigger des gelöschten Originals seinen eigenen,
// zu löschenden Indexeintrag rekonstruiert - eine reine Live-Abfrage sieht die Beziehung dann
// bereits gekappt und liefert '' statt des tatsächlich indizierten Werts, wodurch das echte
// Posting im contentless-FTS5-Index nie subtrahiert wird (Karteileiche).
import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { alleAbgeleitetenNeuAufbauen } from '../../src/main/datenbank/trigger'
import {
  frischeDatenbankMitAbgeleitetemSchema,
  sucheFtsInhaltAbzug,
  verwaisteFtsEintraegeAnzahl,
} from './_hilfen-abgeleitet'

function personMitFremdschriftlichemNamenAnlegen(db: ReturnType<typeof frischeDatenbankMitAbgeleitetemSchema>): {
  readonly personId: string
  readonly kyrillischeId: string
  readonly umschriftId: string
} {
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
  ).run({ id: umschriftId, personId, umschriftVon: kyrillischeId, nachname: 'Scherbakov', originalText: 'Scherbakov' })

  return { personId, kyrillischeId, umschriftId }
}

describe('Bitgleichheit beim Löschen fremdschriftlicher Namen (hueter-Review AP-0.7 PR-A)', () => {
  it('DELETE des kyrillischen Originals (Geschwister überlebt, umschrift_von wird per SET NULL gekappt)', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const { kyrillischeId } = personMitFremdschriftlichemNamenAnlegen(db)

      db.prepare('DELETE FROM name WHERE id = @id').run({ id: kyrillischeId })

      // Die entscheidende Prüfung zuerst: keine Karteileiche im rohen FTS5-Index. Ein reiner
      // sucheFtsInhaltAbzug()-Vergleich allein hätte diesen Fehler NICHT gefangen (siehe
      // Modul-Doku von verwaisteFtsEintraegeAnzahl) - beide Seiten wären fälschlich gleich
      // gewesen, weil der join über suche_fts_quelle blind für verwaiste rowids ist.
      expect(verwaisteFtsEintraegeAnzahl(db)).toBe(0)

      const inkrementell = sucheFtsInhaltAbzug(db)
      alleAbgeleitetenNeuAufbauen(db)
      const nachNeuaufbau = sucheFtsInhaltAbzug(db)

      expect(inkrementell).toBe(nachNeuaufbau)
      expect(verwaisteFtsEintraegeAnzahl(db)).toBe(0)
      expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
    } finally {
      db.close()
    }
  })

  it('DELETE der ganzen Person (CASCADE löscht Original UND Umschrift-Geschwister)', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const { personId } = personMitFremdschriftlichemNamenAnlegen(db)

      db.prepare('DELETE FROM person WHERE id = @id').run({ id: personId })

      expect(verwaisteFtsEintraegeAnzahl(db)).toBe(0)

      const inkrementell = sucheFtsInhaltAbzug(db)
      alleAbgeleitetenNeuAufbauen(db)
      const nachNeuaufbau = sucheFtsInhaltAbzug(db)

      expect(inkrementell).toBe(nachNeuaufbau)
      expect(inkrementell).toBe('[]') // die Person und alle ihre Namen sind weg - nichts sollte übrig bleiben.
      expect(verwaisteFtsEintraegeAnzahl(db)).toBe(0)
      expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
    } finally {
      db.close()
    }
  })

  it('roher Treffer gegen suche_fts enthält keine rowid, die nicht (mehr) in suche_fts_quelle steht (kein Phantom-Treffer)', () => {
    // Bewusst KEIN erwarteter Fixwert (mehrere Namenszeilen matchen "scherbakov" legitim: die
    // kyrillische Zeile über ihre umschrift-Spalte, die lateinische über original - beides echte
    // Treffer, keine Phantome). Die eigentliche Prüfung: jede per rohem `MATCH` gefundene rowid
    // muss auch über suche_fts_quelle auflösbar sein - eine Karteileiche hat ihre
    // suche_fts_quelle-Zeile bereits verloren (siehe Modul-Doku von verwaisteFtsEintraegeAnzahl)
    // und würde hier als rowid ohne passende quelle_id auffallen.
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      personMitFremdschriftlichemNamenAnlegen(db)
      const { kyrillischeId } = personMitFremdschriftlichemNamenAnlegen(db) // zweite, unabhängige Person/Namensgruppe
      db.prepare('DELETE FROM name WHERE id = @id').run({ id: kyrillischeId })

      const rohTreffer = db
        .prepare<[], { readonly rowid: number }>("SELECT rowid FROM suche_fts WHERE suche_fts MATCH 'scherbakov'")
        .all()
        .map((zeile) => zeile.rowid)
      const bekannteRowids = new Set(db.prepare<[], { readonly rowid: number }>('SELECT rowid FROM suche_fts_quelle').all().map((z) => z.rowid))

      const phantome = rohTreffer.filter((rowid) => !bekannteRowids.has(rowid))
      expect(phantome).toEqual([])
    } finally {
      db.close()
    }
  })
})
