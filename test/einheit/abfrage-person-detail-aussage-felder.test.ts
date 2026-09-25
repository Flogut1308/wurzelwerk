// AP-1.30 PR 9a (Rundreise): `abfrage:person.detail` liefert je Grunddaten-Aussage alle Felder, die
// `befehl:aussage.aendern` annimmt — Rohwerte, die ganze Datumsgruppe (auch Altbestands-Sonderformen),
// `unsicherheit`, `gueltig_von`/`bis`. Die Abbildung zurück prüft profil-aussage-rundreise.test.ts.
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

describe('person.detail: Aussage-Felder für die Rundreise (AP-1.30 PR 9a)', () => {
  it('liefert Rohwerte, volle Datumsgruppe, unsicherheit und Gültigkeitszeitraum', () => {
    const db = oeffnen(':memory:')
    try {
      migrieren(db)
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'aussage.anlegen', {
        subjektTyp: 'person',
        subjektId: personId,
        praedikat: 'beruf',
        wertZahl: 7,
        datum: { modifikator: 'exakt', praezision: 'jahr', wert1: '1850' },
        konfidenz: 2,
        begruendung: 'erschlossen',
        unsicherheit: 'Lesung unsicher',
        gueltigVon: 2396759,
        gueltigBis: 2400000,
      })
      journalAus(db, 'Testvorbereitung (AP-1.30 PR 9a): Altbestands-Datumsgruppe.')
      try {
        db.prepare<{ readonly id: string }>(
          `UPDATE aussage SET datum_kalender = 'julian', datum_zweitkalender = 'gregorian', datum_zweitwert = '1712', datum_doppeljahr = '1711/12',
                  datum_originaltext = 'Anno 1711/12', datum_sort_von = 1, datum_sort_bis = 2 WHERE id = @id`,
        ).run({ id })
      } finally {
        journalAn(db)
      }
      const aussage = personDetail(db, { personId }).grunddaten.flatMap((feld) => feld.aussagen).find((a) => a.aussage_id === id)
      expect(aussage).toMatchObject({
        wert: '1850',
        wert_text: null,
        wert_zahl: 7,
        wert_ref_id: null,
        konfidenz: 2,
        begruendung: 'erschlossen',
        unsicherheit: 'Lesung unsicher',
        gueltig_von: 2396759,
        gueltig_bis: 2400000,
        datum: {
          kalender: 'julian',
          modifikator: 'exakt',
          praezision: 'jahr',
          wert1: '1850',
          wert2: null,
          originaltext: 'Anno 1711/12',
          sort_von: 1,
          sort_bis: 2,
          zweitkalender: 'gregorian',
          zweitwert: '1712',
          doppeljahr: '1711/12',
        },
      })
    } finally {
      db.close()
    }
  })

  it('datum ist null, wenn die Aussage keine Datumsgruppe trägt', () => {
    const db = oeffnen(':memory:')
    try {
      migrieren(db)
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat: 'beruf', wertText: 'Schmied', konfidenz: 3 })
      const aussage = personDetail(db, { personId }).grunddaten.flatMap((feld) => feld.aussagen)[0]
      expect(aussage?.datum).toBeNull()
      expect(aussage?.wert_text).toBe('Schmied')
    } finally {
      db.close()
    }
  })
})
