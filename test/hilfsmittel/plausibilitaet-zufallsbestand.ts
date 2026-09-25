// AP-1.34 PR-C2b (§31 U-1.34-C2-O1): deterministischer, absichtlich fehlerhafter Bestand für den
// Konsistenztest „Feldwarnungen je Person = Prüfhinweise des Gesamtbestands, gefiltert auf die
// Person". Seed-gesteuerter LCG statt `Math.random` (CLAUDE.md §13: reproduzierbar). Erzeugt alle
// Fälle, die die Bestandsregeln unterscheiden: Platzhalter, fehlendes/gemischtes Geschlecht,
// mehrere (bevorzugte/nicht bevorzugte) Datumsaussagen, doppelte Elternkanten, Selbstkanten und
// Zyklen, Partnerschaften mit einem/mehreren Beteiligten, Ereignisse mit/ohne Ort und Datum,
// doppelte Beteiligung derselben Person, Bestattungen mit anderer Rolle. Rohes SQL wie in
// `test/einheit/abfrage-person-detail.test.ts` — Befehle würden Zyklen verhindern.
import type Database from 'better-sqlite3'
import { nachJdn } from '../../src/core/datum/kalender'

function lcg(seed: number): () => number {
  let zustand = seed >>> 0
  return () => {
    zustand = (Math.imul(zustand, 1664525) + 1013904223) >>> 0
    return zustand / 0x100000000
  }
}

export interface ZufallsBestand {
  readonly personIds: readonly string[]
}

