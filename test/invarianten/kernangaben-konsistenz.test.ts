// Vorarbeiten AP-1.30, PR 7 — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025; docs/80 §31
// U-1.34-D-invariante-konsistenz, hueter PR #123 H5). Invariante gegen die Regeln aus PR 2 (#125,
// Nachtrag ADR-031 vom 25.09.2026): Kernangaben, Sterbeort und offene Punkte, die `abfrage:person.detail`
// liefert, widersprechen sich für KEINE Person eines erzeugten Bestands. Bisher nur an Handfällen
// geprüft (KA9/KA10 in test/einheit/abfrage-person-detail-kernangaben.test.ts).
//
// Die Bestände entstehen über den echten Befehlsbus (dieselben Wege wie Oberfläche und Import:
// `aussage.anlegen` mit/ohne Beleg, `ereignis.anlegen` mit Rolle, Datum, Ort, Beleg und feldgenauem
// Beleg, `elternschaft.anlegen`, `name.anlegen`); einzig der Altbestand „Orts-Aussage nur mit
// wert_zahl" wird ohne Befehlsbus geschrieben, weil die Befehle ihn seit PR 5 ablehnen.
//
// Je Person P (Zusicherungen):
//   Z1  Platzhalter ⇔ kernangaben = null; ein Platzhalter hat keine offenen Punkte.
//   Z2  sterbeort_fehlt ⇔ P verstorben ∧ sterbeort = null.
//   Z3  Nur bei `verstorben` gibt es `todesdatum`/`todesort` in der Aufschlüsselung.
//   Z4  Bei `verstorben`: sterbeort = null ⇒ todesort `fehlt`; Herkunft Ereignis ⇒ todesort erfüllt
//       (`belegt`/`vorhanden`); Herkunft Aussage ⇒ todesort `belegt` oder `unbelegt` (die Aussage führt).
//       Insbesondere sterbeort_fehlt ⇒ todesort ∈ fehlend.
//   Z5  Vater/Mutter: Zustand `fehlt` ⇔ offener Punkt „Vater/Mutter nicht zugeordnet".
//   Z6  `elternteil` in der Aufschlüsselung ⇔ offener Punkt „Elternteil nicht zugeordnet"; dann genau
//       zwei `elternteil`-Zeilen, die zweite `fehlt`.
//   Z7  fehlend = Ids mit `unbelegt`/`fehlt` in Aufschlüsselungsreihenfolge; erfuellt + |fehlend| = anwendbar.
// Deckung: der Lauf zählt, dass jede Sterbeort-Herkunft, jeder todesort-Zustand und jeder offene
// Elternplatz-Schlüssel mindestens einmal vorkam — sonst prüfte die Invariante leere Mengen.
// Grenzen (hueter #133): die Invariante prüft die Konsistenz ZWISCHEN den Lesern. Einen Fehler, den
// Kernangaben und Sterbeort gleich machen (z. B. eine Rolle fehlt in `RUECKFALL_ROLLEN` für beide),
// fangen die Einheitstests (test/einheit/kernangaben*.test.ts, lebensdaten.test.ts), nicht diese
// Datei. Geburtsdatum/-ort werden nicht über Kreuz geprüft — für sie gibt es keinen zweiten Leser
// (kein aufgelöstes Grunddatenfeld bis AP-1.30, §32 V-D9-anzeige). Z5 ist bewusst als „Zustand
// `fehlt` ⇔ offener Punkt" formuliert, nicht als „Id ∈ fehlend ⇔ Punkt": ein besetzter Platz mit
// unbelegter Kante steht in `fehlend` (`unbelegt`), löst aber keinen offenen Punkt aus.
import { describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'

vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../../src/main/protokoll/logger', () => ({
  protokollFehler: vi.fn(),
  protokollInfo: vi.fn(),
  protokollDebug: vi.fn(),
}))
vi.mock('../../src/main/ipc/ereignisse', () => ({ sendeEreignis: vi.fn() }))

import { fuehreAus } from '../../src/main/befehle/bus'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { journalAn, journalAus } from '../../src/main/journal/kontext'
import { personDetail } from '../../src/main/abfragen/person-detail'

type Db = ReturnType<typeof oeffnen>

const SEED = 20260925
const LAEUFE = 80

type Beleg = 'keiner' | 'ganz' | 'datum' | 'ort'

