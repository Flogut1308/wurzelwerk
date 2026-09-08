// AP-0.8, test/schema/trigger-vorhanden.test.ts (CLAUDE.md §13 geschützter Prüfpfad, zulässig
// zusammen mit der begleitenden docs/schema/0004_journal.sql laut ADR-025-Nachtrag /
// skripte/pruefpfad-pruefen.ts). 55_Architektur.md §4.4: "Jede Tabelle der Datenbank steht in
// genau einer der beiden Listen, und jede journalisierte Tabelle hat genau drei Trigger."
import { describe, expect, it } from 'vitest'
import { JOURNALISIERT, NICHT_JOURNALISIERT } from '../../src/main/journal/journalisierung'
import { anwenderTabellenNamen, frischeMigrierteDatenbank, triggerNamenFuerTabelle } from './_hilfen'

describe('test/schema/trigger-vorhanden (55_Architektur.md §4.4, AP-0.8)', () => {
  it('JOURNALISIERT und NICHT_JOURNALISIERT sind überschneidungsfrei und decken alle Anwendertabellen ab', () => {
    const db = frischeMigrierteDatenbank()
    try {
      const journalisiert = new Set<string>(JOURNALISIERT)
      const nichtJournalisiert = new Set<string>(NICHT_JOURNALISIERT)

      const schnitt = [...journalisiert]
        .filter((tabelle) => nichtJournalisiert.has(tabelle))
        .sort((a, b) => a.localeCompare(b))
      expect(schnitt).toEqual([])

      const vereinigung = new Set<string>([...journalisiert, ...nichtJournalisiert])
      const tatsaechlich = new Set(anwenderTabellenNamen(db))

      const fehlend = [...tatsaechlich].filter((tabelle) => !vereinigung.has(tabelle)).sort((a, b) => a.localeCompare(b))
      const ueberzaehlig = [...vereinigung].filter((tabelle) => !tatsaechlich.has(tabelle)).sort((a, b) => a.localeCompare(b))

      expect({ fehlend, ueberzaehlig }).toEqual({ fehlend: [], ueberzaehlig: [] })
    } finally {
      db.close()
    }
  })

  describe.each(JOURNALISIERT.slice().sort((a, b) => a.localeCompare(b)))('journalisierte Tabelle %s', (tabelle) => {
    it('hat genau drei jrn_*-Trigger (ai/au/ad)', () => {
      const db = frischeMigrierteDatenbank()
      try {
        const trigger = triggerNamenFuerTabelle(db, tabelle).filter((name) => name.startsWith('jrn_'))
        expect(trigger).toEqual([`jrn_${tabelle}_ad`, `jrn_${tabelle}_ai`, `jrn_${tabelle}_au`])
      } finally {
        db.close()
      }
    })
  })

  describe.each(NICHT_JOURNALISIERT.slice().sort((a, b) => a.localeCompare(b)))('nicht-journalisierte Tabelle %s', (tabelle) => {
    it('hat keinen jrn_*-Trigger', () => {
      const db = frischeMigrierteDatenbank()
      try {
        const jrnTrigger = triggerNamenFuerTabelle(db, tabelle).filter((name) => name.startsWith('jrn_'))
        expect(jrnTrigger).toEqual([])
      } finally {
        db.close()
      }
    })
  })
})
