// test/migration/import-luecken.test.ts (AP-1.3c, ADR-026, additiv — kein geschützter Prüfpfad wird
// hier angefasst, nur die neue Migration 0005 selbst geprüft). Deckt den Auftrag aus
// 57_Phase0_Arbeitspakete.md AP-1.3c ab: Aufstieg 4->5, Datenerhalt des Tabellenneubaus (Phase
// 1-3 in docs/schema/0005_import_luecken.sql), CHECK-Erweiterung, Trigger-/FK-Funktionsfähigkeit.
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { v7 as uuidv7 } from 'uuid'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { SCHEMA_VERSION } from '../../src/main/datenbank/migration/registrierung'
import { journalAn, journalAus } from '../../src/main/journal/kontext'

const FIXTURE_V4_PFAD = join(process.cwd(), 'fixtures', 'datenbanken', 'schema-v4.sqlite')

interface SpalteInfoZeile {
  readonly name: string
}

function spaltenNamen(db: Database.Database, tabelle: string): readonly string[] {
  return db.prepare<[], SpalteInfoZeile>(`PRAGMA table_info(${tabelle})`).all().map((zeile) => zeile.name)
}

interface CreateTableSqlZeile {
  readonly sql: string | null
}

function createTableSqlVon(db: Database.Database, tabelle: string): string {
  const zeile = db
    .prepare<{ readonly name: string }, CreateTableSqlZeile>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = @name",
    )
    .get({ name: tabelle })
  if (zeile === undefined || zeile.sql === null) {
    throw new Error(`Kein CREATE-TABLE-SQL für Tabelle "${tabelle}" gefunden.`)
  }
  return zeile.sql
}

interface TriggerNameZeile {
  readonly name: string
}

function triggerNamenFuerTabelle(db: Database.Database, tabelle: string): readonly string[] {
  return db
    .prepare<{ readonly tabelle: string }, TriggerNameZeile>(
      "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = @tabelle",
    )
    .all({ tabelle })
    .map((zeile) => zeile.name)
    .sort((a, b) => a.localeCompare(b))
}

interface IndexNameZeile {
  readonly name: string
}

/** Nur die benannten Indizes aus 0002_kern.sql — `sqlite_autoindex_*` (automatisch für den zusammengesetzten PRIMARY KEY) ausgeschlossen. */
function indexNamenFuerTabelle(db: Database.Database, tabelle: string): readonly string[] {
  return db
    .prepare<[], IndexNameZeile>(`PRAGMA index_list(${tabelle})`)
    .all()
    .map((zeile) => zeile.name)
    .filter((name) => !name.startsWith('sqlite_autoindex_'))
    .sort((a, b) => a.localeCompare(b))
}

interface AnzahlZeile {
  readonly anzahl: number
}

function zeilenzahl(db: Database.Database, tabelle: string): number {
  const zeile = db.prepare<[], AnzahlZeile>(`SELECT COUNT(*) AS anzahl FROM ${tabelle}`).get()
  if (zeile === undefined) {
    throw new Error(`COUNT(*) auf ${tabelle} lieferte keine Zeile.`)
  }
  return zeile.anzahl
}

/** Voll-Spalten-Abzug einer Tabelle (explizite Spaltenliste, sortiert nach id) — für den Vergleich vor/nach der Migration (Beweis: kein Cascade, kein Wertverlust, CLAUDE.md §6: kein SELECT *). */
function spaltenAbzug(db: Database.Database, tabelle: string, spalten: readonly string[], sortierSpalten: readonly string[]): string {
  const sql = `SELECT ${spalten.join(', ')} FROM ${tabelle} ORDER BY ${sortierSpalten.join(', ')}`
  const zeilen = db.prepare<[], Record<string, unknown>>(sql).all()
  return JSON.stringify(zeilen)
}

