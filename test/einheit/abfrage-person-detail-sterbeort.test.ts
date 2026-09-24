// AP-1.34 PR-C2a (§31 U-1.34-E5, „Sterbeort = beides"): `abfrage:person.detail` liefert
// - das Grunddatenfeld `todesort` mit aufgelöstem Ortsnamen (nicht UUID, nicht null),
// - `sterbeort` (Aussage führend, sonst Ort des Tod-Ereignisses mit Rolle `verstorbener`),
// - `kopf.lebend_status`.
// Über den echten Befehlsbus, damit der Rückfall genau den Weg nimmt, den die UI nimmt
// (`ereignis.anlegen` schreibt weder todesdatum noch todesort, §31 Risiko).
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
import { personDetail } from '../../src/main/abfragen/person-detail'
import { praedikatSchluessel } from '../../src/renderer/ansichten/profil/profil-schluessel'

type Db = ReturnType<typeof oeffnen>

function neueTestDatenbank(): Db {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

function neuePerson(db: Db, lebendStatus?: 'lebend' | 'verstorben' | 'vermutet_verstorben'): string {
  return fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0, ...(lebendStatus !== undefined ? { lebend_status: lebendStatus } : {}) }).id
}

function neuerOrt(db: Db, name: string): string {
  return fuehreAus(db, 'ort.anlegen', { name, typ: 'dorf' }).id
}

describe('person.detail — Sterbeort (AP-1.34, E5)', () => {
  it('D1: das Grunddatenfeld todesort zeigt den Ortsnamen; sterbeort stammt aus der Aussage', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const ortAussage = neuerOrt(db, 'Aussagedorf')
      const ortEreignis = neuerOrt(db, 'Ereignisdorf')
      const { id: aussageId } = fuehreAus(db, 'aussage.anlegen', {
        subjektTyp: 'person',
        subjektId: personId,
        praedikat: 'todesort',
        wertRefId: ortAussage,
        konfidenz: 3,
      })
      fuehreAus(db, 'ereignis.anlegen', { typ: 'tod', ortId: ortEreignis, beteiligungen: [{ personId, rolle: 'verstorbener' }], konfidenz: 3 })

      const detail = personDetail(db, { personId })
      const feld = detail.grunddaten.find((f) => f.praedikat === 'todesort')
      expect(feld?.wert).toBe('Aussagedorf')
      expect(feld?.aussagen[0]?.wert).toBe('Aussagedorf')
      expect(detail.sterbeort).toEqual({ herkunft: 'aussage', ort_id: ortAussage, ort_name: 'Aussagedorf', aussage_id: aussageId })
    } finally {
      db.close()
    }
  })

  it('D2: ohne Aussage gilt der Ort des per Befehl angelegten Tod-Ereignisses (Rolle verstorbener)', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const ortId = neuerOrt(db, 'Ereignisdorf')
      fuehreAus(db, 'ereignis.anlegen', { typ: 'tod', ortId, beteiligungen: [{ personId, rolle: 'verstorbener' }], konfidenz: 2 })

      const detail = personDetail(db, { personId })
      expect(detail.grunddaten.some((f) => f.praedikat === 'todesort')).toBe(false)
      expect(detail.sterbeort).toEqual({ herkunft: 'ereignis', ort_id: ortId, ort_name: 'Ereignisdorf', aussage_id: null })
    } finally {
      db.close()
    }
  })

  it('D2b: ein Tod-Ereignis, an dem die Person nur als informant beteiligt ist, zählt nicht', () => {
    const db = neueTestDatenbank()
    try {
      const personId = neuePerson(db)
      const andere = neuePerson(db)
      const ortId = neuerOrt(db, 'Fremddorf')
      fuehreAus(db, 'ereignis.anlegen', {
        typ: 'tod',
        ortId,
        beteiligungen: [
          { personId: andere, rolle: 'verstorbener' },
          { personId, rolle: 'informant' },
        ],
        konfidenz: 3,
      })
      // Nicht-Tod-Ereignis mit Rolle verstorbener zählt ebenfalls nicht (nur typ = 'tod').
      fuehreAus(db, 'ereignis.anlegen', { typ: 'beerdigung', ortId, beteiligungen: [{ personId, rolle: 'verstorbener' }], konfidenz: 3 })

      expect(personDetail(db, { personId }).sterbeort).toBeNull()
      expect(personDetail(db, { personId: andere }).sterbeort?.ort_name).toBe('Fremddorf')
    } finally {
      db.close()
    }
  })

  it('D3: kopf.lebend_status spiegelt person.lebend_status (auch NULL)', () => {
    const db = neueTestDatenbank()
    try {
      expect(personDetail(db, { personId: neuePerson(db, 'verstorben') }).kopf.lebend_status).toBe('verstorben')
      expect(personDetail(db, { personId: neuePerson(db, 'vermutet_verstorben') }).kopf.lebend_status).toBe('vermutet_verstorben')
      expect(personDetail(db, { personId: neuePerson(db) }).kopf.lebend_status).toBeNull()
    } finally {
      db.close()
    }
  })

  it('D4: das Prädikat todesort hat einen i18n-Schlüssel (Existenz in profil.json prüft i18n-vollstaendig)', () => {
    expect(praedikatSchluessel('todesort')).toBe('praedikat_todesort')
  })
})
