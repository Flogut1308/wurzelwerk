// AP-0.15, F-03, 55_Architektur.md §4.8: Grenzfälle der Koaleszenz-Orchestrierung
// (`src/main/journal/koaleszenz.ts`) — deterministisch über `versucheZusammenfassen()` mit
// explizit übergebenem `zeitpunktMs` (KEIN Date-Mock, CLAUDE.md §13: Determinismus ist Pflicht).
// Baut die Kandidaten-/Neu-Transaktion direkt über das Repository auf (`transaktionAnlegen`/
// `aenderungEinfuegen`), ohne den echten Befehlsbus — das ist Sache von Gruppe B in
// `test/einheit/koaleszenz.test.ts`.
import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { transaktionAnlegen, aenderungEinfuegen, statusSetzen } from '../../src/main/repositories/journal-repo'
import { versucheZusammenfassen } from '../../src/main/journal/koaleszenz'

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

interface TransaktionZeile {
  readonly id: string
}

function transaktionIds(db: ReturnType<typeof oeffnen>): readonly string[] {
  return db
    .prepare<[], TransaktionZeile>('SELECT id FROM transaktion ORDER BY lfd')
    .all()
    .map((zeile) => zeile.id)
}

/** Legt eine Transaktionszeile + eine begleitende aenderung-Zeile an (ohne den echten Bus). */
function transaktionMitAenderungAnlegen(
  db: ReturnType<typeof oeffnen>,
  ein: {
    readonly id: string
    readonly lfd: number
    readonly zeitpunktMs: number
    readonly art: 'nutzer' | 'wartung'
    readonly koaleszenzSchluessel: string | null
    readonly status?: 'angewendet' | 'zurueckgenommen'
  },
): void {
  transaktionAnlegen(db, {
    id: ein.id,
    zeitpunkt: ein.zeitpunktMs,
    art: ein.art,
    lfd: ein.lfd,
    koaleszenzSchluessel: ein.koaleszenzSchluessel,
  })
  if (ein.status !== undefined && ein.status !== 'angewendet') {
    statusSetzen(db, ein.id, ein.status)
  }
  aenderungEinfuegen(db, {
    id: uuidv7(),
    transaktionId: ein.id,
    reihenfolge: 1,
    tabelle: 'person',
    datensatzId: uuidv7(),
    feld: null,
    wertAltJson: null,
    wertNeuJson: '{"a":1}',
    operation: 'insert',
  })
}

