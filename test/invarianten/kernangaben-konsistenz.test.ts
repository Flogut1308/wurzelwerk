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
//   Z8  Lebensdaten mit Herkunft (AP-1.30 PR 1b, docs/80 §33 U-130-1-folgepunkte), für JEDE Person
//       (auch Platzhalter und nicht Verstorbene) und jede Angabe aus `LEBENSDATUM_ANGABEN`:
//       a) `lebensdaten` hat genau die vier Angaben in dieser Reihenfolge; Herkunft `null` ⇒ alle
//          Felder `null`; `aussage` ⇒ keine `ereignis_id`; `ereignis` ⇒ keine `aussage_id`.
//       b) `lebensdaten[todesort]` ≡ `sterbeort` (Herkunft, `ort_id`, `ort_name`, `aussage_id`;
//          `sterbeort` trägt keine `ereignis_id`).
//       c) Herkunft `aussage`: die Aussage gehört zur Person, hat das Prädikat der Angabe und trägt
//          einen Wert (Ort: Verweis oder freier Text, nie Zahl; bei Ort ist `ort_id` ihr Verweis).
//          Herkunft `ereignis`: keine Aussage der Person trägt einen Wert (die Aussage führt); das
//          Ereignis hat den Typ geburt/tod, die Person ist daran mit einer Rolle aus
//          `RUECKFALL_ROLLEN` beteiligt, und es trägt Datum (Wert ODER Originaltext) bzw. Ort
//          (`ort_id` = sein Ort). Herkunft `null`: weder eine Aussage noch ein solches Ereignis trägt
//          einen Wert. Das Orakel liest die Tabellen direkt, nicht über `lebensdatumAufloesen`.
//       d) Hat `kernangaben` eine Zeile der Angabe: Herkunft `null` ⇔ `fehlt`; `ereignis` ⇒
//          `vorhanden`/`belegt`; `aussage` ⇒ `belegt`/`unbelegt`.
//       Lebend-Filter: die Leser filtern NICHT gleich, und das ist so entschieden (docs/80 §33
//       V-130-1-lebend): `lebensdaten` (und damit `sterbeort`) liefern die Todesangaben unabhängig
//       vom Lebensstatus, die Oberfläche blendet sie bei nicht Verstorbenen aus
//       (src/renderer/ansichten/profil/profil-lebensdaten-logik.ts); `kernangaben` führt
//       todesdatum/todesort nur bei `verstorben` (Z3). Z8c verlangt darum die Statusunabhängigkeit
//       von `lebensdaten`; Z8d vergleicht nur, wo es die Kernangaben-Zeile gibt.
// Deckung: der Lauf zählt, dass jede Sterbeort-Herkunft, jeder todesort-Zustand und jeder offene
// Elternplatz-Schlüssel mindestens einmal vorkam — sonst prüfte die Invariante leere Mengen. Für Z8
// je Angabe × Herkunft (aussage/ereignis/null) eine Mindestzahl, dazu die Fälle, an denen eine
// abweichende Auswahl auffiele (mehrere tragende Todesort-Aussagen bzw. Tod-Ereignisse), Ereignisse
// nur mit Originaltext, Todesangaben nicht Verstorbener und Orts-Aussagen ohne Ort hinter einem
// Ereignis. Die seltenen Fälle erzeugt `zusatz` (unten) gezielt.
// Grenzen (hueter #133): die Invariante prüft die Konsistenz ZWISCHEN den Lesern und (Z8c) gegen die
// Tabellen. Einen Fehler, den alle Leser gleich machen — z. B. eine Rolle fehlt in `RUECKFALL_ROLLEN`
// (Z8c prüft gegen dieselbe Liste) oder die Wahl unter mehreren tragenden Kandidaten (bevorzugt,
// kleinste `id`) ist falsch —, fangen die Einheitstests (test/einheit/kernangaben*.test.ts,
// lebensdaten.test.ts), nicht diese Datei. Z5 ist bewusst als „Zustand `fehlt` ⇔ offener Punkt"
// formuliert, nicht als „Id ∈ fehlend ⇔ Punkt": ein besetzter Platz mit unbelegter Kante steht in
// `fehlend` (`unbelegt`), löst aber keinen offenen Punkt aus.
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
import { LEBENSDATUM_ANGABEN, RUECKFALL_ROLLEN, type LebensdatumAngabe } from '../../src/core/person/lebensdaten'

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

