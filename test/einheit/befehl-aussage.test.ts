// AP-1.12: `aussage.anlegen`/`aussage.loeschen` über den echten Befehlsbus
// (`src/main/befehle/bus.ts`) gegen eine migrierte `:memory:`-Datenbank. "Fakt ändern" (neuer
// bevorzugter Wert) bleibt weiter eine neue Aussage + Demote der alten bevorzugten Aussage
// (geprüft unten, Nutzerentscheidung AP-1.12) — `aussage.aendern` (AP-1.29 PR-A, unten) patcht
// dagegen NUR die Detailfelder EINER bestehenden Aussage (`wertText`/`wertZahl`/`wertRefId`/
// `datum`/`konfidenz`/`begruendung`/`unsicherheit`/`gueltigVon`/`gueltigBis`), OHNE `istBevorzugt`
// umzuschalten und OHNE Demote-Logik zu duplizieren. Muster identisch zu
// `test/einheit/befehl-person.test.ts`.
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
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'
import { aussageAnlegenEinSchema } from '../../src/shared/schemata/befehle'
import { journalAn, journalAus } from '../../src/main/journal/kontext'

interface AussageZeile {
  readonly id: string
  readonly subjekt_typ: string
  readonly subjekt_id: string
  readonly praedikat: string
  readonly wert_text: string | null
  readonly ist_bevorzugt: 0 | 1 | null
  readonly konfidenz: number | null
}

interface AussageZitatZeile {
  readonly aussage_id: string
  readonly zitat_id: string
}

interface TransaktionZahl {
  readonly anzahl: number
}

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

function aussageLesen(db: ReturnType<typeof oeffnen>, id: string): AussageZeile | undefined {
  return db
    .prepare<{ readonly id: string }, AussageZeile>(
      'SELECT id, subjekt_typ, subjekt_id, praedikat, wert_text, ist_bevorzugt, konfidenz FROM aussage WHERE id = @id',
    )
    .get({ id })
}

function aussagenFuerSubjekt(db: ReturnType<typeof oeffnen>, subjektTyp: string, subjektId: string): readonly AussageZeile[] {
  return db
    .prepare<{ readonly subjektTyp: string; readonly subjektId: string }, AussageZeile>(
      'SELECT id, subjekt_typ, subjekt_id, praedikat, wert_text, ist_bevorzugt, konfidenz FROM aussage WHERE subjekt_typ = @subjektTyp AND subjekt_id = @subjektId',
    )
    .all({ subjektTyp, subjektId })
}

function aussageZitatListe(db: ReturnType<typeof oeffnen>, aussageId: string): readonly AussageZitatZeile[] {
  return db
    .prepare<{ readonly aussageId: string }, AussageZitatZeile>('SELECT aussage_id, zitat_id FROM aussage_zitat WHERE aussage_id = @aussageId')
    .all({ aussageId })
}

function transaktionAnzahl(db: ReturnType<typeof oeffnen>): number {
  const zeile = db.prepare<[], TransaktionZahl>('SELECT COUNT(*) AS anzahl FROM transaktion').get()
  if (zeile === undefined) {
    throw new Error('transaktionAnzahl(): COUNT(*)-Abfrage lieferte unerwartet keine Zeile.')
  }
  return zeile.anzahl
}

function neuePerson(db: ReturnType<typeof oeffnen>): string {
  return fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
}

let zitatZaehler = 0

/** Legt eine minimale `quelle` + ein `zitat` roh an (kein Vertrags-/Befehlspfad in diesem AP —
 * Belege referenzieren nur BESTEHENDE `zitat`-Zeilen, s. Arbeitspaket) — für Tests, die einen
 * echten `zitatId`-Beleg brauchen. Läuft OHNE Befehlsbus, darum kurzzeitig `journalAus()`
 * (55_Architektur.md §4.3 „scharfer Ruhezustand" — ein Schreibvorgang auf einer journalisierten
 * Tabelle ohne armierte Transaktion scheitert sonst an `aenderung.transaktion_id NOT NULL`,
 * Muster identisch zu `test/einheit/_hilfen-abgeleitet.ts`). */
