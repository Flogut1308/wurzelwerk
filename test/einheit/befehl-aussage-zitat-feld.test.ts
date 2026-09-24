// AP-1.34 PR-C1b (B-01, §31 U-1.34-F1/F2): `aussage_zitat.anlegen` mit `feld` über den echten
// Befehlsbus gegen eine migrierte `:memory:`-Datenbank. `feld` muss zum `subjekt_typ` der Aussage
// passen (src/shared/schemata/aussage-zitat.ts), sonst `VALIDIERUNG_WERTEBEREICH` und nichts wird
// geschrieben. Muster wie `test/einheit/befehl-aussage-zitat-anker.test.ts`.
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
import { aussageZitatAnlegenEinSchema } from '../../src/shared/schemata/befehle'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'

type Db = ReturnType<typeof oeffnen>

function neueTestDatenbank(): Db {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

function neuePersonenAussage(db: Db): string {
  const { id: personId } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
  return fuehreAus(db, 'aussage.anlegen', {
    subjektTyp: 'person',
    subjektId: personId,
    praedikat: 'existenz',
    wertText: 'ja',
    konfidenz: 3,
  }).id
}

/** Die Existenz-Aussage eines frisch angelegten Ereignisses (ADR-026: `ereignis.anlegen` schreibt sie). */
function neueEreignisAussage(db: Db): string {
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
    throw new Error('neueEreignisAussage(): ereignis.anlegen schrieb keine Existenz-Aussage.')
  }
  return zeile.id
}

function neuesZitat(db: Db): string {
  const { id: quelleId } = fuehreAus(db, 'quelle.anlegen', { typ: 'kirchenbuch', titel: 'Taufregister' })
  return fuehreAus(db, 'zitat.anlegen', { quelleId, transkript: 'Getauft wurde Johann Müller' }).id
}

interface VerknuepfungZeile {
  readonly feld: string | null
  readonly textanker_von: number | null
  readonly textanker_bis: number | null
}

function verknuepfungLesen(db: Db, aussageId: string, zitatId: string): VerknuepfungZeile | undefined {
  return db
    .prepare<{ readonly aussageId: string; readonly zitatId: string }, VerknuepfungZeile>(
      `SELECT feld, textanker_von, textanker_bis FROM aussage_zitat WHERE aussage_id = @aussageId AND zitat_id = @zitatId`,
    )
    .get({ aussageId, zitatId })
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

describe('aussage_zitat.anlegen mit feld (AP-1.34 PR-C1b)', () => {
  it('FA1 passendes feld am Ereignis wird gespeichert, mit Anker', () => {
    const db = neueTestDatenbank()
    try {
      const aussageId = neueEreignisAussage(db)
      const zitatId = neuesZitat(db)

      fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId, feld: 'datum', textanker: { von: 0, bis: 7 } })

      expect(verknuepfungLesen(db, aussageId, zitatId)).toEqual({ feld: 'datum', textanker_von: 0, textanker_bis: 7 })
    } finally {
      db.close()
    }
  })

  it('FA2 passendes feld an der Person wird gespeichert', () => {
    const db = neueTestDatenbank()
    try {
      const aussageId = neuePersonenAussage(db)
      const zitatId = neuesZitat(db)

      fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId, feld: 'geschlecht' })

      expect(verknuepfungLesen(db, aussageId, zitatId)).toEqual({ feld: 'geschlecht', textanker_von: null, textanker_bis: null })
    } finally {
      db.close()
    }
  })

  it('FA3 ohne feld bleibt es NULL (ganze Aussage)', () => {
    const db = neueTestDatenbank()
    try {
      const aussageId = neueEreignisAussage(db)
      const zitatId = neuesZitat(db)

      fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId })

      expect(verknuepfungLesen(db, aussageId, zitatId)?.feld).toBeNull()
    } finally {
      db.close()
    }
  })

  it('FA4 unpassendes feld → VALIDIERUNG_WERTEBEREICH, keine Zeile, keine Transaktion', () => {
    const db = neueTestDatenbank()
    try {
      const personAussage = neuePersonenAussage(db)
      const ereignisAussage = neueEreignisAussage(db)
      const zitatId = neuesZitat(db)
      const anzahlVorher = transaktionAnzahl(db)

      expect(fehlerCode(() => fuehreAus(db, 'aussage_zitat.anlegen', { aussageId: personAussage, zitatId, feld: 'datum' }))).toBe(
        'VALIDIERUNG_WERTEBEREICH',
      )
      expect(fehlerCode(() => fuehreAus(db, 'aussage_zitat.anlegen', { aussageId: ereignisAussage, zitatId, feld: 'nachname' }))).toBe(
        'VALIDIERUNG_WERTEBEREICH',
      )
      expect(verknuepfungLesen(db, personAussage, zitatId)).toBeUndefined()
      expect(verknuepfungLesen(db, ereignisAussage, zitatId)).toBeUndefined()
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('FA5 unbekannter feld-Wert scheitert am Zod-Schema', () => {
    const basis = { aussageId: 'a', zitatId: 'z' }
    expect(aussageZitatAnlegenEinSchema.safeParse({ ...basis, feld: 'datum' }).success).toBe(true)
    expect(aussageZitatAnlegenEinSchema.safeParse({ ...basis, feld: 'geburtsdatum' }).success).toBe(false)
    expect(aussageZitatAnlegenEinSchema.safeParse({ ...basis, feld: null }).success).toBe(false)
  })
})
