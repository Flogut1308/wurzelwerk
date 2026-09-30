// A-02, AP-1.30 (Folgepunkt U-130-rufname-doppelt, docs/80 §33): Ein mehrwortiger `rufnameText`, der
// einer zusammenhängenden Wortfolge der Vornamen gleicht, ohne gültigen `rufnameIndex`, wird von
// `zerlegeName` (Regel 3, bitgleich zu Migration 0006 (c)) als ZUSÄTZLICHER Vorname angehängt:
// „Hans Peter" + Rufname „Hans Peter" → „Hans Peter Hans Peter". `zerlegeName` bleibt unverändert
// (offene Eigentümerfrage U-130-rufname-mehrteilig); stattdessen wird der Fall SICHTBAR abgewiesen:
//  - `name.anlegen`/`name.aendern` → eigener Fehlercode, nichts geschrieben, kein Journal;
//  - Import → Prüfhinweis mit Pfad und Zeile (Trockenlauf-Bericht == Bericht des echten Imports).
// Gegenfälle (dürfen NICHT abgewiesen werden): Teilwort-Treffer („Hans Peterson"), andere Reihenfolge
// („Peter Hans"), einwortiger Rufname (Regel 2 markiert ihn), gültiger Index (Regel 1 gewinnt).
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
import { fuehreAus } from '../../src/main/befehle/bus'
import { importAusfuehren } from '../../src/main/befehle/import-ausfuehren'
import { importTrockenlaufDurchfuehren } from '../../src/main/befehle/import-trockenlauf'
import { alsText } from '../../src/main/import/bericht'
import * as nameRepo from '../../src/main/repositories/name-repo'
import type { NameAnlegenEin } from '../../src/shared/schemata/befehle'
import { WurzelFehler } from '../../src/shared/fehler/wurzel-fehler'
import { journalAn, journalAus } from '../../src/main/journal/kontext'
import { flacheNameEinfuegen } from '../hilfsmittel/name-schreiben'

type Db = ReturnType<typeof oeffnen>

const FEHLERCODE = 'VALIDIERUNG_RUFNAME_VERDOPPELT'
// `string` statt Literaltyp: der Code ist vor dem Fix noch kein `ImpCode`.
const IMP_CODE: string = 'IMP-311'

function mitDb(fn: (db: Db) => void): void {
  const db = oeffnen(':memory:')
  try {
    migrieren(db)
    fn(db)
  } finally {
    db.close()
  }
}

function fehlercode(fn: () => unknown): string {
  try {
    fn()
    return 'KEIN_FEHLER'
  } catch (fehler) {
    return fehler instanceof WurzelFehler ? fehler.code : `KEIN_WURZELFEHLER:${String(fehler)}`
  }
}

function zaehle(db: Db, tabelle: 'name_form' | 'name_part' | 'transaktion' | 'aenderung'): number {
  return db.prepare<[], { readonly n: number }>(`SELECT COUNT(*) AS n FROM ${tabelle}`).get()?.n ?? -1
}

function stand(db: Db): readonly number[] {
  return [zaehle(db, 'name_form'), zaehle(db, 'name_part'), zaehle(db, 'transaktion'), zaehle(db, 'aenderung')]
}

interface Fall {
  readonly titel: string
  readonly vornamen: string
  readonly rufnameText: string
  readonly rufnameIndex?: number
}

/** Die Verdopplungsfälle aus #180 (dort rot gegen die stille Umdeutung), hier gegen die Abweisung. */
const VERDOPPELT: readonly Fall[] = [
  { titel: '„Hans Peter" + „Hans Peter"', vornamen: 'Hans Peter', rufnameText: 'Hans Peter' },
  { titel: '„Johann Georg Karl" + „Johann Georg"', vornamen: 'Johann Georg Karl', rufnameText: 'Johann Georg' },
  { titel: '„Karl Hans Peter" + „Hans Peter" (Folge am Ende)', vornamen: 'Karl Hans Peter', rufnameText: 'Hans Peter' },
  { titel: 'Leerraum wird normiert: „Hans  Peter" + „ Hans Peter "', vornamen: 'Hans  Peter', rufnameText: ' Hans Peter ' },
  { titel: 'Index außerhalb der Vornamen zählt nicht als gültig', vornamen: 'Hans Peter', rufnameText: 'Hans Peter', rufnameIndex: 7 },
]

