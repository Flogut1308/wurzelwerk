// AP-1.34 PR-C2b (F-07, §31 U-1.34-C2-O1): `abfrage:person.detail` liefert `warnungen` — die
// Bestandsregeln aus AP-1.8, beschränkt auf diese Person, mit Sprungziel {reiter, feld}. Eine
// Warnung blockiert nie (Vorgaben §1): sie entsteht nur beim Lesen.
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import type Database from 'better-sqlite3'
import { nachJdn } from '../../src/core/datum/kalender'
import { BESTAND_HINWEIS_CODES } from '../../src/core/plausibilitaet/regeln'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { fuehreAus } from '../../src/main/befehle/bus'
import { personDetail } from '../../src/main/abfragen/person-detail'
import { pruefhinweise } from '../../src/main/abfragen/pruefhinweise'
import { frischeDatenbankMitAbgeleitetemSchema } from './_hilfen-abgeleitet'
import { zufallsBestandAufbauen } from '../hilfsmittel/plausibilitaet-zufallsbestand'

type Db = Database.Database

const JDN = (jahr: number): number => nachJdn(jahr, 1, 1, 'gregorian')

// --- Rohes SQL (abgeleitetes Schema, Journal aus) für gezielte Einzelfälle -------------------

let zaehler = 0
function nid(praefix: string): string {
  zaehler += 1
  return `${praefix}-${String(zaehler).padStart(5, '0')}`
}

function person(db: Db, optionen: { readonly geschlecht?: 'M' | 'F'; readonly platzhalter?: boolean; readonly geburt?: number; readonly tod?: number } = {}): string {
  const id = nid('p')
  db.prepare(`INSERT INTO person (id, privat, ist_platzhalter, geschlecht) VALUES (@id, 0, @pl, @g)`).run({ id, pl: optionen.platzhalter === true ? 1 : 0, g: optionen.geschlecht ?? null })
  for (const [praedikat, jahr] of [['geburtsdatum', optionen.geburt], ['todesdatum', optionen.tod]] as const) {
    if (jahr === undefined) continue
    db.prepare(
      `INSERT INTO aussage (id, subjekt_typ, subjekt_id, praedikat, datum_sort_von, datum_sort_bis, ist_bevorzugt) VALUES (@a, 'person', @id, @praedikat, @von, @von, 1)`,
    ).run({ a: nid('a'), id, praedikat, von: JDN(jahr) })
  }
  return id
}

function eltern(db: Db, elternteilId: string, kindId: string): void {
  db.prepare(`INSERT INTO elternschaft (id, elternteil_id, kind_id, typ) VALUES (@id, @e, @k, 'biologisch')`).run({ id: nid('e'), e: elternteilId, k: kindId })
}

function ehe(db: Db, beginn: number, beteiligte: readonly string[]): void {
  const id = nid('ps')
  db.prepare(`INSERT INTO partnerschaft (id, typ, beginn_sort_von, beginn_sort_bis) VALUES (@id, 'ehe_zivil', @v, @v)`).run({ id, v: JDN(beginn) })
  for (const p of beteiligte) db.prepare(`INSERT INTO partnerschaft_person (partnerschaft_id, person_id) VALUES (@id, @p)`).run({ id, p })
}

function ereignisAmOrt(db: Db, typ: string, jahr: number, existiert: readonly [number, number] | undefined, beteiligte: readonly (readonly [string, string])[]): void {
  const ortId = nid('o')
  db.prepare(`INSERT INTO ort (id, existiert_von, existiert_bis) VALUES (@id, @v, @b)`).run({ id: ortId, v: existiert === undefined ? null : JDN(existiert[0]), b: existiert === undefined ? null : JDN(existiert[1]) })
  const id = nid('ev')
  db.prepare(`INSERT INTO ereignis (id, typ, ort_id, datum_sort_von, datum_sort_bis) VALUES (@id, @typ, @o, @v, @v)`).run({ id, typ, o: ortId, v: JDN(jahr) })
  for (const [p, rolle] of beteiligte) db.prepare(`INSERT INTO beteiligung (id, ereignis_id, person_id, rolle) VALUES (@id, @e, @p, @r)`).run({ id: nid('b'), e: id, p, r: rolle })
}

