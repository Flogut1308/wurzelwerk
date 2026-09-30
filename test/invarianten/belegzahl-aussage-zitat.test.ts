// AP-1.30 PR 9d-b (Prüfpfad-Folge zu #176, docs/80 §33 V-130-9d-b) — geschützter Prüfpfad
// (CLAUDE.md §5/§13, ADR-025). Neue Invariante „Belegzähler ≡ `aussage_zitat`": die Belegzahlen,
// die `abfrage:person.detail` (src/main/abfragen/person-detail.ts) je Grunddaten-Feld liefert, ziehen
// mit jeder Verknüpfung und jeder Rücknahme mit.
//
// Der Zähler ist die sichtbare Abnahme „Zähler ziehen mit" (PR 9d); bisher prüfte ihn nur e2e an
// einem Fall. Zusicherungen je Person P nach JEDEM Schritt einer Befehlsfolge (echter Befehlsbus,
// `_befehlsfolge-generator.ts`, inkl. `aussage_zitat.anlegen`/`.loeschen`, `zitat.loeschen` und
// `aussage.loeschen` mit ihrem CASCADE) und nach jedem Undo-Schritt zurück:
//   Z1  `grunddaten` enthält genau die Prädikate der Aussagen von P (keines fehlt, keines doppelt) —
//       sonst hätte ein Beleg kein Feld, an dem er gezählt würde.
//   Z2  Je Feld: die Aussagen des Felds sind genau die Aussagen von P mit diesem Prädikat.
//   Z3  Je Aussage: `belege` (Zitat-IDs, als Multimenge) = die `zitat_id` ihrer `aussage_zitat`-Zeilen.
//   Z4  Je Feld: `belegzahl` = Summe der `belege` seiner Aussagen = Zahl der `aussage_zitat`-Zeilen
//       dieser Aussagen.
// Das Orakel liest `aussage` und `aussage_zitat` in zwei getrennten, einfachen Abfragen direkt aus
// den Tabellen und setzt sie in TypeScript zusammen — nicht über die zu prüfende Abfrage (die zählt
// per LEFT JOIN/GROUP BY).
//
// Profil `beleg` (wie `textanker-gueltig`): dort tragen die Beleg-Aktionen das meiste Gewicht und
// legen die Kette Quelle → Zitat → Aussage → Verknüpfung über den Vorlauf selbst an. Deckung: der Lauf
// zählt Prüfungen an belegten Feldern, an Feldern mit mehreren Aussagen und Beleg (dort fiele ein
// Zähler auf, der nur die erste Aussage zählt), Schritte, nach denen die Personen-Belege weniger
// wurden (`aussage_zitat.loeschen` bzw. CASCADE), und Undo-Schritte, die sie verändern — sonst prüfte
// die Invariante überwiegend Nullen.
//
// GRENZE DER DECKUNG (hueter #177 H1/H3): geprüft werden ALLE Aussagen einer Person, wie
// `grunddatenBauen` sie gruppiert — aber das Profil `beleg` erzeugt Personen-Aussagen nur mit
// `beruf`/`konfession` (`aussageAnlegenAktionArbitrary`/`aussageFaktAendernAktionArbitrary` in
// `_befehlsfolge-generator.ts`; die Datumswert- und Kurzbeschreibungs-Einschübe gibt es nur im Profil
// `bestand`). Belege an `geburtsdatum`/`todesdatum`/Orts-Prädikaten kommen darum nie vor. Heute ist die
// Abfrage prädikatunabhängig; eine künftige Sonderbehandlung einzelner Prädikate fiele hier nicht auf
// — Folgepunkt U-130-9d-b-praedikate (docs/80 §33, Generator-Erweiterung als eigene Prüfpfad-Folge).
//
// LAUFZAHL (hueter #177): 120 statt 300 Läufe — die Datei läuft in der CI parallel zu `undo-bitgleich`
// und bremste es auf Windows von 122 s auf 148 s (sie selbst 127 s, Timeout 180 s). Lokal (macOS) ~10 s
// statt ~25 s; alle Deckungszähler bleiben deutlich über 0 (Messwerte an den Mindestzahlen unten).
import { afterAll, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import type Database from 'better-sqlite3'

vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { undo } from '../../src/main/journal/undo'
import { undoZiel } from '../../src/main/repositories/journal-repo'
import { personDetail } from '../../src/main/abfragen/person-detail'
import { aktionAusfuehren, befehlsfolgeArbitrary, neuerZustand, type Zweig } from './_befehlsfolge-generator'

const SEED = 20260930
const LAEUFE = 120

interface AussageZeile {
  readonly id: string
  readonly subjekt_id: string
  readonly praedikat: string
}

interface VerknuepfungZeile {
  readonly aussage_id: string
  readonly zitat_id: string
}

interface Orakel {
  /** Aussagen je Person, dann je Prädikat. */
  readonly aussagen: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>
  /** Zitat-IDs je Aussage (sortiert). */
  readonly zitate: ReadonlyMap<string, readonly string[]>
  /** Zahl aller `aussage_zitat`-Zeilen an Aussagen über existierende Personen. */
  readonly personenBelege: number
}

interface Deckung {
  belegteFelder: number
  mehrereAussagenBelegt: number
  spaetereAussageBelegt: number
  nachWenigerBelegen: number
  nachLoeschBefehl: number
  undoVeraendert: number
  undoMehrBelege: number
}

function neueTestDatenbank(): ReturnType<typeof oeffnen> {
  const db = oeffnen(':memory:')
  migrieren(db)
  return db
}

function personIds(db: Database.Database): readonly string[] {
  return db
    .prepare<[], { readonly id: string }>('SELECT id FROM person ORDER BY id')
    .all()
    .map((zeile) => zeile.id)
}

/** `aussage` und `aussage_zitat` direkt aus den Tabellen (Orakel), in TypeScript zusammengesetzt. */
function orakelLesen(db: Database.Database, personen: readonly string[]): Orakel {
  const aussagen = new Map<string, Map<string, string[]>>()
  for (const personId of personen) aussagen.set(personId, new Map())
  const aussageIds = new Set<string>()
  for (const zeile of db
    .prepare<[], AussageZeile>("SELECT id, subjekt_id, praedikat FROM aussage WHERE subjekt_typ = 'person' ORDER BY id")
    .all()) {
    const jePraedikat = aussagen.get(zeile.subjekt_id)
    if (jePraedikat === undefined) continue // Aussage über eine gelöschte Person — kein Profil
    const liste = jePraedikat.get(zeile.praedikat) ?? []
    liste.push(zeile.id)
    jePraedikat.set(zeile.praedikat, liste)
    aussageIds.add(zeile.id)
  }
  const zitate = new Map<string, string[]>()
  let personenBelege = 0
  for (const zeile of db.prepare<[], VerknuepfungZeile>('SELECT aussage_id, zitat_id FROM aussage_zitat ORDER BY aussage_id, zitat_id').all()) {
    const liste = zitate.get(zeile.aussage_id) ?? []
    liste.push(zeile.zitat_id)
    zitate.set(zeile.aussage_id, liste)
    if (aussageIds.has(zeile.aussage_id)) personenBelege += 1
  }
  return { aussagen, zitate, personenBelege }
}

/** Prüft Z1–Z4 für jede Person; zählt die Deckung der Feldprüfungen mit. */
function pruefen(db: Database.Database, wo: string, deckung: Deckung): number {
  const personen = personIds(db)
  const orakel = orakelLesen(db, personen)
  for (const personId of personen) {
    const soll = orakel.aussagen.get(personId) ?? new Map<string, readonly string[]>()
    const grunddaten = personDetail(db, { personId }).grunddaten
    const kontext = `${wo}, Person ${personId}`
    // Z1
    expect(grunddaten.map((feld) => feld.praedikat).sort(), `Z1 ${kontext}`).toEqual([...soll.keys()].sort())
    for (const feld of grunddaten) {
      const feldKontext = `${kontext}, Prädikat ${feld.praedikat}`
      const sollAussagen = soll.get(feld.praedikat) ?? []
      // Z2
      expect(feld.aussagen.map((aussage) => aussage.aussage_id).sort(), `Z2 ${feldKontext}`).toEqual([...sollAussagen].sort())
      // Z3
      for (const aussage of feld.aussagen) {
        expect(
          aussage.belege.map((beleg) => beleg.zitat_id).sort(),
          `Z3 ${feldKontext}, Aussage ${aussage.aussage_id}`,
        ).toEqual(orakel.zitate.get(aussage.aussage_id) ?? [])
      }
      // Z4
      const sollZahl = sollAussagen.reduce((summe, aussageId) => summe + (orakel.zitate.get(aussageId)?.length ?? 0), 0)
      const belegeSumme = feld.aussagen.reduce((summe, aussage) => summe + aussage.belege.length, 0)
      expect(feld.belegzahl, `Z4 belegzahl = aussage_zitat ${feldKontext}`).toBe(sollZahl)
      expect(belegeSumme, `Z4 Summe belege = aussage_zitat ${feldKontext}`).toBe(sollZahl)
      if (sollZahl > 0) deckung.belegteFelder += 1
      if (sollZahl > 0 && sollAussagen.length >= 2) deckung.mehrereAussagenBelegt += 1
      if ([...sollAussagen].sort().slice(1).some((aussageId) => (orakel.zitate.get(aussageId)?.length ?? 0) > 0)) deckung.spaetereAussageBelegt += 1
    }
  }
  return orakel.personenBelege
}

describe('Invariante: Belegzahl in person.detail ≡ aussage_zitat (V-130-9d-b)', () => {
  // Der Generator stellt `Date` über `vi.setSystemTime()` (Testuhr, `_befehlsfolge-koaleszenz.ts`).
  afterAll(() => {
    vi.useRealTimers()
  })

  it('gilt nach jedem Schritt einer beliebigen Befehlsfolge und nach jedem Undo-Schritt zurück', () => {
    const deckung: Deckung = {
      belegteFelder: 0,
      mehrereAussagenBelegt: 0,
      spaetereAussageBelegt: 0,
      nachWenigerBelegen: 0,
      nachLoeschBefehl: 0,
      undoVeraendert: 0,
      undoMehrBelege: 0,
    }
    fc.assert(
      fc.property(befehlsfolgeArbitrary({ profil: 'beleg' }), (folge) => {
        const db = neueTestDatenbank()
        try {
          const zustand = neuerZustand()
          let vorher = pruefen(db, 'vor der Folge', deckung)
          for (const [i, aktion] of folge.entries()) {
            const zweige: readonly Zweig[] = aktionAusfuehren(db, zustand, aktion)
            const nachher = pruefen(db, `nach Aktion ${i} (${aktion.art})`, deckung)
            if (nachher < vorher) {
              deckung.nachWenigerBelegen += 1
              if (zweige.includes('befehl:aussage_zitat.loeschen')) deckung.nachLoeschBefehl += 1
            }
            vorher = nachher
          }
          let schritt = 0
          while (undoZiel(db) !== undefined) {
            undo(db)
            const nachher = pruefen(db, `nach Undo-Schritt ${schritt}`, deckung)
            if (nachher !== vorher) deckung.undoVeraendert += 1
            if (nachher > vorher) deckung.undoMehrBelege += 1
            vorher = nachher
            schritt += 1
          }
        } finally {
          db.close()
        }
      }),
      { seed: SEED, numRuns: LAEUFE },
    )
    // Mindestzahlen: je die Hälfte des gemessenen Werts mit diesem Seed/`numRuns` (1096, 410, 144, 26,
    // 9, 107, 26), aufgerundet — Muster `NEUE_MINDESTTREFFER` in `undo-bitgleich.test.ts`. Fällt einer
    // darunter: Gewichte im Generator korrigieren, nie Seed oder Laufzahl (ADR-009-Nachtrag).
    expect(deckung.belegteFelder, 'Prüfungen an belegten Feldern').toBeGreaterThanOrEqual(548)
    expect(deckung.mehrereAussagenBelegt, 'Prüfungen an belegten Feldern mit mehreren Aussagen').toBeGreaterThanOrEqual(205)
    expect(deckung.spaetereAussageBelegt, 'Prüfungen mit Beleg an einer nicht ersten Aussage des Felds').toBeGreaterThanOrEqual(72)
    expect(deckung.nachWenigerBelegen, 'Schritte, nach denen die Personen-Belege weniger wurden').toBeGreaterThanOrEqual(13)
    expect(deckung.nachLoeschBefehl, 'davon über aussage_zitat.loeschen').toBeGreaterThanOrEqual(5)
    expect(deckung.undoVeraendert, 'Undo-Schritte, die die Personen-Belege verändern').toBeGreaterThanOrEqual(54)
    expect(deckung.undoMehrBelege, 'Undo-Schritte, die entfernte Belege zurückbringen').toBeGreaterThanOrEqual(13)
  }, 180_000)
  // it()-Timeout 180 s wie `undo-bitgleich`/`hauptname-detail-konsistent`: lokal (macOS) ~10 s.
})
