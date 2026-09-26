// AP-1.30 U-130-9b-unlesbar (docs/80 §33 V-130-unlesbar, Entscheidung B, dritter Weg): aus einem
// nicht auflösbaren Datumstext mit erkennbarem Jahr wird ein vertragsgültiges „etwa JJJJ" mit dem
// getippten Text als `original_text` — ohne Vertrags- oder Parser-Umbau. Geprüft auf drei Ebenen:
// Form, Vertrag (`datumswertSchema`) und echter Befehlsbus (`aussage.anlegen`/`aussage.aendern`).
// Rot zuerst (CLAUDE.md §5): vor diesem PR gibt es `etwaDatumswertAusText` nicht.
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
import * as aussageRepo from '../../src/main/repositories/aussage-repo'
import { datumswertAusText, etwaDatumswertAusText } from '../../src/renderer/bausteine/datumsfeld-logik'
import { datumswertSchema } from '../../src/shared/schemata/import-v1'

describe('etwaDatumswertAusText (U-130-9b-unlesbar)', () => {
  it('„31.02.1788" (nicht auflösbar) → etwa 1788, Genauigkeit Jahr, Originaltext = getippter Text', () => {
    expect(datumswertAusText('31.02.1788', 'gregorian')).toBeUndefined()
    expect(etwaDatumswertAusText(' 31.02.1788 ', 'julian')).toEqual({
      kalender: 'julian',
      modifikator: 'etwa',
      praezision: 'jahr',
      wert1: '1788',
      original_text: '31.02.1788',
    })
  })

  it('ist schema-gültig (IMP-106: original_text bei modifikator ≠ exakt, wert1 Pflicht)', () => {
    expect(datumswertSchema.safeParse(etwaDatumswertAusText('31.02.1788', 'gregorian')).success).toBe(true)
  })

  it('ohne erkennbares Jahr: kein Angebot', () => {
    expect(etwaDatumswertAusText('kurz nach dem Krieg', 'gregorian')).toBeUndefined()
    expect(etwaDatumswertAusText('', 'gregorian')).toBeUndefined()
  })
})

describe('etwaDatumswertAusText am echten Befehlsbus', () => {
  it('aussage.anlegen und aussage.aendern nehmen das Datum an; Originaltext bleibt erhalten', () => {
    const db = oeffnen(':memory:')
    try {
      migrieren(db)
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const datum = etwaDatumswertAusText('31.02.1788', 'gregorian')
      if (datum === undefined) throw new Error('kein Datum')
      const { id } = fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat: 'geburtsdatum', datum, konfidenz: 2 })
      const angelegt = aussageRepo.lesen(db, id)
      expect(angelegt?.datum_modifikator).toBe('etwa')
      expect(angelegt?.datum_wert1).toBe('1788')
      expect(angelegt?.datum_originaltext).toBe('31.02.1788')

      const neu = etwaDatumswertAusText('32.13.1790', 'gregorian')
      if (neu === undefined) throw new Error('kein Datum')
      fuehreAus(db, 'aussage.aendern', { id, datum: neu, konfidenz: 2 })
      expect(aussageRepo.lesen(db, id)?.datum_originaltext).toBe('32.13.1790')
    } finally {
      db.close()
    }
  })
})