interface EreignisPlan {
  readonly rolle: 'hauptperson' | 'kind' | 'vater' | 'verstorbener' | 'informant'
  readonly datum: boolean
  readonly ort: boolean
  readonly beleg: Beleg
}

type OrtsAussage = 'keine' | 'text' | 'text_belegt' | 'verweis_belegt' | 'zahl_altbestand'
type DatumsAussage = 'keine' | 'unbelegt' | 'belegt'

interface PersonPlan {
  readonly lebendStatus: 'lebend' | 'verstorben' | 'vermutet_verstorben' | null
  readonly geschlecht: 'M' | 'F' | 'U' | null
  readonly name: 'keiner' | 'leer' | 'text' | 'text_belegt'
  readonly geburtsdatum: DatumsAussage
  readonly geburtsort: OrtsAussage
  readonly geburt: EreignisPlan | null
  readonly todesdatum: DatumsAussage
  readonly todesort: OrtsAussage
  readonly tod: EreignisPlan | null
  /** Indizes in die zuvor angelegten Personen (kleiner Pool, darum auch Doppelkanten). */
  readonly eltern: readonly { readonly index: number; readonly belegt: boolean }[]
}

const belegArb = fc.constantFrom<Beleg>('keiner', 'ganz', 'datum', 'ort')
const ereignisArb = (rollen: readonly EreignisPlan['rolle'][]): fc.Arbitrary<EreignisPlan | null> =>
  fc.option(fc.record({ rolle: fc.constantFrom(...rollen), datum: fc.boolean(), ort: fc.boolean(), beleg: belegArb }), { nil: null, freq: 2 })
const ortsAussageArb = fc.constantFrom<OrtsAussage>('keine', 'keine', 'text', 'text_belegt', 'verweis_belegt', 'zahl_altbestand')
const datumsAussageArb = fc.constantFrom<DatumsAussage>('keine', 'keine', 'unbelegt', 'belegt')

const personArb: fc.Arbitrary<PersonPlan> = fc.record({
  lebendStatus: fc.constantFrom('lebend', 'verstorben', 'verstorben', 'vermutet_verstorben', null),
  geschlecht: fc.constantFrom('M', 'F', 'U', null),
  name: fc.constantFrom('keiner', 'leer', 'text', 'text_belegt'),
  geburtsdatum: datumsAussageArb,
  geburtsort: ortsAussageArb,
  geburt: ereignisArb(['hauptperson', 'kind', 'vater']),
  todesdatum: datumsAussageArb,
  todesort: ortsAussageArb,
  tod: ereignisArb(['verstorbener', 'hauptperson', 'informant']),
  eltern: fc.array(fc.record({ index: fc.nat({ max: 5 }), belegt: fc.boolean() }), { maxLength: 3 }),
})

const bestandArb = fc.record({
  personen: fc.array(personArb, { minLength: 2, maxLength: 7 }),
  platzhalterAnteil: fc.array(fc.boolean(), { minLength: 7, maxLength: 7 }),
})

interface Deckung {
  readonly herkunft: Set<string>
  readonly todesortZustand: Set<string>
  readonly elternPunkt: Set<string>
  personen: number
}

function zitat(db: Db): string {
  const { id: quelleId } = fuehreAus(db, 'quelle.anlegen', { typ: 'kirchenbuch', titel: 'Kirchenbuch' })
  return fuehreAus(db, 'zitat.anlegen', { quelleId, seite: '1' }).id
}

function existenzAussageId(db: Db, ereignisId: string): string {
  const zeile = db
    .prepare<{ readonly id: string }, { readonly id: string }>(`SELECT id AS id FROM aussage WHERE subjekt_typ = 'ereignis' AND subjekt_id = @id AND praedikat = 'existenz'`)
    .get({ id: ereignisId })
  if (zeile === undefined) throw new Error('Existenz-Aussage fehlt')
  return zeile.id
}