const AUSSAGE_ZITAT_SPALTEN = ['aussage_id', 'zitat_id', 'erstellt_am', 'geaendert_am'] as const
const RISIKOFAKTOR_SPALTEN = [
  'id',
  'person_id',
  'art',
  'detail',
  'intensitaet',
  'beginn_kalender',
  'beginn_modifikator',
  'beginn_praezision',
  'beginn_wert1',
  'beginn_wert2',
  'beginn_originaltext',
  'beginn_sort_von',
  'beginn_sort_bis',
  'beginn_zweitkalender',
  'beginn_zweitwert',
  'beginn_doppeljahr',
  'ende_kalender',
  'ende_modifikator',
  'ende_praezision',
  'ende_wert1',
  'ende_wert2',
  'ende_originaltext',
  'ende_sort_von',
  'ende_sort_bis',
  'ende_zweitkalender',
  'ende_zweitwert',
  'ende_doppeljahr',
  'quelle_beruf_id',
  'konfidenz',
  'notiz',
  'erstellt_am',
  'geaendert_am',
] as const
/** Die 23 aus Schema v4 ererbten aussage-Spalten (ohne die drei neuen aus Migration 0005). */
const AUSSAGE_ALTSPALTEN = [
  'id',
  'subjekt_typ',
  'subjekt_id',
  'praedikat',
  'wert_text',
  'wert_zahl',
  'wert_ref_id',
  'datum_kalender',
  'datum_modifikator',
  'datum_praezision',
  'datum_wert1',
  'datum_wert2',
  'datum_originaltext',
  'datum_sort_von',
  'datum_sort_bis',
  'datum_zweitkalender',
  'datum_zweitwert',
  'datum_doppeljahr',
  'konfidenz',
  'ist_bevorzugt',
  'begruendung',
  'erstellt_am',
  'geaendert_am',
] as const

const ALLE_SECHS_ALT_SUBJEKTTYPEN = ['person', 'ereignis', 'elternschaft', 'partnerschaft', 'ort', 'name'] as const

