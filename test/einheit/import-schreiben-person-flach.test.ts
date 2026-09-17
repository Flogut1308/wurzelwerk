// AP-1.3d: `schreibeImport()` gegen eine kleine, inline gebaute Importdatei mit Geburt (samt Ort)
// UND Tod — Beleg dafür, dass `person_flach` (0003_abgeleitet.sql, gepflegt von `abl_aussage_*`)
// `geburt_jahr`, `tod_jahr` und `geburt_ort_name` NICHT nur aus einer einzelnen abgeleiteten
// Aussage zieht, sondern aus dem VOLLSTÄNDIGEN Satz, den `schreibeImport()` je Person erzeugt
// (Existenz + geburtsdatum + geburtsort + todesdatum, 50_Datenmodell.md §2.7 Nebenbefund 2:
// "person_flach wird AUSSCHLIESSLICH aus aussage gespeist"). Kein Fixture-Datei-Zusatz nötig — die
// drei bestehenden `fixtures/import/v1/gueltig/*.json` haben keine Person mit Geburt+Ort+Tod
// gleichzeitig, darum hier ein minimales, direkt geparstes Objekt (Anforderungspunkt "Abnahmepunkt
// 2" laut Auftrag).
import { describe, expect, it } from 'vitest'
import { frischeDatenbankMitAbgeleitetemSchema } from './_hilfen-abgeleitet'
import { schreibeImport } from '../../src/main/import/schreiben'
import { importDateiSchema } from '../../src/shared/schemata/import-v1'

const ROH_IMPORT = {
  vertrag: 'wurzelwerk-import/v1',
  erzeugt: { am: '2026-09-17', werkzeug: 'test' },
  zusammenfassung: { personen: 1, orte: 1, ereignisse: 2, notizen_unverarbeitet: 0 },
  quellen: [{ id: 'tmp:q1', typ: 'sonstiges', titel: 'Testquelle für person_flach' }],
  personen: [
    {
      id: 'tmp:p1',
      geschlecht: 'M',
      namen: [{ typ: 'geburtsname', vornamen: 'Test', nachname: 'Person', ist_bevorzugt: true }],
      konfidenz: 4,
      belege: [{ quelle: 'tmp:q1', konfidenz: 4 }],
    },
  ],
  orte: [{ id: 'tmp:o1', typ: 'stadt', namen: [{ name: 'Teststadt', ist_bevorzugt: true }] }],
  ereignisse: [
    {
      id: 'tmp:e-geb',
      typ: 'geburt',
      ort: 'tmp:o1',
      datum: { kalender: 'gregorian', modifikator: 'exakt', praezision: 'tag', wert1: '1900-01-01' },
      beteiligungen: [{ person: 'tmp:p1', rolle: 'hauptperson' }],
      konfidenz: 4,
      belege: [{ quelle: 'tmp:q1', konfidenz: 4 }],
    },
    {
      id: 'tmp:e-tod',
      typ: 'tod',
      datum: { kalender: 'gregorian', modifikator: 'exakt', praezision: 'tag', wert1: '1950-06-15' },
      beteiligungen: [{ person: 'tmp:p1', rolle: 'verstorbener' }],
      konfidenz: 4,
      belege: [{ quelle: 'tmp:q1', konfidenz: 4 }],
    },
  ],
  notizen_unverarbeitet: [],
}

interface PersonFlachZeile {
  readonly geburt_jahr: number | null
  readonly tod_jahr: number | null
  readonly geburt_ort_name: string | null
  readonly anzeigename: string
  readonly konfidenz_min: number | null
  readonly hat_widerspruch: number
}

describe('schreibeImport() — person_flach trägt geburt_jahr/tod_jahr/geburt_ort_name (AP-1.3d)', () => {
  it('geburt_jahr=1900, tod_jahr=1950, geburt_ort_name=Teststadt nach Import', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    const datei = importDateiSchema.parse(ROH_IMPORT)

    const ergebnis = schreibeImport(db, datei, { erstelltAm: 1_700_000_000_000 })
    const personId = ergebnis.kennungen.get('tmp:p1')
    expect(personId).toBeDefined()

    const zeile = db
      .prepare<{ readonly id: string }, PersonFlachZeile>(
        'SELECT geburt_jahr, tod_jahr, geburt_ort_name, anzeigename, konfidenz_min, hat_widerspruch FROM person_flach WHERE person_id = @id',
      )
      .get({ id: personId ?? '' })

    expect(zeile).toBeDefined()
    expect(zeile?.geburt_jahr).toBe(1900)
    expect(zeile?.tod_jahr).toBe(1950)
    expect(zeile?.geburt_ort_name).toBe('Teststadt')
    expect(zeile?.anzeigename).toBe('Test Person')
    expect(zeile?.hat_widerspruch).toBe(0)
  })
})
