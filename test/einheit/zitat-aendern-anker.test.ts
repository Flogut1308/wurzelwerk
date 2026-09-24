// AP-1.34 PR-C1a (B-01, §31 U-1.34-E4): `zitat.aendern` entwertet in derselben Transaktion genau die
// Textanker, deren Ausschnitt [von, bis) sich ändert (Position UND Text, src/core/beleg/textanker.ts)
// — `textanker_von = textanker_bis = NULL`, `feld` bleibt. Erster Befehl, der `aussage_zitat` per
// UPDATE ändert: Z8 prüft darum Journal (`jrn_aussage_zitat_au`) und Undo/Redo über den
// zusammengesetzten Schlüssel (`rohErsetzen`) per vollständigem Zeilenabzug.
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { fuehreAus } from '../../src/main/befehle/bus'
import { redo, undo } from '../../src/main/journal/undo'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'
import { journalAn, journalAus } from '../../src/main/journal/kontext'

type Db = ReturnType<typeof oeffnen>

afterEach(() => {
  vi.restoreAllMocks()
})

function neueTestDatenbank(): Db {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

const TRANSKRIPT = 'Getauft wurde Johann Müller, Sohn des Schmieds'
// "Johann" = [14, 20), "Müller" = [21, 27)

interface Aufbau {
  readonly quelleId: string
  readonly zitatId: string
  readonly aussageA: string
  readonly aussageB: string
}

function neueAussage(db: Db, personId: string, wertText: string): string {
  return fuehreAus(db, 'aussage.anlegen', {
    subjektTyp: 'person',
    subjektId: personId,
    praedikat: 'beruf',
    wertText,
    konfidenz: 3,
  }).id
}

/** Ein Zitat mit TRANSKRIPT, zwei Aussagen daran: A mit Anker "Johann" [14,20), B mit Anker
 * "Müller" [21,27). */
function aufbauen(db: Db): Aufbau {
  const { id: quelleId } = fuehreAus(db, 'quelle.anlegen', { typ: 'kirchenbuch', titel: 'Taufregister' })
  const { id: zitatId } = fuehreAus(db, 'zitat.anlegen', { quelleId, seite: '12', transkript: TRANSKRIPT })
  const { id: personId } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
  const aussageA = neueAussage(db, personId, 'Schmied')
  const aussageB = neueAussage(db, personId, 'Bauer')
  fuehreAus(db, 'aussage_zitat.anlegen', { aussageId: aussageA, zitatId, textanker: { von: 14, bis: 20 } })
  fuehreAus(db, 'aussage_zitat.anlegen', { aussageId: aussageB, zitatId, textanker: { von: 21, bis: 27 } })
  return { quelleId, zitatId, aussageA, aussageB }
}

/** `feld` hat noch keinen Schreibweg (PR-C1b) — für Z2 roh und ohne Journal gesetzt. */
function feldRohSetzen(db: Db, aussageId: string, zitatId: string, feld: string): void {
  journalAus(db, 'test-fixture: feld ohne Befehl (PR-C1b)')
  try {
    db.prepare('UPDATE aussage_zitat SET feld = @feld WHERE aussage_id = @aussageId AND zitat_id = @zitatId').run({
      feld,
      aussageId,
      zitatId,
    })
  } finally {
    journalAn(db)
  }
}

interface VerknuepfungZeile {
  readonly aussage_id: string
  readonly zitat_id: string
  readonly feld: string | null
  readonly textanker_von: number | null
  readonly textanker_bis: number | null
  readonly erstellt_am: number
  readonly geaendert_am: number
}

function verknuepfung(db: Db, aussageId: string, zitatId: string): VerknuepfungZeile {
  const zeile = db
    .prepare<{ readonly aussageId: string; readonly zitatId: string }, VerknuepfungZeile>(
      `SELECT aussage_id, zitat_id, feld, textanker_von, textanker_bis, erstellt_am, geaendert_am
       FROM aussage_zitat WHERE aussage_id = @aussageId AND zitat_id = @zitatId`,
    )
    .get({ aussageId, zitatId })
  if (zeile === undefined) {
    throw new Error(`verknuepfung(): keine Zeile für ${aussageId}/${zitatId}.`)
  }
  return zeile
}

function spalten(db: Db, tabelle: 'zitat' | 'aussage_zitat'): readonly string[] {
  return db
    .prepare<[], { readonly name: string }>(`PRAGMA table_info(${tabelle})`)
    .all()
    .map((zeile) => zeile.name)
}

/** Vollständiger Zeilenabzug von `zitat` und `aussage_zitat` (alle Spalten laut PRAGMA, fest sortiert). */
function abzug(db: Db): string {
  const zitatSpalten = spalten(db, 'zitat').join(', ')
  const azSpalten = spalten(db, 'aussage_zitat').join(', ')
  const zitate = db.prepare<[], unknown>(`SELECT ${zitatSpalten} FROM zitat ORDER BY id`).all()
  const verknuepfungen = db.prepare<[], unknown>(`SELECT ${azSpalten} FROM aussage_zitat ORDER BY aussage_id, zitat_id`).all()
  return JSON.stringify({ zitate, verknuepfungen })
}

function transaktionAnzahl(db: Db): number {
  const zeile = db.prepare<[], { readonly anzahl: number }>('SELECT COUNT(*) AS anzahl FROM transaktion').get()
  if (zeile === undefined) {
    throw new Error('transaktionAnzahl(): COUNT(*)-Abfrage lieferte unerwartet keine Zeile.')
  }
  return zeile.anzahl
}

function aenderungenAussageZitat(db: Db): readonly { readonly operation: string; readonly datensatz_id: string }[] {
  return db
    .prepare<[], { readonly operation: string; readonly datensatz_id: string }>(
      `SELECT operation, datensatz_id FROM aenderung WHERE tabelle = 'aussage_zitat' ORDER BY reihenfolge`,
    )
    .all()
}

function fehlerCode(fn: () => void): string | undefined {
  try {
    fn()
    return undefined
  } catch (fehler) {
    return fehler instanceof WurzelFehler ? fehler.code : `KEIN_WURZELFEHLER:${String(fehler)}`
  }
}

describe('zitat.aendern entwertet geänderte Textanker (AP-1.34 PR-C1a, E4)', () => {
  it('Z1 Änderung nur hinter den Ankern → beide bleiben', () => {
    const db = neueTestDatenbank()
    try {
      const a = aufbauen(db)
      const vorherA = verknuepfung(db, a.aussageA, a.zitatId)
      const vorherB = verknuepfung(db, a.aussageB, a.zitatId)

      fuehreAus(db, 'zitat.aendern', { id: a.zitatId, quelleId: a.quelleId, seite: '12', transkript: `${TRANSKRIPT} aus Hainholz` })

      expect(verknuepfung(db, a.aussageA, a.zitatId)).toEqual(vorherA)
      expect(verknuepfung(db, a.aussageB, a.zitatId)).toEqual(vorherB)
    } finally {
      db.close()
    }
  })

  it('Z2 Änderung im Ausschnitt → von und bis NULL, feld bleibt, geaendert_am neu', () => {
    const db = neueTestDatenbank()
    try {
      const a = aufbauen(db)
      feldRohSetzen(db, a.aussageA, a.zitatId, 'vorname')
      const erstelltAm = verknuepfung(db, a.aussageA, a.zitatId).erstellt_am
      const neu = TRANSKRIPT.replace('Johann', 'Johonn')
      vi.spyOn(Date, 'now').mockReturnValue(4_102_444_800_000)

      fuehreAus(db, 'zitat.aendern', { id: a.zitatId, quelleId: a.quelleId, seite: '12', transkript: neu })

      expect(verknuepfung(db, a.aussageA, a.zitatId)).toEqual({
        aussage_id: a.aussageA,
        zitat_id: a.zitatId,
        feld: 'vorname',
        textanker_von: null,
        textanker_bis: null,
        erstellt_am: erstelltAm,
        geaendert_am: 4_102_444_800_000,
      })
    } finally {
      db.close()
    }
  })

  it('Z3 Einfügung vor den Ankern verschiebt den Text → beide NULL (kein Nachführen)', () => {
    const db = neueTestDatenbank()
    try {
      const a = aufbauen(db)

      fuehreAus(db, 'zitat.aendern', { id: a.zitatId, quelleId: a.quelleId, seite: '12', transkript: `Heute ${TRANSKRIPT}` })

      expect(verknuepfung(db, a.aussageA, a.zitatId).textanker_von).toBeNull()
      expect(verknuepfung(db, a.aussageA, a.zitatId).textanker_bis).toBeNull()
      expect(verknuepfung(db, a.aussageB, a.zitatId).textanker_von).toBeNull()
      expect(verknuepfung(db, a.aussageB, a.zitatId).textanker_bis).toBeNull()
    } finally {
      db.close()
    }
  })

  it('Z4 transkript weggelassen → Transkript NULL, alle Anker NULL', () => {
    const db = neueTestDatenbank()
    try {
      const a = aufbauen(db)

      fuehreAus(db, 'zitat.aendern', { id: a.zitatId, quelleId: a.quelleId, seite: '12' })

      const transkript = db
        .prepare<{ readonly id: string }, { readonly transkript: string | null }>('SELECT transkript FROM zitat WHERE id = @id')
        .get({ id: a.zitatId })
      expect(transkript).toEqual({ transkript: null })
      expect(verknuepfung(db, a.aussageA, a.zitatId).textanker_von).toBeNull()
      expect(verknuepfung(db, a.aussageB, a.zitatId).textanker_von).toBeNull()
      expect(verknuepfung(db, a.aussageB, a.zitatId).textanker_bis).toBeNull()
    } finally {
      db.close()
    }
  })

  it('Z5 zwei Aussagen am selben Zitat → nur der betroffene Anker wird entwertet', () => {
    const db = neueTestDatenbank()
    try {
      const a = aufbauen(db)
      const vorherA = verknuepfung(db, a.aussageA, a.zitatId)

      fuehreAus(db, 'zitat.aendern', {
        id: a.zitatId,
        quelleId: a.quelleId,
        seite: '12',
        transkript: TRANSKRIPT.replace('Müller', 'Möller'),
      })

      expect(verknuepfung(db, a.aussageA, a.zitatId)).toEqual(vorherA)
      expect(verknuepfung(db, a.aussageB, a.zitatId).textanker_von).toBeNull()
      expect(verknuepfung(db, a.aussageB, a.zitatId).textanker_bis).toBeNull()
      expect(aenderungenAussageZitat(db).filter((zeile) => zeile.operation === 'update')).toEqual([
        { operation: 'update', datensatz_id: `${a.aussageB}|${a.zitatId}` },
      ])
    } finally {
      db.close()
    }
  })

  it('Z6 nur seite geändert → aussage_zitat unverändert inkl. geaendert_am, kein Journal', () => {
    const db = neueTestDatenbank()
    try {
      const a = aufbauen(db)
      const vorherA = verknuepfung(db, a.aussageA, a.zitatId)
      const vorherB = verknuepfung(db, a.aussageB, a.zitatId)
      const journalVorher = aenderungenAussageZitat(db)

      fuehreAus(db, 'zitat.aendern', { id: a.zitatId, quelleId: a.quelleId, seite: '13', transkript: TRANSKRIPT })

      expect(verknuepfung(db, a.aussageA, a.zitatId)).toEqual(vorherA)
      expect(verknuepfung(db, a.aussageB, a.zitatId)).toEqual(vorherB)
      expect(aenderungenAussageZitat(db)).toEqual(journalVorher)
    } finally {
      db.close()
    }
  })

  it('Z7 Fehlerfall → nichts geändert (auch wenn der Fehler erst nach dem Entwerten fällt)', () => {
    const db = neueTestDatenbank()
    try {
      const a = aufbauen(db)
      const vorher = abzug(db)
      const anzahlVorher = transaktionAnzahl(db)

      const code = fehlerCode(() =>
        fuehreAus(db, 'zitat.aendern', { id: a.zitatId, quelleId: 'nicht-vorhanden', transkript: 'ganz anders' }),
      )
      expect(code).toBe('NICHT_GEFUNDEN_QUELLE')
      expect(abzug(db)).toBe(vorher)
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)

      // Fremdschlüsselfehler beim UPDATE von `zitat` — NACH dem Entwerten der Anker: die
      // Bus-Transaktion rollt beides zurück.
      expect(() =>
        fuehreAus(db, 'zitat.aendern', { id: a.zitatId, quelleId: a.quelleId, transkript: 'ganz anders', mediumId: 'nicht-vorhanden' }),
      ).toThrow()
      expect(abzug(db)).toBe(vorher)
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('Z8 genau ein Undo-Schritt: Undo stellt zitat und aussage_zitat bitgleich her, Redo entwertet wieder', () => {
    const db = neueTestDatenbank()
    try {
      const a = aufbauen(db)
      const vorher = abzug(db)
      const anzahlVorher = transaktionAnzahl(db)

      fuehreAus(db, 'zitat.aendern', { id: a.zitatId, quelleId: a.quelleId, seite: '12', transkript: 'Getauft wurde' })
      const nachher = abzug(db)
      expect(transaktionAnzahl(db)).toBe(anzahlVorher + 1)
      expect(verknuepfung(db, a.aussageA, a.zitatId).textanker_von).toBeNull()
      expect(verknuepfung(db, a.aussageB, a.zitatId).textanker_von).toBeNull()

      undo(db)
      expect(abzug(db)).toBe(vorher)
      expect(verknuepfung(db, a.aussageA, a.zitatId).textanker_von).toBe(14)
      expect(verknuepfung(db, a.aussageB, a.zitatId).textanker_bis).toBe(27)

      redo(db)
      expect(abzug(db)).toBe(nachher)

      undo(db)
      expect(abzug(db)).toBe(vorher)
    } finally {
      db.close()
    }
  })
})