describe('test/migration/import-luecken (AP-1.3c, ADR-026, docs/schema/0005_import_luecken.sql)', () => {
  describe('1. Aufstieg 4->5 gegen die eingefrorene schema-v4.sqlite', () => {
    let ordner: string
    let dbPfad: string

    beforeEach(() => {
      ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-import-luecken-aufstieg-'))
      dbPfad = join(ordner, 'baum.sqlite')
      copyFileSync(FIXTURE_V4_PFAD, dbPfad)
    })

    afterEach(() => {
      rmSync(ordner, { recursive: true, force: true })
    })

    it('user_version landet auf SCHEMA_VERSION (>= 5), die fünf neuen Spalten und der erweiterte CHECK sind da', () => {
      const db = oeffnen(dbPfad)
      try {
        expect(db.pragma('user_version', { simple: true })).toBe(4)
        // AP-1.33: voller Aufstieg auf SCHEMA_VERSION. Nicht auf v5 begrenzbar, weil
        // `generierteTriggerAnwenden()` stets das aktuelle trigger_generiert.sql liest (seit 0006
        // `name_form`-, seit 0007 `kennung`-förmig) — die hier geprüften 0005-Eigenschaften
        // (Spalten/CHECK/Daten) überleben jeden weiteren Aufstieg unverändert. AP-1.34: gegen die
        // eigene Zielversion (>= 5) statt gegen eine feste Spitze, damit der nächste Schema-Sprung
        // diesen Test nicht erneut bricht.
        migrieren(db)
        expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
        expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(5)

        expect(spaltenNamen(db, 'zitat')).toContain('zeitmarke_sekunden')
        expect(spaltenNamen(db, 'person')).toContain('unsicherheit')
        const aussageSpalten = spaltenNamen(db, 'aussage')
        expect(aussageSpalten).toContain('unsicherheit')
        expect(aussageSpalten).toContain('gueltig_von')
        expect(aussageSpalten).toContain('gueltig_bis')

        const aussageSql = createTableSqlVon(db, 'aussage')
        for (const wert of ['person', 'ereignis', 'elternschaft', 'partnerschaft', 'ort', 'name', 'diagnose', 'risikofaktor']) {
          expect(aussageSql).toContain(`'${wert}'`)
        }
      } finally {
        db.close()
      }
    })
  })

  describe('2. Datenerhaltung des Tabellenneubaus (Phase 1-3) + FK-/Trigger-Funktionsfähigkeit', () => {
    it('aussage_zitat/risikofaktor überleben bitgleich, Indizes und Trigger sind wieder da, FK-Wirkung ist funktionsfähig', () => {
      // Bewusst NICHT `migrieren(db, { migrationen: MIGRATIONEN.filter(v <= 4) })` gegen eine frische
      // In-Memory-Datenbank: `generierteTriggerAnwenden()` liest IMMER das aktuell ausgecheckte
      // `docs/schema/trigger_generiert.sql` (das inzwischen die v5-Spalten kennt), unabhängig davon,
      // auf welche Version die `migrationen`-Liste gefiltert ist - das erzeugte auf einem
      // v4-Schema-Stand einen `jrn_zitat_*`-Trigger, der `NEW.zeitmarke_sekunden` referenziert, eine
      // Spalte, die auf v4 noch nicht existiert (SqliteError erst beim ersten INSERT, nicht beim
      // CREATE TRIGGER). Die eingefrorene `schema-v4.sqlite` umgeht das: sie wurde VOR dieser
      // PR mit dem damals passenden `trigger_generiert.sql` gebaut (`pnpm fixture:db 4`) und trägt
      // darum bereits korrekt zu v4 passende Trigger.
      const ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-import-luecken-datenerhalt-'))
      const dbPfad = join(ordner, 'baum.sqlite')
      copyFileSync(FIXTURE_V4_PFAD, dbPfad)
      const db = oeffnen(dbPfad)
      try {
        expect(db.pragma('user_version', { simple: true })).toBe(4)

        const quelleId = uuidv7()
        const zitatId = uuidv7()
        const personId = uuidv7()
        const aussageIds = ALLE_SECHS_ALT_SUBJEKTTYPEN.map(() => uuidv7())
        const risikofaktorId = uuidv7()

        journalAus(db, 'Testvorbereitung (AP-1.3c): Fixture-Daten ohne armierte Transaktion einfügen.')
        db.prepare("INSERT INTO quelle (id, typ) VALUES (@id, 'kirchenbuch')").run({ id: quelleId })
        db.prepare('INSERT INTO zitat (id, quelle_id) VALUES (@id, @quelleId)').run({ id: zitatId, quelleId })
        db.prepare("INSERT INTO person (id, privat, ist_platzhalter) VALUES (@id, 0, 0)").run({ id: personId })
        ALLE_SECHS_ALT_SUBJEKTTYPEN.forEach((subjektTyp, index) => {
          const aussageId = aussageIds[index]
          if (aussageId === undefined) {
            throw new Error('aussageIds/ALLE_SECHS_ALT_SUBJEKTTYPEN außer Tritt.')
          }
          db.prepare(
            'INSERT INTO aussage (id, subjekt_typ, subjekt_id, praedikat, konfidenz) VALUES (@id, @subjektTyp, @subjektId, @praedikat, @konfidenz)',
          ).run({ id: aussageId, subjektTyp, subjektId: uuidv7(), praedikat: 'test', konfidenz: 3 })
        })
        const ersteAussageId = aussageIds[0]
        if (ersteAussageId === undefined) {
          throw new Error('aussageIds ist leer.')
        }
        db.prepare('INSERT INTO aussage_zitat (aussage_id, zitat_id) VALUES (@aussageId, @zitatId)').run({
          aussageId: ersteAussageId,
          zitatId,
        })
        db.prepare(
          'INSERT INTO risikofaktor (id, person_id, quelle_beruf_id) VALUES (@id, @personId, @quelleBerufId)',
        ).run({ id: risikofaktorId, personId, quelleBerufId: ersteAussageId })

        // CHECK-Grenze VOR der Migration: 'diagnose' ist auf Schema v4 kein gültiger subjekt_typ.
        expect(() =>
          db
            .prepare("INSERT INTO aussage (id, subjekt_typ, subjekt_id, praedikat) VALUES (@id, 'diagnose', @subjektId, 'x')")
            .run({ id: uuidv7(), subjektId: uuidv7() }),
        ).toThrow()
        journalAn(db)

        const zeilenzahlVorher = {
          aussage: zeilenzahl(db, 'aussage'),
          aussage_zitat: zeilenzahl(db, 'aussage_zitat'),
          risikofaktor: zeilenzahl(db, 'risikofaktor'),
        }
        const aussageZitatAbzugVorher = spaltenAbzug(db, 'aussage_zitat', AUSSAGE_ZITAT_SPALTEN, ['aussage_id', 'zitat_id'])
        const risikofaktorAbzugVorher = spaltenAbzug(db, 'risikofaktor', RISIKOFAKTOR_SPALTEN, ['id'])
        const aussageAltspaltenAbzugVorher = spaltenAbzug(db, 'aussage', AUSSAGE_ALTSPALTEN, ['id'])

        // Voller Aufstieg auf SCHEMA_VERSION — die 0005-Datenerhaltung (aussage_zitat/
        // risikofaktor bitgleich) überlebt den weiteren 0006-Aufstieg, der `name` umstrukturiert.
        migrieren(db)
        expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)

        // (1) Zeilenzahlen identisch.
        expect(zeilenzahl(db, 'aussage')).toBe(zeilenzahlVorher.aussage)
        expect(zeilenzahl(db, 'aussage_zitat')).toBe(zeilenzahlVorher.aussage_zitat)
        expect(zeilenzahl(db, 'risikofaktor')).toBe(zeilenzahlVorher.risikofaktor)

        // (2) Voll-Spalten-Abzug vor==nach über aussage_zitat UND risikofaktor (inkl. quelle_beruf_id,
        // geaendert_am) — der Beweis, dass Phase 1-3 keinen Cascade auslöst und keinen Wert verliert.
        expect(spaltenAbzug(db, 'aussage_zitat', AUSSAGE_ZITAT_SPALTEN, ['aussage_id', 'zitat_id'])).toBe(aussageZitatAbzugVorher)
        expect(spaltenAbzug(db, 'risikofaktor', RISIKOFAKTOR_SPALTEN, ['id'])).toBe(risikofaktorAbzugVorher)
        expect(spaltenAbzug(db, 'aussage', AUSSAGE_ALTSPALTEN, ['id'])).toBe(aussageAltspaltenAbzugVorher)

        // Neue Spalten sind für die migrierten Altzeilen NULL (nicht im INSERT...SELECT enthalten).
        interface NeueSpaltenZeile {
          readonly unsicherheit: string | null
          readonly gueltig_von: number | null
          readonly gueltig_bis: number | null
        }
        const neueSpaltenAlleZeilen = db.prepare<[], NeueSpaltenZeile>('SELECT unsicherheit, gueltig_von, gueltig_bis FROM aussage').all()
        expect(neueSpaltenAlleZeilen.length).toBe(zeilenzahlVorher.aussage)
        for (const zeile of neueSpaltenAlleZeilen) {
          expect(zeile).toEqual({ unsicherheit: null, gueltig_von: null, gueltig_bis: null })
        }

        // (3) Die vier Indizes aus 0002_kern.sql (:351-352, :555-556) sind wiederhergestellt.
        expect(indexNamenFuerTabelle(db, 'aussage_zitat')).toEqual(['idx_aussage_zitat_aussage_id', 'idx_aussage_zitat_zitat_id'])
        expect(indexNamenFuerTabelle(db, 'risikofaktor')).toEqual(['idx_risikofaktor_person_id', 'idx_risikofaktor_quelle_beruf_id'])

        // (5) PRAGMA foreign_key_check liefert 0 Zeilen — referenzielle Integrität über die gesamte Sequenz.
        expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])

        // (6) abl_aussage_* (nur auf aussage) und jrn_* (auf allen drei Tabellen) sind wieder da.
        expect(triggerNamenFuerTabelle(db, 'aussage').filter((name) => name.startsWith('abl_'))).toEqual([
          'abl_aussage_ad',
          'abl_aussage_ai',
          'abl_aussage_au',
        ])
        expect(triggerNamenFuerTabelle(db, 'aussage').filter((name) => name.startsWith('jrn_'))).toEqual([
          'jrn_aussage_ad',
          'jrn_aussage_ai',
          'jrn_aussage_au',
        ])
        expect(triggerNamenFuerTabelle(db, 'aussage_zitat').filter((name) => name.startsWith('jrn_'))).toEqual([
          'jrn_aussage_zitat_ad',
          'jrn_aussage_zitat_ai',
          'jrn_aussage_zitat_au',
        ])
        expect(triggerNamenFuerTabelle(db, 'risikofaktor').filter((name) => name.startsWith('jrn_'))).toEqual([
          'jrn_risikofaktor_ad',
          'jrn_risikofaktor_ai',
          'jrn_risikofaktor_au',
        ])

        // CHECK-Grenze NACH der Migration: 'diagnose' und 'risikofaktor' sind jetzt gültige Subjekttypen.
        journalAus(db, 'Testvorbereitung (AP-1.3c): weitere Fixture-Daten ohne armierte Transaktion einfügen.')
        expect(() =>
          db
            .prepare("INSERT INTO aussage (id, subjekt_typ, subjekt_id, praedikat) VALUES (@id, 'diagnose', @subjektId, 'x')")
            .run({ id: uuidv7(), subjektId: uuidv7() }),
        ).not.toThrow()
        expect(() =>
          db
            .prepare("INSERT INTO aussage (id, subjekt_typ, subjekt_id, praedikat) VALUES (@id, 'risikofaktor', @subjektId, 'x')")
            .run({ id: uuidv7(), subjektId: uuidv7() }),
        ).not.toThrow()

        // Nachweis: eine nach der Migration eingefügte Personen-Aussage aktualisiert person_flach über abl_aussage_ai.
        const neuePersonId = uuidv7()
        db.prepare('INSERT INTO person (id, privat, ist_platzhalter) VALUES (@id, 0, 0)').run({ id: neuePersonId })
        db.prepare(
          'INSERT INTO aussage (id, subjekt_typ, subjekt_id, praedikat, konfidenz) VALUES (@id, @subjektTyp, @subjektId, @praedikat, @konfidenz)',
        ).run({ id: uuidv7(), subjektTyp: 'person', subjektId: neuePersonId, praedikat: 'email', konfidenz: 2 })
        journalAn(db)

        interface PersonFlachKonfidenzZeile {
          readonly konfidenz_min: number | null
        }
        const personFlachZeile = db
          .prepare<{ readonly personId: string }, PersonFlachKonfidenzZeile>(
            'SELECT konfidenz_min FROM person_flach WHERE person_id = @personId',
          )
          .get({ personId: neuePersonId })
        expect(personFlachZeile).toEqual({ konfidenz_min: 2 })

        // (4) FK-Wirkung ist funktionsfähig, nicht nur strukturell vorhanden. Journal bewusst aus:
        // eine FK-kaskadierte DELETE/UPDATE auf aussage_zitat/risikofaktor feuert deren jrn_*-Trigger
        // genau wie ein direkter Schreibvorgang - ohne armierte Transaktion würde das NOT-NULL-
        // Constraint auf aenderung.transaktion_id sonst die hier geprüfte FK-Wirkung überdecken.
        journalAus(db, 'Testvorbereitung (AP-1.3c): FK-Wirkung ohne armierte Transaktion prüfen.')

        // 4a. INSERT mit unbekannter aussage_id scheitert (FK-Durchsetzung aktiv).
        expect(() =>
          db.prepare('INSERT INTO aussage_zitat (aussage_id, zitat_id) VALUES (@aussageId, @zitatId)').run({
            aussageId: 'unbekannte-aussage-id',
            zitatId,
          }),
        ).toThrow()

        // 4b. DELETE der referenzierten aussage kaskadiert aussage_zitat UND nullt risikofaktor.quelle_beruf_id.
        db.prepare('DELETE FROM aussage WHERE id = @id').run({ id: ersteAussageId })
        expect(
          db
            .prepare('SELECT COUNT(*) AS anzahl FROM aussage_zitat WHERE aussage_id = @aussageId')
            .get({ aussageId: ersteAussageId }),
        ).toEqual({ anzahl: 0 })
        interface QuelleBerufIdZeile {
          readonly quelle_beruf_id: string | null
        }
        const risikofaktorNachDelete = db
          .prepare<{ readonly id: string }, QuelleBerufIdZeile>('SELECT quelle_beruf_id FROM risikofaktor WHERE id = @id')
          .get({ id: risikofaktorId })
        expect(risikofaktorNachDelete).toEqual({ quelle_beruf_id: null })
        journalAn(db)
      } finally {
        db.close()
        rmSync(ordner, { recursive: true, force: true })
      }
    })
  })
})
