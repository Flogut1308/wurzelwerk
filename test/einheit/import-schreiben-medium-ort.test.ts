// Regressionstest (hueter-Auflage aus PR #60): `schreibeImport()` schrieb `medium` VOR `ort`,
// obwohl `medium.ort_id REFERENCES ort(id)` (docs/schema/0002_kern.sql:409) und der Vertrag ein
// ortsgebundenes Medium erlaubt (`$defs/Medium.ort`, 56_Import_Vertrag.md §3.8). Unter
// `foreign_keys=ON` brach das mit "FOREIGN KEY constraint failed" ab, sobald ein `medien[]`-Eintrag
// ein `ort`-Feld trug — kein bestehendes Fixture (beispiel-1/-2/-3) trifft diesen Fall, darum ein
// eigener, minimaler Regressionsfall statt einer Erweiterung der bestehenden Testdateien.
import { describe, expect, it } from 'vitest'
import { frischeDatenbankMitAbgeleitetemSchema } from './_hilfen-abgeleitet'
import { schreibeImport } from '../../src/main/import/schreiben'
import { importDateiSchema } from '../../src/shared/schemata/import-v1'

const ROH_IMPORT = {
  vertrag: 'wurzelwerk-import/v1',
  erzeugt: { am: '2026-09-17', werkzeug: 'test' },
  zusammenfassung: { personen: 0, orte: 1, medien: 1, notizen_unverarbeitet: 0 },
  quellen: [{ id: 'tmp:q1', typ: 'sonstiges', titel: 'Testquelle' }],
  orte: [{ id: 'tmp:o1', typ: 'stadt', namen: [{ name: 'Testort', ist_bevorzugt: true }] }],
  medien: [{ id: 'tmp:m1', relativer_pfad: 'foto.jpg', titel: 'Ortsgebundenes Foto', ort: 'tmp:o1' }],
  notizen_unverarbeitet: [],
}

interface MediumZeile {
  readonly ort_id: string | null
}

describe('schreibeImport() — medium mit ort-Referenz (Regression, hueter PR #60)', () => {
  it('läuft ohne FK-Fehler durch und schreibt medium.ort_id = die aufgelöste Ort-UUID', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    const datei = importDateiSchema.parse(ROH_IMPORT)

    const ergebnis = schreibeImport(db, datei, { erstelltAm: 1_700_000_000_000 })
    const ortId = ergebnis.kennungen.get('tmp:o1')
    const mediumId = ergebnis.kennungen.get('tmp:m1')
    expect(ortId).toBeDefined()
    expect(mediumId).toBeDefined()

    const zeile = db.prepare<{ readonly id: string }, MediumZeile>('SELECT ort_id FROM medium WHERE id = @id').get({ id: mediumId ?? '' })
    expect(zeile?.ort_id).toBe(ortId)
  })
})
