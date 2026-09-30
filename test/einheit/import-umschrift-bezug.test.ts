// A-19, AP-1.30 (U-130-import-umschrift-vorwaerts, U-130-umschrift-bestand, U-130-11-0b-selbstbezug-fts;
// docs/80 §33): `umschrift_von` ist der Index des Originals im `namen`-Array derselben Person
// (docs/import-vertrag.md §3.3). Vor dem Fix:
//  1. Selbstbezug (`umschrift_von` = eigener Index) wurde still geschrieben (Schema nur `int().min(0)`),
//     der Trigger `abl_name_form_ai` erzeugte einen Überschuss in der FTS-Spaltensumme;
//  2. ein Index außerhalb des Arrays wurde still zu NULL;
//  3. ein Vorwärtsbezug (Umschrift steht vor ihrem Original) brach den ganzen Import mit
//     `FOREIGN KEY constraint failed` ab, obwohl der Vertrag keine Reihenfolge vorschreibt;
//  4. ein Kreis (a→b, b→a) war über 3 unerreichbar, wird mit dem Fix von 3 erreichbar.
// Erwartet: 1, 2 und 4 → Stufe-2-Befund IMP-210 (eigener Stufe-2-Code, Review #211 H1/H2) am Pfad `personen[i].namen[j].umschrift_von`, nichts
// geschrieben, Trockenlauf == echter Import; 3 wird importiert, Bezug und Reihenfolge wie in der Datei,
// abgeleitete Tabellen gleich dem Neuaufbau, FTS5 `integrity-check` ok, FTS-Spaltensumme = docsize.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { alleAbgeleitetenNeuAufbauen } from '../../src/main/datenbank/trigger'
import { importAusfuehren } from '../../src/main/befehle/import-ausfuehren'
import { importTrockenlaufDurchfuehren } from '../../src/main/befehle/import-trockenlauf'
import { undo } from '../../src/main/journal/undo'
import type { Trockenlaufbericht } from '../../src/shared/import/trockenlauf-bericht'
import { kanonischerAbzug } from '../hilfsmittel/kanonischer-abzug'
import { sucheFtsInhaltAbzug, verwaisteFtsEintraegeAnzahl } from './_hilfen-abgeleitet'

type Db = ReturnType<typeof oeffnen>
type NameEintrag = Readonly<Record<string, unknown>>

/** Eine Importdatei mit je einer Person `tmp:p1`, `tmp:p2`, … pro Namensliste. */
function importDatei(...namenJePerson: readonly (readonly NameEintrag[])[]): unknown {
  return {
    vertrag: 'wurzelwerk-import/v1',
    erzeugt: { am: '2026-09-30', werkzeug: 'test' },
    zusammenfassung: { personen: namenJePerson.length, notizen_unverarbeitet: 0 },
    quellen: [{ id: 'tmp:q1', typ: 'sonstiges', titel: 'Testquelle Umschrift' }],
    personen: namenJePerson.map((namen, i) => ({
      id: `tmp:p${i + 1}`,
      geschlecht: 'F',
      lebend_status: 'verstorben',
      namen,
      konfidenz: 4,
      belege: [{ quelle: 'tmp:q1', konfidenz: 4 }],
    })),
    notizen_unverarbeitet: [],
  }
}

const ORIGINAL: NameEintrag = { typ: 'geburtsname', schrift: 'cyrl', vornamen: 'Ольга', nachname: 'Щербакова', original_text: 'Ольга Щербакова', ist_bevorzugt: true }

function umschrift(von: number, text = 'Olga Scherbakowa'): NameEintrag {
  const [vornamen, nachname] = text.split(' ')
  return { typ: 'transliteriert', schrift: 'latn', vornamen, nachname, original_text: text, umschrift_von: von, umschrift_norm: 'iso9' }
}

function zaehle(db: Db, tabelle: 'person' | 'name_form' | 'name_part' | 'transaktion' | 'aenderung'): number {
  return db.prepare<[], { readonly n: number }>(`SELECT COUNT(*) AS n FROM ${tabelle}`).get()?.n ?? -1
}

interface FormZeile {
  readonly id: string
  readonly umschrift_von: string | null
  readonly sortier_index: number | null
  readonly original_text: string | null
}

