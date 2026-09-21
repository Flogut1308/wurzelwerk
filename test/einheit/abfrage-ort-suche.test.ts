// AP-1.13 PR-C — rot zuerst (CLAUDE.md §5, eiserne Regel): vor der Implementierung geschrieben.
// `abfrage:ort.suche` (src/main/abfragen/ort-suche.ts) — findet Orte über einen Teilstring EINES
// (auch historischen) `ortsname.name`, liefert den zu `ein.jdn` datumsgültigen Namen
// (`src/core/ort/zeitbezug.ts::gueltigerOrtsname`, ohne `jdn` den bevorzugten). Direktes INSERT
// statt Befehlsbus (Lesevorgänge sind nicht Sache des Bus, analog test/einheit/abfrage-person-liste.test.ts).
import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import type Database from 'better-sqlite3'
import { frischeDatenbankMitAbgeleitetemSchema } from './_hilfen-abgeleitet'
import { nachJdn } from '../../src/core/datum/kalender'
import { ortSuche } from '../../src/main/abfragen/ort-suche'
import type { OrtSucheEin } from '../../src/shared/schemata/ort-suche'

// Kriegsende/Verwaltungswechsel als präziser Testanker (wie test/einheit/ort-zeitbezug.test.ts) —
// keine "magischen" Tageszahlen im Test (AP-1.16 PR-C).
const GRENZTAG_1945 = nachJdn(1945, 5, 8, 'gregorian')

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

function zugehoerigkeitAnlegen(
  db: Database.Database,
  ortId: string,
  uebergeordnetId: string,
  art: 'politisch' | 'kirchlich',
  optionen: { readonly gueltigVon?: number; readonly gueltigBis?: number } = {},
): void {
  db.prepare(
    `INSERT INTO ortszugehoerigkeit (id, ort_id, uebergeordnet_id, art, gueltig_von, gueltig_bis)
     VALUES (@id, @ortId, @uebergeordnetId, @art, @gueltigVon, @gueltigBis)`,
  ).run({ id: uuidv7(), ortId, uebergeordnetId, art, gueltigVon: optionen.gueltigVon ?? null, gueltigBis: optionen.gueltigBis ?? null })
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

  it('ohne jdn: politischeKette ist IMMER leer (kein eindeutiger Gültigkeitszeitpunkt)', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const ortId = ortAnlegen(db, 'dorf')
      ortsnameAnlegen(db, ortId, { name: 'Marienwerder', istBevorzugt: 1 })
      const kreisId = ortAnlegen(db, 'kreis')
      ortsnameAnlegen(db, kreisId, { name: 'Kreis Marienwerder', istBevorzugt: 1 })
      zugehoerigkeitAnlegen(db, ortId, kreisId, 'politisch')

      const ergebnis = ortSuche(db, sucheEingabe({ text: 'marien' }))
      expect(ergebnis.treffer[0]?.politischeKette).toEqual([])
    } finally {
      db.close()
    }
  })

  it('mit jdn: politischeKette trägt die MEHRSTUFIGE politische Kette, nächster Vorfahre zuerst (docs/71 §3.2)', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const ortId = ortAnlegen(db, 'dorf')
      ortsnameAnlegen(db, ortId, { name: 'Marienwerder', istBevorzugt: 1 })
      const kreisId = ortAnlegen(db, 'kreis')
      ortsnameAnlegen(db, kreisId, { name: 'Kreis Marienwerder', istBevorzugt: 1 })
      const provinzId = ortAnlegen(db, 'provinz')
      ortsnameAnlegen(db, provinzId, { name: 'Westpreußen', istBevorzugt: 1 })
      zugehoerigkeitAnlegen(db, ortId, kreisId, 'politisch')
      zugehoerigkeitAnlegen(db, kreisId, provinzId, 'politisch')

      const ergebnis = ortSuche(db, sucheEingabe({ text: 'marienwerder', jdn: 2415021 }))
      expect(ergebnis.treffer[0]?.politischeKette).toEqual(['Kreis Marienwerder', 'Westpreußen'])
    } finally {
      db.close()
    }
  })

  it('mit jdn: eine zum Datum abgelaufene Zugehörigkeit erscheint NICHT in der Kette', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const ortId = ortAnlegen(db, 'dorf')
      ortsnameAnlegen(db, ortId, { name: 'Marienwerder', istBevorzugt: 1 })
      const kreisId = ortAnlegen(db, 'kreis')
      ortsnameAnlegen(db, kreisId, { name: 'Kreis Marienwerder', istBevorzugt: 1 })
      // Zugehörigkeit endet 1945 (JDN ≈ 2431182) — ein Abfragedatum danach (1950, JDN 2433283)
      // liegt außerhalb, die Kette bleibt für diesen Ort leer.
      zugehoerigkeitAnlegen(db, ortId, kreisId, 'politisch', { gueltigBis: 2431182 })

      const ergebnis = ortSuche(db, sucheEingabe({ text: 'marienwerder', jdn: 2433283 }))
      expect(ergebnis.treffer[0]?.politischeKette).toEqual([])
    } finally {
      db.close()
    }
  })

  // AP-1.16 PR-C (docs/71_Designsystem.md §3.2 "Zwingend": Geltungszeitraum rechts neben jedem
  // Vorschlag). Grobe JDN-Grenzwerte wie im Testfall oben (2433282 ≈ 1.1.1950, 2415021 ≈ 1.1.1900).
  it('trägt den Geltungszeitraum des angezeigten Namens (Marienwerder bis 1945 / Kwidzyn ab 1945)', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const ortId = ortAnlegen(db, 'stadt')
      ortsnameAnlegen(db, ortId, { name: 'Marienwerder', gueltigBis: GRENZTAG_1945, istBevorzugt: 0 })
      ortsnameAnlegen(db, ortId, { name: 'Kwidzyn', gueltigVon: GRENZTAG_1945 + 1, istBevorzugt: 1 })

      const ohneJdn = ortSuche(db, sucheEingabe({ text: 'wid' }))
      expect(ohneJdn.treffer[0]?.anzeigename).toBe('Kwidzyn')
      expect(ohneJdn.treffer[0]?.gueltigVonJahr).toBe(1945)
      expect(ohneJdn.treffer[0]?.gueltigBisJahr).toBeUndefined()

      const mit1900 = ortSuche(db, sucheEingabe({ text: 'wid', jdn: 2415021 }))
      expect(mit1900.treffer[0]?.anzeigename).toBe('Marienwerder')
      expect(mit1900.treffer[0]?.gueltigBisJahr).toBe(1945)
      expect(mit1900.treffer[0]?.gueltigVonJahr).toBeUndefined()
    } finally {
      db.close()
    }
  })

  it('ohne Geltungsgrenzen (unbegrenzt gültig): weder gueltigVonJahr noch gueltigBisJahr gesetzt', () => {
    const db = frischeDatenbankMitAbgeleitetemSchema()
    try {
      const ortId = ortAnlegen(db, 'stadt')
      ortsnameAnlegen(db, ortId, { name: 'Berlin', istBevorzugt: 1 })

      const ergebnis = ortSuche(db, sucheEingabe({ text: 'berlin' }))
      expect(ergebnis.treffer[0]?.gueltigVonJahr).toBeUndefined()
      expect(ergebnis.treffer[0]?.gueltigBisJahr).toBeUndefined()
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
