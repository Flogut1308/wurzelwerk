// AP-1.34 PR-C1b (B-01, §31 U-1.34-F3/E1/E13): `abfrage:person.detail` liefert je Beleg `zitat_id`,
// `feld` und `textanker` (`{ von, bis }` oder null) und im Kopf die `kennung` (Zahl oder null). Ein
// unbekannter `feld`-Wert im Bestand (kein DB-CHECK, E3) wird unverändert durchgereicht und bricht die
// Abfrage nicht ab. Aufbau über den echten Befehlsbus.
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
import { journalAn, journalAus } from '../../src/main/journal/kontext'
import { personDetail } from '../../src/main/abfragen/person-detail'
import type { PersonDetailAus, PersonDetailBeleg } from '../../src/shared/schemata/person-detail'

type Db = ReturnType<typeof oeffnen>

function neueTestDatenbank(): Db {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

const TRANSKRIPT = 'Getauft wurde Johann Müller'

interface Aufbau {
  readonly personId: string
  readonly aussageId: string
  readonly zitatMitAnker: string
  readonly zitatOhneAnker: string
}

/** Eine Person mit einer Existenz-Aussage und zwei Belegen: einer mit feld + Anker, einer ohne. */
function aufbauen(db: Db): Aufbau {
  const { id: personId } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
  const { id: aussageId } = fuehreAus(db, 'aussage.anlegen', {
    subjektTyp: 'person',
    subjektId: personId,
    praedikat: 'existenz',
    wertText: 'ja',
    konfidenz: 3,
  })
  const { id: quelleId } = fuehreAus(db, 'quelle.anlegen', { typ: 'kirchenbuch', titel: 'Taufregister' })
  const { id: zitatMitAnker } = fuehreAus(db, 'zitat.anlegen', { quelleId, seite: '1', transkript: TRANSKRIPT })
  const { id: zitatOhneAnker } = fuehreAus(db, 'zitat.anlegen', { quelleId, seite: '2' })
  fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId: zitatMitAnker, feld: 'geschlecht', textanker: { von: 14, bis: 20 } })
  fuehreAus(db, 'aussage_zitat.anlegen', { aussageId, zitatId: zitatOhneAnker })
  return { personId, aussageId, zitatMitAnker, zitatOhneAnker }
}

function belegeDerAussage(ergebnis: PersonDetailAus, aussageId: string): readonly PersonDetailBeleg[] {
  for (const feld of ergebnis.grunddaten) {
    const aussage = feld.aussagen.find((kandidat) => kandidat.aussage_id === aussageId)
    if (aussage !== undefined) return aussage.belege
  }
  throw new Error(`belegeDerAussage(): Aussage ${aussageId} nicht in den Grunddaten.`)
}

function roh(db: Db, grund: string, sql: string, parameter: Record<string, string>): void {
  journalAus(db, `test-fixture: ${grund} (AP-1.34 PR-C1b)`)
  try {
    db.prepare(sql).run(parameter)
  } finally {
    journalAn(db)
  }
}

describe('abfrage:person.detail — Beleg-Feld, Textanker, Kennung (AP-1.34 PR-C1b)', () => {
  it('PD1 je Beleg zitat_id, feld und textanker', () => {
    const db = neueTestDatenbank()
    try {
      const a = aufbauen(db)

      const belege = belegeDerAussage(personDetail(db, { personId: a.personId }), a.aussageId)

      const mitAnker = belege.find((beleg) => beleg.zitat_id === a.zitatMitAnker)
      const ohneAnker = belege.find((beleg) => beleg.zitat_id === a.zitatOhneAnker)
      expect(belege).toHaveLength(2)
      expect(mitAnker).toMatchObject({ zitat_id: a.zitatMitAnker, feld: 'geschlecht', textanker: { von: 14, bis: 20 }, transkript: TRANSKRIPT })
      expect(ohneAnker).toMatchObject({ zitat_id: a.zitatOhneAnker, feld: null, textanker: null, transkript: null })
      expect(TRANSKRIPT.slice(14, 20)).toBe('Johann')
    } finally {
      db.close()
    }
  })

  it('PD2 kopf.kennung ist die gespeicherte Zahl', () => {
    const db = neueTestDatenbank()
    try {
      const a = aufbauen(db)
      const { id: zweite } = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })

      expect(personDetail(db, { personId: a.personId }).kopf.kennung).toBe(1)
      expect(personDetail(db, { personId: zweite }).kopf.kennung).toBe(2)
    } finally {
      db.close()
    }
  })

  it('PD3 kopf.kennung ist null für eine Person ohne Kennung (E13)', () => {
    const db = neueTestDatenbank()
    try {
      const a = aufbauen(db)
      roh(db, 'Person ohne Kennung', 'UPDATE person SET kennung = NULL WHERE id = @id', { id: a.personId })

      expect(personDetail(db, { personId: a.personId }).kopf.kennung).toBeNull()
    } finally {
      db.close()
    }
  })

  it('PD4 ein unbekannter feld-Wert im Bestand bricht nicht ab und wird durchgereicht', () => {
    const db = neueTestDatenbank()
    try {
      const a = aufbauen(db)
      roh(
        db,
        'unbekannter feld-Wert',
        'UPDATE aussage_zitat SET feld = @feld WHERE aussage_id = @aussageId AND zitat_id = @zitatId',
        { feld: 'kuenftiges_feld', aussageId: a.aussageId, zitatId: a.zitatOhneAnker },
      )

      const belege = belegeDerAussage(personDetail(db, { personId: a.personId }), a.aussageId)

      expect(belege.find((beleg) => beleg.zitat_id === a.zitatOhneAnker)?.feld).toBe('kuenftiges_feld')
      expect(belege.find((beleg) => beleg.zitat_id === a.zitatMitAnker)?.feld).toBe('geschlecht')
    } finally {
      db.close()
    }
  })

  it('PD5 die Kennung steht nicht in person_flach (E9)', () => {
    const db = neueTestDatenbank()
    try {
      const spalten = db
        .prepare<[], { readonly name: string }>('PRAGMA table_info(person_flach)')
        .all()
        .map((zeile) => zeile.name)
      expect(spalten).not.toContain('kennung')
    } finally {
      db.close()
    }
  })
})