function neuesZitat(db: ReturnType<typeof oeffnen>): string {
  zitatZaehler += 1
  const quelleId = 'quelle-test'
  const zitatId = `zitat-test-${zitatZaehler}`
  journalAus(db, 'test-fixture: Beleg für aussage.anlegen-Tests')
  try {
    db.prepare(
      `INSERT INTO quelle (id, typ, titel, erstellt_am, geaendert_am)
       SELECT @id, 'kirchenbuch', 'Testquelle', 0, 0
       WHERE NOT EXISTS (SELECT 1 FROM quelle WHERE id = @id)`,
    ).run({ id: quelleId })
    db.prepare('INSERT INTO zitat (id, quelle_id, erstellt_am, geaendert_am) VALUES (@id, @quelleId, 0, 0)').run({ id: zitatId, quelleId })
  } finally {
    journalAn(db)
  }
  return zitatId
}

function fehlerCode(fn: () => void): string | undefined {
  try {
    fn()
    return undefined
  } catch (fehler) {
    return fehler instanceof WurzelFehler ? fehler.code : `KEIN_WURZELFEHLER:${String(fehler)}`
  }
}

describe('aussage.anlegen (AP-1.12)', () => {
  it('legt eine aussage-Zeile mit wertText an, verknüpft mit einem bestehenden zitat', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const zitatId = neuesZitat(db)

      const { id } = fuehreAus(db, 'aussage.anlegen', {
        subjektTyp: 'person',
        subjektId: personId,
        praedikat: 'beruf',
        wertText: 'Schmied',
        konfidenz: 3,
        belege: [zitatId],
      })

      const zeile = aussageLesen(db, id)
      expect(zeile?.subjekt_typ).toBe('person')
      expect(zeile?.subjekt_id).toBe(personId)
      expect(zeile?.praedikat).toBe('beruf')
      expect(zeile?.wert_text).toBe('Schmied')

      const zitate = aussageZitatListe(db, id)
      expect(zitate).toHaveLength(1)
      expect(zitate[0]?.zitat_id).toBe(zitatId)
    } finally {
      db.close()
    }
  })

  it('nicht existierende zitatId in belege → NICHT_GEFUNDEN_ZITAT, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const anzahlVorher = transaktionAnzahl(db)

      const code = fehlerCode(() =>
        fuehreAus(db, 'aussage.anlegen', {
          subjektTyp: 'person',
          subjektId: personId,
          praedikat: 'beruf',
          wertText: 'Schmied',
          konfidenz: 3,
          belege: ['nicht-vorhanden'],
        }),
      )

      expect(code).toBe('NICHT_GEFUNDEN_ZITAT')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('nicht existierende subjektId (subjektTyp person) → NICHT_GEFUNDEN_PERSON, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)

      const code = fehlerCode(() =>
        fuehreAus(db, 'aussage.anlegen', {
          subjektTyp: 'person',
          subjektId: 'nicht-vorhanden',
          praedikat: 'beruf',
          wertText: 'Schmied',
          konfidenz: 3,
        }),
      )

      expect(code).toBe('NICHT_GEFUNDEN_PERSON')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('nicht existierende subjektId (subjektTyp ereignis) → NICHT_GEFUNDEN_EREIGNIS, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)

      const code = fehlerCode(() =>
        fuehreAus(db, 'aussage.anlegen', {
          subjektTyp: 'ereignis',
          subjektId: 'nicht-vorhanden',
          praedikat: 'existenz',
          wertText: 'ja',
          konfidenz: 3,
        }),
      )

      expect(code).toBe('NICHT_GEFUNDEN_EREIGNIS')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('Undo entfernt die aussage-Zeile + aussage_zitat-Verknüpfung bitgleich, Redo legt beide wieder an', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const zitatId = neuesZitat(db)

      const { id } = fuehreAus(db, 'aussage.anlegen', {
        subjektTyp: 'person',
        subjektId: personId,
        praedikat: 'beruf',
        wertText: 'Schmied',
        konfidenz: 3,
        belege: [zitatId],
      })
      const zeileNachAnlegen = aussageLesen(db, id)
      const zitateNachAnlegen = aussageZitatListe(db, id)
      expect(zeileNachAnlegen).toBeDefined()
      expect(zitateNachAnlegen).toHaveLength(1)

      undo(db)
      expect(aussageLesen(db, id)).toBeUndefined()
      expect(aussageZitatListe(db, id)).toHaveLength(0)

      redo(db)
      expect(aussageLesen(db, id)).toEqual(zeileNachAnlegen)
      expect(aussageZitatListe(db, id)).toEqual(zitateNachAnlegen)
    } finally {
      db.close()
    }
  })

  it('"Fakt ändern": eine neue bevorzugte Aussage demotet die vorherige bevorzugte Aussage (dasselbe Prädikat)', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)

      const { id: alteId } = fuehreAus(db, 'aussage.anlegen', {
        subjektTyp: 'person',
        subjektId: personId,
        praedikat: 'beruf',
        wertText: 'Bauer',
        konfidenz: 2,
        istBevorzugt: 1,
      })
      expect(aussageLesen(db, alteId)?.ist_bevorzugt).toBe(1)

      const { id: neueIdWert } = fuehreAus(db, 'aussage.anlegen', {
        subjektTyp: 'person',
        subjektId: personId,
        praedikat: 'beruf',
        wertText: 'Schmied',
        konfidenz: 4,
        istBevorzugt: 1,
      })

      expect(aussageLesen(db, alteId)?.ist_bevorzugt).toBe(0) // demotet
      expect(aussageLesen(db, neueIdWert)?.ist_bevorzugt).toBe(1)

      const alle = aussagenFuerSubjekt(db, 'person', personId)
      expect(alle).toHaveLength(2) // beide Aussagen bleiben erhalten, nur eine ist bevorzugt
    } finally {
      db.close()
    }
  })

  it('Undo des Demotes stellt den vorherigen bevorzugten Zustand bitgleich wieder her, Redo demotet erneut', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)

      const { id: alteId } = fuehreAus(db, 'aussage.anlegen', {
        subjektTyp: 'person',
        subjektId: personId,
        praedikat: 'beruf',
        wertText: 'Bauer',
        konfidenz: 2,
        istBevorzugt: 1,
      })
      const alteVorDemote = aussageLesen(db, alteId)
      expect(alteVorDemote?.ist_bevorzugt).toBe(1)

      const { id: neueIdWert } = fuehreAus(db, 'aussage.anlegen', {
        subjektTyp: 'person',
        subjektId: personId,
        praedikat: 'beruf',
        wertText: 'Schmied',
        konfidenz: 4,
        istBevorzugt: 1,
      })
      const alteNachDemote = aussageLesen(db, alteId)
      const neueNachAnlegen = aussageLesen(db, neueIdWert)
      expect(alteNachDemote?.ist_bevorzugt).toBe(0)

      undo(db)
      expect(aussageLesen(db, alteId)).toEqual(alteVorDemote) // wieder ist_bevorzugt=1, bitgleich
      expect(aussageLesen(db, neueIdWert)).toBeUndefined()

      redo(db)
      expect(aussageLesen(db, alteId)).toEqual(alteNachDemote)
      expect(aussageLesen(db, neueIdWert)).toEqual(neueNachAnlegen)
    } finally {
      db.close()
    }
  })

  it('OHNE istBevorzugt bleibt eine bestehende bevorzugte Aussage unangetastet', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id: alteId } = fuehreAus(db, 'aussage.anlegen', {
        subjektTyp: 'person',
        subjektId: personId,
        praedikat: 'beruf',
        wertText: 'Bauer',
        konfidenz: 2,
        istBevorzugt: 1,
      })

      fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat: 'beruf', wertText: 'Vermutung', konfidenz: 1 })

      expect(aussageLesen(db, alteId)?.ist_bevorzugt).toBe(1)
    } finally {
      db.close()
    }
  })

  it('Zod-Schema lehnt subjektTyp diagnose/risikofaktor ab (M-08, DSGVO Art. 9)', () => {
    const basis = { subjektId: 'x', praedikat: 'p', wertText: 'v', konfidenz: 2 }
    expect(aussageAnlegenEinSchema.safeParse({ ...basis, subjektTyp: 'diagnose' }).success).toBe(false)
    expect(aussageAnlegenEinSchema.safeParse({ ...basis, subjektTyp: 'risikofaktor' }).success).toBe(false)
    expect(aussageAnlegenEinSchema.safeParse({ ...basis, subjektTyp: 'person' }).success).toBe(true)
  })

  it('Zod-Schema verlangt genau EIN wert_* — keins gesetzt ist ungültig', () => {
    const ergebnis = aussageAnlegenEinSchema.safeParse({ subjektTyp: 'person', subjektId: 'x', praedikat: 'p', konfidenz: 2 })
    expect(ergebnis.success).toBe(false)
  })

  it('Zod-Schema verlangt genau EIN wert_* — zwei gleichzeitig gesetzt ist ungültig', () => {
    const ergebnis = aussageAnlegenEinSchema.safeParse({
      subjektTyp: 'person',
      subjektId: 'x',
      praedikat: 'p',
      wertText: 'a',
      wertZahl: 1,
      konfidenz: 2,
    })
    expect(ergebnis.success).toBe(false)
  })
})

