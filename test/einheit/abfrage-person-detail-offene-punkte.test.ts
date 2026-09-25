// AP-1.34 PR-C2c (Vorgaben §5.5, §31 U-1.34-C2-O2…O5, E6/E7/E8): `abfrage:person.detail` liefert
// `offene_punkte` — über den echten Befehlsbus, damit Eingaben genau so entstehen wie in der UI.
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
import { personDetail } from '../../src/main/abfragen/person-detail'
import type { PersonDetailOffenerPunkt } from '../../src/shared/schemata/person-detail'

type Db = ReturnType<typeof oeffnen>

function mitDb(fn: (db: Db) => void): void {
  const db = oeffnen(':memory:')
  try {
    migrieren(db)
    fn(db)
  } finally {
    db.close()
  }
}

interface PersonOptionen {
  readonly geschlecht?: 'M' | 'F' | 'U' | 'X'
  readonly lebendStatus?: 'lebend' | 'verstorben' | 'vermutet_verstorben'
  readonly platzhalter?: boolean
}

function person(db: Db, o: PersonOptionen = {}): string {
  return fuehreAus(db, 'person.anlegen', {
    privat: 0,
    ist_platzhalter: o.platzhalter === true ? 1 : 0,
    ...(o.platzhalter === true ? { platzhalter_grund: 'unbekannt' as const } : {}),
    ...(o.geschlecht !== undefined ? { geschlecht: o.geschlecht } : {}),
    ...(o.lebendStatus !== undefined ? { lebend_status: o.lebendStatus } : {}),
  }).id
}

function eltern(db: Db, elternteilId: string, kindId: string, typ: 'biologisch' | 'adoptiv' | 'stief' = 'biologisch'): void {
  fuehreAus(db, 'elternschaft.anlegen', { elternteilId, kindId, typ, konfidenz: 3 })
}

function partnerschaft(db: Db, a: string, b: string): void {
  fuehreAus(db, 'partnerschaft.anlegen', {
    typ: 'ehe_zivil',
    beteiligte: [
      { personId: a, rolle: 'ehepartner' },
      { personId: b, rolle: 'ehepartner' },
    ],
    konfidenz: 3,
  })
}

/** Person mit Vater und Mutter — ohne weitere offene Punkte. */
function vollstaendig(db: Db, o: PersonOptionen = {}): string {
  const p = person(db, o)
  eltern(db, person(db, { geschlecht: 'M' }), p)
  eltern(db, person(db, { geschlecht: 'F' }), p)
  return p
}

function punkte(db: Db, personId: string): readonly PersonDetailOffenerPunkt[] {
  return personDetail(db, { personId }).offene_punkte
}

function kurz(db: Db, personId: string): readonly string[] {
  return punkte(db, personId).map((p) => `${p.regel_id}:${p.meldungsschluessel}:${p.reiter}/${p.feld}:${p.bezug_id ?? '-'}`)
}

function datum(db: Db, personId: string, praedikat: 'geburtsdatum' | 'todesdatum', tag: string): void {
  fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat, wertText: tag, datum: { modifikator: 'exakt', praezision: 'tag', wert1: tag }, konfidenz: 3 })
}

