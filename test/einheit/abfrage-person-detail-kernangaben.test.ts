// AP-1.34 PR-D (ADR-031, §31 U-1.34-E7, U-1.34-D1…D11): `abfrage:person.detail` liefert
// `kernangaben` — über den echten Befehlsbus, damit Belege genau so entstehen wie in der UI.
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
import type { PersonDetailKernangaben } from '../../src/shared/schemata/person-detail'

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

function zitat(db: Db): string {
  const { id: quelleId } = fuehreAus(db, 'quelle.anlegen', { typ: 'kirchenbuch', titel: 'Kirchenbuch' })
  return fuehreAus(db, 'zitat.anlegen', { quelleId, seite: '1' }).id
}

function belege(db: Db, belegt: boolean): { readonly belege?: readonly string[] } {
  return belegt ? { belege: [zitat(db)] } : {}
}

function eltern(db: Db, elternteilId: string, kindId: string, belegt: boolean, typ: 'biologisch' | 'adoptiv' = 'biologisch'): void {
  fuehreAus(db, 'elternschaft.anlegen', { elternteilId, kindId, typ, konfidenz: 3, ...belege(db, belegt) })
}

function datum(db: Db, personId: string, praedikat: 'geburtsdatum' | 'todesdatum', belegt: boolean): void {
  fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat, wertText: '1900', datum: { modifikator: 'exakt', praezision: 'jahr', wert1: '1900' }, konfidenz: 3, ...belege(db, belegt) })
}

function ortText(db: Db, personId: string, praedikat: 'geburtsort' | 'todesort', belegt: boolean): void {
  fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat, wertText: 'Irgendwo', konfidenz: 3, ...belege(db, belegt) })
}

function ort(db: Db): string {
  return fuehreAus(db, 'ort.anlegen', { name: 'Sterbedorf', typ: 'dorf' }).id
}

function name(db: Db, personId: string, nachname: string): string {
  return fuehreAus(db, 'name.anlegen', { personId, typ: 'geburtsname', nachname }).id
}

function nameBelegen(db: Db, nameFormId: string): void {
  fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'name', subjektId: nameFormId, praedikat: 'name', wertText: 'laut Taufeintrag', konfidenz: 3, belege: [zitat(db)] })
}

function todEreignis(db: Db, personId: string, o: { readonly ortId?: string; readonly rolle?: 'verstorbener' | 'informant'; readonly belegt?: boolean }): string {
  return fuehreAus(db, 'ereignis.anlegen', {
    typ: 'tod',
    ...(o.ortId !== undefined ? { ortId: o.ortId } : {}),
    beteiligungen: [{ personId, rolle: o.rolle ?? 'verstorbener' }],
    konfidenz: 3,
    ...belege(db, o.belegt ?? false),
  }).id
}

/** Id der Existenz-Aussage (ADR-026) eines Ereignisses — nur lesend, für einen Beleg mit `feld`. */
function existenzAussageId(db: Db, ereignisId: string): string {
  const zeile = db
    .prepare<{ readonly id: string }, { readonly id: string }>(`SELECT id AS id FROM aussage WHERE subjekt_typ = 'ereignis' AND subjekt_id = @id AND praedikat = 'existenz'`)
    .get({ id: ereignisId })
  if (zeile === undefined) throw new Error('Existenz-Aussage fehlt')
  return zeile.id
}

function ortBeleg(db: Db, ereignisId: string, feld: 'ort' | 'datum'): void {
  fuehreAus(db, 'aussage_zitat.anlegen', { aussageId: existenzAussageId(db, ereignisId), zitatId: zitat(db), feld })
}

function kern(db: Db, personId: string): PersonDetailKernangaben | null {
  return personDetail(db, { personId }).kernangaben
}

function fehlend(db: Db, personId: string): readonly string[] {
  return kern(db, personId)?.fehlend ?? ['<null>']
}

/** Verstorbene Person, alles belegt außer dem Sterbeort (der Rest ist Gegenstand des Tests). */
function verstorbenOhneTodesort(db: Db): string {
  const p = person(db, { geschlecht: 'F', lebendStatus: 'verstorben' })
  nameBelegen(db, name(db, p, 'Muster'))
  datum(db, p, 'geburtsdatum', true)
  ortText(db, p, 'geburtsort', true)
  datum(db, p, 'todesdatum', true)
  eltern(db, person(db, { geschlecht: 'M' }), p, true)
  eltern(db, person(db, { geschlecht: 'F' }), p, true)
  return p
}