describe('aussage.loeschen (AP-1.12)', () => {
  it('löscht die aussage-Zeile (CASCADE räumt aussage_zitat ab)', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const zitatId = neuesZitat(db)
      const { id } = fuehreAus(db, 'aussage.anlegen', {
        subjektTyp: 'person',
        subjektId: personId,
        praedikat: 'beruf',
        wertText: 'Schmied',
        konfidenz: 3,
        belege: [zitatId],
      })

      fuehreAus(db, 'aussage.loeschen', { id })

      expect(aussageLesen(db, id)).toBeUndefined()
      expect(aussageZitatListe(db, id)).toHaveLength(0)
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_AUSSAGE, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'aussage.loeschen', { id: 'nicht-vorhanden' }))
      expect(code).toBe('NICHT_GEFUNDEN_AUSSAGE')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('Undo stellt die gelöschte aussage-Zeile + aussage_zitat-Verknüpfung bitgleich wieder her, Redo löscht erneut', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const zitatId = neuesZitat(db)
      const { id } = fuehreAus(db, 'aussage.anlegen', {
        subjektTyp: 'person',
        subjektId: personId,
        praedikat: 'beruf',
        wertText: 'Schmied',
        konfidenz: 3,
        belege: [zitatId],
      })
      const vorLoeschen = aussageLesen(db, id)
      const zitateVorLoeschen = aussageZitatListe(db, id)

      fuehreAus(db, 'aussage.loeschen', { id })
      expect(aussageLesen(db, id)).toBeUndefined()

      undo(db)
      expect(aussageLesen(db, id)).toEqual(vorLoeschen)
      expect(aussageZitatListe(db, id)).toEqual(zitateVorLoeschen)

      redo(db)
      expect(aussageLesen(db, id)).toBeUndefined()
      expect(aussageZitatListe(db, id)).toHaveLength(0)
    } finally {
      db.close()
    }
  })
})

