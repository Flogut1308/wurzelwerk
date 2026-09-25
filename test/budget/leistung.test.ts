// AP-1.6 PR1 (Leistungsbudgets, CLAUDE.md §5/§9): `abfrage:person.liste` und `abfrage:suche` gegen
// einen deterministischen 2000-Personen-Bestand (test/hilfsmittel/grossbestand.ts). Median über
// mehrere Läufe statt eines Einzelmaßes — ein einzelner Ausreißer (GC-Pause, kalter Cache) soll das
// Budget nicht nichtdeterministisch rot werden lassen (CLAUDE.md §13), eine echte Regression aber
// schon.
//
// Läuft nur über das langsame Gate `pnpm test:budget` (vitest.budget.config.ts); das schnelle Gate
// `pnpm test` schließt `test/budget/**` aus (CLAUDE.md §13, gestufte Gates). Überschreitungen sind
// lokal ein harter Fehler, in der CI nur eine Warnung im Job-Log (CLAUDE.md §3): ein
// maschinenabhängiges Timing darf das Gate nicht nichtdeterministisch rot machen — der Schutz vor
// echten Regressionen liegt im lokalen Lauf. Diese Unterscheidung trifft `budgetErfuellen`.
import { describe, expect, it, vi } from 'vitest'

// AP-1.30 PR 5: der Journal-Bestand (grossbestand-journal.ts) schreibt über den echten Befehlsbus —
// Protokoll und Renderer-Ereignisse wie in den Einheitstests stummgeschaltet (kein Electron-Fenster).
vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))
import { grossbestandAufbauen } from '../hilfsmittel/grossbestand'
import { grossbestandMitJournalAufbauen } from '../hilfsmittel/grossbestand-journal'
import { journalVerlauf } from '../../src/main/abfragen/journal-verlauf'
import { personDetail } from '../../src/main/abfragen/person-detail'
import { personListe } from '../../src/main/abfragen/person-liste'
import { pruefhinweise } from '../../src/main/abfragen/pruefhinweise'
import { suche } from '../../src/main/abfragen/suche'
import type { PersonListeFilter } from '../../src/shared/schemata/person-liste'

const DURCHLAEUFE = 21
const FILTER_ALLE: PersonListeFilter = { platzhalter: 'alle', privat: 'alle', nurWiderspruch: false }

// CLAUDE.md §3: lokal harter Fehler bei Überschreitung, in der CI nur eine Warnung, die ein Mensch
// im Job-Log sieht. In der CI ist `CI` gesetzt (GitHub Actions); lokal nicht.
function budgetErfuellen(medianMs: number, grenzeMs: number, name: string): void {
  // Messwert immer sichtbar (Job-Log der CI; lokal mit `--reporter=verbose`) — Vorarbeiten AP-1.30 Teil 2, PR 5:
  // Budgetwerte werden je PR genannt, auch wenn sie unter der Grenze liegen.
  console.info(`[Budget] ${name}: Median ${medianMs.toFixed(2)} ms (Grenze ${grenzeMs} ms).`)
  if (process.env['CI'] !== undefined) {
    if (medianMs >= grenzeMs) {
      // Bewusste, für Menschen sichtbare CI-Budgetwarnung (§3).
      console.warn(
        `[Budget-Warnung] ${name}: Median ${medianMs.toFixed(2)} ms ≥ Budget ${grenzeMs} ms (CI: Warnung, kein Fehler).`,
      )
    }
    return
  }
  expect(medianMs, name).toBeLessThan(grenzeMs)
}

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
      budgetErfuellen(median(laufzeitenMs), 20, 'abfrage:person.liste')
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
        suche(db, { text: 'Meyer', grenze: 100, filter: FILTER_ALLE, sortierung: 'nachname', richtung: 'auf', seite: 1, proSeite: 100 })
        laufzeitenMs.push(performance.now() - start)
      }
      budgetErfuellen(median(laufzeitenMs), 50, 'abfrage:suche')
    } finally {
      db.close()
    }
  })
})

describe('Leistungsbudget: abfrage:pruefhinweise bei 2000 Personen (AP-1.8)', () => {
  it('abfrage:pruefhinweise (vollständige Bestandsprüfung) liegt im Median unter 1000 ms', () => {
    const db = grossbestandAufbauen()
    try {
      const laufzeitenMs: number[] = []
      for (let i = 0; i < DURCHLAEUFE; i += 1) {
        const start = performance.now()
        pruefhinweise(db)
        laufzeitenMs.push(performance.now() - start)
      }
      budgetErfuellen(median(laufzeitenMs), 1000, 'abfrage:pruefhinweise')
    } finally {
      db.close()
    }
  })
})

describe('Leistungsbudget: abfrage:person.detail bei 2000 Personen (AP-1.34 PR-C2b)', () => {
  // Die Feldwarnungen (Umfeld-Lader + Vorfahren-CTE) laufen bei JEDER Profilantwort mit — darum
  // ein eigenes Budget. Gemessen an Eltern mit den meisten Kindern (größtes Umfeld), je Lauf eine
  // andere Person, Median über alle Läufe.
  it('abfrage:person.detail (inkl. Feldwarnungen) liegt im Median unter 50 ms', () => {
    const db = grossbestandAufbauen()
    try {
      const personIds = db
        .prepare<{ readonly n: number }, { readonly id: string }>(
          `SELECT elternteil_id AS id FROM elternschaft GROUP BY elternteil_id ORDER BY COUNT(*) DESC, elternteil_id LIMIT @n`,
        )
        .all({ n: DURCHLAEUFE })
        .map((zeile) => zeile.id)
      expect(personIds.length).toBeGreaterThan(0)
      const laufzeitenMs: number[] = []
      for (const personId of personIds) {
        const start = performance.now()
        personDetail(db, { personId })
        laufzeitenMs.push(performance.now() - start)
      }
      budgetErfuellen(median(laufzeitenMs), 50, 'abfrage:person.detail')
    } finally {
      db.close()
    }
  })
})

describe('Leistungsbudget: abfrage:journal.verlauf (Person) bei 2000 Personen (AP-1.30 PR 5)', () => {
  // Die rechte Spalte des Personenprofils lädt die letzten drei Verlaufseinträge bei JEDEM
  // Profilaufruf mit — darum dieselbe Grenze wie abfrage:person.detail. Bestand: 2000 Personen, ein
  // journalisierter Import über den ganzen Bestand + 60 Nutzeränderungen
  // (test/hilfsmittel/grossbestand-journal.ts). Je Lauf eine andere Person, zuerst die bearbeiteten.
  it('abfrage:journal.verlauf (personId, grenze=3) liegt im Median unter 50 ms', () => {
    const db = grossbestandMitJournalAufbauen()
    try {
      const personIds = db
        .prepare<{ readonly n: number }, { readonly id: string }>('SELECT id FROM person ORDER BY id LIMIT @n')
        .all({ n: DURCHLAEUFE })
        .map((zeile) => zeile.id)
      expect(personIds.length).toBe(DURCHLAEUFE)
      const laufzeitenMs: number[] = []
      for (const personId of personIds) {
        const start = performance.now()
        const verlauf = journalVerlauf(db, 3, personId)
        laufzeitenMs.push(performance.now() - start)
        expect(verlauf.length).toBeGreaterThan(0)
      }
      budgetErfuellen(median(laufzeitenMs), 50, 'abfrage:journal.verlauf (Person)')
    } finally {
      db.close()
    }
  })
})