function codes(db: Db, personId: string): readonly string[] {
  return personDetail(db, { personId }).warnungen.map((w) => w.code)
}

function mitDb(fn: (db: Db) => void): void {
  const db = frischeDatenbankMitAbgeleitetemSchema()
  try {
    fn(db)
  } finally {
    db.close()
  }
}

describe('person.detail — Feldwarnungen (AP-1.34 PR-C2b)', () => {
  it('W0: eine unauffällige Person hat keine Warnungen', () => {
    mitDb((db) => {
      const p = person(db, { geburt: 1850, tod: 1920 })
      expect(personDetail(db, { personId: p }).warnungen).toEqual([])
    })
  })

  it('W1: tod_vor_geburt, alter_ueber_110 und bestattung_vor_tod am Todesdatum', () => {
    mitDb((db) => {
      const a = person(db, { geburt: 1900, tod: 1899 })
      expect(personDetail(db, { personId: a }).warnungen).toEqual([{ code: 'tod_vor_geburt', reiter: 'person', feld: 'todesdatum' }])
      const b = person(db, { geburt: 1800, tod: 1915 })
      expect(codes(db, b)).toEqual(['alter_ueber_110'])
      const c = person(db, { geburt: 1850, tod: 1920 })
      ereignisAmOrt(db, 'beerdigung', 1919, undefined, [[c, 'verstorbener']])
      expect(personDetail(db, { personId: c }).warnungen).toEqual([{ code: 'bestattung_vor_tod', reiter: 'person', feld: 'todesdatum' }])
    })
  })

  it('W2: mutter_alter / vater_alter am ELTERNTEIL (Reiter Beziehungen, Kinder), nicht am Kind', () => {
    mitDb((db) => {
      const mutter = person(db, { geschlecht: 'F', geburt: 1850 })
      const vater = person(db, { geschlecht: 'M', geburt: 1800 })
      const kind = person(db, { geburt: 1908 })
      eltern(db, mutter, kind)
      eltern(db, vater, kind)
      expect(personDetail(db, { personId: mutter }).warnungen).toEqual([{ code: 'mutter_alter', reiter: 'beziehungen', feld: 'kinder' }])
      expect(codes(db, vater)).toEqual(['vater_alter'])
      expect(codes(db, kind)).toEqual([])
      // Ein zweites Kind mit derselben Auffälligkeit ergibt eine zweite Warnung (Anzahl zählt).
      const kind2 = person(db, { geburt: 1910 })
      eltern(db, mutter, kind2)
      expect(codes(db, mutter)).toEqual(['mutter_alter', 'mutter_alter'])
    })
  })

  it('W3: kind_vor_ehe am KIND (Reiter Beziehungen, Eltern), nicht an den Eltern', () => {
    mitDb((db) => {
      const v = person(db, { geschlecht: 'M', geburt: 1850 })
      const m = person(db, { geschlecht: 'F', geburt: 1852 })
      const kind = person(db, { geburt: 1875 })
      eltern(db, v, kind)
      eltern(db, m, kind)
      ehe(db, 1880, [v, m])
      expect(personDetail(db, { personId: kind }).warnungen).toEqual([{ code: 'kind_vor_ehe', reiter: 'beziehungen', feld: 'eltern' }])
      expect(codes(db, v)).toEqual([])
      expect(codes(db, m)).toEqual([])
    })
  })

  it('W4: ereignis_vor_ortsexistenz an jeder beteiligten Person (Reiter Leben, Ereignisse)', () => {
    mitDb((db) => {
      const a = person(db)
      const b = person(db)
      const unbeteiligt = person(db)
      ereignisAmOrt(db, 'taufe', 1800, [1850, 1950], [[a, 'hauptperson'], [b, 'pate']])
      expect(personDetail(db, { personId: a }).warnungen).toEqual([{ code: 'ereignis_vor_ortsexistenz', reiter: 'leben', feld: 'ereignisse' }])
      expect(codes(db, b)).toEqual(['ereignis_vor_ortsexistenz'])
      expect(codes(db, unbeteiligt)).toEqual([])
      ereignisAmOrt(db, 'taufe', 1900, [1850, 1950], [[unbeteiligt, 'hauptperson']])
      expect(codes(db, unbeteiligt)).toEqual([])
    })
  })

  it('W4b: zyklus am Elternfeld, nur für Personen AUF dem Zyklus', () => {
    mitDb((db) => {
      const a = person(db)
      const b = person(db)
      const darunter = person(db)
      eltern(db, a, b)
      eltern(db, b, a)
      eltern(db, a, darunter)
      expect(personDetail(db, { personId: a }).warnungen).toEqual([{ code: 'zyklus', reiter: 'beziehungen', feld: 'eltern' }])
      expect(codes(db, b)).toEqual(['zyklus'])
      expect(codes(db, darunter)).toEqual([])
    })
  })

  it('W5: Platzhalter lösen nichts aus — weder als Person noch als Kind noch auf einer Zykluskante', () => {
    mitDb((db) => {
      const pl = person(db, { platzhalter: true, geburt: 1900, tod: 1800 })
      ereignisAmOrt(db, 'taufe', 1800, [1850, 1950], [[pl, 'hauptperson']])
      expect(codes(db, pl)).toEqual([])

      const mutter = person(db, { geschlecht: 'F', geburt: 1850 })
      const plKind = person(db, { platzhalter: true, geburt: 1855 })
      eltern(db, mutter, plKind)
      expect(codes(db, mutter)).toEqual([])

      const a = person(db)
      const plZyklus = person(db, { platzhalter: true })
      eltern(db, a, plZyklus)
      eltern(db, plZyklus, a)
      expect(codes(db, a)).toEqual([])
    })
  })

  it('W5b: Reihenfolge folgt der Regelreihenfolge, unabhängig vom Anlegen', () => {
    mitDb((db) => {
      const m = person(db, { geschlecht: 'F', geburt: 1900, tod: 1890 })
      ereignisAmOrt(db, 'taufe', 1800, [1850, 1950], [[m, 'hauptperson']])
      const kind = person(db, { geburt: 1905 })
      eltern(db, m, kind)
      expect(codes(db, m)).toEqual(['tod_vor_geburt', 'mutter_alter', 'ereignis_vor_ortsexistenz'])
    })
  })

  describe('W6: Konsistenz mit abfrage:pruefhinweise', () => {
    for (const seed of [11, 12, 13]) {
      it(`Zufallsbestand Seed ${seed}: je Person gleiche Multimenge, zyklus mindestens so viel`, () => {
        mitDb((db) => {
          const { personIds } = zufallsBestandAufbauen(db, seed)
          const gesamt = pruefhinweise(db).eintraege
          let summe = 0
          for (const personId of personIds) {
            const erwartet = gesamt.filter((h) => h.personId === personId)
            const warnungen = personDetail(db, { personId }).warnungen
            expect(
              warnungen.filter((w) => w.code !== 'zyklus').map((w) => w.code).sort(),
              personId,
            ).toEqual(erwartet.filter((h) => h.code !== 'zyklus').map((h) => h.code).sort())
            const zyklusErwartet = erwartet.filter((h) => h.code === 'zyklus').length
            const zyklusIst = warnungen.filter((w) => w.code === 'zyklus').length
            expect(zyklusIst, personId).toBeLessThanOrEqual(1)
            expect(zyklusIst, personId).toBeGreaterThanOrEqual(zyklusErwartet)
            summe += warnungen.length
          }
          expect(summe).toBeGreaterThan(10)
        })
      })
    }

    it('die Seeds 11–13 decken als Feldwarnung alle Hinweiscodes ab (hueter PR #121 H1)', () => {
      const gesehen = new Map<string, number>()
      for (const seed of [11, 12, 13]) {
        mitDb((db) => {
          const { personIds } = zufallsBestandAufbauen(db, seed)
          for (const personId of personIds) {
            for (const w of personDetail(db, { personId }).warnungen) gesehen.set(w.code, (gesehen.get(w.code) ?? 0) + 1)
          }
        })
      }
      for (const code of BESTAND_HINWEIS_CODES) expect(gesehen.get(code) ?? 0, code).toBeGreaterThan(0)
      // tod_vor_geburt entsteht sonst nur zufällig und selten — der Generator erzwingt es.
      expect(gesehen.get('tod_vor_geburt') ?? 0).toBeGreaterThanOrEqual(3 * 5)
    })
  })
})

