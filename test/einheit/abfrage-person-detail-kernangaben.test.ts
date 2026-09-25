// AP-1.34 PR-D (ADR-031, §31 U-1.34-E7, U-1.34-D1…D11): `abfrage:person.detail` liefert
// `kernangaben` — über den echten Befehlsbus, damit Belege genau so entstehen wie in der UI.
// Vorarbeiten AP-1.30, PR 2 (Nachtrag ADR-031, §32): Name nach Vorhandensein, Ereignis-Rückfall für
// Geburt/Tod auch ohne Beleg, Rollen hauptperson/kind bzw. verstorbener/hauptperson, Aufschlüsselung.
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
import { journalAn, journalAus } from '../../src/main/journal/kontext'
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

function todEreignis(
  db: Db,
  personId: string,
  o: { readonly ortId?: string; readonly rolle?: 'verstorbener' | 'informant' | 'hauptperson'; readonly belegt?: boolean; readonly datum?: boolean },
): string {
  return fuehreAus(db, 'ereignis.anlegen', {
    typ: 'tod',
    ...(o.ortId !== undefined ? { ortId: o.ortId } : {}),
    ...(o.datum === true ? { datum: { modifikator: 'exakt' as const, praezision: 'jahr' as const, wert1: '1950' } } : {}),
    beteiligungen: [{ personId, rolle: o.rolle ?? 'verstorbener' }],
    konfidenz: 3,
    ...belege(db, o.belegt ?? false),
  }).id
}