function ortsAussage(db: Db, personId: string, praedikat: 'geburtsort' | 'todesort', art: OrtsAussage, ortId: string): void {
  if (art === 'keine') return
  const basis = { subjektTyp: 'person' as const, subjektId: personId, praedikat, konfidenz: 3 }
  switch (art) {
    case 'text':
      fuehreAus(db, 'aussage.anlegen', { ...basis, wertText: 'Irgendwo' })
      return
    case 'text_belegt':
      fuehreAus(db, 'aussage.anlegen', { ...basis, wertText: 'Irgendwo', belege: [zitat(db)] })
      return
    case 'verweis_belegt':
      fuehreAus(db, 'aussage.anlegen', { ...basis, wertRefId: ortId, belege: [zitat(db)] })
      return
    case 'zahl_altbestand': {
      const { id } = fuehreAus(db, 'aussage.anlegen', { ...basis, wertText: 'vorläufig', belege: [zitat(db)] })
      journalAus(db, 'invariante: Altbestand Orts-Aussage mit wert_zahl')
      try {
        db.prepare<{ readonly id: string }>(`UPDATE aussage SET wert_text = NULL, wert_zahl = 5 WHERE id = @id`).run({ id })
      } finally {
        journalAn(db)
      }
      return
    }
  }
}

function datumsAussage(db: Db, personId: string, praedikat: 'geburtsdatum' | 'todesdatum', art: DatumsAussage): void {
  if (art === 'keine') return
  fuehreAus(db, 'aussage.anlegen', {
    subjektTyp: 'person',
    subjektId: personId,
    praedikat,
    wertText: '1900',
    datum: { modifikator: 'exakt', praezision: 'jahr', wert1: '1900' },
    konfidenz: 3,
    ...(art === 'belegt' ? { belege: [zitat(db)] } : {}),
  })
}

function ereignis(db: Db, personId: string, typ: 'geburt' | 'tod', plan: EreignisPlan | null, ortId: string): void {
  if (plan === null) return
  const { id } = fuehreAus(db, 'ereignis.anlegen', {
    typ,
    ...(plan.ort ? { ortId } : {}),
    ...(plan.datum ? { datum: { modifikator: 'exakt' as const, praezision: 'jahr' as const, wert1: '1900' } } : {}),
    beteiligungen: [{ personId, rolle: plan.rolle }],
    konfidenz: 3,
    ...(plan.beleg === 'ganz' ? { belege: [zitat(db)] } : {}),
  })
  if (plan.beleg === 'datum' || plan.beleg === 'ort') {
    fuehreAus(db, 'aussage_zitat.anlegen', { aussageId: existenzAussageId(db, id), zitatId: zitat(db), feld: plan.beleg })
  }
}

function bestandAufbauen(db: Db, personen: readonly PersonPlan[], platzhalter: readonly boolean[]): readonly string[] {
  const ortId = fuehreAus(db, 'ort.anlegen', { name: 'Kirchdorf', typ: 'dorf' }).id
  const ids: string[] = []
  personen.forEach((plan, i) => {
    const istPlatzhalter = platzhalter[i] === true && i % 3 === 2
    const id = fuehreAus(db, 'person.anlegen', {
      privat: 0,
      ist_platzhalter: istPlatzhalter ? 1 : 0,
      ...(istPlatzhalter ? { platzhalter_grund: 'unbekannt' as const } : {}),
      ...(plan.geschlecht !== null ? { geschlecht: plan.geschlecht } : {}),
      ...(plan.lebendStatus !== null ? { lebend_status: plan.lebendStatus } : {}),
    }).id
    ids.push(id)
    if (plan.name !== 'keiner') {
      const form = fuehreAus(db, 'name.anlegen', { personId: id, typ: 'geburtsname', ...(plan.name === 'leer' ? {} : { vornamen: 'Anna', nachname: 'Muster' }) }).id
      if (plan.name === 'text_belegt') {
        fuehreAus(db, 'aussage.anlegen', { subjektTyp: 'name', subjektId: form, praedikat: 'name', wertText: 'laut Taufeintrag', konfidenz: 3, belege: [zitat(db)] })
      }
    }
    datumsAussage(db, id, 'geburtsdatum', plan.geburtsdatum)
    ortsAussage(db, id, 'geburtsort', plan.geburtsort, ortId)
    ereignis(db, id, 'geburt', plan.geburt, ortId)
    datumsAussage(db, id, 'todesdatum', plan.todesdatum)
    ortsAussage(db, id, 'todesort', plan.todesort, ortId)
    ereignis(db, id, 'tod', plan.tod, ortId)
    for (const elternteil of plan.eltern) {
      const elternId = ids[elternteil.index % ids.length]
      if (elternId === undefined || elternId === id) continue
      fuehreAus(db, 'elternschaft.anlegen', {
        elternteilId: elternId,
        kindId: id,
        typ: elternteil.belegt ? 'adoptiv' : 'biologisch',
        konfidenz: 3,
        ...(elternteil.belegt ? { belege: [zitat(db)] } : {}),
      })
    }
  })
  return ids
}

