// AP-1.29 PR-A (55_Architektur.md §5.2): `abfrage:quelle.suche` gegen eine migrierte
// `:memory:`-Datenbank. Muster identisch zu `test/einheit/befehl-archiv.test.ts` (`archivSuche`-
// Abschnitt) — hier über `titel` UND `autor`, apostrophtauglich (`INSTR(LOWER(...))`, kein `LIKE`).
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
import { quelleSuche } from '../../src/main/abfragen/quelle-suche'

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

describe('abfrage:quelle.suche (AP-1.29 PR-A)', () => {
  it('findet eine Quelle über den Titel (case-insensitiv)', () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'quelle.anlegen', { typ: 'literatur', titel: 'Kirchenbuch Musterstadt', autor: 'Schmidt' })
      fuehreAus(db, 'quelle.anlegen', { typ: 'literatur', titel: 'Adressbuch', autor: 'Müller' })

      const ergebnis = quelleSuche(db, { text: 'MUSTERSTADT' })

      expect(ergebnis.treffer).toHaveLength(1)
      expect(ergebnis.treffer[0]?.id).toBe(id)
      expect(ergebnis.treffer[0]?.titel).toBe('Kirchenbuch Musterstadt')
    } finally {
      db.close()
    }
  })

  it('findet eine Quelle über den Autor (case-insensitiv, apostrophtauglich)', () => {
    const db = neueTestDatenbank()
    try {
      const { id } = fuehreAus(db, 'quelle.anlegen', { typ: 'literatur', titel: 'Chronik', autor: "O'Brien" })
      fuehreAus(db, 'quelle.anlegen', { typ: 'literatur', titel: 'Andere Quelle', autor: 'Schmidt' })

      const ergebnis = quelleSuche(db, { text: "o'brien" })

      expect(ergebnis.treffer).toHaveLength(1)
      expect(ergebnis.treffer[0]?.id).toBe(id)
      expect(ergebnis.treffer[0]?.autor).toBe("O'Brien")
    } finally {
      db.close()
    }
  })

  it('leerer/whitespace Suchtext liefert keine Treffer', () => {
    const db = neueTestDatenbank()
    try {
      fuehreAus(db, 'quelle.anlegen', { typ: 'literatur', titel: 'Kirchenbuch Musterstadt' })

      expect(quelleSuche(db, { text: '' }).treffer).toHaveLength(0)
      expect(quelleSuche(db, { text: '   ' }).treffer).toHaveLength(0)
    } finally {
      db.close()
    }
  })

  it('respektiert grenze', () => {
    const db = neueTestDatenbank()
    try {
      fuehreAus(db, 'quelle.anlegen', { typ: 'literatur', titel: 'Kirchenbuch A' })
      fuehreAus(db, 'quelle.anlegen', { typ: 'literatur', titel: 'Kirchenbuch B' })
      fuehreAus(db, 'quelle.anlegen', { typ: 'literatur', titel: 'Kirchenbuch C' })

      const ergebnis = quelleSuche(db, { text: 'kirchenbuch', grenze: 2 })

      expect(ergebnis.treffer).toHaveLength(2)
    } finally {
      db.close()
    }
  })
})