function geburtEreignis(
  db: Db,
  personId: string,
  o: { readonly ortId?: string; readonly rolle: 'hauptperson' | 'kind' | 'vater'; readonly datum?: boolean; readonly belegt?: boolean; readonly typ?: 'geburt' | 'taufe' },
): string {
  return fuehreAus(db, 'ereignis.anlegen', {
    typ: o.typ ?? 'geburt',
    ...(o.ortId !== undefined ? { ortId: o.ortId } : {}),
    ...(o.datum === true ? { datum: { modifikator: 'exakt' as const, praezision: 'jahr' as const, wert1: '1900' } } : {}),
    beteiligungen: [{ personId, rolle: o.rolle }],
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

function zustand(db: Db, personId: string, id: string): string {
  return kern(db, personId)?.aufschluesselung.find((a) => a.id === id)?.zustand ?? '<keine>'
}

/** Altbestand (vor PR 5 der Vorarbeiten AP-1.30): eine Orts-Aussage nur mit `wert_zahl`. Die Befehle
 * lehnen das heute ab (`VALIDIERUNG_ORTSWERT`), ältere Projektdateien können es enthalten — darum
 * per Text anlegen und den Wert ohne Befehlsbus auf eine Zahl umschreiben. */
function ortZahl(db: Db, personId: string, praedikat: 'geburtsort' | 'todesort', belegt: boolean): void {
  const { id } = fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat, wertText: 'vorläufig', konfidenz: 3, ...belege(db, belegt) })
  journalAus(db, 'test-fixture: Altbestand Orts-Aussage mit wert_zahl')
  try {
    db.prepare<{ readonly id: string }>(`UPDATE aussage SET wert_text = NULL, wert_zahl = 5 WHERE id = @id`).run({ id })
  } finally {
    journalAn(db)
  }
}

/** Beide Richtungen zwischen Kernangaben, Sterbeort und offenen Punkten. */
function konsistent(db: Db, personId: string): void {
  const detail = personDetail(db, { personId })
  const f = detail.kernangaben?.fehlend ?? []
  const schluessel = detail.offene_punkte.map((x) => x.meldungsschluessel)
  const sterbeortFehlt = detail.offene_punkte.some((x) => x.regel_id === 'sterbeort_fehlt')
  expect(sterbeortFehlt).toBe(detail.kopf.lebend_status === 'verstorben' && detail.sterbeort === null)
  if (sterbeortFehlt) expect(f).toContain('todesort')
  if (detail.kopf.lebend_status === 'verstorben' && !f.includes('todesort')) expect(sterbeortFehlt).toBe(false)
  for (const [id, meldung] of [['vater', 'offener_punkt_vater_nicht_zugeordnet'], ['mutter', 'offener_punkt_mutter_nicht_zugeordnet'], ['elternteil', 'offener_punkt_elternteil_nicht_zugeordnet']] as const) {
    if (schluessel.includes(meldung)) expect(f).toContain(id)
    if (id !== 'elternteil' && !f.includes(id)) expect(schluessel).not.toContain(meldung)
  }
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
      const ids = ['name', 'geschlecht', 'geburtsdatum', 'geburtsort', 'vater', 'mutter'] as const
      expect(kern(db, person(db))).toEqual({ erfuellt: 0, anwendbar: 6, prozent: 0, fehlend: ids, aufschluesselung: ids.map((id) => ({ id, zustand: 'fehlt' })) })
    })
  })

  it('KA3: voll belegte verstorbene Person 8/8 = 100 %', () => {
    mitDb((db) => {
      const p = verstorbenOhneTodesort(db)
      ortText(db, p, 'todesort', true)
      expect(kern(db, p)).toMatchObject({ erfuellt: 8, anwendbar: 8, prozent: 100, fehlend: [] })
      // Geschlecht zählt nur als vorhanden (E7), alles andere ist belegt.
      expect(kern(db, p)?.aufschluesselung.filter((a) => a.zustand !== 'belegt')).toEqual([{ id: 'geschlecht', zustand: 'vorhanden' }])
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

  it('KA5: Ereignis-Rückfall — Beleg ganz oder feld=ort belegt, feld=datum nur vorhanden (D9 neu), Rolle informant nein, ohne Ort nein', () => {
    mitDb((db) => {
      const ganz = verstorbenOhneTodesort(db)
      todEreignis(db, ganz, { ortId: ort(db), belegt: true })
      expect(fehlend(db, ganz)).toEqual([])

      const feldOrt = verstorbenOhneTodesort(db)
      ortBeleg(db, todEreignis(db, feldOrt, { ortId: ort(db) }), 'ort')
      expect(fehlend(db, feldOrt)).toEqual([])

      expect(zustand(db, feldOrt, 'todesort')).toBe('belegt')

      // D9 neu: ein Beleg nur für das Datum belegt den Ort nicht — der Ereignisort zählt trotzdem (vorhanden).
      const feldDatum = verstorbenOhneTodesort(db)
      ortBeleg(db, todEreignis(db, feldDatum, { ortId: ort(db) }), 'datum')
      expect(fehlend(db, feldDatum)).toEqual([])
      expect(zustand(db, feldDatum, 'todesort')).toBe('vorhanden')

      const informant = verstorbenOhneTodesort(db)
      todEreignis(db, informant, { ortId: ort(db), rolle: 'informant', belegt: true })
      expect(fehlend(db, informant)).toEqual(['todesort'])

      const ohneOrt = verstorbenOhneTodesort(db)
      todEreignis(db, ohneOrt, { belegt: true })
      expect(fehlend(db, ohneOrt)).toEqual(['todesort'])

      // hueter-H3: eine belegte Aussage am Tod-Ereignis, die NICHT die Existenz-Aussage ist, belegt den Ort nicht.
      const fremdeAussage = verstorbenOhneTodesort(db)
      const ereignisId = todEreignis(db, fremdeAussage, { ortId: ort(db) })
      fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'ereignis', subjektId: ereignisId, praedikat: 'todesursache', wertText: 'Fieber', konfidenz: 3, belege: [zitat(db)] })
      expect(zustand(db, fremdeAussage, 'todesort')).toBe('vorhanden')
    })
  })

  it('KA6: Name zählt, sobald er vorhanden ist (D1 neu); „belegt" nur über den Beleg an der Hauptform (D3), auch nach hauptname.wechseln', () => {
    mitDb((db) => {
      const p = person(db)
      expect(zustand(db, p, 'name')).toBe('fehlt')
      const haupt = name(db, p, 'Haupt')
      const neben = name(db, p, 'Neben')
      expect(fehlend(db, p)).not.toContain('name')
      expect(zustand(db, p, 'name')).toBe('vorhanden')
      nameBelegen(db, neben)
      expect(zustand(db, p, 'name')).toBe('vorhanden')
      fuehreAus(db, 'hauptname.wechseln', { personId: p, alt: haupt, neu: neben })
      expect(zustand(db, p, 'name')).toBe('belegt')
      expect(kern(db, p)?.erfuellt).toBe(1)
    })
  })

  it('KA6b: eine Hauptform ohne jeden Text ist kein Name (§32 V-D1-name-vorhanden)', () => {
    mitDb((db) => {
      const p = person(db)
      fuehreAus(db, 'name.anlegen', { personId: p, typ: 'geburtsname' })
      expect(personDetail(db, { personId: p }).namen).toHaveLength(1)
      expect(zustand(db, p, 'name')).toBe('fehlt')
    })
  })

  it('KA11: Ereignisse aus der Oberfläche (Rolle hauptperson) zählen für Datum und Ort, auch ohne Beleg (D9 neu)', () => {
    mitDb((db) => {
      const p = person(db, { lebendStatus: 'verstorben' })
      geburtEreignis(db, p, { rolle: 'hauptperson', datum: true, ortId: ort(db) })
      todEreignis(db, p, { rolle: 'hauptperson', datum: true, ortId: ort(db) })
      const k = kern(db, p)
      expect(k?.fehlend).toEqual(['name', 'geschlecht', 'vater', 'mutter'])
      expect(k?.aufschluesselung.filter((a) => a.zustand === 'vorhanden').map((a) => a.id)).toEqual(['geburtsdatum', 'geburtsort', 'todesdatum', 'todesort'])
      konsistent(db, p)
    })
  })

  it('KA12: Geburt mit Rolle kind zählt, Rolle vater und Taufe nicht; ohne Datum nur der Ort', () => {
    mitDb((db) => {
      const kind = person(db)
      geburtEreignis(db, kind, { rolle: 'kind', datum: true, ortId: ort(db) })
      expect(fehlend(db, kind)).not.toContain('geburtsdatum')
      expect(fehlend(db, kind)).not.toContain('geburtsort')

      const vater = person(db)
      geburtEreignis(db, vater, { rolle: 'vater', datum: true, ortId: ort(db) })
      expect(fehlend(db, vater)).toEqual(expect.arrayContaining(['geburtsdatum', 'geburtsort']))

      const getauft = person(db)
      geburtEreignis(db, getauft, { rolle: 'hauptperson', typ: 'taufe', datum: true, ortId: ort(db) })
      expect(fehlend(db, getauft)).toEqual(expect.arrayContaining(['geburtsdatum', 'geburtsort']))

      const ohneDatum = person(db)
      geburtEreignis(db, ohneDatum, { rolle: 'hauptperson', ortId: ort(db) })
      expect(fehlend(db, ohneDatum)).toContain('geburtsdatum')
      expect(fehlend(db, ohneDatum)).not.toContain('geburtsort')
    })
  })

  it('KA13: die Aussage führt — eine unbelegte Aussage verdrängt ein belegtes Geburtsereignis (V-D9-aussage-fuehrt)', () => {
    mitDb((db) => {
      const p = person(db)
      geburtEreignis(db, p, { rolle: 'hauptperson', datum: true, ortId: ort(db), belegt: true })
      expect(zustand(db, p, 'geburtsdatum')).toBe('belegt')
      expect(zustand(db, p, 'geburtsort')).toBe('belegt')
      datum(db, p, 'geburtsdatum', false)
      expect(zustand(db, p, 'geburtsdatum')).toBe('unbelegt')
      expect(zustand(db, p, 'geburtsort')).toBe('belegt')
    })
  })

  it('KA13b: ein Beleg an einem Ereignis, das für die Person kein Rückfall ist (Rolle vater), wirkt nie (hueter #125, H3)', () => {
    mitDb((db) => {
      const p = person(db)
      geburtEreignis(db, p, { rolle: 'hauptperson', datum: true, ortId: ort(db) })
      geburtEreignis(db, p, { rolle: 'vater', datum: true, ortId: ort(db), belegt: true })
      expect(zustand(db, p, 'geburtsdatum')).toBe('vorhanden')
      expect(zustand(db, p, 'geburtsort')).toBe('vorhanden')
    })
  })

  it('KA13c: ein Ereignis nur mit Originaltext-Datum zählt; ein Name nur aus original_text ist vorhanden (hueter #125, H4)', () => {
    mitDb((db) => {
      const p = person(db, { lebendStatus: 'verstorben' })
      fuehreAus(db, 'name.anlegen', { personId: p, typ: 'geburtsname', originalText: 'Hans der Schmied' })
      const e = fuehreAus(db, 'ereignis.anlegen', { typ: 'tod', datum: { modifikator: 'etwa', praezision: 'jahr', wert1: '1812', original_text: 'um Martini 1812' }, beteiligungen: [{ personId: p, rolle: 'hauptperson' }], konfidenz: 2 }).id
      // Altbestand: die Schreibbefehle verlangen wert1, ältere Daten können nur den Originaltext tragen.
      journalAus(db, 'test-fixture: Altbestand ohne datum_wert1')
      try {
        db.prepare<{ readonly id: string }>(`UPDATE ereignis SET datum_wert1 = NULL WHERE id = @id`).run({ id: e })
      } finally {
        journalAn(db)
      }
      expect(zustand(db, p, 'name')).toBe('vorhanden')
      expect(zustand(db, p, 'todesdatum')).toBe('vorhanden')
    })
  })

  it('KA14: Ereignis-Beleg feldgenau — feld=datum belegt das Datum, nicht den Ort', () => {
    mitDb((db) => {
      const p = person(db)
      ortBeleg(db, geburtEreignis(db, p, { rolle: 'hauptperson', datum: true, ortId: ort(db) }), 'datum')
      expect(zustand(db, p, 'geburtsdatum')).toBe('belegt')
      expect(zustand(db, p, 'geburtsort')).toBe('vorhanden')
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

  it('KA9: konsistent mit offenen Punkten — je Fall ausdrücklich und in beiden Richtungen', () => {
    mitDb((db) => {
      const ohneAlles = person(db, { lebendStatus: 'verstorben' })
      const nurVater = person(db, { lebendStatus: 'verstorben' })
      eltern(db, person(db, { geschlecht: 'M' }), nurVater, true)
      const nurU = person(db)
      eltern(db, person(db, { geschlecht: 'U' }), nurU, true)
      const voll = verstorbenOhneTodesort(db)
      ortText(db, voll, 'todesort', true)

      const faelle: readonly [string, readonly string[], readonly string[]][] = [
        [ohneAlles, ['sterbeort_fehlt:offener_punkt_sterbeort_fehlt', 'elternteil_nicht_zugeordnet:offener_punkt_vater_nicht_zugeordnet', 'elternteil_nicht_zugeordnet:offener_punkt_mutter_nicht_zugeordnet'], ['name', 'geschlecht', 'geburtsdatum', 'geburtsort', 'todesdatum', 'todesort', 'vater', 'mutter']],
        [nurVater, ['sterbeort_fehlt:offener_punkt_sterbeort_fehlt', 'elternteil_nicht_zugeordnet:offener_punkt_mutter_nicht_zugeordnet'], ['name', 'geschlecht', 'geburtsdatum', 'geburtsort', 'todesdatum', 'todesort', 'mutter']],
        [nurU, ['elternteil_nicht_zugeordnet:offener_punkt_elternteil_nicht_zugeordnet'], ['name', 'geschlecht', 'geburtsdatum', 'geburtsort', 'elternteil']],
        [voll, [], []],
      ]
      for (const [p, punkte, fehlt] of faelle) {
        const detail = personDetail(db, { personId: p })
        expect(detail.offene_punkte.map((x) => `${x.regel_id}:${x.meldungsschluessel}`)).toEqual(punkte)
        expect(detail.kernangaben?.fehlend).toEqual(fehlt)
        konsistent(db, p)
      }
    })
  })

  it('KA10: todesort nur mit wertZahl trägt keinen Ort — gleiche Wahrheit wie sterbeort und offene Punkte (hueter-H1)', () => {
    mitDb((db) => {
      // P1: belegt, kein Tod-Ereignis → kein Sterbeort, also auch nicht erfüllt.
      const p1 = verstorbenOhneTodesort(db)
      ortZahl(db, p1, 'todesort', true)
      const d1 = personDetail(db, { personId: p1 })
      expect(d1.sterbeort).toBeNull()
      expect(d1.offene_punkte.map((x) => x.regel_id)).toEqual(['sterbeort_fehlt'])
      expect(d1.kernangaben?.fehlend).toEqual(['todesort'])
      konsistent(db, p1)

      // P2: unbelegt, dazu belegtes Tod-Ereignis mit Ort → der Ereignisort gilt, erfüllt.
      const p2 = verstorbenOhneTodesort(db)
      ortZahl(db, p2, 'todesort', false)
      todEreignis(db, p2, { ortId: ort(db), belegt: true })
      const d2 = personDetail(db, { personId: p2 })
      expect(d2.sterbeort?.herkunft).toBe('ereignis')
      expect(d2.kernangaben?.fehlend).toEqual([])
      konsistent(db, p2)

      // Geburtsort konsistent: nur wertZahl ist kein Ort.
      const p3 = person(db)
      ortZahl(db, p3, 'geburtsort', true)
      expect(personDetail(db, { personId: p3 }).kernangaben?.fehlend).toContain('geburtsort')
    })
  })
})
