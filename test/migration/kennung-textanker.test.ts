// test/migration/kennung-textanker.test.ts (AP-1.34 PR-A, docs/schema/0007_kennung_textanker.sql,
// additiv — kein geschützter Prüfpfad berührt; nur die neue Migration 0007 selbst geprüft, analog
// namensformen.test.ts für 0006). Deckt aus dem freigegebenen Plan AP-1.34 (Vorgaben §2.2/§5.5,
// keine A-ID; B-01 für den Textanker) ab:
//   - Aufstieg 6 -> 7 (SCHEMA_VERSION),
//   - Nachtrag `person.kennung` lückenlos 1..n in `ORDER BY id` (E2), keine NULL, UNIQUE,
//   - `kennung_zaehler` steht nach dem Nachtrag auf n+1 und läuft nur vorwärts (kein Rückwärts-
//     UPDATE, kein DELETE, kein fremder `bereich`),
//   - `aussage_zitat` bekommt `feld`/`textanker_von`/`textanker_bis`, Bestandszeilen dort NULL,
//     CHECK „beide oder keine" und „bis > von" (mit Gegenproben),
//   - Bestandszeilen sonst unverändert, `foreign_key_check` leer, Journal-Trigger kennen die
//     neuen Spalten.
//
// Der Vor-Zustand kommt aus der eingefrorenen fixtures/datenbanken/schema-v6.sqlite (`pnpm
// fixture:db 6`, VOR dem Eintrag von 0007 erzeugen) — dieselbe Vorsichtsmaßnahme wie in
// namensformen.test.ts: eine frisch migrierte In-Memory-DB bekäme bereits die v7-Trigger.
// Solange Fixture und Migration fehlen, scheitert jeder Fall bereits im beforeEach (ENOENT) bzw.
// an „no such column: kennung" — das ist der beabsichtigte Rot-Zustand (CLAUDE.md §5).
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { SCHEMA_VERSION } from '../../src/main/datenbank/migration/registrierung'
import { journalAn, journalAus } from '../../src/main/journal/kontext'

const FIXTURE_V6_PFAD = join(process.cwd(), 'fixtures', 'datenbanken', 'schema-v6.sqlite')

/**
 * Feste Personen-IDs (deterministisch, keine uuidv7-Zeitabhängigkeit). Sie werden bewusst in einer
 * Reihenfolge eingefügt, die von der `id`-Sortierung abweicht (`EINFUEGE_REIHENFOLGE`) — ein
 * Nachtrag nach rowid/Einfügereihenfolge statt `ORDER BY id` (E2) fiele damit auf.
 */
const PERSON_IDS = [
  '018f0000-0000-7000-8000-00000000000a',
  '018f0000-0000-7000-8000-00000000000b',
  '018f0000-0000-7000-8000-00000000000c',
  '018f0000-0000-7000-8000-00000000000d',
  '018f0000-0000-7000-8000-00000000000e',
] as const
const EINFUEGE_REIHENFOLGE = [3, 0, 4, 1, 2] as const

const QUELLE_ID = '018f0000-0000-7000-8000-0000000000f1'
const ZITAT_ID = '018f0000-0000-7000-8000-0000000000f2'
const AUSSAGE_ID = '018f0000-0000-7000-8000-0000000000f3'