interface AussageVollZeile {
  readonly id: string
  readonly subjekt_typ: string
  readonly subjekt_id: string
  readonly praedikat: string
  readonly wert_text: string | null
  readonly wert_zahl: number | null
  readonly wert_ref_id: string | null
  readonly konfidenz: number | null
  readonly ist_bevorzugt: 0 | 1 | null
  readonly begruendung: string | null
  readonly unsicherheit: string | null
  readonly gueltig_von: number | null
  readonly gueltig_bis: number | null
}

function aussageVollLesen(db: ReturnType<typeof oeffnen>, id: string): AussageVollZeile | undefined {
  return db
    .prepare<{ readonly id: string }, AussageVollZeile>(
      `SELECT id, subjekt_typ, subjekt_id, praedikat, wert_text, wert_zahl, wert_ref_id, konfidenz, ist_bevorzugt,
              begruendung, unsicherheit, gueltig_von, gueltig_bis
       FROM aussage WHERE id = @id`,
    )
    .get({ id })
}

describe('aussage.aendern (AP-1.29 PR-A)', () => {
  it('ändert wertText/konfidenz/begruendung/unsicherheit/gueltigVon/gueltigBis', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'aussage.anlegen', {
        subjektTyp: 'person',
        subjektId: personId,
        praedikat: 'beruf',
        wertText: 'Bauer',
        konfidenz: 2,
      })

      fuehreAus(db, 'aussage.aendern', {
        id,
        wertText: 'Schmied',
        konfidenz: 4,
        begruendung: 'Kirchenbucheintrag',
        unsicherheit: 'Schrift schwer lesbar',
        gueltigVon: 1700,
        gueltigBis: 1750,
      })

      const nachher = aussageVollLesen(db, id)
      expect(nachher?.wert_text).toBe('Schmied')
      expect(nachher?.konfidenz).toBe(4)
      expect(nachher?.begruendung).toBe('Kirchenbucheintrag')
      expect(nachher?.unsicherheit).toBe('Schrift schwer lesbar')
      expect(nachher?.gueltig_von).toBe(1700)
      expect(nachher?.gueltig_bis).toBe(1750)
    } finally {
      db.close()
    }
  })

  it('rührt subjektTyp/subjektId/praedikat/istBevorzugt NICHT an', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'aussage.anlegen', {
        subjektTyp: 'person',
        subjektId: personId,
        praedikat: 'beruf',
        wertText: 'Bauer',
        konfidenz: 2,
        istBevorzugt: 1,
      })

      fuehreAus(db, 'aussage.aendern', { id, wertText: 'Schmied', konfidenz: 3 })

      const nachher = aussageVollLesen(db, id)
      expect(nachher?.subjekt_typ).toBe('person')
      expect(nachher?.subjekt_id).toBe(personId)
      expect(nachher?.praedikat).toBe('beruf')
      expect(nachher?.ist_bevorzugt).toBe(1) // unverändert - aussage.aendern schaltet istBevorzugt nicht um
    } finally {
      db.close()
    }
  })

  it('No-op bei identischen Werten (AP-0.22, keine leere Transaktion)', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'aussage.anlegen', {
        subjektTyp: 'person',
        subjektId: personId,
        praedikat: 'beruf',
        wertText: 'Schmied',
        konfidenz: 3,
      })

      fuehreAus(db, 'aussage.aendern', { id, wertText: 'Schmied', konfidenz: 3 })
      const anzahlVorher = transaktionAnzahl(db)

      fuehreAus(db, 'aussage.aendern', { id, wertText: 'Schmied', konfidenz: 3 })
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('nicht existierende id → NICHT_GEFUNDEN_AUSSAGE, kein Schreibvorgang', () => {
    const db = neueTestDatenbank()
    try {
      const anzahlVorher = transaktionAnzahl(db)
      const code = fehlerCode(() => fuehreAus(db, 'aussage.aendern', { id: 'nicht-vorhanden', wertText: 'x', konfidenz: 2 }))
      expect(code).toBe('NICHT_GEFUNDEN_AUSSAGE')
      expect(transaktionAnzahl(db)).toBe(anzahlVorher)
    } finally {
      db.close()
    }
  })

  it('Undo stellt den vorherigen Wert bitgleich wieder her, Redo die Änderung', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const { id } = fuehreAus(db, 'aussage.anlegen', {
        subjektTyp: 'person',
        subjektId: personId,
        praedikat: 'beruf',
        wertText: 'Bauer',
        konfidenz: 2,
      })
      const vorAendern = aussageVollLesen(db, id)

      fuehreAus(db, 'aussage.aendern', { id, wertText: 'Schmied', konfidenz: 4 })
      const nachAendern = aussageVollLesen(db, id)
      expect(nachAendern).not.toEqual(vorAendern)

      undo(db)
      expect(aussageVollLesen(db, id)).toEqual(vorAendern)

      redo(db)
      expect(aussageVollLesen(db, id)).toEqual(nachAendern)
    } finally {
      db.close()
    }
  })
})
