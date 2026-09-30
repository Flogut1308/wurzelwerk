// AP-1.30, Folgepunkt U-130-undo-bitgleich-laufzeit (docs/80 §33) — geschützter Prüfpfad (CLAUDE.md
// §5/§13, ADR-025). Bitgleichheits-Test gegen den alten Stand nach ADR-009-Nachtrag 25.09.2026 (reine
// Leistungsänderung): `kanonischerAbzug()` (`_kanonischer-abzug.ts`) soll schneller werden, sein
// Ergebnis darf sich dabei um KEIN Zeichen ändern — sonst vergliche `undo-bitgleich.test.ts` nach der
// Umstellung etwas anderes als vorher.
//
// Darum steht hier die Umsetzung von `_kanonischer-abzug.ts` auf main 7a19203 WORTGLEICH als Referenz
// (einziger Unterschied: kein `export` vor `kanonischerAbzug`). Dieser Test ist schon VOR der
// Umstellung grün (Neu == Alt, trivial, dieselbe Umsetzung) und hält das Verhalten fest; nach der
// Umstellung muss er es bleiben.
//
// Verglichen wird zeichengleich (`toBe`) auf:
// - R1: leerer, frisch migrierter Datenbank;
// - R2: Befehlsfolgen aus dem echten Generator (`_befehlsfolge-generator.ts`, eigener fester Seed —
//       NICHT der von `undo-bitgleich.test.ts`), nach jeder Aktion, nach jedem Serienaufruf und nach
//       jedem Undo bis zum leeren Journal;
// - R3: Schemaänderungen AUF DERSELBEN VERBINDUNG nach einem ersten Abzug (`CREATE TABLE`,
//       `ALTER TABLE … ADD COLUMN` an einer neuen und an einer bestehenden Tabelle, `DROP TABLE`) —
//       fängt einen Plan-/Anweisungs-Cache, der eine Schemaänderung übersieht (fail-closed);
// - R4: Schließen und Neuöffnen derselben Datei (neue Verbindung, gleicher Inhalt, danach Schemaänderung);
// - R5: Textwerte mit Apostroph, Emoji, Anführungszeichen, Backslash, Zeilen-/Absatztrennern, NULL,
//       Zahlen, BLOB, zusammengesetztem Primärschlüssel und einer Tabelle ohne Primärschlüssel.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'

// Dieselben Mocks wie `undo-bitgleich.test.ts` (Befehlsbus ohne Electron/Protokoll/Ereignisse).
vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import type Database from 'better-sqlite3'
import type { ZeileWerte } from '../../src/main/repositories/basis'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { undo } from '../../src/main/journal/undo'
import { undoZiel } from '../../src/main/repositories/journal-repo'
import { kanonischerAbzug as abzugNeu } from './_kanonischer-abzug'
import { aktionAusfuehren, befehlsfolgeArbitrary, neuerZustand } from './_befehlsfolge-generator'

// ---------------------------------------------------------------------------------------------------
// REFERENZ — wortgleich `_kanonischer-abzug.ts` auf main 7a19203 ab `AUSGENOMMEN_JOURNAL`. Nicht ändern.
// ---------------------------------------------------------------------------------------------------

/** Journal-Tabellen (ADR-018): dort soll sich durch Undo/Redo etwas ändern. */
const AUSGENOMMEN_JOURNAL = ['transaktion', 'aenderung', 'journal_kontext'] as const

/** Abgeleitete Tabellen (55_Architektur.md §5.3) - geprüft gegen Neuaufbau in abgeleitet-gleich.test.ts. */
const AUSGENOMMEN_ABGELEITET = [
  'person_flach',
  'name_phonetik',
  'suche_fts_quelle',
  'suche_fts',
  'suche_fts_data',
  'suche_fts_idx',
  'suche_fts_docsize',
  'suche_fts_config',
] as const

/** Fachliche Ausnahme (AP-1.34, E14): Kennung wird nie neu vergeben, Zähler bleibt nach Undo stehen. */
const AUSGENOMMEN_FACHLICH = ['kennung_zaehler'] as const

const AUSGENOMMEN: ReadonlySet<string> = new Set<string>([
  ...AUSGENOMMEN_JOURNAL,
  ...AUSGENOMMEN_ABGELEITET,
  ...AUSGENOMMEN_FACHLICH,
])