// Vorarbeiten AP-1.30 Teil 3 (docs/80 §32, E5): Orts-Aussagen mit Datum im Altbestand (roh
// eingefügt — `aussage.anlegen`/`.aendern` lehnen sie seit Teil 2 ab) erscheinen als Prüfhinweis
// `ort_mit_datum`, je Aussage einer; Feld = das Feld des Prädikats, `wohnort` bei den Angaben.
describe('W8: ort_mit_datum (AP-1.30 Vorarbeiten Teil 3, E5)', () => {
  type Datumsteil = { readonly datum_kalender?: string; readonly datum_modifikator?: string; readonly datum_praezision?: string; readonly datum_wert1?: string; readonly datum_originaltext?: string; readonly datum_sort_von?: number; readonly datum_sort_bis?: number; readonly gueltig_von?: number; readonly gueltig_bis?: number }
  function ortsAussage(db: Db, personId: string, praedikat: string, teil: Datumsteil): void {
    db.prepare(
      `INSERT INTO aussage (id, subjekt_typ, subjekt_id, praedikat, wert_text, datum_kalender, datum_modifikator, datum_praezision, datum_wert1, datum_originaltext, datum_sort_von, datum_sort_bis, gueltig_von, gueltig_bis, ist_bevorzugt)
       VALUES (@id, 'person', @personId, @praedikat, 'Ortstext', @kal, @mod, @prae, @w1, @orig, @sv, @sb, @gv, @gb, 1)`,
    ).run({
      id: nid('a'),
      personId,
      praedikat,
      kal: teil.datum_kalender ?? null,
      mod: teil.datum_modifikator ?? null,
      prae: teil.datum_praezision ?? null,
      w1: teil.datum_wert1 ?? null,
      orig: teil.datum_originaltext ?? null,
      sv: teil.datum_sort_von ?? null,
      sb: teil.datum_sort_bis ?? null,
      gv: teil.gueltig_von ?? null,
      gb: teil.gueltig_bis ?? null,
    })
  }
  const VOLLES_DATUM: Datumsteil = { datum_kalender: 'gregorian', datum_modifikator: 'exakt', datum_praezision: 'jahr', datum_wert1: '1850', datum_sort_von: JDN(1850), datum_sort_bis: JDN(1851) - 1 }

  it('Orts-Aussagen mit Datum: je Aussage ein Hinweis, Feld des Prädikats (wohnort → Leben/Angaben)', () => {
    mitDb((db) => {
      const p = person(db)
      ortsAussage(db, p, 'geburtsort', VOLLES_DATUM)
      // Ein Bruchstück der Datumsgruppe (nur Originaltext) ist ebenfalls ein Datum.
      ortsAussage(db, p, 'todesort', { datum_originaltext: 'um 1900' })
      ortsAussage(db, p, 'wohnort', VOLLES_DATUM)
      expect(personDetail(db, { personId: p }).warnungen).toEqual([
        { code: 'ort_mit_datum', reiter: 'person', feld: 'geburtsort' },
        { code: 'ort_mit_datum', reiter: 'person', feld: 'todesort' },
        { code: 'ort_mit_datum', reiter: 'leben', feld: 'angaben' },
      ])
      expect(pruefhinweise(db).eintraege.filter((h) => h.personId === p).map((h) => h.code)).toEqual(['ort_mit_datum', 'ort_mit_datum', 'ort_mit_datum'])
    })
  })

  it('nur Personen-Aussagen zählen: eine Orts-Aussage mit Datum an einem anderen Subjekt gleicher Id erzeugt keinen Hinweis (hueter #145, 2a)', () => {
    mitDb((db) => {
      const p = person(db)
      // Gleiche subjekt_id wie die Person, aber subjekt_typ ereignis bzw. name: ohne den Subjekt-Filter
      // der Lader fiele der Hinweis fälschlich der Person zu.
      for (const subjektTyp of ['ereignis', 'name'] as const) {
        db.prepare(
          `INSERT INTO aussage (id, subjekt_typ, subjekt_id, praedikat, wert_text, datum_modifikator, datum_praezision, datum_wert1, ist_bevorzugt)
           VALUES (@id, @subjektTyp, @p, 'geburtsort', 'Ortstext', 'exakt', 'jahr', '1850', 1)`,
        ).run({ id: nid('a'), subjektTyp, p })
      }
      expect(personDetail(db, { personId: p }).warnungen.filter((w) => w.code === 'ort_mit_datum')).toEqual([])
      expect(pruefhinweise(db).eintraege.filter((h) => h.code === 'ort_mit_datum')).toEqual([])
    })
  })

  it('nur Gültigkeitszeitraum, anderes Prädikat mit Datum, Platzhalter: kein Hinweis', () => {
    mitDb((db) => {
      const p = person(db)
      ortsAussage(db, p, 'wohnort', { gueltig_von: JDN(1780), gueltig_bis: JDN(1795) })
      ortsAussage(db, p, 'geburtsort', {})
      ortsAussage(db, p, 'beruf', VOLLES_DATUM)
      const pl = person(db, { platzhalter: true })
      ortsAussage(db, pl, 'geburtsort', VOLLES_DATUM)
      expect(codes(db, p)).toEqual([])
      expect(codes(db, pl)).toEqual([])
      expect(pruefhinweise(db).eintraege.map((h) => h.code)).not.toContain('ort_mit_datum')
    })
  })
})