/** Gegenfälle: bleiben wie auf main (kein Fehler). */
const ERLAUBT: readonly Fall[] = [
  { titel: 'Teilwort: „Hans Peterson" + „Hans Peter"', vornamen: 'Hans Peterson', rufnameText: 'Hans Peter' },
  { titel: 'andere Reihenfolge: „Peter Hans" + „Hans Peter"', vornamen: 'Peter Hans', rufnameText: 'Hans Peter' },
  { titel: 'einwortig: „Hans Peter" + „Peter"', vornamen: 'Hans Peter', rufnameText: 'Peter' },
  { titel: 'mit gültigem Index: „Hans Peter" + „Hans Peter", Index 0', vornamen: 'Hans Peter', rufnameText: 'Hans Peter', rufnameIndex: 0 },
  { titel: 'nicht in den Vornamen (Koseform): „Friedrich" + „Fritz"', vornamen: 'Friedrich', rufnameText: 'Fritz' },
  { titel: 'nicht in den Vornamen, mehrwortig: „Karl" + „Hans Peter"', vornamen: 'Karl', rufnameText: 'Hans Peter' },
]

function anlegenEin(personId: string, fall: Fall): NameAnlegenEin {
  return {
    personId,
    typ: 'geburtsname',
    vornamen: fall.vornamen,
    rufnameText: fall.rufnameText,
    nachname: 'Gutnow',
    ...(fall.rufnameIndex !== undefined ? { rufnameIndex: fall.rufnameIndex } : {}),
  }
}

describe('name.anlegen: mehrwortiger Rufname, der schon in den Vornamen steht (U-130-rufname-doppelt)', () => {
  for (const fall of VERDOPPELT) {
    it(`wird abgewiesen: ${fall.titel} → ${FEHLERCODE}, nichts geschrieben, kein Journal`, () => {
      mitDb((db) => {
        const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
        const vorher = stand(db)
        expect(fehlercode(() => fuehreAus(db, 'name.anlegen', anlegenEin(personId, fall)))).toBe(FEHLERCODE)
        expect(stand(db)).toEqual(vorher)
      })
    })
  }

  for (const fall of ERLAUBT) {
    it(`bleibt erlaubt: ${fall.titel}`, () => {
      mitDb((db) => {
        const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
        expect(fehlercode(() => fuehreAus(db, 'name.anlegen', anlegenEin(personId, fall)))).toBe('KEIN_FEHLER')
      })
    })
  }
})

