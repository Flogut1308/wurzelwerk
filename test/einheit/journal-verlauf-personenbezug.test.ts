// AP-1.30 (PR 5): die feste Liste „Tabelle → Personenbezug“ der Verlaufsabfrage
// (src/main/abfragen/journal-personenbezug.ts). Jede Tabelle aus `JOURNALISIERT` steht GENAU EINMAL
// entweder in `PERSONENBEZUG` oder ausdrücklich in `OHNE_PERSONENBEZUG` — eine neue journalisierte
// Tabelle ohne Einordnung macht diesen Test rot, statt stillschweigend aus dem Personenverlauf zu
// fallen (analog zur Weißliste mit Gegenprobe in test/schema/trigger-vorhanden.test.ts).
import { describe, expect, it } from 'vitest'
import { GESUNDHEIT_TABELLEN, OHNE_PERSONENBEZUG, PERSONENBEZUG } from '../../src/main/abfragen/journal-personenbezug'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { JOURNALISIERT } from '../../src/main/journal/journalisierung'

function spaltenVon(tabelle: string): ReadonlySet<string> {
  const db = oeffnen(':memory:')
  try {
    migrieren(db)
    return new Set(
      db
        .prepare<{ readonly t: string }, { readonly name: string }>('SELECT name FROM pragma_table_info(@t)')
        .all({ t: tabelle })
        .map((z) => z.name),
    )
  } finally {
    db.close()
  }
}

describe('Personenbezug der Verlaufsabfrage (AP-1.30 PR 5)', () => {
  it('jede journalisierte Tabelle steht genau einmal in PERSONENBEZUG oder OHNE_PERSONENBEZUG', () => {
    const mit = Object.keys(PERSONENBEZUG)
    const ohne = Object.keys(OHNE_PERSONENBEZUG)
    expect(mit.filter((t) => ohne.includes(t))).toEqual([])
    expect([...mit, ...ohne].sort()).toEqual([...JOURNALISIERT].sort())
  })

  it('jede „ohne“-Einordnung trägt eine Begründung', () => {
    for (const [tabelle, grund] of Object.entries(OHNE_PERSONENBEZUG)) {
      expect(grund.trim().length, tabelle).toBeGreaterThan(10)
    }
  })

  it('jede genannte Spalte existiert in ihrer Tabelle (Zeilenbild-Schlüssel = Spaltenname)', () => {
    for (const [tabelle, bezug] of Object.entries(PERSONENBEZUG)) {
      const spalten = spaltenVon(tabelle)
      const genannt =
        bezug.art === 'spalten'
          ? [...bezug.spalten]
          : bezug.art === 'subjekt'
            ? [bezug.typSpalte, bezug.idSpalte]
            : [bezug.spalte]
      if (bezug.art !== 'ueber' && bezug.anker !== undefined) genannt.push(bezug.anker.spalte)
      for (const spalte of genannt) expect(spalten.has(spalte), `${tabelle}.${spalte}`).toBe(true)
    }
  })

  it('die Gesundheitstabellen sind genau diagnose und risikofaktor (M-08) und haben einen Personenbezug', () => {
    expect([...GESUNDHEIT_TABELLEN].sort()).toEqual(['diagnose', 'risikofaktor'])
    for (const tabelle of GESUNDHEIT_TABELLEN) expect(Object.keys(PERSONENBEZUG)).toContain(tabelle)
  })
})
