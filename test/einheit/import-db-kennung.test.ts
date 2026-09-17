// AP-1.5, 56_Import_Vertrag.md §2.1 Schutzregel (B-04/E21, ADR-026): ein Objekt mit `db:`-Kennung
// darf ergänzen, aber keinen bestehenden bevorzugten Wert ersetzen — außer mit
// `"ueberschreiben": true`. Beide Zweige laufen über `schreibeImport()`
// (`src/main/import/schreiben.ts`), hier über den vollen `importAusfuehren()`-Weg geprüft, damit
// die Prüfung dieselbe Wirkung sieht wie der echte Import (Leitentscheidung AP-1.5: die
// Sondierung IST der echte Import in einer zurückgerollten Transaktion).
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importAusfuehren } from '../../src/main/befehle/import-ausfuehren'
import { neueId } from '../../src/main/id'
import { armieren, entwaffnen } from '../../src/main/journal/kontext'
import * as aussageRepo from '../../src/main/repositories/aussage-repo'
import { naechsteLfd, transaktionAnlegen } from '../../src/main/repositories/journal-repo'
import * as personRepo from '../../src/main/repositories/person-repo'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { datumSpalten } from '../../src/main/import/datum-spalten'

interface AussageZeile {
  readonly id: string
  readonly wert_text: string | null
  readonly ist_bevorzugt: number | null
}

interface AenderungZeile {
  readonly operation: string
  readonly tabelle: string
  readonly datensatz_id: string
}

/** Seedet eine Bestandsperson "Karl" mit einer bevorzugten Aussage `beruf = 'Schmied'` — Grundlage
 * für die Schutzregel-Fälle unten. Analog zu `seedeAugustWruck()` in `trockenlauf-bericht.test.ts`. */
function seedeKarlMitBeruf(db: ReturnType<typeof oeffnen>): { readonly personId: string; readonly aussageId: string } {
  const personId = neueId()
  const aussageId = neueId()
  const seedTxId = neueId()
  db.transaction(() => {
    const lfd = naechsteLfd(db)
    transaktionAnlegen(db, { id: seedTxId, zeitpunkt: 1_600_000_000_000, art: 'nutzer', lfd })
    armieren(db, seedTxId)
    personRepo.einfuegen(db, {
      id: personId,
      privat: 0,
      ist_platzhalter: 0,
      erstelltAm: 1_600_000_000_000,
      geaendertAm: 1_600_000_000_000,
    })
    aussageRepo.einfuegen(db, {
      id: aussageId,
      subjektTyp: 'person',
      subjektId: personId,
      praedikat: 'beruf',
      wertText: 'Schmied',
      wertZahl: null,
      wertRefId: null,
      datum: datumSpalten(undefined),
      konfidenz: 4,
      istBevorzugt: 1,
      begruendung: null,
      unsicherheit: null,
      gueltigVon: null,
      gueltigBis: null,
      erstelltAm: 1_600_000_000_000,
      geaendertAm: 1_600_000_000_000,
    })
    entwaffnen(db)
  })()
  return { personId, aussageId }
}

function baueImportDatei(personId: string, ueberschreiben: boolean | undefined): unknown {
  return {
    vertrag: 'wurzelwerk-import/v1',
    erzeugt: { am: '2026-09-17', werkzeug: 'test' },
    zusammenfassung: { personen: 1, aussagen: 1, notizen_unverarbeitet: 0 },
    quellen: [{ id: 'tmp:q1', typ: 'sonstiges', titel: 'Testquelle import-db-kennung' }],
    personen: [
      {
        id: `db:${personId}`,
        ...(ueberschreiben !== undefined ? { ueberschreiben } : {}),
        namen: [{ typ: 'geburtsname', nachname: 'Irrelevant', ist_bevorzugt: true }],
        konfidenz: 4,
        belege: [{ quelle: 'tmp:q1', konfidenz: 4 }],
      },
    ],
    aussagen: [
      {
        subjekt_typ: 'person',
        subjekt: `db:${personId}`,
        praedikat: 'beruf',
        wert_text: 'Schlosser',
        ist_bevorzugt: true,
        begruendung: 'Neue Angabe aus zweiter Quelle',
        konfidenz: 4,
        belege: [{ quelle: 'tmp:q1', konfidenz: 4 }],
      },
    ],
    notizen_unverarbeitet: [],
  }
}