/** Binäre Zeichenkettenordnung wie SQLite `ORDER BY` (BINARY-Kollation), nicht locale-abhängig. */
function binaerVergleich(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

interface PersonBestandZeile {
  readonly id: string
  readonly geschlecht: string | null
  readonly lebend_status: string | null
  readonly privat: number
  readonly notiz: string | null
  readonly gesperrt_bis: number | null
  readonly ist_platzhalter: number
  readonly platzhalter_grund: string | null
  readonly erstellt_am: number | null
  readonly geaendert_am: number | null
  readonly unsicherheit: string | null
}

/** Nur die v6-Spalten — damit derselbe Abzug vor UND nach der Migration läuft. */
function personBestand(db: Database.Database): readonly PersonBestandZeile[] {
  return db
    .prepare<[], PersonBestandZeile>(
      'SELECT id, geschlecht, lebend_status, privat, notiz, gesperrt_bis, ist_platzhalter, platzhalter_grund, erstellt_am, geaendert_am, unsicherheit FROM person ORDER BY id',
    )
    .all()
}

interface AussageZitatBestandZeile {
  readonly aussage_id: string
  readonly zitat_id: string
  readonly erstellt_am: number | null
  readonly geaendert_am: number | null
}

function aussageZitatBestand(db: Database.Database): readonly AussageZitatBestandZeile[] {
  return db
    .prepare<[], AussageZitatBestandZeile>(
      'SELECT aussage_id, zitat_id, erstellt_am, geaendert_am FROM aussage_zitat ORDER BY aussage_id, zitat_id',
    )
    .all()
}

interface KennungZeile {
  readonly id: string
  readonly kennung: number | null
}

function kennungenNachId(db: Database.Database): readonly KennungZeile[] {
  return db.prepare<[], KennungZeile>('SELECT id, kennung FROM person ORDER BY id').all()
}

interface ZaehlerZeile {
  readonly naechste: number
}

function zaehlerstand(db: Database.Database): number {
  const zeile = db
    .prepare<[], ZaehlerZeile>("SELECT naechste FROM kennung_zaehler WHERE bereich = 'person'")
    .get()
  if (zeile === undefined) {
    throw new Error("kennung_zaehler hat keine Zeile für bereich = 'person'.")
  }
  return zeile.naechste
}

interface AnkerZeile {
  readonly feld: string | null
  readonly textanker_von: number | null
  readonly textanker_bis: number | null
}

function triggerSql(db: Database.Database, name: string): string {
  const zeile = db
    .prepare<{ readonly name: string }, { readonly sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = @name",
    )
    .get({ name })
  if (zeile === undefined) {
    throw new Error(`Trigger "${name}" fehlt.`)
  }
  return zeile.sql
}

interface SpaltenInfoZeile {
  readonly name: string
  readonly notnull: number
}

function spalteInfo(db: Database.Database, tabelle: string, spalte: string): SpaltenInfoZeile | undefined {
  return db
    .prepare<[], SpaltenInfoZeile>(`PRAGMA table_info(${tabelle})`)
    .all()
    .find((zeile) => zeile.name === spalte)
}

describe('test/migration/kennung-textanker (AP-1.34, docs/schema/0007_kennung_textanker.sql)', () => {
  let ordner: string
  let dbPfad: string

  beforeEach(() => {
    ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-kennung-textanker-'))
    dbPfad = join(ordner, 'baum.sqlite')
    copyFileSync(FIXTURE_V6_PFAD, dbPfad)
  })

  afterEach(() => {
    rmSync(ordner, { recursive: true, force: true })
  })

  /** Bestand auf v6: fünf Personen (abweichende Einfügereihenfolge) + eine belegte Aussage. */
  function setzeFixture(db: Database.Database): void {
    // person/quelle/zitat/aussage/aussage_zitat sind journalisiert — ohne armierte Transaktion
    // scheiterten ihre jrn_*-Trigger an aenderung.transaktion_id NOT NULL (vgl. namensformen.test.ts).
    journalAus(db, 'Testvorbereitung (AP-1.34): v6-Bestand ohne armierte Transaktion einfügen.')
    const personEinfuegen = db.prepare(
      "INSERT INTO person (id, geschlecht, lebend_status, privat, notiz, ist_platzhalter, erstellt_am, geaendert_am) VALUES (@id, 'M', 'verstorben', 0, @notiz, 0, 1600000000000, 1600000000000)",
    )
    for (const index of EINFUEGE_REIHENFOLGE) {
      const id = PERSON_IDS[index]
      personEinfuegen.run({ id, notiz: `Notiz ${String(index)} (O'Brien)` })
    }
    db.prepare("INSERT INTO quelle (id, typ, titel) VALUES (@id, 'sonstiges', 'Testquelle AP-1.34')").run({ id: QUELLE_ID })
    db.prepare("INSERT INTO zitat (id, quelle_id, seite, transkript) VALUES (@id, @quelleId, '12', 'Johann Weber, geboren 1801')").run({
      id: ZITAT_ID,
      quelleId: QUELLE_ID,
    })
    db.prepare(
      "INSERT INTO aussage (id, subjekt_typ, subjekt_id, praedikat, konfidenz, ist_bevorzugt) VALUES (@id, 'person', @personId, 'existenz', 3, 1)",
    ).run({ id: AUSSAGE_ID, personId: PERSON_IDS[0] })
    db.prepare('INSERT INTO aussage_zitat (aussage_id, zitat_id) VALUES (@aussageId, @zitatId)').run({
      aussageId: AUSSAGE_ID,
      zitatId: ZITAT_ID,
    })
    journalAn(db)
  }

  it('Aufstieg: Fixture steht auf 6, migrieren() landet auf SCHEMA_VERSION >= 7', () => {
    const db = oeffnen(dbPfad)
    try {
      expect(db.pragma('user_version', { simple: true })).toBe(6)
      migrieren(db)
      expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(7)
      expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
    } finally {
      db.close()
    }
  })

  it('Nachtrag: person.kennung ist lückenlos 1..n in ORDER BY id (nicht Einfügereihenfolge), keine NULL', () => {
    const db = oeffnen(dbPfad)
    try {
      setzeFixture(db)
      migrieren(db)

      const erwartet = [...PERSON_IDS].sort(binaerVergleich).map((id, index) => ({ id, kennung: index + 1 }))
      expect(kennungenNachId(db)).toEqual(erwartet)

      // Gegenprobe gegen einen Nachtrag nach rowid: die zuerst eingefügte Person (Index 3) ist
      // nach id die vierte und muss darum Kennung 4 tragen, nicht 1.
      const zuerstEingefuegt = kennungenNachId(db).find((zeile) => zeile.id === PERSON_IDS[3])
      expect(zuerstEingefuegt?.kennung).toBe(4)

      const nullAnzahl = db
        .prepare<[], { readonly anzahl: number }>('SELECT COUNT(*) AS anzahl FROM person WHERE kennung IS NULL')
        .get()
      expect(nullAnzahl?.anzahl).toBe(0)
    } finally {
      db.close()
    }
  })

  it('Zähler: kennung_zaehler steht nach dem Nachtrag auf n+1', () => {
    const db = oeffnen(dbPfad)
    try {
      setzeFixture(db)
      migrieren(db)
      expect(zaehlerstand(db)).toBe(PERSON_IDS.length + 1)
    } finally {
      db.close()
    }
  })

  it('Zähler auf leerem Bestand: naechste = 1 (COALESCE, keine Person)', () => {
    const db = oeffnen(dbPfad)
    try {
      migrieren(db)
      expect(zaehlerstand(db)).toBe(1)
    } finally {
      db.close()
    }
  })

  it('UNIQUE: eine doppelte Kennung wird abgelehnt; mehrere NULL bleiben erlaubt (B2/E13), Spalte nullable', () => {
    const db = oeffnen(dbPfad)
    try {
      setzeFixture(db)
      migrieren(db)
      const [erste, zweite, dritte] = [...PERSON_IDS].sort(binaerVergleich)

      journalAus(db, 'Testvorbereitung (AP-1.34): UNIQUE-/CHECK-Gegenproben auf person.kennung.')
      // Doppelte Kennung: abgelehnt.
      expect(() => db.prepare('UPDATE person SET kennung = 1 WHERE id = @id').run({ id: zweite })).toThrow(/UNIQUE/)
      // Kennung < 1: abgelehnt (CHECK).
      expect(() => db.prepare('UPDATE person SET kennung = 0 WHERE id = @id').run({ id: zweite })).toThrow(/CHECK/)
      // Gegenprobe: eine freie Kennung ist erlaubt …
      expect(() => db.prepare('UPDATE person SET kennung = 999 WHERE id = @id').run({ id: zweite })).not.toThrow()
      // … und mehrere NULL (Undo über die Migrationsgrenze, E13) ebenso.
      expect(() => db.prepare('UPDATE person SET kennung = NULL WHERE id IN (@a, @b)').run({ a: erste, b: dritte })).not.toThrow()
      journalAn(db)

      // B2: kein NOT NULL per ALTER — die Garantie liegt im einzigen Schreibweg, nicht in der DB.
      expect(spalteInfo(db, 'person', 'kennung')?.notnull).toBe(0)
    } finally {
      db.close()
    }
  })

  it('Zähler läuft nur vorwärts: Rückwärts-/Gleichstand-UPDATE, DELETE und fremder bereich scheitern; Vorwärts geht', () => {
    const db = oeffnen(dbPfad)
    try {
      setzeFixture(db)
      migrieren(db)
      const stand = zaehlerstand(db)

      expect(() => db.prepare("UPDATE kennung_zaehler SET naechste = naechste - 1 WHERE bereich = 'person'").run()).toThrow(
        /kennung_zaehler/,
      )
      expect(() => db.prepare("UPDATE kennung_zaehler SET naechste = naechste WHERE bereich = 'person'").run()).toThrow(
        /kennung_zaehler/,
      )
      expect(() => db.prepare("DELETE FROM kennung_zaehler WHERE bereich = 'person'").run()).toThrow(/kennung_zaehler/)
      expect(() => db.prepare("INSERT INTO kennung_zaehler (bereich, naechste) VALUES ('ort', 1)").run()).toThrow(/CHECK/)
      expect(zaehlerstand(db)).toBe(stand)

      // Gegenprobe: vorwärts ist erlaubt (sonst wäre der Trigger schlicht „alles verboten").
      expect(() => db.prepare("UPDATE kennung_zaehler SET naechste = naechste + 1 WHERE bereich = 'person'").run()).not.toThrow()
      expect(zaehlerstand(db)).toBe(stand + 1)
    } finally {
      db.close()
    }
  })

  it('Zähler wird nie per REPLACE zurückgesetzt: INSERT OR REPLACE / REPLACE INTO / UPSERT rückwärts scheitern; normaler Ablauf geht', () => {
    // hueter-H2 (PR #111): REPLACE löst einen Konflikt durch Löschen der alten Zeile — ohne
    // DELETE-Trigger (recursive_triggers ist aus) — und umginge so beide Zähler-Trigger.
    const db = oeffnen(dbPfad)
    try {
      setzeFixture(db)
      migrieren(db)
      const stand = zaehlerstand(db)
      expect(stand).toBeGreaterThan(1)

      expect(() => db.prepare("INSERT OR REPLACE INTO kennung_zaehler (bereich, naechste) VALUES ('person', 1)").run()).toThrow(
        /kennung_zaehler/,
      )
      expect(() => db.prepare("REPLACE INTO kennung_zaehler (bereich, naechste) VALUES ('person', 1)").run()).toThrow(
        /kennung_zaehler/,
      )
      // UPSERT rückwärts: scheitert ebenfalls. Ohne chk_kennung_zaehler_kein_ersetzen am UPDATE-
      // Trigger („nur vorwaerts", Konfliktzweig ist ein UPDATE); mit ihm schon am BEFORE INSERT,
      // das vor der Konfliktprüfung feuert.
      expect(() =>
        db
          .prepare(
            "INSERT INTO kennung_zaehler (bereich, naechste) VALUES ('person', 1) ON CONFLICT (bereich) DO UPDATE SET naechste = excluded.naechste",
          )
          .run(),
      ).toThrow(/kennung_zaehler/)
      expect(zaehlerstand(db)).toBe(stand)

      // Gegenprobe: der normale Ablauf (kennungZiehen, UPDATE … RETURNING) läuft weiter.
      const gezogen = db
        .prepare<[], { readonly gezogen: number }>(
          "UPDATE kennung_zaehler SET naechste = naechste + 1 WHERE bereich = 'person' RETURNING naechste - 1 AS gezogen",
        )
        .get()
      expect(gezogen?.gezogen).toBe(stand)
      expect(zaehlerstand(db)).toBe(stand + 1)
    } finally {
      db.close()
    }
  })

  it('aussage_zitat: neue Spalten feld/textanker_von/textanker_bis existieren und sind im Bestand NULL', () => {
    const db = oeffnen(dbPfad)
    try {
      setzeFixture(db)
      migrieren(db)
      const zeilen = db
        .prepare<[], AnkerZeile>('SELECT feld, textanker_von, textanker_bis FROM aussage_zitat')
        .all()
      expect(zeilen).toEqual([{ feld: null, textanker_von: null, textanker_bis: null }])
    } finally {
      db.close()
    }
  })

  it('aussage_zitat CHECK: „beide oder keine" und „bis > von", mit Gegenproben', () => {
    const db = oeffnen(dbPfad)
    try {
      setzeFixture(db)
      migrieren(db)
      const schluessel = { aussageId: AUSSAGE_ID, zitatId: ZITAT_ID }
      const setze = (von: number | null, bis: number | null): void => {
        db.prepare(
          'UPDATE aussage_zitat SET textanker_von = @von, textanker_bis = @bis WHERE aussage_id = @aussageId AND zitat_id = @zitatId',
        ).run({ ...schluessel, von, bis })
      }

      journalAus(db, 'Testvorbereitung (AP-1.34): CHECK-Gegenproben auf aussage_zitat.textanker_*.')
      // Nur eine Seite gesetzt: abgelehnt (beide Richtungen — ein CHECK der Form
      // „(von IS NULL AND bis IS NULL) OR bis > von" ließe beide durch, weil NULL > x NULL ist).
      expect(() => setze(3, null)).toThrow(/CHECK/)
      expect(() => setze(null, 5)).toThrow(/CHECK/)
      // bis == von und bis < von: abgelehnt (halboffenes, nicht leeres Intervall).
      expect(() => setze(4, 4)).toThrow(/CHECK/)
      expect(() => setze(5, 2)).toThrow(/CHECK/)
      // von < 0: abgelehnt.
      expect(() => setze(-1, 3)).toThrow(/CHECK/)

      // Gegenproben: gültiger Anker ab 0, und zurück auf „keiner".
      expect(() => setze(0, 6)).not.toThrow()
      expect(() => setze(null, null)).not.toThrow()
      // feld hat bewusst KEINEN DB-CHECK (E3: Wertliste als Zod-Enum im Code).
      expect(() =>
        db.prepare('UPDATE aussage_zitat SET feld = @feld WHERE aussage_id = @aussageId AND zitat_id = @zitatId').run({
          ...schluessel,
          feld: 'beliebiger_text',
        }),
      ).not.toThrow()
      journalAn(db)
    } finally {
      db.close()
    }
  })

  it('Bestandszeilen bleiben unverändert (person ohne kennung, aussage_zitat ohne neue Spalten)', () => {
    const db = oeffnen(dbPfad)
    try {
      setzeFixture(db)
      const personVorher = personBestand(db)
      const zuordnungVorher = aussageZitatBestand(db)
      expect(personVorher).toHaveLength(PERSON_IDS.length)
      expect(zuordnungVorher).toHaveLength(1)

      migrieren(db)

      expect(personBestand(db)).toEqual(personVorher)
      expect(aussageZitatBestand(db)).toEqual(zuordnungVorher)
    } finally {
      db.close()
    }
  })

  it('referenzielle Integrität: foreign_key_check ist nach der Migration leer', () => {
    const db = oeffnen(dbPfad)
    try {
      setzeFixture(db)
      migrieren(db)
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      db.close()
    }
  })

  it('Journal-Trigger: jrn_person_* führen kennung, jrn_aussage_zitat_* führen feld/textanker_von/textanker_bis', () => {
    const db = oeffnen(dbPfad)
    try {
      migrieren(db)
      expect(triggerSql(db, 'jrn_person_ai')).toContain("'kennung', NEW.kennung")
      expect(triggerSql(db, 'jrn_person_au')).toContain("'kennung', OLD.kennung")
      expect(triggerSql(db, 'jrn_person_au')).toContain("'kennung', NEW.kennung")
      expect(triggerSql(db, 'jrn_person_ad')).toContain("'kennung', OLD.kennung")

      for (const spalte of ['feld', 'textanker_von', 'textanker_bis']) {
        expect(triggerSql(db, 'jrn_aussage_zitat_ai')).toContain(`'${spalte}', NEW.${spalte}`)
        expect(triggerSql(db, 'jrn_aussage_zitat_au')).toContain(`'${spalte}', OLD.${spalte}`)
        expect(triggerSql(db, 'jrn_aussage_zitat_au')).toContain(`'${spalte}', NEW.${spalte}`)
        expect(triggerSql(db, 'jrn_aussage_zitat_ad')).toContain(`'${spalte}', OLD.${spalte}`)
      }

      // kennung_zaehler ist NICHT_JOURNALISIERT: keine jrn_*-Trigger.
      const zaehlerTrigger = db
        .prepare<[], { readonly name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'kennung_zaehler' AND name LIKE 'jrn_%'",
        )
        .all()
      expect(zaehlerTrigger).toEqual([])
    } finally {
      db.close()
    }
  })
})