export function zufallsBestandAufbauen(db: Database.Database, seed: number, anzahlPersonen = 60): ZufallsBestand {
  const zufall = lcg(seed)
  const ganz = (n: number): number => Math.floor(zufall() * n)
  const wahl = <T>(liste: readonly T[]): T => {
    const wert = liste[ganz(liste.length)]
    if (wert === undefined) throw new RangeError('wahl: leere Liste')
    return wert
  }
  const jahr = (j: number): { readonly von: number; readonly bis: number } => ({ von: nachJdn(j, 1, 1, 'gregorian'), bis: nachJdn(j, 12, 31, 'gregorian') })
  const vielleichtJahr = (basis: number, streuung: number): { readonly von: number | null; readonly bis: number | null } => {
    if (zufall() < 0.2) return { von: null, bis: null }
    return jahr(basis + ganz(streuung))
  }

  const personIds: string[] = []
  const person = db.prepare(`INSERT INTO person (id, privat, ist_platzhalter, geschlecht) VALUES (@id, 0, @istPlatzhalter, @geschlecht)`)
  const aussage = db.prepare(
    `INSERT INTO aussage (id, subjekt_typ, subjekt_id, praedikat, datum_sort_von, datum_sort_bis, ist_bevorzugt)
     VALUES (@id, 'person', @personId, @praedikat, @von, @bis, @istBevorzugt)`,
  )
  for (let i = 0; i < anzahlPersonen; i += 1) {
    const id = `p-${String(i).padStart(3, '0')}`
    personIds.push(id)
    person.run({ id, istPlatzhalter: i % 13 === 7 ? 1 : 0, geschlecht: wahl(['M', 'F', 'F', 'M', 'U', null]) })
    const geburtsjahr = 1700 + ganz(200)
    // hueter PR #121 H1: jede sechste Person bekommt sicher Geburt UND ein bevorzugtes Todesdatum
    // vor der Geburt (erste Todesaussage), damit `tod_vor_geburt` in jedem Seed mehrfach vorkommt.
    const rueckdatiert = i % 6 === 1
    for (const [praedikat, basis, streuung] of [['geburtsdatum', geburtsjahr - 2, 5], ['todesdatum', geburtsjahr - 30, 160]] as const) {
      const anzahl = Math.max(ganz(3), rueckdatiert ? 1 : 0)
      for (let a = 0; a < anzahl; a += 1) {
        const zufallsJahr = basis + ganz(streuung)
        const zufallsBevorzugt = zufall() < 0.4 ? 1 : 0
        const erzwungen = rueckdatiert && praedikat === 'todesdatum' && a === 0
        const { von, bis } = jahr(erzwungen ? geburtsjahr - 5 : zufallsJahr)
        aussage.run({ id: `a-${id}-${praedikat}-${a}`, personId: id, praedikat, von, bis, istBevorzugt: erzwungen ? 1 : zufallsBevorzugt })
      }
    }
  }

  const elternschaft = db.prepare(`INSERT INTO elternschaft (id, elternteil_id, kind_id, typ) VALUES (@id, @elternteilId, @kindId, 'biologisch')`)
  for (let e = 0; e < anzahlPersonen * 1.5; e += 1) {
    elternschaft.run({ id: `e-${String(e).padStart(4, '0')}`, elternteilId: wahl(personIds), kindId: wahl(personIds) })
  }

  const partnerschaft = db.prepare(`INSERT INTO partnerschaft (id, typ, beginn_sort_von, beginn_sort_bis) VALUES (@id, 'ehe_zivil', @von, @bis)`)
  const partner = db.prepare(`INSERT OR IGNORE INTO partnerschaft_person (partnerschaft_id, person_id) VALUES (@partnerschaftId, @personId)`)
  for (let p = 0; p < anzahlPersonen / 2; p += 1) {
    const id = `ps-${String(p).padStart(3, '0')}`
    partnerschaft.run({ id, ...vielleichtJahr(1720, 200) })
    const anzahl = 1 + ganz(3)
    for (let b = 0; b < anzahl; b += 1) partner.run({ partnerschaftId: id, personId: wahl(personIds) })
  }

  const ortIds: string[] = []
  const ort = db.prepare(`INSERT INTO ort (id, existiert_von, existiert_bis) VALUES (@id, @von, @bis)`)
  for (let o = 0; o < 8; o += 1) {
    const id = `o-${o}`
    ortIds.push(id)
    const von = zufall() < 0.3 ? null : jahr(1750 + ganz(100)).von
    ort.run({ id, von, bis: von === null ? null : von + 365 * (20 + ganz(150)) })
  }

  const ereignis = db.prepare(`INSERT INTO ereignis (id, typ, ort_id, datum_sort_von, datum_sort_bis) VALUES (@id, @typ, @ortId, @von, @bis)`)
  const beteiligung = db.prepare(`INSERT INTO beteiligung (id, ereignis_id, person_id, rolle) VALUES (@id, @ereignisId, @personId, @rolle)`)
  for (let v = 0; v < anzahlPersonen; v += 1) {
    const id = `ev-${String(v).padStart(3, '0')}`
    ereignis.run({ id, typ: wahl(['beerdigung', 'beerdigung', 'geburt', 'taufe']), ortId: zufall() < 0.2 ? null : wahl(ortIds), ...vielleichtJahr(1700, 300) })
    const anzahl = 1 + ganz(3)
    const erster = wahl(personIds)
    for (let b = 0; b < anzahl; b += 1) {
      // Mit Absicht gelegentlich dieselbe Person zweimal (andere Rolle).
      beteiligung.run({ id: `b-${id}-${b}`, ereignisId: id, personId: zufall() < 0.3 ? erster : wahl(personIds), rolle: wahl(['verstorbener', 'verstorbener', 'hauptperson']) })
    }
  }

  // Vorarbeiten AP-1.30 Teil 3 (E5, `ort_mit_datum`): Orts-Aussagen mit vollem Datum, nur mit
  // Originaltext (Bruchstück der Datumsgruppe), nur mit Gültigkeitszeitraum (kein Datum) oder ganz
  // ohne, dazu ein Nicht-Orts-Prädikat mit Datum. Eigener Zufallsstrom, damit der Bestand oben für
  // jeden Seed unverändert bleibt.
  const ortsZufall = lcg(seed ^ 0x5bd1e995)
  const ortsAussage = db.prepare(
    `INSERT INTO aussage (id, subjekt_typ, subjekt_id, praedikat, wert_text, datum_kalender, datum_modifikator, datum_praezision, datum_wert1, datum_originaltext, datum_sort_von, datum_sort_bis, gueltig_von, gueltig_bis, ist_bevorzugt)
     VALUES (@id, 'person', @personId, @praedikat, 'Ort', @kalender, @modifikator, @praezision, @wert1, @originaltext, @von, @bis, @gueltigVon, @gueltigBis, 1)`,
  )
  personIds.forEach((personId, i) => {
    for (const praedikat of ['geburtsort', 'todesort', 'wohnort', 'beruf'] as const) {
      const anzahl = Math.floor(ortsZufall() * 3)
      for (let a = 0; a < anzahl; a += 1) {
        const art = Math.floor(ortsZufall() * 4)
        const { von, bis } = jahr(1750 + Math.floor(ortsZufall() * 150))
        const voll = art === 0
        ortsAussage.run({
          id: `ao-${String(i).padStart(3, '0')}-${praedikat}-${a}`,
          personId,
          praedikat,
          kalender: voll ? 'gregorian' : null,
          modifikator: voll ? 'exakt' : null,
          praezision: voll ? 'jahr' : null,
          wert1: voll ? '1800' : null,
          originaltext: art === 1 ? 'um 1800' : null,
          von: voll ? von : null,
          bis: voll ? bis : null,
          gueltigVon: art === 2 ? von : null,
          gueltigBis: art === 2 ? bis : null,
        })
      }
    }
  })

  return { personIds }
}
