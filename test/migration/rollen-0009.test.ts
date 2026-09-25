// test/migration/rollen-0009.test.ts (Vorarbeiten AP-1.30, PR 3; docs/schema/0009_rolle_verstorbener.sql).
// Reine Datenmigration: `beteiligung.rolle` `hauptperson` → `verstorbener` an Ereignissen `typ = 'tod'`
// (die Oberfläche legte bis hierher jedes Ereignis mit der Profilperson als `hauptperson` an).
// Geburt bleibt offen (docs/80 V-E4-geburt) und wird NICHT umgestellt.
//
// Vorher: ein Journal-Schnitt, damit kein Undo/Redo den alten Zustand (`hauptperson` am Tod)
// zurückschreibt — `aenderung` selbst bleibt bitgleich, nur `transaktion.rueckgaengig_moeglich`
// (zusammenhängender Anfang) bzw. der Redo-Stapel (`zurueckgenommen` → `verworfen`) ändern sich.
//
// Befüllung: die eingefrorene fixtures/datenbanken/schema-v8.sqlite wird in ein Temp-Verzeichnis
// kopiert und auf Stand 8 mit den ECHTEN Befehlen (`fuehreAus`) gefüllt — 0009 ändert kein Schema,
// der heutige Befehlsvorrat läuft darum unverändert gegen v8. Danach `migrieren()` auf 9.
// Rot, solange 0009 fehlt (CLAUDE.md §5).
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import type Database from 'better-sqlite3'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { SCHEMA_VERSION } from '../../src/main/datenbank/migration/registrierung'
import { fuehreAus } from '../../src/main/befehle/bus'
import { redo, undo } from '../../src/main/journal/undo'
import { undoZiel } from '../../src/main/repositories/journal-repo'
import { personDetail } from '../../src/main/abfragen/person-detail'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'

type Db = Database.Database

const FIXTURE_V8_PFAD = join(process.cwd(), 'fixtures', 'datenbanken', 'schema-v8.sqlite')

interface BeteiligungZeile {
  readonly id: string
  readonly ereignis_id: string
  readonly person_id: string
  readonly rolle: string
  readonly reihenfolge: number | null
  readonly erstellt_am: number | null
  readonly geaendert_am: number | null
}

interface TransaktionZeile {
  readonly id: string
  readonly lfd: number
  readonly status: string
  readonly rueckgaengig_moeglich: number
}

interface AenderungZeile {
  readonly id: string
  readonly transaktion_id: string
  readonly reihenfolge: number
  readonly tabelle: string
  readonly datensatz_id: string
  readonly feld: string | null
  readonly wert_alt_json: string | null
  readonly wert_neu_json: string | null
  readonly operation: string
}

function beteiligungen(db: Db): readonly BeteiligungZeile[] {
  return db
    .prepare<[], BeteiligungZeile>(
      'SELECT id, ereignis_id, person_id, rolle, reihenfolge, erstellt_am, geaendert_am FROM beteiligung ORDER BY id',
    )
    .all()
}

function beteiligungIdVon(db: Db, ereignisId: string, personId: string, rolle: string): string {
  const zeile = beteiligungen(db).find((b) => b.ereignis_id === ereignisId && b.person_id === personId && b.rolle === rolle)
  if (zeile === undefined) throw new Error(`beteiligung (${ereignisId}, ${personId}, ${rolle}) fehlt`)
  return zeile.id
}

function transaktionen(db: Db): readonly TransaktionZeile[] {
  return db.prepare<[], TransaktionZeile>('SELECT id, lfd, status, rueckgaengig_moeglich FROM transaktion ORDER BY lfd, id').all()
}

function transaktionVon(db: Db, id: string): TransaktionZeile {
  const zeile = transaktionen(db).find((t) => t.id === id)
  if (zeile === undefined) throw new Error(`transaktion ${id} fehlt`)
  return zeile
}

function juengsteTransaktionId(db: Db): string {
  const zeile = db.prepare<[], { readonly id: string }>('SELECT id FROM transaktion ORDER BY lfd DESC LIMIT 1').get()
  if (zeile === undefined) throw new Error('keine transaktion')
  return zeile.id
}

