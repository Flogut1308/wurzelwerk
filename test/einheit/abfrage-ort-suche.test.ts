// AP-1.13 PR-C — rot zuerst (CLAUDE.md §5, eiserne Regel): vor der Implementierung geschrieben.
// `abfrage:ort.suche` (src/main/abfragen/ort-suche.ts) — findet Orte über einen Teilstring EINES
// (auch historischen) `ortsname.name`, liefert den zu `ein.jdn` datumsgültigen Namen
// (`src/core/ort/zeitbezug.ts::gueltigerOrtsname`, ohne `jdn` den bevorzugten). Direktes INSERT
// statt Befehlsbus (Lesevorgänge sind nicht Sache des Bus, analog test/einheit/abfrage-person-liste.test.ts).
import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import type Database from 'better-sqlite3'
import { frischeDatenbankMitAbgeleitetemSchema } from './_hilfen-abgeleitet'
import { ortSuche } from '../../src/main/abfragen/ort-suche'
import type { OrtSucheEin } from '../../src/shared/schemata/ort-suche'

function ortAnlegen(db: Database.Database, typ: string | null = null): string {
  const ortId = uuidv7()
  db.prepare('INSERT INTO ort (id, typ) VALUES (@id, @typ)').run({ id: ortId, typ })
  return ortId
}

function ortsnameAnlegen(
  db: Database.Database,
  ortId: string,
  optionen: { readonly name: string; readonly gueltigVon?: number; readonly gueltigBis?: number; readonly istBevorzugt?: 0 | 1 },
): void {
  db.prepare(
    `INSERT INTO ortsname (id, ort_id, name, gueltig_von, gueltig_bis, ist_bevorzugt)
     VALUES (@id, @ortId, @name, @gueltigVon, @gueltigBis, @istBevorzugt)`,
  ).run({
    id: uuidv7(),
    ortId,
    name: optionen.name,
    gueltigVon: optionen.gueltigVon ?? null,
    gueltigBis: optionen.gueltigBis ?? null,
    istBevorzugt: optionen.istBevorzugt ?? null,
  })
}

function sucheEingabe(ueberschreibung: Partial<OrtSucheEin> & Pick<OrtSucheEin, 'text'>): OrtSucheEin {
  return { grenze: 20, ...ueberschreibung }
}

describe('abfrage:ort.suche (AP-1.13 PR-C)', () => {
  it('findet einen Ort über einen Teilstring seines Namens, unabhängig von Groß-/Kleinschreibung', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const ortId = ortAnlegen(db, 'stadt')
      ortsnameAnlegen(db, ortId, { name: 'Marienwerder', istBevorzugt: 1 })

      const ergebnis = ortSuche(db, sucheEingabe({ text: 'marien' }))

      expect(ergebnis.treffer).toHaveLength(1)
      expect(ergebnis.treffer[0]?.id).toBe(ortId)
      expect(ergebnis.treffer[0]?.anzeigename).toBe('Marienwerder')
    } finally {
      db.close()
    }
  })

  it('liefert ohne jdn den bevorzugten Namen, mit jdn den zu diesem Datum gültigen (Marienwerder 1900 / Kwidzyn 1950)', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const ortId = ortAnlegen(db, 'stadt')
      // Grobe JDN-Grenzwerte (die Grenzlogik selbst ist bereits über
      // src/core/ort/zeitbezug.ts geprüft) — 2415021 ≈ 1.1.1900, 2433283 ≈ 1.1.1950.
      ortsnameAnlegen(db, ortId, { name: 'Marienwerder', gueltigBis: 2433282, istBevorzugt: 0 })
      ortsnameAnlegen(db, ortId, { name: 'Kwidzyn', gueltigVon: 2433283, istBevorzugt: 1 })

      const ohneJdn = ortSuche(db, sucheEingabe({ text: 'wid' }))
      expect(ohneJdn.treffer).toHaveLength(1)
      expect(ohneJdn.treffer[0]?.anzeigename).toBe('Kwidzyn')

      // "wid" steckt nur im historischen Namen "Kwidzyn" — gefunden über diesen, angezeigt wird
      // trotzdem der zu 1900 gültige Name.
      const mit1900 = ortSuche(db, sucheEingabe({ text: 'wid', jdn: 2415021 }))
      expect(mit1900.treffer).toHaveLength(1)
      expect(mit1900.treffer[0]?.anzeigename).toBe('Marienwerder')
    } finally {
      db.close()
    }
  })

  it('leerer Suchtext liefert keine Treffer (keine Blindabfrage über den gesamten Ortsbestand)', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const ortId = ortAnlegen(db, 'stadt')
      ortsnameAnlegen(db, ortId, { name: 'Berlin', istBevorzugt: 1 })

      const ergebnis = ortSuche(db, sucheEingabe({ text: '' }))
      expect(ergebnis.treffer).toEqual([])
    } finally {
      db.close()
    }
  })

  it('respektiert "grenze" als Kandidatenfenster', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      for (let i = 0; i < 5; i += 1) {
        const ortId = ortAnlegen(db, 'dorf')
        ortsnameAnlegen(db, ortId, { name: `Dorf ${i}`, istBevorzugt: 1 })
      }

      const ergebnis = ortSuche(db, sucheEingabe({ text: 'Dorf', grenze: 2 }))
      expect(ergebnis.treffer).toHaveLength(2)
    } finally {
      db.close()
    }
  })
})