function pruefePerson(db: Db, personId: string, deckung: Deckung): void {
  const detail = personDetail(db, { personId })
  const k = detail.kernangaben
  const regeln = detail.offene_punkte.map((p) => p.regel_id)
  const schluessel = detail.offene_punkte.map((p) => p.meldungsschluessel)

  // Z1
  expect(k === null, personId).toBe(detail.kopf.ist_platzhalter)
  if (k === null) {
    expect(detail.offene_punkte, personId).toEqual([])
    return
  }
  deckung.personen += 1

  const verstorben = detail.kopf.lebend_status === 'verstorben'
  const sterbeortFehlt = regeln.includes('sterbeort_fehlt')
  const zustaende = (id: string): readonly string[] => k.aufschluesselung.filter((a) => a.id === id).map((a) => a.zustand)

  // Z2
  expect(sterbeortFehlt, personId).toBe(verstorben && detail.sterbeort === null)
  // Z3
  expect(zustaende('todesdatum').length, personId).toBe(verstorben ? 1 : 0)
  expect(zustaende('todesort').length, personId).toBe(verstorben ? 1 : 0)
  // Z4
  if (verstorben) {
    const todesort = zustaende('todesort')[0] ?? '<keiner>'
    deckung.todesortZustand.add(todesort)
    deckung.herkunft.add(detail.sterbeort?.herkunft ?? 'null')
    if (detail.sterbeort === null) expect(todesort, personId).toBe('fehlt')
    else if (detail.sterbeort.herkunft === 'ereignis') expect(['belegt', 'vorhanden'], personId).toContain(todesort)
    else expect(['belegt', 'unbelegt'], personId).toContain(todesort)
    if (sterbeortFehlt) expect(k.fehlend, personId).toContain('todesort')
  }
  // Z5
  for (const [id, meldung] of [
    ['vater', 'offener_punkt_vater_nicht_zugeordnet'],
    ['mutter', 'offener_punkt_mutter_nicht_zugeordnet'],
  ] as const) {
    const fehlt = zustaende(id).includes('fehlt')
    expect(fehlt, `${personId} ${id}`).toBe(schluessel.includes(meldung))
    if (fehlt) deckung.elternPunkt.add(id)
  }
  // Z6
  const elternteil = zustaende('elternteil')
  expect(elternteil.length > 0, personId).toBe(schluessel.includes('offener_punkt_elternteil_nicht_zugeordnet'))
  if (elternteil.length > 0) {
    deckung.elternPunkt.add('elternteil')
    expect(elternteil.length, personId).toBe(2)
    expect(elternteil[1], personId).toBe('fehlt')
  }
  // Z7
  expect(k.fehlend, personId).toEqual(k.aufschluesselung.filter((a) => a.zustand === 'unbelegt' || a.zustand === 'fehlt').map((a) => a.id))
  expect(k.erfuellt + k.fehlend.length, personId).toBe(k.anwendbar)
}

describe('Invariante: Kernangaben, Sterbeort und offene Punkte sind konsistent (Vorarbeiten AP-1.30, PR 7)', () => {
  it('Z1–Z7 für jede Person erzeugter Bestände; jede Herkunft, jeder todesort-Zustand und jeder offene Elternplatz kommt vor', () => {
    const deckung: Deckung = { herkunft: new Set(), todesortZustand: new Set(), elternPunkt: new Set(), personen: 0 }
    fc.assert(
      fc.property(bestandArb, ({ personen, platzhalterAnteil }) => {
        const db = oeffnen(':memory:')
        try {
          migrieren(db)
          for (const personId of bestandAufbauen(db, personen, platzhalterAnteil)) pruefePerson(db, personId, deckung)
        } finally {
          db.close()
        }
      }),
      { seed: SEED, numRuns: LAEUFE },
    )
    expect(deckung.personen).toBeGreaterThan(50)
    expect([...deckung.herkunft].sort()).toEqual(['aussage', 'ereignis', 'null'])
    expect([...deckung.todesortZustand].sort()).toEqual(['belegt', 'fehlt', 'unbelegt', 'vorhanden'])
    expect([...deckung.elternPunkt].sort()).toEqual(['elternteil', 'mutter', 'vater'])
  })
})