describe('importAusfuehren() — §2.1 Schutzregel: ergänzen ja, bevorzugten Wert ersetzen nur mit ueberschreiben (AP-1.5)', () => {
  let ordner: string
  let dbPfad: string
  let importPfad: string

  beforeEach(() => {
    ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-import-db-kennung-'))
    dbPfad = join(ordner, 'baum.sqlite')
    importPfad = join(ordner, 'import.json')
  })

  afterEach(() => {
    rmSync(ordner, { recursive: true, force: true })
  })

  it('OHNE ueberschreiben: der bestehende bevorzugte Wert bleibt bevorzugt, der neue steht als konkurrierende Aussage daneben', () => {
    const db = oeffnen(dbPfad)
    try {
      migrieren(db)
      const { personId, aussageId } = seedeKarlMitBeruf(db)
      writeFileSync(importPfad, JSON.stringify(baueImportDatei(personId, undefined)), 'utf8')

      const bericht = importAusfuehren(db, { pfad: importPfad })
      expect(bericht.importGesperrt).toBe(false)

      const aussagen = db
        .prepare<{ readonly personId: string }, AussageZeile>(
          `SELECT id, wert_text, ist_bevorzugt FROM aussage WHERE subjekt_typ = 'person' AND subjekt_id = @personId AND praedikat = 'beruf'`,
        )
        .all({ personId })
      expect(aussagen).toHaveLength(2)

      const bestehend = aussagen.find((a) => a.id === aussageId)
      const neu = aussagen.find((a) => a.id !== aussageId)
      expect(bestehend?.ist_bevorzugt).toBe(1)
      expect(bestehend?.wert_text).toBe('Schmied')
      expect(neu?.wert_text).toBe('Schlosser')
      expect(neu?.ist_bevorzugt).toBe(0)
    } finally {
      db.close()
    }
  })

  it('MIT ueberschreiben:true: die Bevorzugung wechselt, die Demotion steht als aenderung-Zeile im Journal', () => {
    const db = oeffnen(dbPfad)
    try {
      migrieren(db)
      const { personId, aussageId } = seedeKarlMitBeruf(db)
      writeFileSync(importPfad, JSON.stringify(baueImportDatei(personId, true)), 'utf8')

      const bericht = importAusfuehren(db, { pfad: importPfad })
      expect(bericht.importGesperrt).toBe(false)

      const aussagen = db
        .prepare<{ readonly personId: string }, AussageZeile>(
          `SELECT id, wert_text, ist_bevorzugt FROM aussage WHERE subjekt_typ = 'person' AND subjekt_id = @personId AND praedikat = 'beruf'`,
        )
        .all({ personId })
      expect(aussagen).toHaveLength(2)

      const bestehend = aussagen.find((a) => a.id === aussageId)
      const neu = aussagen.find((a) => a.id !== aussageId)
      expect(bestehend?.ist_bevorzugt).toBe(0)
      expect(neu?.wert_text).toBe('Schlosser')
      expect(neu?.ist_bevorzugt).toBe(1)

      // Die Demotion ist ein UPDATE auf `aussage` — muss im Journal DIESER Import-Transaktion stehen.
      const transaktionId = db.prepare<[], { readonly id: string }>('SELECT id FROM transaktion ORDER BY lfd DESC LIMIT 1').get()?.id
      const demotionZeilen = db
        .prepare<{ readonly transaktionId: string; readonly datensatzId: string }, AenderungZeile>(
          `SELECT operation, tabelle, datensatz_id FROM aenderung
           WHERE transaktion_id = @transaktionId AND tabelle = 'aussage' AND datensatz_id = @datensatzId AND operation = 'update'`,
        )
        .all({ transaktionId: transaktionId ?? '', datensatzId: aussageId })
      expect(demotionZeilen).toHaveLength(1)
    } finally {
      db.close()
    }
  })
})