/** Seltene Fälle für Z8 (je Person, nach dem Grundplan angelegt, also mit größerer `id`):
 * - `originalEreignis`: Altbestand — ein Geburts- bzw. Tod-Ereignis nur mit Originaltext, ohne Ort.
 * - `zweiterTodesort`: eine zweite Todesort-Aussage (Verweis auf einen zweiten Ort), ggf. bevorzugt.
 * - `zweitesTodEreignis`: ein zweites Tod-Ereignis (`verstorbener`) mit Datum und zweitem Ort. */
interface ZusatzPlan {
  readonly originalEreignis: 'keins' | 'geburt' | 'tod'
  readonly zweiterTodesort: 'keine' | 'nachrangig' | 'bevorzugt'
  readonly zweitesTodEreignis: boolean
}

const zusatzArb: fc.Arbitrary<ZusatzPlan> = fc.record({
  originalEreignis: fc.constantFrom('keins', 'keins', 'geburt', 'tod'),
  zweiterTodesort: fc.constantFrom('keine', 'keine', 'nachrangig', 'bevorzugt'),
  zweitesTodEreignis: fc.boolean(),
})

const bestandArb = fc.record({
  personen: fc.array(personArb, { minLength: 2, maxLength: 7 }),
  platzhalterAnteil: fc.array(fc.boolean(), { minLength: 7, maxLength: 7 }),
  zusatz: fc.array(zusatzArb, { minLength: 7, maxLength: 7 }),
})

interface Deckung {
  readonly herkunft: Set<string>
  readonly todesortZustand: Set<string>
  readonly elternPunkt: Set<string>
  /** Z8: Treffer je `<angabe>:<herkunft>` bzw. je Sonderfall. */
  readonly lebensdaten: Map<string, number>
  personen: number
}