interface TabelleNameZeile {
  readonly name: string
}

/** Alle Basistabellen für den kanonischen Abzug — `sqlite_master`, gefiltert um `AUSGENOMMEN` + SQLite-Eigenverwaltung (`sqlite_%`). */
function basisTabellenNamen(db: Database.Database): readonly string[] {
  return db
    .prepare<[], TabelleNameZeile>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((zeile) => zeile.name)
    .filter((name) => !name.startsWith('sqlite_') && !AUSGENOMMEN.has(name))
}

interface SpalteInfoZeile {
  readonly name: string
  readonly pk: number
}

interface SpaltenPlan {
  readonly spalten: readonly string[]
  readonly sortierSpalten: readonly string[]
}

/**
 * Spaltenliste + Sortierschlüssel einer Tabelle. `pk`-Reihenfolge aus `PRAGMA table_info`
 * (aufsteigend — bei einer zusammengesetzten Primärschlüsseldefinition wie
 * `PRIMARY KEY (aussage_id, zitat_id)` steht `pk=1` auf `aussage_id`, `pk=2` auf `zitat_id`, s.
 * `docs/schema/0002_kern.sql`). Fallback auf ALLE Spalten, falls eine Tabelle (entgegen F-05)
 * keine Primärschlüsselspalte hätte — rein defensiv, jede heutige Basistabelle hat eine.
 */