describe('name.aendern: derselbe Fall darf nicht über das Ändern entstehen', () => {
  it(`eine Form „Hans Peter" ohne Rufname auf Rufname „Hans Peter" ändern → ${FEHLERCODE}, Form unverändert`, () => {
    mitDb((db) => {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Hans Peter', nachname: 'Gutnow' })
      const zeileVorher = nameRepo.lesen(db, id)
      const vorher = stand(db)
      expect(fehlercode(() => fuehreAus(db, 'name.aendern', { id, typ: 'geburtsname', vornamen: 'Hans Peter', rufnameText: 'Hans Peter', nachname: 'Gutnow' }))).toBe(FEHLERCODE)
      expect(stand(db)).toEqual(vorher)
      expect(nameRepo.lesen(db, id)).toEqual(zeileVorher)
    })
  })

  it('eine Altform „Hans Peter Hans Peter" (Migration 0006) bleibt über die Maske änderbar', () => {
    mitDb((db) => {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      journalAus(db, 'Test: Altform wie aus Migration 0006 (c) einfügen')
      const id = flacheNameEinfuegen(db, { personId, vornamen: 'Hans Peter', rufnameText: 'Hans Peter', nachname: 'Gutnow' })
      journalAn(db)
      const alt = nameRepo.lesen(db, id)
      expect(alt?.vornamen).toBe('Hans Peter Hans Peter')
      expect(alt?.rufname_index).toBe(2)
      // So schickt die Maske eine Altform mit angehängtem mehrwortigem Rufnamen zurück
      // (`rufnameFuerAenderung`, profil-bearbeiten-logik.ts): Vornamen ohne ihn + `rufnameText`.
      expect(fehlercode(() => fuehreAus(db, 'name.aendern', { id, typ: 'geburtsname', vornamen: 'Hans Peter', rufnameText: 'Hans Peter', nachname: 'Gutnau' }))).toBe('KEIN_FEHLER')
      const neu = nameRepo.lesen(db, id)
      expect(neu?.nachname).toBe('Gutnau')
      expect(neu?.vornamen).toBe('Hans Peter Hans Peter')
      expect(neu?.rufname_index).toBe(2)
    })
  })

  it('die Altform-Ausnahme gilt nur bei gleicher Wirkung: gleiche Rufname-Position, andere Vornamen → abgewiesen', () => {
    mitDb((db) => {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      // „Anna Berta" + angehängter Rufname „Carl Dora" (kein Verdopplungsfall, darum zulässig): Index 2.
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Anna Berta', rufnameText: 'Carl Dora', nachname: 'Gutnow' })
      expect(nameRepo.lesen(db, id)?.rufname_index).toBe(2)
      const zeileVorher = nameRepo.lesen(db, id)
      // Ergäbe „Carl Dora Carl Dora" mit Index 2 — gleiche Position, aber eine NEUE Verdopplung.
      expect(fehlercode(() => fuehreAus(db, 'name.aendern', { id, typ: 'geburtsname', vornamen: 'Carl Dora', rufnameText: 'Carl Dora', nachname: 'Gutnow' }))).toBe(FEHLERCODE)
      expect(nameRepo.lesen(db, id)).toEqual(zeileVorher)
    })
  })

  it('die Altform-Ausnahme gilt nur bei gleicher Wirkung: gleiche Kette und Position, anderer Rufname-Text → abgewiesen (hueter #184 P1)', () => {
    mitDb((db) => {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      // Vier einzelne Vornamen, Rufname „Hans" an Index 2: Kette „Hans Peter Hans Peter", Text „Hans".
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Hans Peter Hans Peter', rufnameIndex: 2, nachname: 'Gutnow' })
      const zeileVorher = nameRepo.lesen(db, id)
      expect(zeileVorher?.rufname_index).toBe(2)
      expect(zeileVorher?.rufname_text).toBe('Hans')
      const teileVorher = zaehle(db, 'name_part')
      // Ergäbe dieselbe Kette und Position 2, deutete den Rufnamen aber von „Hans" zu „Hans Peter" um.
      expect(fehlercode(() => fuehreAus(db, 'name.aendern', { id, typ: 'geburtsname', vornamen: 'Hans Peter', rufnameText: 'Hans Peter', nachname: 'Gutnow' }))).toBe(FEHLERCODE)
      expect(nameRepo.lesen(db, id)).toEqual(zeileVorher)
      expect(zaehle(db, 'name_part')).toBe(teileVorher)
    })
  })

  it('die Altform-Ausnahme gilt nur bei gleicher Wirkung: gleiche Vornamenkette, neue Rufname-Position → abgewiesen', () => {
    mitDb((db) => {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      // Vier einzelne Vornamen ohne Rufname: Kette „Hans Peter Hans Peter", Index null.
      const { id } = fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Hans Peter Hans Peter', nachname: 'Gutnow' })
      const zeileVorher = nameRepo.lesen(db, id)
      expect(zeileVorher?.rufname_index).toBeNull()
      // Ergäbe dieselbe Kette, aber mit einem neu angehängten Rufnamen an Position 2.
      expect(fehlercode(() => fuehreAus(db, 'name.aendern', { id, typ: 'geburtsname', vornamen: 'Hans Peter', rufnameText: 'Hans Peter', nachname: 'Gutnow' }))).toBe(FEHLERCODE)
      expect(nameRepo.lesen(db, id)).toEqual(zeileVorher)
    })
  })
})

function importDatei(namen: readonly Record<string, unknown>[]): unknown {
  return {
    vertrag: 'wurzelwerk-import/v1',
    erzeugt: { am: '2026-09-30', werkzeug: 'test' },
    zusammenfassung: { personen: 1, notizen_unverarbeitet: 0 },
    quellen: [{ id: 'tmp:q1', typ: 'sonstiges', titel: 'Testquelle Rufname' }],
    personen: [
      {
        id: 'tmp:p1',
        geschlecht: 'M',
        lebend_status: 'verstorben',
        namen,
        konfidenz: 4,
        belege: [{ quelle: 'tmp:q1', konfidenz: 4 }],
      },
    ],
    notizen_unverarbeitet: [],
  }
}

