// AP-1.6 PR1 (Leistungsbudgets, CLAUDE.md §5/§9): `abfrage:person.liste` und `abfrage:suche` gegen
// einen deterministischen 2000-Personen-Bestand (test/hilfsmittel/grossbestand.ts). Median über
// mehrere Läufe statt eines Einzelmaßes — ein einzelner Ausreißer (GC-Pause, kalter Cache) soll das
// Budget nicht nichtdeterministisch rot werden lassen (CLAUDE.md §13), eine echte Regression aber
// schon. Lokal ein Fehler bei Überschreitung, in der CI-Job „langsame Gates" nur eine Warnung
// (90_Arbeitsweise §9/CLAUDE.md-Auftrag) — dieser Test selbst kennt diesen Unterschied nicht, er
// meldet immer hart rot/grün.
import { describe, expect, it } from 'vitest'
import { grossbestandAufbauen } from '../hilfsmittel/grossbestand'
import { personListe } from '../../src/main/abfragen/person-liste'
import { suche } from '../../src/main/abfragen/suche'
import type { PersonListeFilter } from '../../src/shared/schemata/person-liste'

const DURCHLAEUFE = 21
const FILTER_ALLE: PersonListeFilter = { platzhalter: 'alle', privat: 'alle', nurWiderspruch: false }

function median(werte: readonly number[]): number {
  const sortiert = [...werte].sort((a, b) => a - b)
  const mitte = Math.floor(sortiert.length / 2)
  if (sortiert.length % 2 === 0) {
    const untererWert = sortiert[mitte - 1]
    const obererWert = sortiert[mitte]
    if (untererWert === undefined || obererWert === undefined) {
      throw new RangeError('median: leere Werteliste.')
    }
    return (untererWert + obererWert) / 2
  }
  const wert = sortiert[mitte]
  if (wert === undefined) {
    throw new RangeError('median: leere Werteliste.')
  }
  return wert
}

describe('Leistungsbudget: abfrage:person.liste / abfrage:suche bei 2000 Personen (AP-1.6)', () => {
  it('abfrage:person.liste (proSeite=100, sortiert nach Nachname) liegt im Median unter 20 ms', () => {
    const db = grossbestandAufbauen()
    try {
      const laufzeitenMs: number[] = []
      for (let i = 0; i < DURCHLAEUFE; i += 1) {
        const start = performance.now()
        personListe(db, { sortierung: 'nachname', richtung: 'auf', seite: 1, proSeite: 100, filter: FILTER_ALLE })
        laufzeitenMs.push(performance.now() - start)
      }
      expect(median(laufzeitenMs)).toBeLessThan(20)
    } finally {
      db.close()
    }
  })

  it('abfrage:suche liegt im Median unter 50 ms', () => {
    const db = grossbestandAufbauen()
    try {
      const laufzeitenMs: number[] = []
      for (let i = 0; i < DURCHLAEUFE; i += 1) {
        const start = performance.now()
        suche(db, { text: 'Meyer', grenze: 100 })
        laufzeitenMs.push(performance.now() - start)
      }
      expect(median(laufzeitenMs)).toBeLessThan(50)
    } finally {
      db.close()
    }
  })
})