function zaehle(karte: Map<string, number>, schluessel: string): void {
  karte.set(schluessel, (karte.get(schluessel) ?? 0) + 1)
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

/** Altbestand „Ereignis nur mit Originaltext" (V-D9-ereignisdatum, V-130-1-original): die Befehle
 * verlangen zu einem Datum `wert1`, darum wie beim Orts-Altbestand ohne Befehlsbus nachgetragen. */
function originalEreignis(db: Db, personId: string, typ: 'geburt' | 'tod'): void {
  const { id } = fuehreAus(db, 'ereignis.anlegen', {
    typ,
    beteiligungen: [{ personId, rolle: typ === 'geburt' ? 'kind' : 'verstorbener' }],
    konfidenz: 3,
  })
  journalAus(db, 'invariante: Altbestand Ereignis nur mit Originaltext')
  try {
    db.prepare<{ readonly id: string }>(`UPDATE ereignis SET datum_originaltext = 'Mariä Lichtmess' WHERE id = @id`).run({ id })
  } finally {
    journalAn(db)
  }
}

function zusatzAufbauen(db: Db, personId: string, plan: ZusatzPlan, zweiterOrtId: string): void {
  if (plan.originalEreignis !== 'keins') originalEreignis(db, personId, plan.originalEreignis)
  if (plan.zweiterTodesort !== 'keine') {
    fuehreAus(db, 'aussage.anlegen', {
      subjektTyp: 'person',
      subjektId: personId,
      praedikat: 'todesort',
      wertRefId: zweiterOrtId,
      konfidenz: 3,
      ...(plan.zweiterTodesort === 'bevorzugt' ? { istBevorzugt: 1 as const } : {}),
    })
  }
  if (plan.zweitesTodEreignis) {
    fuehreAus(db, 'ereignis.anlegen', {
      typ: 'tod',
      ortId: zweiterOrtId,
      datum: { modifikator: 'exakt' as const, praezision: 'jahr' as const, wert1: '1901' },
      beteiligungen: [{ personId, rolle: 'verstorbener' }],
      konfidenz: 3,
    })
  }
}

function bestandAufbauen(db: Db, personen: readonly PersonPlan[], platzhalter: readonly boolean[], zusatz: readonly ZusatzPlan[]): readonly string[] {
  const ortId = fuehreAus(db, 'ort.anlegen', { name: 'Kirchdorf', typ: 'dorf' }).id
  const zweiterOrtId = fuehreAus(db, 'ort.anlegen', { name: 'Nachbarort', typ: 'dorf' }).id
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
    const zusatzPlan = zusatz[i]
    if (zusatzPlan !== undefined) zusatzAufbauen(db, id, zusatzPlan, zweiterOrtId)
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

interface AussageOrakel {
  readonly id: string
  readonly subjekt_typ: string
  readonly subjekt_id: string
  readonly praedikat: string
  readonly wert_text: string | null
  readonly wert_zahl: number | null
  readonly wert_ref_id: string | null
  readonly datum_wert1: string | null
}

interface EreignisOrakel {
  readonly id: string
  readonly typ: string
  readonly rolle: string
  readonly ort_id: string | null
  readonly datum_wert1: string | null
  readonly datum_originaltext: string | null
}

function istOrt(angabe: LebensdatumAngabe): boolean {
  return angabe === 'geburtsort' || angabe === 'todesort'
}

/** Orakel „trägt einen Wert" direkt aus den Spalten (docs/80 §32 D1, V-5-altbestand, V-D9-ereignisdatum). */
function aussageTraegt(angabe: LebensdatumAngabe, a: AussageOrakel): boolean {
  if (istOrt(angabe)) return a.wert_ref_id !== null || a.wert_text !== null
  return a.wert_text !== null || a.wert_zahl !== null || a.wert_ref_id !== null || a.datum_wert1 !== null
}

function ereignisTraegt(angabe: LebensdatumAngabe, e: EreignisOrakel): boolean {
  if (istOrt(angabe)) return e.ort_id !== null
  return e.datum_wert1 !== null || e.datum_originaltext !== null
}

function artVon(angabe: LebensdatumAngabe): 'geburt' | 'tod' {
  return angabe === 'geburtsdatum' || angabe === 'geburtsort' ? 'geburt' : 'tod'
}

/** Z8 für EINE Person (Kopfkommentar). */
function pruefeLebensdaten(db: Db, personId: string, detail: ReturnType<typeof personDetail>, deckung: Deckung): void {
  const aussagen = db
    .prepare<{ readonly id: string }, AussageOrakel>(
      `SELECT id AS id, subjekt_typ AS subjekt_typ, subjekt_id AS subjekt_id, praedikat AS praedikat, wert_text AS wert_text,
              wert_zahl AS wert_zahl, wert_ref_id AS wert_ref_id, datum_wert1 AS datum_wert1
       FROM aussage WHERE subjekt_typ = 'person' AND subjekt_id = @id`,
    )
    .all({ id: personId })
  const ereignisse = db
    .prepare<{ readonly id: string }, EreignisOrakel>(
      `SELECT e.id AS id, e.typ AS typ, b.rolle AS rolle, e.ort_id AS ort_id, e.datum_wert1 AS datum_wert1, e.datum_originaltext AS datum_originaltext
       FROM beteiligung b JOIN ereignis e ON e.id = b.ereignis_id WHERE b.person_id = @id`,
    )
    .all({ id: personId })
  const verstorben = detail.kopf.lebend_status === 'verstorben'

  // Z8a
  expect(detail.lebensdaten.map((l) => l.angabe), personId).toEqual([...LEBENSDATUM_ANGABEN])
  for (const eintrag of detail.lebensdaten) {
    const angabe = eintrag.angabe
    const text = `${personId} ${angabe}`
    const art = artVon(angabe)
    const tragendeAussagen = aussagen.filter((a) => a.praedikat === angabe && aussageTraegt(angabe, a))
    const tragendeEreignisse = ereignisse.filter((e) => e.typ === art && RUECKFALL_ROLLEN[art].includes(e.rolle) && ereignisTraegt(angabe, e))
    zaehle(deckung.lebensdaten, `${angabe}:${eintrag.herkunft ?? 'null'}`)
    if (eintrag.herkunft === null) {
      expect(eintrag, text).toEqual({ angabe, herkunft: null, aussage_id: null, ereignis_id: null, datum: null, datum_originaltext: null, ort_id: null, ort_name: null })
      // Z8c
      expect(tragendeAussagen, text).toEqual([])
      expect(tragendeEreignisse, text).toEqual([])
    } else if (eintrag.herkunft === 'aussage') {
      expect(eintrag.ereignis_id, text).toBeNull()
      const aussage = aussagen.find((a) => a.id === eintrag.aussage_id)
      expect(aussage, `${text} (Aussage der Person)`).toBeDefined()
      if (aussage === undefined) continue
      expect([aussage.subjekt_typ, aussage.subjekt_id, aussage.praedikat], text).toEqual(['person', personId, angabe])
      expect(aussageTraegt(angabe, aussage), text).toBe(true)
      if (istOrt(angabe)) expect(eintrag.ort_id, text).toBe(aussage.wert_ref_id)
      if (tragendeAussagen.length > 1) zaehle(deckung.lebensdaten, `${angabe}:aussage:mehrere`)
    } else {
      expect(eintrag.aussage_id, text).toBeNull()
      expect(tragendeAussagen, `${text} (die Aussage führt)`).toEqual([])
      const ereignis = tragendeEreignisse.find((e) => e.id === eintrag.ereignis_id)
      expect(ereignis, `${text} (Rückfall-Ereignis mit Wert)`).toBeDefined()
      if (ereignis === undefined) continue
      if (istOrt(angabe)) expect(eintrag.ort_id, text).toBe(ereignis.ort_id)
      else expect(eintrag.datum_originaltext, text).toBe(ereignis.datum_originaltext)
      if (!istOrt(angabe) && ereignis.datum_wert1 === null) zaehle(deckung.lebensdaten, `${angabe}:ereignis:originaltext`)
      if (new Set(tragendeEreignisse.map((e) => e.id)).size > 1) zaehle(deckung.lebensdaten, `${angabe}:ereignis:mehrere`)
      if (istOrt(angabe) && aussagen.some((a) => a.praedikat === angabe)) zaehle(deckung.lebensdaten, `${angabe}:ereignis:aussage_ohne_ort`)
    }
    if (art === 'tod' && !verstorben && eintrag.herkunft !== null) zaehle(deckung.lebensdaten, `${angabe}:nicht_verstorben`)
    // Z8d
    const zeile = detail.kernangaben?.aufschluesselung.find((a) => a.id === angabe)
    if (zeile !== undefined) {
      expect(eintrag.herkunft === null, text).toBe(zeile.zustand === 'fehlt')
      if (eintrag.herkunft === 'ereignis') expect(['belegt', 'vorhanden'], text).toContain(zeile.zustand)
      if (eintrag.herkunft === 'aussage') expect(['belegt', 'unbelegt'], text).toContain(zeile.zustand)
    }
  }
  // Z8b
  const todesort = detail.lebensdaten.find((l) => l.angabe === 'todesort')
  expect(todesort, personId).toBeDefined()
  if (todesort === undefined) return
  expect(detail.sterbeort, personId).toEqual(
    todesort.herkunft === null ? null : { herkunft: todesort.herkunft, ort_id: todesort.ort_id, ort_name: todesort.ort_name, aussage_id: todesort.aussage_id },
  )
}

function pruefePerson(db: Db, personId: string, deckung: Deckung): void {
  const detail = personDetail(db, { personId })
  pruefeLebensdaten(db, personId, detail, deckung)
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
  it('Z1–Z8 für jede Person erzeugter Bestände; jede Herkunft, jeder todesort-Zustand und jeder offene Elternplatz kommt vor', () => {
    const deckung: Deckung = { herkunft: new Set(), todesortZustand: new Set(), elternPunkt: new Set(), lebensdaten: new Map(), personen: 0 }
    fc.assert(
      fc.property(bestandArb, ({ personen, platzhalterAnteil, zusatz }) => {
        const db = oeffnen(':memory:')
        try {
          migrieren(db)
          for (const personId of bestandAufbauen(db, personen, platzhalterAnteil, zusatz)) pruefePerson(db, personId, deckung)
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
    // Z8-Deckung (Stand SEED 20260925: kleinster Grundfall 26, Sonderfälle ab 5).
    const treffer = (schluessel: string): number => deckung.lebensdaten.get(schluessel) ?? 0
    for (const angabe of LEBENSDATUM_ANGABEN) {
      for (const herkunft of ['aussage', 'ereignis', 'null']) expect(treffer(`${angabe}:${herkunft}`), `${angabe}:${herkunft}`).toBeGreaterThanOrEqual(20)
    }
    for (const [schluessel, mindestens] of [
      ['todesort:aussage:mehrere', 20],
      ['todesdatum:ereignis:mehrere', 5],
      ['todesort:ereignis:mehrere', 3],
      ['geburtsdatum:ereignis:originaltext', 10],
      ['todesdatum:ereignis:originaltext', 10],
      ['geburtsort:ereignis:aussage_ohne_ort', 3],
      ['todesort:ereignis:aussage_ohne_ort', 3],
      ['todesdatum:nicht_verstorben', 20],
      ['todesort:nicht_verstorben', 20],
    ] as const) {
      expect(treffer(schluessel), schluessel).toBeGreaterThanOrEqual(mindestens)
    }
  })
})
