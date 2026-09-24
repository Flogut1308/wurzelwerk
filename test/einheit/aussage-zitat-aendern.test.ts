// AP-1.34 PR-C1b (B-01, §31 U-1.34-F2): `aussage_zitat.aendern` ersetzt `feld` und `textanker` einer
// bestehenden Verknüpfung vollständig (beide Pflicht, `null` = entfernen). Muster `zitat.aendern`:
// No-op bei gleicher Eingabe (AP-0.22, keine Transaktion), fehlende Verknüpfung →
// `NICHT_GEFUNDEN_AUSSAGE_ZITAT`, Anker gegen das Transkript (`ankerPruefen`, F4), `feld` gegen den
// Subjekttyp (`belegFeldPasst`). Ein Befehl = ein Undo-Schritt, Undo/Redo bitgleich über den
// vollständigen Zeilenabzug von `aussage_zitat`.
import { describe, expect, it, vi } from 'vitest'

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
import { journalAn, journalAus } from '../../src/main/journal/kontext'
import { aussageZitatAendernEinSchema } from '../../src/shared/schemata/befehle'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'

type Db = ReturnType<typeof oeffnen>

function neueTestDatenbank(): Db {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

const TRANSKRIPT = 'Getauft wurde Johann Müller 👶 am Sonntag'
// "Johann" = [14, 20), "Müller" = [21, 27), "👶" = [28, 30) (Ersatzpaar)

interface Aufbau {
  readonly quelleId: string
  readonly zitatId: string
  readonly aussageId: string
}

/** Ein Ereignis (Existenz-Aussage, ADR-026) mit einem Zitat daran, ohne feld und ohne Anker. */
/** `transkript: null` legt das Zitat ohne Transkript an. */
function aufbauen(db: Db, transkript: string | null = TRANSKRIPT): Aufbau {
  const { id: personId } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
  const { id: ereignisId } = fuehreAus(db, 'ereignis.anlegen', {
    typ: 'taufe',
    beteiligungen: [{ personId, rolle: 'kind' }],
    konfidenz: 3,
  })
  const zeile = db
    .prepare<{ readonly ereignisId: string }, { readonly id: string }>(
      `SELECT id FROM aussage WHERE subjekt_typ = 'ereignis' AND subjekt_id = @ereignisId AND praedikat = 'existenz'`,
    )
    .get({ ereignisId })
  if (zeile === undefined) {
    throw new Error('aufbauen(): ereignis.anlegen schrieb keine Existenz-Aussage.')
  }
  const { id: quelleId } = fuehreAus(db, 'quelle.anlegen', { typ: 'kirchenbuch', titel: 'Taufregister' })
  const { id: zitatId } = fuehreAus(db, 'zitat.anlegen', transkript === null ? { quelleId } : { quelleId, transkript })
  fuehreAus(db, 'aussage_zitat.anlegen', { aussageId: zeile.id, zitatId })
  return { quelleId, zitatId, aussageId: zeile.id }
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

/** Vollständiger Zeilenabzug von `aussage_zitat` (alle Spalten laut PRAGMA, fest sortiert). */
function abzug(db: Db): string {
  const spalten = db
    .prepare<[], { readonly name: string }>('PRAGMA table_info(aussage_zitat)')
    .all()
    .map((zeile) => zeile.name)
    .join(', ')
  return JSON.stringify(db.prepare<[], unknown>(`SELECT ${spalten} FROM aussage_zitat ORDER BY aussage_id, zitat_id`).all())
}

function transaktionAnzahl(db: Db): number {
  const zeile = db.prepare<[], { readonly anzahl: number }>('SELECT COUNT(*) AS anzahl FROM transaktion').get()
  if (zeile === undefined) {
    throw new Error('transaktionAnzahl(): COUNT(*)-Abfrage lieferte unerwartet keine Zeile.')
  }
  return zeile.anzahl
}

function fehlerCode(fn: () => void): string | undefined {
  try {
    fn()
    return undefined
  } catch (fehler) {
    return fehler instanceof WurzelFehler ? fehler.code : `KEIN_WURZELFEHLER:${String(fehler)}`
  }
}

/** Setzt `feld` roh und ohne Journal — für einen Wert außerhalb der Wertliste (Altbestand/künftig). */
function feldRohSetzen(db: Db, aussageId: string, zitatId: string, feld: string): void {
  journalAus(db, 'test-fixture: unbekannter feld-Wert (AP-1.34 PR-C1b)')
  try {
    db.prepare('UPDATE aussage_zitat SET feld = @feld WHERE aussage_id = @aussageId AND zitat_id = @zitatId').run({ feld, aussageId, zitatId })
  } finally {
    journalAn(db)
  }
}

describe('aussage_zitat.aendern (AP-1.34 PR-C1b, F2)', () => {
  it('AE1 setzt feld und Textanker, erstellt_am bleibt, geaendert_am wird neu', () => {
    const db = neueTestDatenbank()
    try {
      const a = aufbauen(db)
      const vorher = verknuepfung(db, a.aussageId, a.zitatId)
      vi.spyOn(Date, 'now').mockReturnValue(vorher.geaendert_am + 1000)

      fuehreAus(db, 'aussage_zitat.aendern', { aussageId: a.aussageId, zitatId: a.zitatId, feld: 'datum', textanker: { von: 14, bis: 20 } })

      expect(verknuepfung(db, a.aussageId, a.zitatId)).toEqual({
        ...vorher,
        feld: 'datum',
        textanker_von: 14,
        textanker_bis: 20,
        geaendert_am: vorher.geaendert_am + 1000,
      })
    } finally {
      vi.restoreAllMocks()
      db.close()
    }
  })

  it('AE2 entfernt beides mit null', () => {
    const db = neueTestDatenbank()
    try {
      const a = aufbauen(db)
      fuehreAus(db, 'aussage_zitat.aendern', { aussageId: a.aussageId, zitatId: a.zitatId, feld: 'ort', textanker: { von: 21, bis: 27 } })
      expect(verknuepfung(db, a.aussageId, a.zitatId).feld).toBe('ort')

      fuehreAus(db, 'aussage_zitat.aendern', { aussageId: a.aussageId, zitatId: a.zitatId, feld: null, textanker: null })

      const zeile = verknuepfung(db, a.aussageId, a.zitatId)
      expect(zeile.feld).toBeNull()
      expect(zeile.textanker_von).toBeNull()
      expect(zeile.textanker_bis).toBeNull()
    } finally {
      db.close()
    }
  })

  it('AE3 Vollersetzung: nur feld mitgeben und Anker null → Anker weg; Anker mitgeben und feld null → feld weg', () => {
    const db = neueTestDatenbank()
    try {
      const a = aufbauen(db)
      fuehreAus(db, 'aussage_zitat.aendern', { aussageId: a.aussageId, zitatId: a.zitatId, feld: 'datum', textanker: { von: 14, bis: 20 } })

      fuehreAus(db, 'aussage_zitat.aendern', { aussageId: a.aussageId, zitatId: a.zitatId, feld: 'beschreibung', textanker: null })
      expect(verknuepfung(db, a.aussageId, a.zitatId)).toMatchObject({ feld: 'beschreibung', textanker_von: null, textanker_bis: null })

      fuehreAus(db, 'aussage_zitat.aendern', { aussageId: a.aussageId, zitatId: a.zitatId, feld: null, textanker: { von: 0, bis: 7 } })
      expect(verknuepfung(db, a.aussageId, a.zitatId)).toMatchObject({ feld: null, textanker_von: 0, textanker_bis: 7 })
    } finally {
      db.close()
    }
  })

  it('AE4 fehlende Verknüpfung → NICHT_GEFUNDEN_AUSSAGE_ZITAT (auch wenn Aussage und Zitat bestehen)', () => {
    const db = neueTestDatenbank()
    try {
      const a = aufbauen(db)
      const { id: zweitesZitat } = fuehreAus(db, 'zitat.anlegen', { quelleId: a.quelleId, transkript: TRANSKRIPT })
      const anzahlVorher = transaktionAnzahl(db)

      expect(fehlerCode(() => fuehreAus(db, 'aussage_zitat.aendern', { aussageId: a.aussageId, zitatId: zweitesZitat, feld: 'datum', textanker: null }))).toBe(
        'NICHT_GEFUNDEN_AUSSAGE_ZITAT',
      )
      expect(fehlerCode(() => fuehreAus(db, 'aussage_zitat.aendern', { aussageId: 'nicht-vorhanden', zitatId: a.zitatId, feld: null, textanker: null }))).toBe(
        'NICHT_GEFUNDEN_AUSSAGE_ZITAT',
      )
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('AE5 gleiche Eingabe → No-op: keine Transaktion, Zeile inkl. geaendert_am unverändert', () => {
    const db = neueTestDatenbank()
    try {
      const a = aufbauen(db)
      const ein = { aussageId: a.aussageId, zitatId: a.zitatId, feld: 'datum', textanker: { von: 14, bis: 20 } } as const
      fuehreAus(db, 'aussage_zitat.aendern', ein)
      const vorher = abzug(db)
      const anzahlVorher = transaktionAnzahl(db)
      vi.spyOn(Date, 'now').mockReturnValue(verknuepfung(db, a.aussageId, a.zitatId).geaendert_am + 5000)

      fuehreAus(db, 'aussage_zitat.aendern', ein)

      expect(abzug(db)).toBe(vorher)
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      vi.restoreAllMocks()
      db.close()
    }
  })

  it('AE5b nur von bzw. nur bis geändert → kein No-op, wird geschrieben', () => {
    const db = neueTestDatenbank()
    try {
      const a = aufbauen(db)
      fuehreAus(db, 'aussage_zitat.aendern', { aussageId: a.aussageId, zitatId: a.zitatId, feld: 'datum', textanker: { von: 14, bis: 20 } })
      const anzahlVorher = transaktionAnzahl(db)

      fuehreAus(db, 'aussage_zitat.aendern', { aussageId: a.aussageId, zitatId: a.zitatId, feld: 'datum', textanker: { von: 14, bis: 27 } })
      expect(verknuepfung(db, a.aussageId, a.zitatId)).toMatchObject({ feld: 'datum', textanker_von: 14, textanker_bis: 27 })

      fuehreAus(db, 'aussage_zitat.aendern', { aussageId: a.aussageId, zitatId: a.zitatId, feld: 'datum', textanker: { von: 21, bis: 27 } })
      expect(verknuepfung(db, a.aussageId, a.zitatId)).toMatchObject({ feld: 'datum', textanker_von: 21, textanker_bis: 27 })
      expect(transaktionAnzahl(db)).toBe(anzahlVorher + 2)
    } finally {
      db.close()
    }
  })

  it('AE6 No-op auch im Ausgangszustand (feld und Anker NULL, Eingabe null/null)', () => {
    const db = neueTestDatenbank()
    try {
      const a = aufbauen(db)
      const vorher = abzug(db)
      const anzahlVorher = transaktionAnzahl(db)

      fuehreAus(db, 'aussage_zitat.aendern', { aussageId: a.aussageId, zitatId: a.zitatId, feld: null, textanker: null })

      expect(abzug(db)).toBe(vorher)
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('AE7 ungültiger Anker (außerhalb, teilt Ersatzpaar F4, kein Transkript) → VALIDIERUNG_WERTEBEREICH, nichts geändert', () => {
    const db = neueTestDatenbank()
    try {
      const a = aufbauen(db)
      const vorher = abzug(db)
      const anzahlVorher = transaktionAnzahl(db)
      const aendern = (von: number, bis: number): string | undefined =>
        fehlerCode(() => fuehreAus(db, 'aussage_zitat.aendern', { aussageId: a.aussageId, zitatId: a.zitatId, feld: 'datum', textanker: { von, bis } }))

      expect(aendern(0, TRANSKRIPT.length + 1)).toBe('VALIDIERUNG_WERTEBEREICH')
      expect(aendern(29, 31)).toBe('VALIDIERUNG_WERTEBEREICH')
      expect(aendern(27, 29)).toBe('VALIDIERUNG_WERTEBEREICH')
      expect(abzug(db)).toBe(vorher)
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)

      // Gegenprobe: das ganze Ersatzpaar ist ein gültiger Anker.
      fuehreAus(db, 'aussage_zitat.aendern', { aussageId: a.aussageId, zitatId: a.zitatId, feld: 'datum', textanker: { von: 28, bis: 30 } })
      expect(verknuepfung(db, a.aussageId, a.zitatId).textanker_von).toBe(28)

      const ohne = aufbauen(db, null)
      expect(
        fehlerCode(() => fuehreAus(db, 'aussage_zitat.aendern', { aussageId: ohne.aussageId, zitatId: ohne.zitatId, feld: null, textanker: { von: 0, bis: 1 } })),
      ).toBe('VALIDIERUNG_WERTEBEREICH')
      expect(verknuepfung(db, ohne.aussageId, ohne.zitatId).textanker_von).toBeNull()
    } finally {
      db.close()
    }
  })

  it('AE8 unpassendes feld → VALIDIERUNG_WERTEBEREICH, nichts geändert', () => {
    const db = neueTestDatenbank()
    try {
      const a = aufbauen(db)
      const vorher = abzug(db)
      const anzahlVorher = transaktionAnzahl(db)

      expect(
        fehlerCode(() => fuehreAus(db, 'aussage_zitat.aendern', { aussageId: a.aussageId, zitatId: a.zitatId, feld: 'nachname', textanker: { von: 14, bis: 20 } })),
      ).toBe('VALIDIERUNG_WERTEBEREICH')
      expect(abzug(db)).toBe(vorher)
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('AE9 Schema: feld und textanker sind Pflicht (null erlaubt), unbekannte Werte scheitern', () => {
    const basis = { aussageId: 'a', zitatId: 'z' }
    expect(aussageZitatAendernEinSchema.safeParse({ ...basis, feld: null, textanker: null }).success).toBe(true)
    expect(aussageZitatAendernEinSchema.safeParse({ ...basis, feld: 'datum', textanker: { von: 0, bis: 1 } }).success).toBe(true)
    expect(aussageZitatAendernEinSchema.safeParse({ ...basis, textanker: null }).success).toBe(false)
    expect(aussageZitatAendernEinSchema.safeParse({ ...basis, feld: null }).success).toBe(false)
    expect(aussageZitatAendernEinSchema.safeParse({ ...basis, feld: 'geburtsdatum', textanker: null }).success).toBe(false)
    expect(aussageZitatAendernEinSchema.safeParse({ ...basis, feld: null, textanker: { von: 3, bis: 3 } }).success).toBe(false)
  })

  it('AE10 ein unbekannter feld-Wert im Bestand wird ersetzt', () => {
    const db = neueTestDatenbank()
    try {
      const a = aufbauen(db)
      feldRohSetzen(db, a.aussageId, a.zitatId, 'kuenftiges_feld')

      fuehreAus(db, 'aussage_zitat.aendern', { aussageId: a.aussageId, zitatId: a.zitatId, feld: 'datum', textanker: null })

      expect(verknuepfung(db, a.aussageId, a.zitatId).feld).toBe('datum')
    } finally {
      db.close()
    }
  })

  it('AE11 genau ein Undo-Schritt je Befehl; Undo/Redo bitgleich', () => {
    const db = neueTestDatenbank()
    try {
      const a = aufbauen(db)
      const stand0 = abzug(db)
      const anzahl0 = transaktionAnzahl(db)

      fuehreAus(db, 'aussage_zitat.aendern', { aussageId: a.aussageId, zitatId: a.zitatId, feld: 'datum', textanker: { von: 14, bis: 20 } })
      const stand1 = abzug(db)
      expect(transaktionAnzahl(db)).toBe(anzahl0 + 1)

      fuehreAus(db, 'aussage_zitat.aendern', { aussageId: a.aussageId, zitatId: a.zitatId, feld: 'ort', textanker: { von: 21, bis: 27 } })
      const stand2 = abzug(db)
      expect(transaktionAnzahl(db)).toBe(anzahl0 + 2)

      undo(db)
      expect(abzug(db)).toBe(stand1)
      undo(db)
      expect(abzug(db)).toBe(stand0)

      redo(db)
      expect(abzug(db)).toBe(stand1)
      redo(db)
      expect(abzug(db)).toBe(stand2)
    } finally {
      db.close()
    }
  })
})
