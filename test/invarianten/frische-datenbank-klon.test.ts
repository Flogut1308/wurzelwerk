// AP-1.30, Folgepunkt U-130-undo-bitgleich-laufzeit (docs/80 §33) — geschützter Prüfpfad (CLAUDE.md
// §5/§13, ADR-025). Beleg, dass `frischeMigrierteDatenbank()` (`_frische-datenbank.ts`, Klon einer
// einmal migrierten Vorlage) sich in jeder für die Invarianten relevanten Hinsicht UNUNTERSCHEIDBAR
// vom Direktweg `oeffnen(':memory:')` + `migrieren(db)` verhält — Voraussetzung dafür, dass
// `undo-bitgleich.test.ts` nach der Umstellung dieselbe Prüfkraft hat:
//   K1 identisches Schema (`sqlite_master`, zeichenweise: Tabellen, Indizes, Journal- und abl_*-Trigger);
//   K2 identische Pragmas (u. a. `foreign_keys` = 1) und identischer `journal_kontext` (aktiv = 1);
//   K3 wertgleiche SQL-Funktionen (`uuid7`, `suchnormalform`, `koelner_phonetik`);
//   K4 Fremdschlüssel greifen (armierte Schreibung mit ungültigem Ziel wirft), das Journal ist scharf
//      (unarmierte Schreibung wirft);
//   K5 Journal-Trigger feuern: nach einem Befehl gibt es ein `undoZiel` und `aenderung`-Zeilen;
//   K6 dieselbe feste Befehlsfolge ergibt auf Klon und Direktweg nach JEDER Aktion und JEDEM Undo
//      denselben Inhalt ALLER Tabellen (einschließlich Journal, Zähler und abgeleiteter Tabellen) —
//      möglich, weil hier `uuid` durch einen deterministischen Zähler und `Date` durch eine feste Uhr
//      ersetzt sind; beide Wege verbrauchen also dieselben IDs und Zeitpunkte.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'

const idQuelle = vi.hoisted(() => ({ naechste: 0 }))

// Deterministische UUID-v7-Form (Version 7, Variante 8), streng aufsteigend — ersetzt `uuid.v7` für
// den Befehlsbus (`src/main/id.ts`) UND die SQL-Funktion `uuid7()` (`verbindung.ts`).
vi.mock('uuid', async (original) => ({
  ...(await original<typeof import('uuid')>()),
  v7: (): string => {
    idQuelle.naechste += 1
    return `00000000-0000-7000-8000-${idQuelle.naechste.toString(16).padStart(12, '0')}`
  },
}))
vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import type Database from 'better-sqlite3'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { SCHEMA_VERSION } from '../../src/main/datenbank/migration/registrierung'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { armieren, entwaffnen } from '../../src/main/journal/kontext'
import { undo } from '../../src/main/journal/undo'
import { transaktionAnlegen, undoZiel } from '../../src/main/repositories/journal-repo'
import { frischeMigrierteDatenbank } from './_frische-datenbank'
import { kanonischerAbzug } from './_kanonischer-abzug'
import { aktionAusfuehren, befehlsfolgeArbitrary, neuerZustand } from './_befehlsfolge-generator'

/** Feste Uhr für den Bau von Vorlage und Direktweg (`schema_migration.angewendet_am`). */
const BAUZEIT_MS = Date.UTC(2026, 8, 30, 12, 0, 0)