describe('versucheZusammenfassen() — Grenzfälle (55_Architektur.md §4.8, AP-0.15)', () => {
  it('2001ms Abstand: kein Merge — beide Transaktionen bleiben, Rückgabe = neu.txId', () => {
    const db = neueTestDatenbank()
    try {
      const kandidatId = uuidv7()
      transaktionMitAenderungAnlegen(db, { id: kandidatId, lfd: 1, zeitpunktMs: 1000, art: 'nutzer', koaleszenzSchluessel: 'k' })

      const neuId = uuidv7()
      transaktionMitAenderungAnlegen(db, { id: neuId, lfd: 2, zeitpunktMs: 1000 + 2001, art: 'nutzer', koaleszenzSchluessel: 'k' })

      const effektiveId = versucheZusammenfassen(db, {
        txId: neuId,
        lfd: 2,
        zeitpunktMs: 1000 + 2001,
        art: 'nutzer',
        koaleszenzSchluessel: 'k',
      })

      expect(effektiveId).toBe(neuId)
      expect(transaktionIds(db)).toEqual([kandidatId, neuId])
    } finally {
      db.close()
    }
  })

  it('Gegenprobe 1999ms Abstand: Merge — nur noch die Kandidaten-ID bleibt', () => {
    const db = neueTestDatenbank()
    try {
      const kandidatId = uuidv7()
      transaktionMitAenderungAnlegen(db, { id: kandidatId, lfd: 1, zeitpunktMs: 1000, art: 'nutzer', koaleszenzSchluessel: 'k' })

      const neuId = uuidv7()
      transaktionMitAenderungAnlegen(db, { id: neuId, lfd: 2, zeitpunktMs: 1000 + 1999, art: 'nutzer', koaleszenzSchluessel: 'k' })

      const effektiveId = versucheZusammenfassen(db, {
        txId: neuId,
        lfd: 2,
        zeitpunktMs: 1000 + 1999,
        art: 'nutzer',
        koaleszenzSchluessel: 'k',
      })

      expect(effektiveId).toBe(kandidatId)
      expect(transaktionIds(db)).toEqual([kandidatId])
    } finally {
      db.close()
    }
  })

  it('fremde Transaktion dazwischen (anderer Schlüssel): koaleszenzKandidat(lfd=3) = die fremde (lfd=2) → kein Merge', () => {
    const db = neueTestDatenbank()
    try {
      const kandidatId = uuidv7()
      transaktionMitAenderungAnlegen(db, { id: kandidatId, lfd: 1, zeitpunktMs: 1000, art: 'nutzer', koaleszenzSchluessel: 'k' })

      const fremdeId = uuidv7()
      transaktionMitAenderungAnlegen(db, { id: fremdeId, lfd: 2, zeitpunktMs: 1100, art: 'nutzer', koaleszenzSchluessel: 'anders' })

      const neuId = uuidv7()
      transaktionMitAenderungAnlegen(db, { id: neuId, lfd: 3, zeitpunktMs: 1150, art: 'nutzer', koaleszenzSchluessel: 'k' })

      const effektiveId = versucheZusammenfassen(db, {
        txId: neuId,
        lfd: 3,
        zeitpunktMs: 1150,
        art: 'nutzer',
        koaleszenzSchluessel: 'k',
      })

      expect(effektiveId).toBe(neuId)
      expect(transaktionIds(db)).toEqual([kandidatId, fremdeId, neuId])
    } finally {
      db.close()
    }
  })

  it("Kandidat art='wartung': kein Merge", () => {
    const db = neueTestDatenbank()
    try {
      const kandidatId = uuidv7()
      transaktionMitAenderungAnlegen(db, { id: kandidatId, lfd: 1, zeitpunktMs: 1000, art: 'wartung', koaleszenzSchluessel: 'k' })

      const neuId = uuidv7()
      transaktionMitAenderungAnlegen(db, { id: neuId, lfd: 2, zeitpunktMs: 1100, art: 'nutzer', koaleszenzSchluessel: 'k' })

      const effektiveId = versucheZusammenfassen(db, {
        txId: neuId,
        lfd: 2,
        zeitpunktMs: 1100,
        art: 'nutzer',
        koaleszenzSchluessel: 'k',
      })

      expect(effektiveId).toBe(neuId)
      expect(transaktionIds(db)).toEqual([kandidatId, neuId])
    } finally {
      db.close()
    }
  })

  it("Kandidat status='zurueckgenommen': kein Merge", () => {
    const db = neueTestDatenbank()
    try {
      const kandidatId = uuidv7()
      transaktionMitAenderungAnlegen(db, {
        id: kandidatId,
        lfd: 1,
        zeitpunktMs: 1000,
        art: 'nutzer',
        koaleszenzSchluessel: 'k',
        status: 'zurueckgenommen',
      })

      const neuId = uuidv7()
      transaktionMitAenderungAnlegen(db, { id: neuId, lfd: 2, zeitpunktMs: 1100, art: 'nutzer', koaleszenzSchluessel: 'k' })

      const effektiveId = versucheZusammenfassen(db, {
        txId: neuId,
        lfd: 2,
        zeitpunktMs: 1100,
        art: 'nutzer',
        koaleszenzSchluessel: 'k',
      })

      expect(effektiveId).toBe(neuId)
      expect(transaktionIds(db)).toEqual([kandidatId, neuId])
    } finally {
      db.close()
    }
  })

  it('koaleszenzSchluessel === null: kein Merge, kein Kandidatenzugriff nötig', () => {
    const db = neueTestDatenbank()
    try {
      const neuId = uuidv7()
      transaktionMitAenderungAnlegen(db, { id: neuId, lfd: 1, zeitpunktMs: 1000, art: 'nutzer', koaleszenzSchluessel: null })

      const effektiveId = versucheZusammenfassen(db, {
        txId: neuId,
        lfd: 1,
        zeitpunktMs: 1000,
        art: 'nutzer',
        koaleszenzSchluessel: null,
      })

      expect(effektiveId).toBe(neuId)
    } finally {
      db.close()
    }
  })

  it("art !== 'nutzer': kein Merge", () => {
    const db = neueTestDatenbank()
    try {
      const kandidatId = uuidv7()
      transaktionMitAenderungAnlegen(db, { id: kandidatId, lfd: 1, zeitpunktMs: 1000, art: 'nutzer', koaleszenzSchluessel: 'k' })

      const neuId = uuidv7()
      transaktionMitAenderungAnlegen(db, { id: neuId, lfd: 2, zeitpunktMs: 1100, art: 'wartung', koaleszenzSchluessel: 'k' })

      const effektiveId = versucheZusammenfassen(db, {
        txId: neuId,
        lfd: 2,
        zeitpunktMs: 1100,
        art: 'wartung',
        koaleszenzSchluessel: 'k',
      })

      expect(effektiveId).toBe(neuId)
      expect(transaktionIds(db)).toEqual([kandidatId, neuId])
    } finally {
      db.close()
    }
  })
})
