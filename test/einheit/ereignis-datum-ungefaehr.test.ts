// AP-1.30 Bugfix U-130-9b-ereignis-ungefaehr: ein ungefähres Datum („um 1890", „vor 1800",
// „zwischen 1750 und 1760") aus dem Ereignisformular (Reiter Leben) muss einen vertragsgültigen
// `Datumswert` ergeben. Der Vertrag (`datumswertSchema`, src/shared/schemata/import-v1.ts, IMP-106)
// verlangt `original_text`, sobald `modifikator ≠ exakt` — `parse()` (src/core/datum/parser.ts)
// setzt `originaltext` für diese Formen nicht, der Renderer muss den getippten Text mitgeben.
// Geprüft auf drei Ebenen: Logik (Form), Vertrag (Schema) und echter Befehlsbus (`ereignis.anlegen`).
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
import {
  EREIGNIS_ENTWURF_LEER,
  ereignisAnlegenEinAusEntwurf,
  ereignisDatumwertAusEntwurf,
} from '../../src/renderer/ansichten/profil/profil-bearbeiten-logik'
import { gespraechsdatumAusEntwurf } from '../../src/renderer/ansichten/quellen/quelle-bearbeiten-logik'
import { datumswertSchema } from '../../src/shared/schemata/import-v1'

interface EreignisDatumZeile {
  readonly datum_modifikator: string | null
  readonly datum_wert1: string | null
  readonly datum_wert2: string | null
  readonly datum_originaltext: string | null
}

const UNGEFAEHRE_TEXTE = [
  { text: 'um 1890', modifikator: 'etwa' },
  { text: 'etwa 1890', modifikator: 'etwa' },
  { text: 'vor 1800', modifikator: 'vor' },
  { text: 'nach 1800', modifikator: 'nach' },
  { text: 'zwischen 1750 und 1760', modifikator: 'zwischen' },
] as const

describe('ereignisDatumwertAusEntwurf: ungefähre Daten (U-130-9b)', () => {
  for (const { text, modifikator } of UNGEFAEHRE_TEXTE) {
    it(`„${text}" -> modifikator ${modifikator}, original_text „${text}", schema-gültig`, () => {
      const wert = ereignisDatumwertAusEntwurf(text, 'gregorian')
      expect(wert?.modifikator).toBe(modifikator)
      expect(wert?.original_text).toBe(text)
      expect(datumswertSchema.safeParse(wert).success).toBe(true)
    })
  }

  it('umgebender Leerraum landet nicht im original_text', () => {
    expect(ereignisDatumwertAusEntwurf('  um 1890  ', 'gregorian')?.original_text).toBe('um 1890')
  })

  it('ein exaktes Datum bekommt weiterhin keinen original_text (Anzeige bleibt formatiert)', () => {
    expect(ereignisDatumwertAusEntwurf('14.3.1850', 'gregorian')?.original_text).toBeUndefined()
  })
})

describe('gespraechsdatumAusEntwurf: dieselbe Regel (U-130-9b)', () => {
  it('„um 1890" -> original_text „um 1890", schema-gültig', () => {
    const wert = gespraechsdatumAusEntwurf('um 1890', 'gregorian')
    expect(wert?.original_text).toBe('um 1890')
    expect(datumswertSchema.safeParse(wert).success).toBe(true)
  })
})

describe('ereignis.anlegen mit ungefährem Datum aus dem Formular (U-130-9b)', () => {
  it('„um 1890" wird angenommen und mit Originaltext gespeichert', () => {
    const db = oeffnen(':memory:')
    try {
      migrieren(db)
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const ein = ereignisAnlegenEinAusEntwurf(personId, { ...EREIGNIS_ENTWURF_LEER, datumText: 'um 1890', konfidenz: 3 })
      expect(ein).not.toBeNull()
      if (ein === null) return

      const { id } = fuehreAus(db, 'ereignis.anlegen', ein)

      const zeile = db
        .prepare<{ readonly id: string }, EreignisDatumZeile>(
          'SELECT datum_modifikator, datum_wert1, datum_wert2, datum_originaltext FROM ereignis WHERE id = @id',
        )
        .get({ id })
      expect(zeile).toEqual({ datum_modifikator: 'etwa', datum_wert1: '1890', datum_wert2: null, datum_originaltext: 'um 1890' })
    } finally {
      db.close()
    }
  })
})