/** Direktweg: genau das, was `undo-bitgleich.test.ts` vor der Umstellung je Lauf tat. */
function direktDatenbank(): Database.Database {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

/** Stand des ID-Zählers direkt nach dem Bau (Vorlage bzw. Direktweg), s. `beforeAll`. */
let idsNachBau = 0

function bauenMitFesterUhr<T>(bauen: () => T): T {
  vi.setSystemTime(BAUZEIT_MS)
  idQuelle.naechste = 0
  return bauen()
}

interface SchemaZeile {
  readonly type: string
  readonly name: string
  readonly tbl_name: string
  readonly sql: string | null
}

function schemaAbzug(db: Database.Database): readonly SchemaZeile[] {
  return db.prepare<[], SchemaZeile>('SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name').all()
}

const PRAGMAS = ['foreign_keys', 'busy_timeout', 'temp_store', 'synchronous', 'journal_mode', 'user_version', 'encoding', 'recursive_triggers', 'defer_foreign_keys'] as const

function pragmaAbzug(db: Database.Database): Readonly<Record<string, unknown>> {
  return Object.fromEntries(PRAGMAS.map((name) => [name, db.pragma(name, { simple: true })]))
}

function journalKontext(db: Database.Database): unknown {
  return db.prepare('SELECT id, aktiv, transaktion_id FROM journal_kontext ORDER BY id').all()
}

/**
 * Inhalt ALLER gewöhnlichen Tabellen (auch Journal, `kennung_zaehler`, abgeleitete Tabellen und die
 * FTS5-Schattentabellen), je Tabelle nach rowid bzw. allen Spalten sortiert. Ausgenommen nur die
 * virtuelle Tabelle `suche_fts` selbst (contentless — ein `SELECT` liefert nur NULL; ihr Inhalt steht
 * in den Schattentabellen, die hier mitverglichen werden).
 */
function vollAbzug(db: Database.Database): string {
  const tabellen = db
    .prepare<[], { readonly name: string; readonly sql: string | null }>("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .filter((t) => !(t.sql ?? '').startsWith('CREATE VIRTUAL TABLE'))
  return tabellen
    .map(({ name }) => {
      const spalten = db
        .prepare<[], { readonly name: string }>(`PRAGMA table_info(${name})`)
        .all()
        .map((s) => s.name)
      const zeilen = db.prepare(`SELECT ${spalten.join(', ')} FROM ${name} ORDER BY ${spalten.join(', ')}`).all()
      return `## ${name}\n${JSON.stringify(zeilen)}`
    })
    .join('\n')
}

describe('Beleg: frischeMigrierteDatenbank() (Klon) verhält sich wie oeffnen + migrieren (U-130-undo-bitgleich-laufzeit)', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // Vorlage des Klons mit fester Uhr und frischem ID-Zähler bauen — genau wie der Direktweg unten.
    bauenMitFesterUhr(() => {
      frischeMigrierteDatenbank().close()
    })
    idsNachBau = idQuelle.naechste
  })
  afterAll(() => {
    vi.useRealTimers()
  })

  it('K1: Schema (sqlite_master) ist zeichenweise identisch', () => {
    const direkt = direktDatenbank()
    const klon = frischeMigrierteDatenbank()
    try {
      expect(schemaAbzug(klon)).toEqual(schemaAbzug(direkt))
      // Gegenprobe: das Schema ist nicht leer und enthält Journal-Trigger.
      expect(schemaAbzug(klon).filter((z) => z.type === 'trigger' && z.name.startsWith('jrn_')).length).toBeGreaterThan(0)
    } finally {
      direkt.close()
      klon.close()
    }
  })

  it('K2: Pragmas und journal_kontext sind identisch (foreign_keys = 1, Journal scharf)', () => {
    const direkt = direktDatenbank()
    const klon = frischeMigrierteDatenbank()
    try {
      expect(pragmaAbzug(klon)).toEqual(pragmaAbzug(direkt))
      expect(klon.pragma('foreign_keys', { simple: true })).toBe(1)
      expect(klon.pragma('busy_timeout', { simple: true })).toBe(5000)
      expect(klon.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
      expect(klon.pragma('integrity_check', { simple: true })).toBe('ok')
      expect(klon.pragma('foreign_key_check')).toEqual([])
      expect(journalKontext(klon)).toEqual(journalKontext(direkt))
      expect(journalKontext(klon)).toEqual([{ id: 1, aktiv: 1, transaktion_id: null }])
    } finally {
      direkt.close()
      klon.close()
    }
  })

  it('K3: SQL-Funktionen liefern auf Direktweg und Klon dieselben Werte', () => {
    const direkt = direktDatenbank()
    const klon = frischeMigrierteDatenbank()
    try {
      const abfrage = 'SELECT suchnormalform(@arg) AS s, koelner_phonetik(@arg) AS k, length(uuid7()) AS u'
      for (const arg of ["Müller-Schröder", "O'Brien", 'Meyer', '']) {
        expect(klon.prepare(abfrage).get({ arg })).toEqual(direkt.prepare(abfrage).get({ arg }))
      }
      expect(klon.prepare<[], { readonly u: number }>('SELECT length(uuid7()) AS u').get()?.u).toBe(36)
    } finally {
      direkt.close()
      klon.close()
    }
  })

  it('K4: Fremdschlüssel greifen und das Journal ist scharf', () => {
    const klon = frischeMigrierteDatenbank()
    try {
      // Unarmiert: der Journal-Trigger lehnt ab (scharfer Ruhezustand).
      expect(() => klon.prepare("INSERT INTO ort (id) VALUES ('ort-unarmiert')").run()).toThrow()
      // Armiert, aber mit ungültigem Fremdschlüssel: die FK-Prüfung lehnt ab.
      expect(() =>
        klon
          .transaction(() => {
            transaktionAnlegen(klon, { id: 'tx-fk-probe', zeitpunkt: BAUZEIT_MS, art: 'nutzer', lfd: 1 })
            armieren(klon, 'tx-fk-probe')
            klon.prepare("INSERT INTO ortsname (id, ort_id) VALUES ('on-probe', 'kein-ort')").run()
            entwaffnen(klon)
          })
          .immediate(),
      ).toThrow(/FOREIGN KEY/)
      // Gegenprobe: dieselbe armierte Schreibung mit gültigem Ziel geht durch.
      klon
        .transaction(() => {
          transaktionAnlegen(klon, { id: 'tx-fk-gut', zeitpunkt: BAUZEIT_MS, art: 'nutzer', lfd: 1 })
          armieren(klon, 'tx-fk-gut')
          klon.prepare("INSERT INTO ort (id) VALUES ('ort-gut')").run()
          klon.prepare("INSERT INTO ortsname (id, ort_id) VALUES ('on-gut', 'ort-gut')").run()
          entwaffnen(klon)
        })
        .immediate()
      expect(klon.prepare("SELECT COUNT(*) AS n FROM ortsname WHERE id = 'on-gut'").get()).toEqual({ n: 1 })
    } finally {
      klon.close()
    }
  })

  const [folge] = fc.sample(befehlsfolgeArbitrary(), { seed: 20260930, numRuns: 1 })

  it('K5: Journal-Trigger feuern auf dem Klon (nach einem Befehl gibt es ein undoZiel)', () => {
    if (folge === undefined) {
      throw new Error('fc.sample lieferte keine Folge (Testvoraussetzung verletzt)')
    }
    const klon = frischeMigrierteDatenbank()
    try {
      expect(undoZiel(klon)).toBeUndefined()
      const zustand = neuerZustand()
      for (const aktion of folge) {
        aktionAusfuehren(klon, zustand, aktion)
      }
      expect(undoZiel(klon)).toBeDefined()
      expect(klon.prepare<[], { readonly n: number }>('SELECT COUNT(*) AS n FROM aenderung').get()?.n ?? 0).toBeGreaterThan(0)
    } finally {
      klon.close()
    }
  })

  it('K6: dieselbe feste Folge ergibt auf Klon und Direktweg nach jeder Aktion und jedem Undo denselben Inhalt aller Tabellen', () => {
    if (folge === undefined) {
      throw new Error('fc.sample lieferte keine Folge (Testvoraussetzung verletzt)')
    }
    /** Führt die Folge aus und nimmt sie vollständig zurück; liefert je Schritt Voll- und kanonischen Abzug. */
    const ablauf = (db: Database.Database): readonly string[] => {
      const abzuege: string[] = [vollAbzug(db), kanonischerAbzug(db)]
      const zustand = neuerZustand()
      for (const aktion of folge) {
        aktionAusfuehren(db, zustand, aktion, () => abzuege.push(vollAbzug(db)))
        abzuege.push(vollAbzug(db), kanonischerAbzug(db))
      }
      let schritte = 0
      while (undoZiel(db) !== undefined) {
        undo(db)
        schritte += 1
        abzuege.push(vollAbzug(db), kanonischerAbzug(db))
      }
      expect(schritte).toBeGreaterThan(0)
      return abzuege
    }

    const direkt = bauenMitFesterUhr(direktDatenbank)
    let direktAbzuege: readonly string[]
    try {
      expect(idQuelle.naechste).toBe(idsNachBau)
      direktAbzuege = ablauf(direkt)
    } finally {
      direkt.close()
    }

    const klon = frischeMigrierteDatenbank()
    let klonAbzuege: readonly string[]
    try {
      idQuelle.naechste = idsNachBau
      klonAbzuege = ablauf(klon)
    } finally {
      klon.close()
    }

    expect(klonAbzuege.length).toBe(direktAbzuege.length)
    for (const [i, abzug] of klonAbzuege.entries()) {
      expect(abzug, `Abzug ${i}`).toBe(direktAbzuege[i])
    }
    // Gegenprobe: die Folge hat tatsächlich etwas verändert.
    expect(new Set(direktAbzuege).size).toBeGreaterThan(2)
  })
})