function spaltenPlan(db: Database.Database, tabelle: string): SpaltenPlan {
  const info = db.prepare<[], SpalteInfoZeile>(`PRAGMA table_info(${tabelle})`).all()
  const spalten = info.map((zeile) => zeile.name)
  const pkSpalten = info
    .filter((zeile) => zeile.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((zeile) => zeile.name)
  return { spalten, sortierSpalten: pkSpalten.length > 0 ? pkSpalten : spalten }
}

/** Deterministischer, sortierter Textabzug einer einzelnen Basistabelle. */
function tabellenAbzug(db: Database.Database, tabelle: string): string {
  const { spalten, sortierSpalten } = spaltenPlan(db, tabelle)
  if (spalten.length === 0) {
    // Unerreichbar für die heutigen Basistabellen (jede hat mindestens eine Spalte) — rein defensiv.
    return `## ${tabelle}\n`
  }
  const sql = `SELECT ${spalten.join(', ')} FROM ${tabelle} ORDER BY ${sortierSpalten.join(', ')}`
  const zeilen = db.prepare<[], ZeileWerte>(sql).all()
  const zeilenText = zeilen.map((zeile) => JSON.stringify(zeile, Object.keys(zeile).sort())).join('\n')
  return `## ${tabelle} (${zeilen.length})\n${zeilenText}`
}

/**
 * Kanonischer, deterministischer Textabzug ALLER Basistabellen (`AUSGENOMMEN` s. o.) —
 * 55_Architektur.md §4.9 Punkt 5. Zwei Aufrufe gegen denselben Datenbankinhalt liefern immer
 * dieselbe Zeichenkette, unabhängig von physischer Speicherreihenfolge (rowid,
 * Einfüge-/Undo-Reihenfolge) — genau das macht ihn tauglich für einen Vorher/Nachher-Vergleich
 * über eine beliebige Befehlsfolge + vollständiges Undo hinweg
 * (`test/invarianten/undo-bitgleich.test.ts`). Rein und deterministisch: kein `Date.now()`, kein
 * `Math.random()` — nur eine reine Funktion der aktuellen Tabelleninhalte.
 */
function kanonischerAbzug(db: Database.Database): string {
  return basisTabellenNamen(db)
    .map((tabelle) => tabellenAbzug(db, tabelle))
    .join('\n\n')
}

// ---------------------------------------------------------------------------------------------------
// Ende der Referenz.
// ---------------------------------------------------------------------------------------------------

function neueTestDatenbank(): Database.Database {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

/** Zählt die Vergleiche, damit ein Test, der nichts vergleicht, nicht still grün wird. */
let vergleiche = 0

function gleich(db: Database.Database, kontext: string): string {
  const referenz = kanonischerAbzug(db)
  expect(abzugNeu(db), kontext).toBe(referenz)
  vergleiche += 1
  return referenz
}

describe('kanonischerAbzug: neue Umsetzung ist zeichengleich der Referenz (ADR-009-Nachtrag 25.09.2026)', () => {
  beforeAll(() => {
    // Wie `undo-bitgleich.test.ts`: nur `Date` gefälscht, der Generator stellt die Uhr je Aufruf.
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterAll(() => {
    vi.useRealTimers()
  })

  it('R1: leere, frisch migrierte Datenbank', () => {
    const db = neueTestDatenbank()
    try {
      const abzug = gleich(db, 'leer')
      // Gegenprobe: der Abzug ist nicht leer (schema_migration steht darin).
      expect(abzug).toContain('## schema_migration (')
    } finally {
      db.close()
    }
  })

  it('R2: nach jeder Aktion, jedem Serienaufruf und jedem Undo einer Generator-Folge', () => {
    // Eigener fester Seed (CLAUDE.md §13 Determinismus), bewusst verschieden von undo-bitgleich.
    const folgen = fc.sample(befehlsfolgeArbitrary(), { seed: 20260930, numRuns: 12 })
    expect(folgen).toHaveLength(12)
    const vorher = vergleiche
    let undoSchritte = 0
    for (const [nr, folge] of folgen.entries()) {
      const db = neueTestDatenbank()
      try {
        const leer = gleich(db, `Folge ${nr}: leer`)
        const zustand = neuerZustand()
        for (const [i, aktion] of folge.entries()) {
          aktionAusfuehren(db, zustand, aktion, () => {
            gleich(db, `Folge ${nr}, Aktion ${i}: Serienaufruf`)
          })
          gleich(db, `Folge ${nr}, Aktion ${i}`)
        }
        // Gegenprobe: die Folge hat den Bestand tatsächlich verändert.
        expect(kanonischerAbzug(db)).not.toBe(leer)
        while (undoZiel(db) !== undefined) {
          undo(db)
          undoSchritte += 1
          gleich(db, `Folge ${nr}: nach Undo ${undoSchritte}`)
        }
      } finally {
        db.close()
      }
    }
    expect(undoSchritte).toBeGreaterThan(0)
    expect(vergleiche - vorher).toBeGreaterThan(folgen.length * 30)
  }, 120_000)

  it('R3: Schemaänderungen auf derselben Verbindung nach einem ersten Abzug werden gesehen', () => {
    const db = neueTestDatenbank()
    try {
      const erster = gleich(db, 'vor der Schemaänderung')

      db.prepare('CREATE TABLE probe_neu (id TEXT PRIMARY KEY, wert TEXT) STRICT').run()
      db.prepare("INSERT INTO probe_neu (id, wert) VALUES ('p-2', 'zwei'), ('p-1', 'eins')").run()
      const nachCreate = gleich(db, 'nach CREATE TABLE')
      expect(nachCreate).toContain('## probe_neu (2)')
      expect(nachCreate).not.toBe(erster)

      db.prepare('ALTER TABLE probe_neu ADD COLUMN zusatz TEXT').run()
      db.prepare("UPDATE probe_neu SET zusatz = 'z' WHERE id = 'p-1'").run()
      const nachAlterNeu = gleich(db, 'nach ALTER TABLE ADD COLUMN (neue Tabelle)')
      expect(nachAlterNeu).toContain('"zusatz":"z"')

      // Bestehende Basistabelle, deren Plan beim ersten Abzug schon gebaut wurde.
      db.prepare('ALTER TABLE schema_migration ADD COLUMN probe_spalte TEXT').run()
      db.prepare("UPDATE schema_migration SET probe_spalte = 'gesehen' WHERE version = 1").run()
      const nachAlterBestand = gleich(db, 'nach ALTER TABLE ADD COLUMN (bestehende Tabelle)')
      expect(nachAlterBestand).toContain('"probe_spalte":"gesehen"')

      db.prepare('DROP TABLE probe_neu').run()
      const nachDrop = gleich(db, 'nach DROP TABLE')
      expect(nachDrop).not.toContain('## probe_neu')
    } finally {
      db.close()
    }
  })

  it('R4: Schließen und Neuöffnen derselben Datei, danach Schemaänderung auf der neuen Verbindung', () => {
    const verzeichnis = mkdtempSync(path.join(tmpdir(), 'wurzelwerk-abzug-referenz-'))
    const datei = path.join(verzeichnis, 'probe ä.wurzelwerk')
    try {
      const erste = oeffnen(datei)
      let abzugErste: string
      try {
        migrieren(erste)
        erste.prepare('CREATE TABLE probe_datei (id TEXT PRIMARY KEY, wert TEXT) STRICT').run()
        erste.prepare("INSERT INTO probe_datei (id, wert) VALUES ('d-1', 'O''Brien')").run()
        abzugErste = gleich(erste, 'erste Verbindung')
      } finally {
        erste.close()
      }

      const zweite = oeffnen(datei)
      try {
        const abzugZweite = gleich(zweite, 'zweite Verbindung, unverändert')
        expect(abzugZweite).toBe(abzugErste)
        zweite.prepare('ALTER TABLE probe_datei ADD COLUMN spaeter INTEGER').run()
        zweite.prepare("UPDATE probe_datei SET spaeter = 7 WHERE id = 'd-1'").run()
        expect(gleich(zweite, 'zweite Verbindung, nach ALTER TABLE')).toContain('"spaeter":7')
      } finally {
        zweite.close()
      }
    } finally {
      rmSync(verzeichnis, { recursive: true, force: true })
    }
  })

  it('R5: Apostroph, Emoji, Sonderzeichen, NULL, Zahlen, BLOB, zusammengesetzter und fehlender Primärschlüssel', () => {
    const db = neueTestDatenbank()
    try {
      gleich(db, 'vor den Probezeilen')
      db.prepare('CREATE TABLE probe_text (id TEXT PRIMARY KEY, text TEXT, zahl REAL, ganz INTEGER, roh BLOB)').run()
      const einfuegen = db.prepare<{ readonly id: string; readonly text: string | null; readonly zahl: number | null; readonly ganz: number | null; readonly roh: Buffer | null }>(
        'INSERT INTO probe_text (id, text, zahl, ganz, roh) VALUES (@id, @text, @zahl, @ganz, @roh)',
      )
      einfuegen.run({ id: "t-o'brien", text: "O'Brien", zahl: 1.5, ganz: 3, roh: null })
      einfuegen.run({ id: 't-daboville', text: "d'Aboville", zahl: -0.25, ganz: 0, roh: Buffer.from([0, 1, 255]) })
      einfuegen.run({ id: 't-emoji', text: 'Familie 👨‍👩‍👧 und 𝔘𝔯𝔨𝔲𝔫𝔡𝔢', zahl: null, ganz: null, roh: null })
      einfuegen.run({ id: 't-sonder', text: 'Zitat "so" \\ Pfad\nZeile Trenner Absatz\tTab', zahl: 1e21, ganz: 9007199254740991, roh: null })
      einfuegen.run({ id: 't-null', text: null, zahl: null, ganz: null, roh: null })

      db.prepare('CREATE TABLE probe_paar (b TEXT, a TEXT, wert TEXT, PRIMARY KEY (a, b))').run()
      db.prepare("INSERT INTO probe_paar (b, a, wert) VALUES ('2', 'x', 'x2'), ('1', 'y', NULL), ('1', 'x', 'x1')").run()

      db.prepare('CREATE TABLE probe_ohne_pk (z TEXT, a INTEGER)').run()
      db.prepare("INSERT INTO probe_ohne_pk (z, a) VALUES ('b', 2), ('a', NULL), ('a', 1)").run()

      db.prepare("INSERT INTO id_alias (alte_id, neue_id, typ) VALUES ('alt-o''brien', 'neu-😀', 'person')").run()

      const abzug = gleich(db, 'mit Probezeilen')
      expect(abzug).toContain('## probe_text (5)')
      expect(abzug).toContain('## probe_paar (3)')
      expect(abzug).toContain('## probe_ohne_pk (3)')
      expect(abzug).toContain("O'Brien")
      expect(abzug).toContain('👨‍👩‍👧')
      expect(abzug).toContain('"text":null')
    } finally {
      db.close()
    }
  })
})