function aenderungen(db: Db): readonly AenderungZeile[] {
  return db
    .prepare<[], AenderungZeile>(
      'SELECT id, transaktion_id, reihenfolge, tabelle, datensatz_id, feld, wert_alt_json, wert_neu_json, operation FROM aenderung ORDER BY id',
    )
    .all()
}

function hauptpersonAmTod(db: Db): number {
  const zeile = db
    .prepare<[], { readonly n: number }>(
      `SELECT COUNT(*) AS n FROM beteiligung b JOIN ereignis e ON e.id = b.ereignis_id WHERE e.typ = 'tod' AND b.rolle = 'hauptperson'`,
    )
    .get()
  if (zeile === undefined) throw new Error('COUNT lieferte keine Zeile')
  return zeile.n
}

function person(db: Db): string {
  return fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
}

type Rolle = 'hauptperson' | 'verstorbener' | 'informant' | 'kind'
type Typ = 'geburt' | 'taufe' | 'tod' | 'beerdigung'

function ereignis(db: Db, typ: Typ, beteiligte: readonly { readonly personId: string; readonly rolle: Rolle }[], ortId?: string): string {
  return fuehreAus(db, 'ereignis.anlegen', {
    typ,
    ...(ortId !== undefined ? { ortId } : {}),
    datum: { modifikator: 'exakt', praezision: 'jahr', wert1: typ === 'tod' || typ === 'beerdigung' ? '1950' : '1900' },
    beteiligungen: beteiligte,
    konfidenz: 3,
  }).id
}

function fehlerCode(fn: () => void): string | undefined {
  try {
    fn()
    return undefined
  } catch (fehler) {
    return fehler instanceof WurzelFehler ? fehler.code : `KEIN_WURZELFEHLER:${String(fehler)}`
  }
}

/** Nimmt zurück, bis nichts mehr geht; nach JEDEM Schritt darf keine `hauptperson` am Tod stehen.
 * Halt vor der Pseudo-Transaktion der Fixture (`art = 'migration'`, skripte/fixture-datenbank-
 * bauen.ts): deren einzige `aenderung`-Zeile zeigt auf `transaktion` selbst und ist kein echter,
 * rücknehmbarer Schritt — sie ist nicht Gegenstand dieses Tests. */
function undoBisEnde(db: Db): number {
  let schritte = 0
  for (;;) {
    if (undoZiel(db)?.art === 'migration') return schritte
    const code = fehlerCode(() => undo(db))
    if (code !== undefined) {
      expect(code).toBe('JOURNAL_NICHTS_ZURUECKZUNEHMEN')
      return schritte
    }
    schritte += 1
    expect(hauptpersonAmTod(db)).toBe(0)
  }
}

/** Wiederholt, bis nichts mehr geht; nach JEDEM Schritt darf keine `hauptperson` am Tod stehen. */
function redoBisEnde(db: Db): number {
  let schritte = 0
  for (;;) {
    const code = fehlerCode(() => redo(db))
    if (code !== undefined) {
      expect(code).toBe('JOURNAL_NICHTS_WIEDERHOLBAR')
      return schritte
    }
    schritte += 1
    expect(hauptpersonAmTod(db)).toBe(0)
  }
}

