// AP-1.34 PR-C2a (§31 U-1.34-E5, „Sterbeort = beides"): Der Import-Writer leitet aus dem Tod-
// Ereignis (`ereignisse[].typ = 'tod'`, Rolle `verstorbener`) neben `todesdatum` auch die Aussage
// `todesort` ab — symmetrisch zu `geburtsort` (nur mit Datum UND Ort, gleiche Konfidenz, gleiche
// Belege). Vertrag v1 bleibt unverändert: die Quelle ist das vorhandene Feld `ereignisse[].ort`.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importAusfuehren } from '../../src/main/befehle/import-ausfuehren'
import { importTrockenlaufDurchfuehren } from '../../src/main/befehle/import-trockenlauf'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { schreibeImport } from '../../src/main/import/schreiben'
import { importDateiSchema } from '../../src/shared/schemata/import-v1'
import { frischeDatenbankMitAbgeleitetemSchema } from './_hilfen-abgeleitet'

interface EreignisOptionen {
  readonly mitDatum: boolean
  readonly mitOrt: boolean
}

/** Minimale v1-Datei: eine Person, ein Ort, eine Quelle, eine Geburt (Datum+Ort) und ein Tod. */
function rohImport(tod: EreignisOptionen): Record<string, unknown> {
  const beleg = { quelle: 'tmp:q1', seite: '12', transkript: 'gestorben zu Testdorf', konfidenz: 3 }
  return {
    vertrag: 'wurzelwerk-import/v1',
    erzeugt: { am: '2026-09-25', werkzeug: 'test' },
    zusammenfassung: { personen: 1, orte: 1, medien: 0, notizen_unverarbeitet: 0 },
    quellen: [{ id: 'tmp:q1', typ: 'sonstiges', titel: 'Testquelle' }],
    orte: [{ id: 'tmp:o1', typ: 'dorf', namen: [{ name: 'Testdorf', ist_bevorzugt: true }] }],
    personen: [
      {
        id: 'tmp:p1',
        namen: [{ typ: 'geburtsname', vornamen: 'Anna', nachname: 'Probe', ist_bevorzugt: true }],
        konfidenz: 4,
        belege: [{ quelle: 'tmp:q1', seite: '1', konfidenz: 4 }],
      },
    ],
    ereignisse: [
      {
        id: 'tmp:e-geb',
        typ: 'geburt',
        datum: { kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', wert1: '1850' },
        ort: 'tmp:o1',
        beteiligungen: [{ person: 'tmp:p1', rolle: 'hauptperson' }],
        konfidenz: 4,
        belege: [{ quelle: 'tmp:q1', seite: '3', konfidenz: 4 }],
      },
      {
        id: 'tmp:e-tod',
        typ: 'tod',
        ...(tod.mitDatum ? { datum: { kalender: 'gregorian', modifikator: 'etwa', praezision: 'jahr', wert1: '1920', original_text: 'um 1920' } } : {}),
        ...(tod.mitOrt ? { ort: 'tmp:o1' } : {}),
        beteiligungen: [{ person: 'tmp:p1', rolle: 'verstorbener' }],
        konfidenz: 2,
        belege: [beleg],
      },
    ],
    notizen_unverarbeitet: [],
  }
}

interface AussageZeile {
  readonly id: string
  readonly wert_ref_id: string | null
  readonly wert_text: string | null
  readonly konfidenz: number | null
}

function aussagenMit(db: Database.Database, personId: string, praedikat: string): readonly AussageZeile[] {
  return db
    .prepare<{ readonly personId: string; readonly praedikat: string }, AussageZeile>(
      `SELECT id, wert_ref_id, wert_text, konfidenz FROM aussage
       WHERE subjekt_typ = 'person' AND subjekt_id = @personId AND praedikat = @praedikat ORDER BY id`,
    )
    .all({ personId, praedikat })
}

/** Belege einer Aussage als vergleichbare Tupel (Quelle, Seite, Transkript, Konfidenz). */
function belegeVon(db: Database.Database, aussageId: string): readonly string[] {
  return db
    .prepare<{ readonly aussageId: string }, { readonly quelle_id: string; readonly seite: string | null; readonly transkript: string | null; readonly konfidenz: number | null }>(
      `SELECT z.quelle_id, z.seite, z.transkript, z.konfidenz FROM aussage_zitat az JOIN zitat z ON z.id = az.zitat_id
       WHERE az.aussage_id = @aussageId ORDER BY z.quelle_id, z.seite`,
    )
    .all({ aussageId })
    .map((z) => JSON.stringify([z.quelle_id, z.seite, z.transkript, z.konfidenz]))
}

function importiere(tod: EreignisOptionen): { readonly db: Database.Database; readonly personId: string; readonly ortId: string } {
  const db = frischeDatenbankMitAbgeleitetemSchema()
  const ergebnis = schreibeImport(db, importDateiSchema.parse(rohImport(tod)), { erstelltAm: 1_700_000_000_000 })
  const personId = ergebnis.kennungen.get('tmp:p1')
  const ortId = ergebnis.kennungen.get('tmp:o1')
  if (personId === undefined || ortId === undefined) throw new Error('Kennungen fehlen im Schreibergebnis')
  return { db, personId, ortId }
}

describe('schreibeImport() — todesort aus dem Tod-Ereignis (AP-1.34, E5)', () => {
  it('T1: Tod mit Datum und Ort → Aussage todesort mit wert_ref_id = Ort, gleiche Konfidenz und Belege wie todesdatum', () => {
    const { db, personId, ortId } = importiere({ mitDatum: true, mitOrt: true })
    try {
      const todesort = aussagenMit(db, personId, 'todesort')
      expect(todesort).toHaveLength(1)
      expect(todesort[0]?.wert_ref_id).toBe(ortId)
      expect(todesort[0]?.wert_text).toBeNull()
      expect(todesort[0]?.konfidenz).toBe(2)

      const todesdatum = aussagenMit(db, personId, 'todesdatum')
      expect(todesdatum).toHaveLength(1)
      const belegeOrt = belegeVon(db, todesort[0]?.id ?? '')
      expect(belegeOrt).toHaveLength(1)
      expect(belegeOrt).toEqual(belegeVon(db, todesdatum[0]?.id ?? ''))
      expect(belegeOrt[0]).toContain(JSON.stringify(['12', 'gestorben zu Testdorf', 3]).slice(1))
    } finally {
      db.close()
    }
  })

  it('T2: Tod ohne Ort → keine Aussage todesort (todesdatum bleibt)', () => {
    const { db, personId } = importiere({ mitDatum: true, mitOrt: false })
    try {
      expect(aussagenMit(db, personId, 'todesort')).toHaveLength(0)
      expect(aussagenMit(db, personId, 'todesdatum')).toHaveLength(1)
    } finally {
      db.close()
    }
  })

  it('T3: Tod ohne Datum → keine Aussage todesort (symmetrisch zu geburtsort)', () => {
    const { db, personId } = importiere({ mitDatum: false, mitOrt: true })
    try {
      expect(aussagenMit(db, personId, 'todesort')).toHaveLength(0)
      expect(aussagenMit(db, personId, 'todesdatum')).toHaveLength(0)
    } finally {
      db.close()
    }
  })

  it('T5: geburtsort bleibt unverändert (eine Aussage, wert_ref_id = Ort, Konfidenz der Geburt)', () => {
    const { db, personId, ortId } = importiere({ mitDatum: true, mitOrt: true })
    try {
      const geburtsort = aussagenMit(db, personId, 'geburtsort')
      expect(geburtsort).toHaveLength(1)
      expect(geburtsort[0]?.wert_ref_id).toBe(ortId)
      expect(geburtsort[0]?.konfidenz).toBe(4)
    } finally {
      db.close()
    }
  })
})

describe('Trockenlauf-Bericht = echter Import, mit todesort (AP-1.34, E5)', () => {
  let ordner: string

  beforeEach(() => {
    ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-todesort-'))
  })

  afterEach(() => {
    rmSync(ordner, { recursive: true, force: true })
  })

  function dateiSchreiben(name: string, tod: EreignisOptionen): string {
    const pfad = join(ordner, name)
    writeFileSync(pfad, JSON.stringify(rohImport(tod)), 'utf8')
    return pfad
  }

  function aussageAnzahl(db: Database.Database): number {
    return db.prepare<[], { readonly n: number }>('SELECT COUNT(*) AS n FROM aussage').get()?.n ?? -1
  }

  it('T4: Bericht zählt genau eine Aussage mehr als ohne Ort, und der echte Import schreibt genau diese Zahl', () => {
    const mitOrt = dateiSchreiben('mit-ort.json', { mitDatum: true, mitOrt: true })
    const ohneOrt = dateiSchreiben('ohne-ort.json', { mitDatum: true, mitOrt: false })

    const db = oeffnen(join(ordner, 'baum.sqlite'))
    try {
      migrieren(db)
      const tabelle = (b: ReturnType<typeof importTrockenlaufDurchfuehren>, name: string): number => b.wirdAngelegt.find((e) => e.tabelle === name)?.anzahl ?? 0

      const trockenOhne = importTrockenlaufDurchfuehren(db, ohneOrt)
      const trockenMit = importTrockenlaufDurchfuehren(db, mitOrt)
      expect(tabelle(trockenMit, 'aussage')).toBe(tabelle(trockenOhne, 'aussage') + 1)

      const echt = importAusfuehren(db, { pfad: mitOrt })
      expect(echt).toEqual(trockenMit)
      expect(aussageAnzahl(db)).toBe(tabelle(trockenMit, 'aussage'))
    } finally {
      db.close()
    }
  })
})
