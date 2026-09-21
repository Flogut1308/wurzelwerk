// AP-1.16 PR-C — rot zuerst (CLAUDE.md §5, eiserne Regel): vor der Implementierung geschrieben.
// `abfrage:ort.detail` (src/main/abfragen/ort-detail.ts) — die lesende Grundlage der Orte-Pflege-
// Ansicht: Ort-Stammfelder + ALLE `ortsname`-Zeilen + BEIDE `ortszugehoerigkeit`-Ketten (politisch
// UND kirchlich, roh, s. Kopfkommentar `src/shared/schemata/ort-detail.ts`) + `ort_externe_id`.
// Direktes INSERT statt Befehlsbus (Lesevorgänge sind nicht Sache des Bus, analog
// test/einheit/abfrage-ort-suche.test.ts).
import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import type Database from 'better-sqlite3'
import { frischeDatenbankMitAbgeleitetemSchema } from './_hilfen-abgeleitet'
import { ortDetail } from '../../src/main/abfragen/ort-detail'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'

function ortAnlegen(db: Database.Database, ueberschreibung: Partial<{ readonly typ: string | null; readonly notiz: string | null }> = {}): string {
  const ortId = uuidv7()
  db.prepare('INSERT INTO ort (id, typ, notiz) VALUES (@id, @typ, @notiz)').run({
    id: ortId,
    typ: ueberschreibung.typ ?? null,
    notiz: ueberschreibung.notiz ?? null,
  })
  return ortId
}

function ortsnameAnlegen(
  db: Database.Database,
  ortId: string,
  optionen: { readonly name: string; readonly gueltigVon?: number; readonly gueltigBis?: number; readonly istBevorzugt?: 0 | 1 },
): string {
  const id = uuidv7()
  db.prepare(
    `INSERT INTO ortsname (id, ort_id, name, gueltig_von, gueltig_bis, ist_bevorzugt)
     VALUES (@id, @ortId, @name, @gueltigVon, @gueltigBis, @istBevorzugt)`,
  ).run({
    id,
    ortId,
    name: optionen.name,
    gueltigVon: optionen.gueltigVon ?? null,
    gueltigBis: optionen.gueltigBis ?? null,
    istBevorzugt: optionen.istBevorzugt ?? null,
  })
  return id
}

function zugehoerigkeitAnlegen(
  db: Database.Database,
  ortId: string,
  uebergeordnetId: string,
  art: 'politisch' | 'kirchlich',
  optionen: { readonly gueltigVon?: number; readonly gueltigBis?: number } = {},
): string {
  const id = uuidv7()
  db.prepare(
    `INSERT INTO ortszugehoerigkeit (id, ort_id, uebergeordnet_id, art, gueltig_von, gueltig_bis)
     VALUES (@id, @ortId, @uebergeordnetId, @art, @gueltigVon, @gueltigBis)`,
  ).run({ id, ortId, uebergeordnetId, art, gueltigVon: optionen.gueltigVon ?? null, gueltigBis: optionen.gueltigBis ?? null })
  return id
}

function externeIdAnlegen(db: Database.Database, ortId: string, system: string, wert: string): void {
  db.prepare('INSERT INTO ort_externe_id (ort_id, system, wert) VALUES (@ortId, @system, @wert)').run({ ortId, system, wert })
}

describe('abfrage:ort.detail (AP-1.16 PR-C)', () => {
  it('liefert die Stammfelder des Orts', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const ortId = ortAnlegen(db, { typ: 'stadt', notiz: 'Testnotiz' })
      const ergebnis = ortDetail(db, { ortId })
      expect(ergebnis.kopf.id).toBe(ortId)
      expect(ergebnis.kopf.typ).toBe('stadt')
      expect(ergebnis.kopf.notiz).toBe('Testnotiz')
    } finally {
      db.close()
    }
  })

  it('liefert ALLE ortsname-Zeilen roh — zwei zeitlich getrennte Namen (Marienwerder/Kwidzyn 1945)', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const ortId = ortAnlegen(db)
      // Grobe JDN-Grenzwerte (die Grenzlogik selbst ist bereits über src/core/ort/zeitbezug.ts
      // geprüft, s. dortige Tests) — 2415021 ≈ 1.1.1900, 2433283 ≈ 1.1.1950.
      ortsnameAnlegen(db, ortId, { name: 'Marienwerder', gueltigBis: 2433282, istBevorzugt: 0 })
      ortsnameAnlegen(db, ortId, { name: 'Kwidzyn', gueltigVon: 2433283, istBevorzugt: 1 })

      const ergebnis = ortDetail(db, { ortId })
      expect(ergebnis.namen).toHaveLength(2)
      expect(ergebnis.namen.map((eintrag) => eintrag.name).sort()).toEqual(['Kwidzyn', 'Marienwerder'])
      const kwidzyn = ergebnis.namen.find((eintrag) => eintrag.name === 'Kwidzyn')
      expect(kwidzyn?.ist_bevorzugt).toBe(true)
      expect(kwidzyn?.gueltig_von).toBe(2433283)
    } finally {
      db.close()
    }
  })

  it('liefert BEIDE Zugehörigkeitsketten (politisch UND kirchlich), getrennt nach art', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const ortId = ortAnlegen(db)
      const kreisId = ortAnlegen(db)
      const bistumId = ortAnlegen(db)
      ortsnameAnlegen(db, kreisId, { name: 'Kreis Marienwerder', istBevorzugt: 1 })
      ortsnameAnlegen(db, bistumId, { name: 'Bistum Kulm', istBevorzugt: 1 })
      zugehoerigkeitAnlegen(db, ortId, kreisId, 'politisch')
      zugehoerigkeitAnlegen(db, ortId, bistumId, 'kirchlich')

      const ergebnis = ortDetail(db, { ortId })
      expect(ergebnis.zugehoerigkeiten).toHaveLength(2)
      const politisch = ergebnis.zugehoerigkeiten.find((eintrag) => eintrag.art === 'politisch')
      const kirchlich = ergebnis.zugehoerigkeiten.find((eintrag) => eintrag.art === 'kirchlich')
      expect(politisch?.uebergeordnet_id).toBe(kreisId)
      expect(politisch?.uebergeordnet_anzeigename).toBe('Kreis Marienwerder')
      expect(kirchlich?.uebergeordnet_id).toBe(bistumId)
      expect(kirchlich?.uebergeordnet_anzeigename).toBe('Bistum Kulm')
    } finally {
      db.close()
    }
  })

  it('liefert die ort_externe_id-Zeilen', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const ortId = ortAnlegen(db)
      externeIdAnlegen(db, ortId, 'gov', 'GOV-1234')
      externeIdAnlegen(db, ortId, 'geonames', '4567')

      const ergebnis = ortDetail(db, { ortId })
      expect(ergebnis.externeIds).toHaveLength(2)
      expect(ergebnis.externeIds.map((eintrag) => eintrag.system).sort()).toEqual(['geonames', 'gov'])
    } finally {
      db.close()
    }
  })

  it('unbekannte ortId -> NICHT_GEFUNDEN_ORT', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      expect(() => ortDetail(db, { ortId: 'nicht-vorhanden' })).toThrowError(
        expect.objectContaining({ code: 'NICHT_GEFUNDEN_ORT' } satisfies Partial<WurzelFehler>),
      )
    } finally {
      db.close()
    }
  })
})