describe('test/migration/rollen-0009 (Vorarbeiten AP-1.30, PR 3)', () => {
  let ordner: string
  let dbPfad: string

  beforeEach(() => {
    ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-0009-'))
    dbPfad = join(ordner, 'projekt.sqlite')
    copyFileSync(FIXTURE_V8_PFAD, dbPfad)
  })

  afterEach(() => {
    rmSync(ordner, { recursive: true, force: true })
  })

  it('R1: der Aufstieg ab v8 landet auf Version 9', () => {
    const db = oeffnen(dbPfad)
    try {
      expect(db.pragma('user_version', { simple: true })).toBe(8)
      migrieren(db)
      expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(9)
      expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
    } finally {
      db.close()
    }
  })

  it('R2: nur hauptperson am Tod wird verstorbener — Geburt/Taufe/Beerdigung und andere Rollen bleiben, Zeilen sonst gleich', () => {
    const db = oeffnen(dbPfad)
    try {
      const p = person(db)
      const informant = person(db)
      const geburt = ereignis(db, 'geburt', [{ personId: p, rolle: 'hauptperson' }])
      const taufe = ereignis(db, 'taufe', [{ personId: p, rolle: 'hauptperson' }])
      const tod = ereignis(db, 'tod', [
        { personId: p, rolle: 'hauptperson' },
        { personId: informant, rolle: 'informant' },
      ])
      const beerdigung = ereignis(db, 'beerdigung', [{ personId: p, rolle: 'hauptperson' }])
      const todHaupt = beteiligungIdVon(db, tod, p, 'hauptperson')
      const vorher = beteiligungen(db)

      migrieren(db)

      const nachher = beteiligungen(db)
      expect(nachher).toHaveLength(vorher.length)
      expect(nachher).toEqual(vorher.map((b) => (b.id === todHaupt ? { ...b, rolle: 'verstorbener' } : b)))
      expect(beteiligungIdVon(db, geburt, p, 'hauptperson')).toBeTruthy()
      expect(beteiligungIdVon(db, taufe, p, 'hauptperson')).toBeTruthy()
      expect(beteiligungIdVon(db, beerdigung, p, 'hauptperson')).toBeTruthy()
      expect(beteiligungIdVon(db, tod, informant, 'informant')).toBeTruthy()
      expect(hauptpersonAmTod(db)).toBe(0)
    } finally {
      db.close()
    }
  })

  it('R3: Kollision — hat die Person am selben Tod schon verstorbener, bleibt die hauptperson-Zeile unverändert stehen', () => {
    const db = oeffnen(dbPfad)
    try {
      const p = person(db)
      const tod = ereignis(db, 'tod', [
        { personId: p, rolle: 'hauptperson' },
        { personId: p, rolle: 'verstorbener' },
      ])
      const vorher = beteiligungen(db)

      migrieren(db)

      expect(beteiligungen(db)).toEqual(vorher)
      expect(beteiligungIdVon(db, tod, p, 'hauptperson')).toBeTruthy()
      expect(beteiligungIdVon(db, tod, p, 'verstorbener')).toBeTruthy()
    } finally {
      db.close()
    }
  })

  it('R4: Kernangaben, Grunddaten und Sterbeort aus personDetail sind vor und nach der Migration gleich', () => {
    const db = oeffnen(dbPfad)
    try {
      const p = person(db)
      const ortId = fuehreAus(db, 'ort.anlegen', { name: 'Sterbedorf', typ: 'dorf' }).id
      ereignis(db, 'geburt', [{ personId: p, rolle: 'hauptperson' }])
      ereignis(db, 'tod', [{ personId: p, rolle: 'hauptperson' }], ortId)
      const vorher = personDetail(db, { personId: p })
      expect(vorher.sterbeort).not.toBeNull()

      migrieren(db)

      const nachher = personDetail(db, { personId: p })
      expect(nachher.kernangaben).toEqual(vorher.kernangaben)
      expect(nachher.grunddaten).toEqual(vorher.grunddaten)
      expect(nachher.sterbeort).toEqual(vorher.sterbeort)
    } finally {
      db.close()
    }
  })

  describe('R5: nach der Migration stellt keine Undo-/Redo-Folge hauptperson am Tod wieder her', () => {
    it('Tod per ereignis.anlegen mit hauptperson; eine NEUERE unbeteiligte Transaktion bleibt rücknehmbar', () => {
      const db = oeffnen(dbPfad)
      try {
        const p = person(db)
        ereignis(db, 'tod', [{ personId: p, rolle: 'hauptperson' }])
        const todTx = juengsteTransaktionId(db)
        person(db)
        const neuereTx = juengsteTransaktionId(db)

        migrieren(db)

        expect(hauptpersonAmTod(db)).toBe(0)
        expect(transaktionVon(db, todTx).rueckgaengig_moeglich).toBe(0)
        expect(transaktionVon(db, neuereTx).rueckgaengig_moeglich).toBe(1)
        expect(undoBisEnde(db)).toBe(1)
        expect(transaktionVon(db, neuereTx).status).toBe('zurueckgenommen')
        expect(redoBisEnde(db)).toBe(1)
        expect(hauptpersonAmTod(db)).toBe(0)
      } finally {
        db.close()
      }
    })

    it('beteiligung.loeschen einer hauptperson am Tod — Undo würde sie zurückbringen', () => {
      const db = oeffnen(dbPfad)
      try {
        const p = person(db)
        const informant = person(db)
        const tod = ereignis(db, 'tod', [
          { personId: p, rolle: 'hauptperson' },
          { personId: informant, rolle: 'informant' },
        ])
        fuehreAus(db, 'beteiligung.loeschen', { id: beteiligungIdVon(db, tod, p, 'hauptperson') })
        const loeschTx = juengsteTransaktionId(db)
        expect(hauptpersonAmTod(db)).toBe(0)

        migrieren(db)

        expect(transaktionVon(db, loeschTx).rueckgaengig_moeglich).toBe(0)
        undoBisEnde(db)
        redoBisEnde(db)
        expect(hauptpersonAmTod(db)).toBe(0)
      } finally {
        db.close()
      }
    })

    it('ereignis.aendern geburt → tod', () => {
      const db = oeffnen(dbPfad)
      try {
        const p = person(db)
        const e = ereignis(db, 'geburt', [{ personId: p, rolle: 'hauptperson' }])
        fuehreAus(db, 'ereignis.aendern', { id: e, typ: 'tod' })
        const aenderTx = juengsteTransaktionId(db)
        expect(hauptpersonAmTod(db)).toBe(1)

        migrieren(db)

        expect(hauptpersonAmTod(db)).toBe(0)
        expect(transaktionVon(db, aenderTx).rueckgaengig_moeglich).toBe(0)
        undoBisEnde(db)
        redoBisEnde(db)
        expect(hauptpersonAmTod(db)).toBe(0)
      } finally {
        db.close()
      }
    })

    it('ein zurückgenommener Tod-Schritt im Redo-Stapel wird verworfen', () => {
      const db = oeffnen(dbPfad)
      try {
        const p = person(db)
        ereignis(db, 'tod', [{ personId: p, rolle: 'hauptperson' }])
        const todTx = juengsteTransaktionId(db)
        undo(db)
        expect(transaktionVon(db, todTx).status).toBe('zurueckgenommen')

        migrieren(db)

        expect(transaktionVon(db, todTx).status).toBe('verworfen')
        expect(redoBisEnde(db)).toBe(0)
        undoBisEnde(db)
        expect(hauptpersonAmTod(db)).toBe(0)
      } finally {
        db.close()
      }
    })

    it('Bestand ohne Tod-Hauptperson: kein Schnitt, Status und rueckgaengig_moeglich unverändert', () => {
      const db = oeffnen(dbPfad)
      try {
        const p = person(db)
        ereignis(db, 'geburt', [{ personId: p, rolle: 'hauptperson' }])
        ereignis(db, 'tod', [{ personId: p, rolle: 'verstorbener' }])
        person(db)
        undo(db)
        const vorher = transaktionen(db)
        expect(vorher.some((t) => t.status === 'zurueckgenommen')).toBe(true)

        migrieren(db)

        expect(transaktionen(db)).toEqual(vorher)
      } finally {
        db.close()
      }
    })
  })

  it('R6: aenderung bleibt bitgleich, Integrität und Fremdschlüssel sauber', () => {
    const db = oeffnen(dbPfad)
    try {
      const p = person(db)
      ereignis(db, 'tod', [{ personId: p, rolle: 'hauptperson' }])
      ereignis(db, 'geburt', [{ personId: p, rolle: 'hauptperson' }])
      const vorher = aenderungen(db)

      migrieren(db)

      expect(aenderungen(db)).toEqual(vorher)
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
      expect(db.pragma('foreign_key_check')).toEqual([])
    } finally {
      db.close()
    }
  })

  it('R7: ein zweites Öffnen und Migrieren ist ein No-op', () => {
    const db = oeffnen(dbPfad)
    try {
      const p = person(db)
      ereignis(db, 'tod', [{ personId: p, rolle: 'hauptperson' }])
      migrieren(db)
    } finally {
      db.close()
    }

    const db2 = oeffnen(dbPfad)
    try {
      expect(db2.pragma('user_version', { simple: true })).toBe(9)
      const beteiligungVorher = beteiligungen(db2)
      const transaktionVorher = transaktionen(db2)
      const aenderungVorher = aenderungen(db2)
      migrieren(db2)
      expect(beteiligungen(db2)).toEqual(beteiligungVorher)
      expect(transaktionen(db2)).toEqual(transaktionVorher)
      expect(aenderungen(db2)).toEqual(aenderungVorher)
      expect(db2.pragma('user_version', { simple: true })).toBe(9)
    } finally {
      db2.close()
    }
  })
})
