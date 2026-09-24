// AP-1.34 (H6b, O-1/O-2, A2b): `personKennungenLesen` / `personKennungenUebernehmen` im
// kennung-repo. Die Übernahme läuft wie im Produktivpfad im Migrations-Hook (Version 7) auf einer
// Kopie der eingefrorenen v6-Fixture. Rot vor A2b: die Funktionen fehlen (`is not a function`).
import type Database from 'better-sqlite3'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { journalAn, journalAus } from '../../src/main/journal/kontext'
import { personKennungenLesen, personKennungenUebernehmen } from '../../src/main/repositories/kennung-repo'

const FIXTURE_V6_PFAD = join(process.cwd(), 'fixtures', 'datenbanken', 'schema-v6.sqlite')

/** Feste, nach `id` sortierte Personen-IDs; eingefügt in abweichender Reihenfolge. */
const A = '018f0000-0000-7000-8000-00000000000a'
const B = '018f0000-0000-7000-8000-00000000000b'
const C = '018f0000-0000-7000-8000-00000000000c'
const D = '018f0000-0000-7000-8000-00000000000d'
const E = '018f0000-0000-7000-8000-00000000000e'

function personenEinfuegen(db: Database.Database, ids: readonly string[]): void {
  journalAus(db, 'Testvorbereitung (AP-1.34, A2b): v6-Bestand ohne armierte Transaktion einfügen.')
  const einfuegen = db.prepare('INSERT INTO person (id, privat, ist_platzhalter) VALUES (@id, 0, 0)')
  for (const id of ids) {
    einfuegen.run({ id })
  }
  journalAn(db)
}

function kennungen(db: Database.Database): Record<string, number | null> {
  const ergebnis: Record<string, number | null> = {}
  for (const zeile of db.prepare<[], { readonly id: string; readonly kennung: number | null }>('SELECT id, kennung FROM person ORDER BY id').all()) {
    ergebnis[zeile.id] = zeile.kennung
  }
  return ergebnis
}

function zaehler(db: Database.Database): number {
  const zeile = db.prepare<[], { readonly naechste: number }>("SELECT naechste FROM kennung_zaehler WHERE bereich = 'person'").get()
  if (zeile === undefined) {
    throw new Error('kennung_zaehler hat keine Zeile für person.')
  }
  return zeile.naechste
}

describe('personKennungenUebernehmen() im Migrations-Hook (AP-1.34, H6b/O-2)', () => {
  let ordner: string
  let db: Database.Database

  beforeEach(() => {
    ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-kennung-uebernehmen-'))
    const pfad = join(ordner, 'v6.sqlite')
    copyFileSync(FIXTURE_V6_PFAD, pfad)
    db = oeffnen(pfad)
  })

  afterEach(() => {
    db.close()
    rmSync(ordner, { recursive: true, force: true })
  })

  function migrierenMitUebernahme(zuordnung: ReadonlyMap<string, number>, zaehlerVorher: number): void {
    migrieren(db, {
      nachMigrationsSql: (hookDb, version) => {
        if (version === 7) {
          personKennungenUebernehmen(hookDb, zuordnung, zaehlerVorher)
        }
      },
    })
  }

  it('eine Permutation der Nachtragskennungen gelingt ohne UNIQUE-Fehler', () => {
    personenEinfuegen(db, [C, A, E, B, D])
    // 0007 allein vergäbe A..E = 1..5; die Zuordnung dreht das genau um.
    const zuordnung = new Map([
      [A, 5],
      [B, 4],
      [C, 3],
      [D, 2],
      [E, 1],
    ])
    migrierenMitUebernahme(zuordnung, 6)
    expect(kennungen(db)).toEqual({ [A]: 5, [B]: 4, [C]: 3, [D]: 2, [E]: 1 })
    expect(zaehler(db)).toBe(6)
  })

  it('Personen ohne Treffer bekommen fortlaufende Kennungen ab dem Zählerstand vorher, in ORDER BY id', () => {
    personenEinfuegen(db, [E, D, C, B, A])
    migrierenMitUebernahme(
      new Map([
        [B, 2],
        [D, 7],
        ['018f0000-0000-7000-8000-0000000000ff', 9], // Person nur in der ersetzten Datei: kein Effekt
      ]),
      10,
    )
    expect(kennungen(db)).toEqual({ [A]: 10, [B]: 2, [C]: 11, [D]: 7, [E]: 12 })
    expect(zaehler(db)).toBe(13)
  })

  it('leere Zuordnung, Zählerstand 1 (ersetzte Datei ohne Personen): 1..n wie der Nachtrag, Zähler n + 1', () => {
    personenEinfuegen(db, [B, A, C])
    migrierenMitUebernahme(new Map(), 1)
    expect(kennungen(db)).toEqual({ [A]: 1, [B]: 2, [C]: 3 })
    expect(zaehler(db)).toBe(4)
  })

  it('der Zähler sinkt nie unter den Stand nach 0007 und liegt immer über der größten vergebenen Kennung', () => {
    personenEinfuegen(db, [A, B, C, D])
    // Inkonsistente Zuordnung (Kennung ≥ Zählerstand vorher) — darf nie zu einem Zähler führen,
    // der eine vergebene Nummer erneut zöge.
    migrierenMitUebernahme(new Map([[A, 40]]), 2)
    expect(kennungen(db)).toEqual({ [A]: 40, [B]: 2, [C]: 3, [D]: 4 })
    expect(zaehler(db)).toBe(41)
  })

  it('ohne Treffer mit kleinem Zählerstand: Zähler bleibt mindestens beim 0007-Stand m + 1', () => {
    personenEinfuegen(db, [A, B])
    migrierenMitUebernahme(new Map(), 1)
    expect(zaehler(db)).toBe(3)
  })

  it('ein ungültiger Zählerstand wirft und rollt die Migration zurück', () => {
    personenEinfuegen(db, [A])
    expect(() => migrierenMitUebernahme(new Map(), 0)).toThrow()
    expect(db.pragma('user_version', { simple: true })).toBe(6)
  })
})

describe('personKennungenLesen() (AP-1.34, H6b)', () => {
  let ordner: string

  beforeEach(() => {
    ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-kennung-lesen-'))
  })

  afterEach(() => {
    rmSync(ordner, { recursive: true, force: true })
  })

  it('liefert id → kennung aller Personen mit Kennung, Personen ohne Kennung (E13) fehlen', () => {
    const db = oeffnen(join(ordner, 'aktuell.sqlite'))
    try {
      migrieren(db)
      journalAus(db, 'Testvorbereitung (AP-1.34, A2b): Personen mit und ohne Kennung direkt einfügen.')
      const einfuegen = db.prepare('INSERT INTO person (id, privat, ist_platzhalter, kennung) VALUES (@id, 0, 0, @kennung)')
      einfuegen.run({ id: A, kennung: 3 })
      einfuegen.run({ id: B, kennung: null })
      einfuegen.run({ id: C, kennung: 1 })
      journalAn(db)

      const zuordnung = personKennungenLesen(db)
      expect([...zuordnung.entries()]).toEqual([
        [A, 3],
        [C, 1],
      ])
    } finally {
      db.close()
    }
  })
})