/** Die Formen in Lesereihenfolge (`ORDER BY id`, wie `person-detail.ts`/`name-form-repo.ts` hinter `ist_bevorzugt`). */
function formen(db: Db): readonly FormZeile[] {
  return db.prepare<[], FormZeile>('SELECT id, umschrift_von, sortier_index, original_text FROM name_form ORDER BY id').all()
}

/** Dekodiert die FTS5-Varints (Zähler/Spaltensummen im `_data`-Datensatz 1 bzw. `_docsize.sz`). */
function varints(block: Buffer): readonly number[] {
  const werte: number[] = []
  let i = 0
  while (i < block.length) {
    let wert = 0
    let byte = 0
    let n = 0
    do {
      byte = block[i] ?? 0
      i += 1
      n += 1
      if (n === 9) {
        wert = wert * 256 + byte
        break
      }
      wert = wert * 128 + (byte & 0x7f)
    } while ((byte & 0x80) !== 0)
    werte.push(wert)
  }
  return werte
}

/** Gespeicherte FTS-Summen (Zeilenzahl + Token je Spalte) gegen die Summe der docsize-Zeilen. */
function ftsSummen(db: Db): { readonly ist: readonly number[]; readonly soll: readonly number[] } {
  const avg = db.prepare<[], { readonly block: Buffer }>('SELECT block FROM suche_fts_data WHERE id = 1').get()
  const ist = avg === undefined ? [] : varints(avg.block)
  const zeilen = db.prepare<[], { readonly sz: Buffer }>('SELECT sz FROM suche_fts_docsize').all()
  const soll: number[] = [zeilen.length]
  for (const zeile of zeilen) {
    varints(zeile.sz).forEach((wert, spalte) => {
      soll[spalte + 1] = (soll[spalte + 1] ?? 0) + wert
    })
  }
  while (soll.length < ist.length) soll.push(0)
  return { ist, soll }
}

function abgeleitetAbzug(db: Db): string {
  db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS vocab USING fts5vocab('suche_fts', 'instance')")
  const fts = sucheFtsInhaltAbzug(db)
  const verwaist = verwaisteFtsEintraegeAnzahl(db)
  db.exec('DROP TABLE vocab')
  const flach = db.prepare('SELECT person_id, anzeigename, sortier_nachname, sortier_vornamen FROM person_flach ORDER BY person_id').all()
  const phonetik = db.prepare('SELECT name_id, verfahren, code FROM name_phonetik ORDER BY name_id, verfahren').all()
  return JSON.stringify({ fts, verwaist, flach, phonetik })
}

function erwarteIndexIntakt(db: Db): void {
  expect(() => db.exec("INSERT INTO suche_fts (suche_fts, rank) VALUES ('integrity-check', 0)")).not.toThrow()
  expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
  const summen = ftsSummen(db)
  expect(summen.ist).toEqual(summen.soll)
  const inkrementell = abgeleitetAbzug(db)
  alleAbgeleitetenNeuAufbauen(db)
  expect(abgeleitetAbzug(db)).toBe(inkrementell)
}