describe('person.detail — Kernangaben (AP-1.34 PR-D, ADR-031)', () => {
  it('KA1: Platzhalter → null', () => {
    mitDb((db) => {
      expect(kern(db, person(db, { platzhalter: true, geschlecht: 'M' }))).toBeNull()
    })
  })

  it('KA2: frische Person 0/6', () => {
    mitDb((db) => {
      expect(kern(db, person(db))).toEqual({ erfuellt: 0, anwendbar: 6, prozent: 0, fehlend: ['name', 'geschlecht', 'geburtsdatum', 'geburtsort', 'vater', 'mutter'] })
    })
  })

  it('KA3: voll belegte verstorbene Person 8/8 = 100 %', () => {
    mitDb((db) => {
      const p = verstorbenOhneTodesort(db)
      ortText(db, p, 'todesort', true)
      expect(kern(db, p)).toEqual({ erfuellt: 8, anwendbar: 8, prozent: 100, fehlend: [] })
    })
  })

  it('KA4: todesort nur als Text — belegt erfüllt, unbelegt fehlt trotz belegtem Ereignisort', () => {
    mitDb((db) => {
      const belegt = verstorbenOhneTodesort(db)
      ortText(db, belegt, 'todesort', true)
      expect(fehlend(db, belegt)).toEqual([])

      const unbelegt = verstorbenOhneTodesort(db)
      ortText(db, unbelegt, 'todesort', false)
      todEreignis(db, unbelegt, { ortId: ort(db), belegt: true })
      expect(personDetail(db, { personId: unbelegt }).sterbeort?.herkunft).toBe('aussage')
      expect(fehlend(db, unbelegt)).toEqual(['todesort'])
    })
  })

  it('KA5: Ereignis-Rückfall — Beleg ganz oder feld=ort ja, feld=datum nein, Rolle informant nein, ohne Ort nein', () => {
    mitDb((db) => {
      const ganz = verstorbenOhneTodesort(db)
      todEreignis(db, ganz, { ortId: ort(db), belegt: true })
      expect(fehlend(db, ganz)).toEqual([])

      const feldOrt = verstorbenOhneTodesort(db)
      ortBeleg(db, todEreignis(db, feldOrt, { ortId: ort(db) }), 'ort')
      expect(fehlend(db, feldOrt)).toEqual([])

      const feldDatum = verstorbenOhneTodesort(db)
      ortBeleg(db, todEreignis(db, feldDatum, { ortId: ort(db) }), 'datum')
      expect(fehlend(db, feldDatum)).toEqual(['todesort'])

      const informant = verstorbenOhneTodesort(db)
      todEreignis(db, informant, { ortId: ort(db), rolle: 'informant', belegt: true })
      expect(fehlend(db, informant)).toEqual(['todesort'])

      const ohneOrt = verstorbenOhneTodesort(db)
      todEreignis(db, ohneOrt, { belegt: true })
      expect(fehlend(db, ohneOrt)).toEqual(['todesort'])
    })
  })

  it('KA6: Name — Beleg an einer Nebenform zählt nicht; nach hauptname.wechseln zählt der Beleg der neuen Hauptform', () => {
    mitDb((db) => {
      const p = person(db)
      const haupt = name(db, p, 'Haupt')
      const neben = name(db, p, 'Neben')
      nameBelegen(db, neben)
      expect(fehlend(db, p)).toContain('name')
      fuehreAus(db, 'hauptname.wechseln', { personId: p, alt: haupt, neu: neben })
      expect(fehlend(db, p)).not.toContain('name')
      expect(kern(db, p)?.erfuellt).toBe(1)
    })
  })

  it('KA7: Doppelkante — biologisch unbelegt und adoptiv belegt zum selben Elternteil erfüllt den Platz', () => {
    mitDb((db) => {
      const p = person(db)
      const vater = person(db, { geschlecht: 'M' })
      eltern(db, vater, p, false, 'biologisch')
      eltern(db, vater, p, true, 'adoptiv')
      eltern(db, person(db, { geschlecht: 'F' }), p, false)
      expect(fehlend(db, p)).toEqual(['name', 'geschlecht', 'geburtsdatum', 'geburtsort', 'mutter'])
    })
  })

  it('KA8: lebend_status nicht erfasst mit belegtem Todesdatum → Nenner 6', () => {
    mitDb((db) => {
      const p = person(db)
      datum(db, p, 'todesdatum', true)
      expect(kern(db, p)).toMatchObject({ erfuellt: 0, anwendbar: 6 })
    })
  })

  it('KA8b: Platzhalter-Elternteil zählt wie jeder andere (E6), unbestimmter Elternteil ergibt zwei elternteil-Angaben', () => {
    mitDb((db) => {
      const p = person(db)
      eltern(db, person(db, { geschlecht: 'M' }), p, true)
      eltern(db, person(db, { platzhalter: true }), p, true)
      expect(fehlend(db, p)).toEqual(['name', 'geschlecht', 'geburtsdatum', 'geburtsort'])

      const q = person(db)
      eltern(db, person(db, { geschlecht: 'U' }), q, false)
      expect(fehlend(db, q)).toEqual(['name', 'geschlecht', 'geburtsdatum', 'geburtsort', 'elternteil', 'elternteil'])
    })
  })

  it('KA9: konsistent mit offenen Punkten — sterbeort_fehlt ⇒ todesort fehlt, offener Elternplatz ⇒ gleiche Id fehlt', () => {
    mitDb((db) => {
      const faelle: string[] = []
      faelle.push(person(db, { lebendStatus: 'verstorben' }))
      const nurVater = person(db, { lebendStatus: 'verstorben' })
      eltern(db, person(db, { geschlecht: 'M' }), nurVater, true)
      faelle.push(nurVater)
      const nurU = person(db)
      eltern(db, person(db, { geschlecht: 'U' }), nurU, true)
      faelle.push(nurU)
      for (const p of faelle) {
        const detail = personDetail(db, { personId: p })
        const f = detail.kernangaben?.fehlend ?? []
        for (const punkt of detail.offene_punkte) {
          if (punkt.regel_id === 'sterbeort_fehlt') expect(f).toContain('todesort')
          if (punkt.meldungsschluessel === 'offener_punkt_vater_nicht_zugeordnet') expect(f).toContain('vater')
          if (punkt.meldungsschluessel === 'offener_punkt_mutter_nicht_zugeordnet') expect(f).toContain('mutter')
          if (punkt.meldungsschluessel === 'offener_punkt_elternteil_nicht_zugeordnet') expect(f).toContain('elternteil')
        }
        expect(detail.offene_punkte.length).toBeGreaterThan(0)
      }
    })
  })
})