describe('W7: eine Warnung blockiert nie (Vorgaben §1)', () => {
  function neueDb(): Db {
    const db = oeffnen(':memory:')
    migrieren(db)
    return db
  }

  it('Todesdatum vor Geburtsdatum über den Befehlsbus: Erfolg, gespeichert, Warnung erscheint', () => {
    const db = neueDb()
    try {
      const personId = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat: 'geburtsdatum', wertText: '1900-05-01', datum: { modifikator: 'exakt', praezision: 'tag', wert1: '1900-05-01' }, konfidenz: 3 })
      const ergebnis = fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat: 'todesdatum', wertText: '1899-05-01', datum: { modifikator: 'exakt', praezision: 'tag', wert1: '1899-05-01' }, konfidenz: 3 })
      expect(typeof ergebnis.id).toBe('string')

      const detail = personDetail(db, { personId })
      expect(detail.grunddaten.some((f) => f.praedikat === 'todesdatum')).toBe(true)
      expect(detail.warnungen).toEqual([{ code: 'tod_vor_geburt', reiter: 'person', feld: 'todesdatum' }])
    } finally {
      db.close()
    }
  })

  it('Elternteil zu jung über elternschaft.anlegen: Erfolg, Kante gespeichert, Warnung am Elternteil', () => {
    const db = neueDb()
    try {
      const mutter = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0, geschlecht: 'F' }).id
      const kind = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 }).id
      fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: mutter, praedikat: 'geburtsdatum', wertText: '1900-01-01', datum: { modifikator: 'exakt', praezision: 'tag', wert1: '1900-01-01' }, konfidenz: 3 })
      fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: kind, praedikat: 'geburtsdatum', wertText: '1905-01-01', datum: { modifikator: 'exakt', praezision: 'tag', wert1: '1905-01-01' }, konfidenz: 3 })
      fuehreAus(db, 'elternschaft.anlegen', { elternteilId: mutter, kindId: kind, typ: 'biologisch', konfidenz: 3 })

      const detail = personDetail(db, { personId: mutter })
      expect(detail.beziehungen.some((b) => b.person_id === kind)).toBe(true)
      expect(detail.warnungen.map((w) => w.code)).toEqual(['mutter_alter'])
    } finally {
      db.close()
    }
  })
})