describe('Import: Validierung und Schreibfolge von umschrift_von (A-19)', () => {
  let ordnerA: string
  let ordnerB: string

  beforeEach(() => {
    ordnerA = mkdtempSync(join(tmpdir(), 'wurzelwerk-umschrift-a-'))
    ordnerB = mkdtempSync(join(tmpdir(), 'wurzelwerk-umschrift-b-'))
  })

  afterEach(() => {
    rmSync(ordnerA, { recursive: true, force: true })
    rmSync(ordnerB, { recursive: true, force: true })
  })

  /** Trockenlauf auf Datenbank A, echter Import auf Datenbank B (beide frisch); `pruefe` sieht B danach. */
  function importiere(
    namen: readonly NameEintrag[],
    pruefe: (db: Db, trocken: Trockenlaufbericht, echt: Trockenlaufbericht, vorher: string) => void,
    datei: unknown = importDatei(namen),
  ): void {
    const pfad = join(ordnerA, 'import.json')
    writeFileSync(pfad, JSON.stringify(datei, null, 2), 'utf8')
    const dbA = oeffnen(join(ordnerA, 'baum.sqlite'))
    const dbB = oeffnen(join(ordnerB, 'baum.sqlite'))
    try {
      migrieren(dbA)
      migrieren(dbB)
      const vorher = kanonischerAbzug(dbB)
      const trocken = importTrockenlaufDurchfuehren(dbA, pfad)
      const echt = importAusfuehren(dbB, { pfad })
      pruefe(dbB, trocken, echt, vorher)
    } finally {
      dbA.close()
      dbB.close()
    }
  }

  function erwarteAbgewiesen(namen: readonly NameEintrag[], pfade: readonly string[], datei?: unknown, kennung = 'tmp:p1'): void {
    importiere(
      namen,
      (db, trocken, echt) => {
        expect(trocken.importGesperrt).toBe(true)
        expect(trocken.fehler.map((befund) => [befund.code, befund.pfad, befund.kennung])).toEqual(pfade.map((pfad) => ['IMP-210', pfad, kennung]))
        for (const befund of trocken.fehler) expect(befund.zeile).toBeGreaterThan(0)
        expect(echt).toEqual(trocken)
        expect([zaehle(db, 'person'), zaehle(db, 'name_form'), zaehle(db, 'name_part'), zaehle(db, 'transaktion'), zaehle(db, 'aenderung')]).toEqual([0, 0, 0, 0, 0])
      },
      datei ?? importDatei(namen),
    )
  }

  it('Selbstbezug → IMP-210 an personen[0].namen[1].umschrift_von, nichts geschrieben, Trockenlauf == Import', () => {
    erwarteAbgewiesen([ORIGINAL, umschrift(1)], ['personen[0].namen[1].umschrift_von'])
  })

  it('Selbstbezug an einer einzigen Form → IMP-210', () => {
    erwarteAbgewiesen([{ ...umschrift(0), ist_bevorzugt: true }], ['personen[0].namen[0].umschrift_von'])
  })

  it('Index außerhalb des namen-Arrays → IMP-210 statt stillem NULL', () => {
    erwarteAbgewiesen([ORIGINAL, umschrift(2)], ['personen[0].namen[1].umschrift_von'])
  })

  it('Kreis a→b, b→a → genau ein IMP-210 (am kleinsten Index des Kreises)', () => {
    erwarteAbgewiesen([{ ...ORIGINAL, umschrift_von: 1, umschrift_norm: 'manuell' }, umschrift(0)], ['personen[0].namen[0].umschrift_von'])
  })

  it('Kreis über drei Formen, dazu eine Form, die in den Kreis zeigt → ein IMP-210 je Kreis', () => {
    erwarteAbgewiesen([umschrift(1, 'A a'), umschrift(2, 'B b'), umschrift(0, 'C c'), umschrift(1, 'D d'), ORIGINAL], ['personen[0].namen[0].umschrift_von'])
  })

  it('Kreis mit Einstieg ungleich Minimum [0→3, 1→2, 2→3, 3→1] → genau ein IMP-210 an namen[1] (Kreis {1,2,3})', () => {
    // Die Kettensuche startet bei 0 und erreicht den Kreis über 3 — der erste Kreisindex der Kette ist
    // 3, der kleinste 1. Tötet den Mutanten `kreis[0]` statt `Math.min(...kreis)` (Review #211 H3).
    erwarteAbgewiesen([umschrift(3, 'A a'), umschrift(2, 'B b'), umschrift(3, 'C c'), umschrift(1, 'D d')], ['personen[0].namen[1].umschrift_von'])
  })

  it('Index nur im namen-Array einer ANDEREN Person gültig → IMP-210, kein personenübergreifender Bezug', () => {
    // tmp:p1 hat zwei Namen, Index 2 gibt es nur bei tmp:p2 (drei Namen). Review #211 H6.
    const p1 = [ORIGINAL, umschrift(2)]
    const p2 = [{ typ: 'geburtsname', nachname: 'Petrowa', ist_bevorzugt: true }, { typ: 'ehename', nachname: 'Iwanowa' }, { typ: 'sonstiges', nachname: 'Smirnowa' }]
    erwarteAbgewiesen(p1, ['personen[0].namen[1].umschrift_von'], importDatei(p1, p2))
  })

  it('Index im namen-Array der zweiten Person geprüft, nicht im Array der ersten', () => {
    // Spiegelfall zu H6: tmp:p2 verweist auf Index 2, den nur tmp:p1 hat.
    const p1 = [{ typ: 'geburtsname', nachname: 'Petrowa', ist_bevorzugt: true }, { typ: 'ehename', nachname: 'Iwanowa' }, { typ: 'sonstiges', nachname: 'Smirnowa' }]
    const p2 = [ORIGINAL, umschrift(2)]
    erwarteAbgewiesen(p2, ['personen[1].namen[1].umschrift_von'], importDatei(p1, p2), 'tmp:p2')
  })

  it('Schreibfolge: jedes Original vor seiner Umschrift, sonst Dateireihenfolge (Journal-Reihenfolge gepinnt)', () => {
    // [0]→2, [1]→0, [2]→4, [3], [4], [5]→1: Kette ab 0 ist 0→2→4 (geschrieben 4, 2, 0), dann 1, 3, 5.
    const namen = [umschrift(2, 'A a'), umschrift(0, 'B b'), umschrift(4, 'C c'), { typ: 'ehename', nachname: 'D', original_text: 'D' }, { ...ORIGINAL, original_text: 'E' }, umschrift(1, 'F f')]
    importiere(namen, (db, trocken) => {
      expect(trocken.fehler).toEqual([])
      const folge = db
        .prepare<[], { readonly original_text: string | null }>(
          `SELECT json_extract(wert_neu_json, '$.original_text') AS original_text FROM aenderung WHERE tabelle = 'name_form' AND operation = 'insert' ORDER BY reihenfolge`,
        )
        .all()
        .map((z) => z.original_text)
      expect(folge).toEqual(['E', 'C c', 'A a', 'B b', 'D', 'F f'])
      expect(formen(db).map((z) => z.original_text)).toEqual(['A a', 'B b', 'C c', 'D', 'E', 'F f'])
      erwarteIndexIntakt(db)
    })
  })

  it('Vorwärtsbezug wird importiert: Bezug, Reihenfolge und sortier_index wie in der Datei, Index intakt, Undo geht', () => {
    // Datei-Reihenfolge: [0] Umschrift von [1], [1] Umschrift von [3], [2] Ehename ohne Bezug, [3] Original.
    const namen = [umschrift(1, 'Olga Scherbakowa'), umschrift(3, 'Olga Ščerbakova'), { typ: 'ehename', nachname: 'Petrowa' }, ORIGINAL]
    importiere(namen, (db, trocken, echt, vorher) => {
      expect(trocken.fehler).toEqual([])
      expect(trocken.importGesperrt).toBe(false)
      expect(echt).toEqual(trocken)

      const zeilen = formen(db)
      expect(zeilen.map((z) => z.original_text)).toEqual(['Olga Scherbakowa', 'Olga Ščerbakova', 'Petrowa', 'Ольга Щербакова'])
      const [a, b, c, d] = zeilen
      if (a === undefined || b === undefined || c === undefined || d === undefined) throw new Error('vier Formen erwartet')
      expect([a.umschrift_von, b.umschrift_von, c.umschrift_von, d.umschrift_von]).toEqual([b.id, d.id, null, null])
      // Der Import setzt `sortier_index` nicht (auch nicht beim Rückwärtsbezug) — die Lesereihenfolge
      // trägt die ID (UUID v7 in Dateireihenfolge vergeben).
      expect(zeilen.map((z) => z.sortier_index)).toEqual([null, null, null, null])
      erwarteIndexIntakt(db)

      undo(db)
      expect(zaehle(db, 'name_form')).toBe(0)
      expect(kanonischerAbzug(db)).toBe(vorher)
      erwarteIndexIntakt(db)
    })
  })

  it('Gegenprobe: Rückwärtsbezug wird wie bisher importiert, Index intakt', () => {
    importiere([ORIGINAL, umschrift(0)], (db, trocken, echt) => {
      expect(trocken.fehler).toEqual([])
      expect(echt).toEqual(trocken)
      const [original, kopie] = formen(db)
      if (original === undefined || kopie === undefined) throw new Error('zwei Formen erwartet')
      expect(original.original_text).toBe('Ольга Щербакова')
      expect([original.umschrift_von, kopie.umschrift_von]).toEqual([null, original.id])
      expect([original.sortier_index, kopie.sortier_index]).toEqual([null, null])
      erwarteIndexIntakt(db)
    })
  })

  it('ohne Umschrift: FTS-Spaltensumme = Summe aus docsize nach dem Import', () => {
    importiere([ORIGINAL, { typ: 'ehename', nachname: 'Petrowa' }], (db, trocken) => {
      expect(trocken.fehler).toEqual([])
      erwarteIndexIntakt(db)
    })
  })
})