describe('Import: derselbe Fall ergibt einen Prüfhinweis mit Pfad und Zeile', () => {
  let ordnerA: string
  let ordnerB: string

  beforeEach(() => {
    ordnerA = mkdtempSync(join(tmpdir(), 'wurzelwerk-rufname-a-'))
    ordnerB = mkdtempSync(join(tmpdir(), 'wurzelwerk-rufname-b-'))
  })

  afterEach(() => {
    rmSync(ordnerA, { recursive: true, force: true })
    rmSync(ordnerB, { recursive: true, force: true })
  })

  function berichte(datei: unknown): { readonly trocken: ReturnType<typeof importTrockenlaufDurchfuehren>; readonly echt: ReturnType<typeof importAusfuehren> } {
    const pfad = join(ordnerA, 'import.json')
    writeFileSync(pfad, JSON.stringify(datei, null, 2), 'utf8')
    const dbA = oeffnen(join(ordnerA, 'baum.sqlite'))
    const dbB = oeffnen(join(ordnerB, 'baum.sqlite'))
    try {
      migrieren(dbA)
      migrieren(dbB)
      const trocken = importTrockenlaufDurchfuehren(dbA, pfad)
      const echt = importAusfuehren(dbB, { pfad })
      return { trocken, echt }
    } finally {
      dbA.close()
      dbB.close()
    }
  }

  it(`„Hans Peter" + rufname_text „Hans Peter" → ${IMP_CODE} an personen[0].namen[1] mit Zeile; Trockenlauf == echter Import`, () => {
    const { trocken, echt } = berichte(
      importDatei([
        { typ: 'geburtsname', vornamen: 'Karl', nachname: 'Gutnow', ist_bevorzugt: true },
        { typ: 'sonstiges', vornamen: 'Hans Peter', rufname_text: 'Hans Peter', nachname: 'Gutnow' },
      ]),
    )
    // Ein Hinweis, kein Fehler: die Datei bleibt importierbar (Vertrag v1, docs/import-vertrag.md §4).
    expect(trocken.fehler).toEqual([])
    expect(trocken.importGesperrt).toBe(false)
    const treffer = trocken.hinweise.filter((befund) => befund.code === IMP_CODE)
    expect(treffer).toHaveLength(1)
    expect(treffer[0]?.pfad).toBe('personen[0].namen[1]')
    expect(treffer[0]?.kennung).toBe('tmp:p1')
    expect(treffer[0]?.zeile).toBeGreaterThan(0)
    expect(echt).toEqual(trocken)
    expect(alsText(echt)).toBe(alsText(trocken))
    // Datenschutz (CLAUDE.md §7): der Berichtseintrag trägt keinen Namensinhalt.
    expect(JSON.stringify(treffer)).not.toContain('Hans')
  })

  it('Gegenfälle ergeben keinen Hinweis (Teilwort, andere Reihenfolge, einwortig, gültiger Index)', () => {
    const { trocken, echt } = berichte(
      importDatei([
        { typ: 'geburtsname', vornamen: 'Hans Peterson', rufname_text: 'Hans Peter', nachname: 'Gutnow', ist_bevorzugt: true },
        { typ: 'sonstiges', vornamen: 'Peter Hans', rufname_text: 'Hans Peter', nachname: 'Gutnow' },
        { typ: 'sonstiges', vornamen: 'Hans Peter', rufname_text: 'Peter', nachname: 'Gutnow' },
        { typ: 'sonstiges', vornamen: 'Hans Peter', rufname_text: 'Hans Peter', rufname_index: 0, nachname: 'Gutnow' },
      ]),
    )
    // Ohne diese Zusicherung wäre der Gegenfall leer grün, wenn die Datei schon an Stufe 1/2 scheitert.
    expect(trocken.fehler).toEqual([])
    expect(trocken.hinweise.filter((befund) => befund.code === IMP_CODE)).toEqual([])
    expect(echt).toEqual(trocken)
  })
})