describe('person.detail — offene Punkte (AP-1.34 PR-C2c)', () => {
  it('O0: Person mit Vater und Mutter, lebend, ohne Kinder hat keine offenen Punkte (kein_portraet inaktiv)', () => {
    mitDb((db) => {
      expect(punkte(db, vollstaendig(db, { lebendStatus: 'lebend' }))).toEqual([])
    })
  })

  it('O1: sterbeort_fehlt bei verstorben ohne Sterbeort, nicht bei vermutet_verstorben, nicht mit Sterbeort', () => {
    mitDb((db) => {
      const tot = vollstaendig(db, { lebendStatus: 'verstorben' })
      expect(punkte(db, tot)).toEqual([
        { regel_id: 'sterbeort_fehlt', reiter: 'person', feld: 'todesort', meldungsschluessel: 'offener_punkt_sterbeort_fehlt', bezug_id: null },
      ])
      expect(punkte(db, vollstaendig(db, { lebendStatus: 'vermutet_verstorben' }))).toEqual([])
      const ortId = fuehreAus(db, 'ort.anlegen', { name: 'Sterbedorf', typ: 'dorf' }).id
      fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: tot, praedikat: 'todesort', wertRefId: ortId, konfidenz: 3 })
      expect(punkte(db, tot)).toEqual([])
    })
  })

  it('O2: Elternplätze — Schlüssel je leerem Platz, jeder Typ zählt, Platzhalter-Elternteil zählt', () => {
    mitDb((db) => {
      expect(kurz(db, person(db))).toEqual([
        'elternteil_nicht_zugeordnet:offener_punkt_vater_nicht_zugeordnet:beziehungen/eltern:-',
        'elternteil_nicht_zugeordnet:offener_punkt_mutter_nicht_zugeordnet:beziehungen/eltern:-',
      ])
      const nurVater = person(db)
      eltern(db, person(db, { geschlecht: 'M' }), nurVater, 'adoptiv')
      expect(kurz(db, nurVater)).toEqual(['elternteil_nicht_zugeordnet:offener_punkt_mutter_nicht_zugeordnet:beziehungen/eltern:-'])
      const nurU = person(db)
      eltern(db, person(db, { geschlecht: 'U' }), nurU)
      expect(kurz(db, nurU)).toEqual(['elternteil_nicht_zugeordnet:offener_punkt_elternteil_nicht_zugeordnet:beziehungen/eltern:-'])
      const zweiMuetter = person(db)
      eltern(db, person(db, { geschlecht: 'F' }), zweiMuetter)
      eltern(db, person(db, { geschlecht: 'F' }), zweiMuetter, 'stief')
      expect(punkte(db, zweiMuetter)).toEqual([])
      const mitPlatzhalter = person(db)
      eltern(db, person(db, { geschlecht: 'M' }), mitPlatzhalter)
      eltern(db, person(db, { platzhalter: true }), mitPlatzhalter)
      expect(punkte(db, mitPlatzhalter)).toEqual([])
    })
  })

  it('O3: kind_ohne_partnerschaft streng, ein Punkt je Kind mit bezug_id', () => {
    mitDb((db) => {
      const p = vollstaendig(db, { geschlecht: 'M' })
      const partnerin = person(db, { geschlecht: 'F' })
      partnerschaft(db, p, partnerin)
      const kindMit = person(db)
      eltern(db, p, kindMit)
      eltern(db, partnerin, kindMit)
      expect(punkte(db, p)).toEqual([])

      const kindAllein = person(db)
      eltern(db, p, kindAllein)
      const andere = person(db, { geschlecht: 'F' })
      const kindAndere = person(db)
      eltern(db, p, kindAndere)
      eltern(db, andere, kindAndere)
      const kindPlatzhalter = person(db, { platzhalter: true })
      eltern(db, p, kindPlatzhalter)

      const erwartet = [kindAllein, kindAndere].sort()
      expect(punkte(db, p).map((x) => [x.regel_id, x.reiter, x.feld, x.bezug_id])).toEqual(erwartet.map((k) => ['kind_ohne_partnerschaft', 'beziehungen', 'kinder', k]))
    })
  })

  it('O4: widerspruch_vorhanden aus zwei Aussagen (ungelöst) und aus einer Feldwarnung, je Feld zusammengefasst', () => {
    mitDb((db) => {
      const p = vollstaendig(db, { lebendStatus: 'lebend' })
      fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: p, praedikat: 'beruf', wertText: 'Müller', konfidenz: 2 })
      fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: p, praedikat: 'beruf', wertText: 'Bäcker', konfidenz: 2 })
      expect(kurz(db, p)).toEqual(['widerspruch_vorhanden:offener_punkt_widerspruch_vorhanden:leben/angaben:-'])

      const q = vollstaendig(db, { lebendStatus: 'lebend' })
      datum(db, q, 'geburtsdatum', '1900-05-01')
      datum(db, q, 'todesdatum', '1890-05-01')
      expect(personDetail(db, { personId: q }).warnungen.map((w) => w.code)).toContain('tod_vor_geburt')
      expect(kurz(db, q)).toEqual(['widerspruch_vorhanden:offener_punkt_widerspruch_vorhanden:person/todesdatum:-'])

      // Zweites, abweichendes Todesdatum ohne Bevorzugung: Aussage-Widerspruch UND Feldwarnung am
      // selben Feld ergeben EINEN Punkt.
      datum(db, q, 'todesdatum', '1880-05-01')
      expect(kurz(db, q)).toEqual(['widerspruch_vorhanden:offener_punkt_widerspruch_vorhanden:person/todesdatum:-'])
    })
  })

  it('O5: aufgelöster Widerspruch (eine Aussage bevorzugt) meldet nichts', () => {
    mitDb((db) => {
      const p = vollstaendig(db)
      fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: p, praedikat: 'beruf', wertText: 'Müller', konfidenz: 2, istBevorzugt: 1 })
      fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: p, praedikat: 'beruf', wertText: 'Bäcker', konfidenz: 2 })
      expect(punkte(db, p)).toEqual([])
    })
  })

  it('O8: bei inaktiver Regel kein_portraet fragt person.detail medium_zuordnung gar nicht ab (hueter-H3)', () => {
    mitDb((db) => {
      const p = vollstaendig(db)
      const prepare = vi.spyOn(db, 'prepare')
      try {
        expect(punkte(db, p)).toEqual([])
        expect(prepare).toHaveBeenCalled()
        const sql = prepare.mock.calls.map((aufruf) => String(aufruf[0]))
        expect(sql.some((text) => text.includes('medium_zuordnung'))).toBe(false)
      } finally {
        prepare.mockRestore()
      }
    })
  })

  it('O6: Platzhalterperson bekommt keine offenen Punkte', () => {
    mitDb((db) => {
      const p = person(db, { platzhalter: true, lebendStatus: 'verstorben' })
      eltern(db, p, person(db))
      expect(punkte(db, p)).toEqual([])
    })
  })

  it('O7: Reihenfolge = Regelreihenfolge', () => {
    mitDb((db) => {
      const p = person(db, { lebendStatus: 'verstorben', geschlecht: 'F' })
      const kind = person(db)
      eltern(db, p, kind)
      fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: p, praedikat: 'beruf', wertText: 'A', konfidenz: 2 })
      fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: p, praedikat: 'beruf', wertText: 'B', konfidenz: 2 })
      expect(punkte(db, p).map((x) => x.regel_id)).toEqual(['sterbeort_fehlt', 'elternteil_nicht_zugeordnet', 'elternteil_nicht_zugeordnet', 'kind_ohne_partnerschaft', 'widerspruch_vorhanden'])
    })
  })
})
