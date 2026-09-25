// AP-1.8, F-07 (57_Phase0_Arbeitspakete.md „AP-1.8"). `abfrage:pruefhinweise` — Plausibilitäts-
// prüfung über den GESAMTEN Bestand (nicht nur eine gerade importierte Datei, das ist AP-1.4a/
// `src/main/import/trockenlauf.ts`). Read-only SQL gegen `person`/`person_flach`/`aussage`/
// `elternschaft`/`partnerschaft`/`partnerschaft_person`/`ereignis`/`beteiligung`/`ort`
// (CLAUDE.md §2: SQL nur in src/main/abfragen/), KEINE Transaktion, Spalten aufgezählt, benannte
// Parameter, kein `SELECT *`. Reine Lese-Abfrage, kein Journal-/Ereignis-Bezug (§11, ADR-016) —
// sie schreibt nichts, auch nicht bei künftigem Abhaken (das wird ein eigener Befehl,
// docs/80_Offene_Fragen.md).
import type Database from 'better-sqlite3'
import type { JdnIntervall, PlausGeschlecht } from '../../core/plausibilitaet/regeln'
import { pruefeBestand, type BestandEingabe, type BestandEreignis, type BestandOrt, type BestandPartnerschaft, type BestandPerson } from '../../core/plausibilitaet/regeln'
import type { PruefhinweiseAus } from '../../shared/schemata/pruefhinweise'

export function alsIntervall(von: number | null, bis: number | null): JdnIntervall | undefined {
  if (von === null || bis === null) return undefined
  return { von, bis }
}

export function alsGeschlecht(wert: string | null): PlausGeschlecht | undefined {
  if (wert === 'M' || wert === 'F' || wert === 'U' || wert === 'X') return wert
  return undefined
}

/** Defensiv gegen ein `NULL`, das eine vorherige `WHERE`-Bedingung eigentlich ausschließt — ohne
 * `!` formuliert (CLAUDE.md §4), analog dem Muster in `src/core/graph/zyklus.ts::besuchen()`. */
function stringPflicht(wert: string | null, kontext: string): string {
  if (wert === null) {
    throw new Error(`pruefhinweise: ${kontext} unerwartet NULL trotz vorheriger WHERE-Filterung.`)
  }
  return wert
}

interface PersonZeile {
  readonly id: string
  readonly ist_platzhalter: number
  readonly geschlecht: string | null
}

function personenLaden(db: Database.Database): readonly PersonZeile[] {
  return db.prepare<[], PersonZeile>(`SELECT id AS id, ist_platzhalter AS ist_platzhalter, geschlecht AS geschlecht FROM person`).all()
}

interface DatumZeile {
  readonly person_id: string
  readonly von: number
  readonly bis: number
}

/** Bevorzugtes `geburtsdatum`/`todesdatum` je Person — dieselbe "bevorzugter Eintrag zuerst,
 * sonst kleinste `id`"-Fensterfunktion wie in den `abl_person_*`-Triggern
 * (docs/schema/0003_abgeleitet.sql) bzw. `abfrage:person.liste`/`abfrage:person.detail`. Anders
 * als `person_flach.geburt_sort_von`/`tod_sort_von` wird hier zusätzlich `datum_sort_bis` gelesen
 * (für ein vollständiges `JdnIntervall`) — `person_flach` trägt nur `_von`. */
function datumJePraedikatLaden(db: Database.Database, praedikat: string): ReadonlyMap<string, JdnIntervall> {
  const zeilen = db
    .prepare<
      { readonly praedikat: string },
      DatumZeile
    >(`SELECT person_id, von, bis FROM (
         SELECT subjekt_id AS person_id, datum_sort_von AS von, datum_sort_bis AS bis,
           ROW_NUMBER() OVER (PARTITION BY subjekt_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
         FROM aussage
         WHERE subjekt_typ = 'person' AND praedikat = @praedikat AND datum_sort_von IS NOT NULL AND datum_sort_bis IS NOT NULL
       ) WHERE rang = 1`,
    )
    .all({ praedikat })
  return new Map(zeilen.map((zeile) => [zeile.person_id, { von: zeile.von, bis: zeile.bis }] as const))
}

/** Bevorzugtes Bestattungsereignis je Person: `ereignis.typ = 'beerdigung'`, Rolle `verstorbener`
 * (`src/main/import/trockenlauf.ts` nutzt dieselbe Zuordnung). Bei mehreren Bestattungsereignissen
 * je Person (Datenfehler für sich) zählt deterministisch die mit der kleinsten `ereignis.id`. */
function bestattungLaden(db: Database.Database): ReadonlyMap<string, JdnIntervall> {
  const zeilen = db
    .prepare<
      [],
      DatumZeile
    >(`SELECT person_id, von, bis FROM (
         SELECT b.person_id AS person_id, e.datum_sort_von AS von, e.datum_sort_bis AS bis,
           ROW_NUMBER() OVER (PARTITION BY b.person_id ORDER BY e.id) AS rang
         FROM ereignis e
         JOIN beteiligung b ON b.ereignis_id = e.id
         WHERE e.typ = 'beerdigung' AND b.rolle = 'verstorbener' AND e.datum_sort_von IS NOT NULL AND e.datum_sort_bis IS NOT NULL
       ) WHERE rang = 1`,
    )
    .all()
  return new Map(zeilen.map((zeile) => [zeile.person_id, { von: zeile.von, bis: zeile.bis }] as const))
}

interface ElternschaftZeile {
  readonly elternteil_id: string
  readonly kind_id: string
}

function elternschaftenLaden(db: Database.Database): readonly ElternschaftZeile[] {
  return db.prepare<[], ElternschaftZeile>(`SELECT elternteil_id AS elternteil_id, kind_id AS kind_id FROM elternschaft`).all()
}

interface PartnerschaftZeile {
  readonly id: string
  readonly beginn_von: number | null
  readonly beginn_bis: number | null
}

function partnerschaftenLaden(db: Database.Database): readonly PartnerschaftZeile[] {
  return db.prepare<[], PartnerschaftZeile>(`SELECT id AS id, beginn_sort_von AS beginn_von, beginn_sort_bis AS beginn_bis FROM partnerschaft`).all()
}

interface PartnerschaftPersonZeile {
  readonly partnerschaft_id: string
  readonly person_id: string
}

function partnerschaftBeteiligteLaden(db: Database.Database): readonly PartnerschaftPersonZeile[] {
  return db.prepare<[], PartnerschaftPersonZeile>(`SELECT partnerschaft_id AS partnerschaft_id, person_id AS person_id FROM partnerschaft_person`).all()
}

interface OrtZeile {
  readonly id: string
  readonly existiert_von: number | null
  readonly existiert_bis: number | null
}

function orteLaden(db: Database.Database): readonly OrtZeile[] {
  return db.prepare<[], OrtZeile>(`SELECT id AS id, existiert_von AS existiert_von, existiert_bis AS existiert_bis FROM ort`).all()
}

interface EreignisZeile {
  readonly id: string
  readonly ort_id: string | null
  readonly datum_von: number | null
  readonly datum_bis: number | null
}

/** Nur Ereignisse mit gesetztem Ort UND Datum sind für `ereignis_vor_ortsexistenz` relevant. */
function ereignisseLaden(db: Database.Database): readonly EreignisZeile[] {
  return db
    .prepare<
      [],
      EreignisZeile
    >(`SELECT id AS id, ort_id AS ort_id, datum_sort_von AS datum_von, datum_sort_bis AS datum_bis
       FROM ereignis
       WHERE ort_id IS NOT NULL AND datum_sort_von IS NOT NULL AND datum_sort_bis IS NOT NULL`,
    )
    .all()
}

interface BeteiligungZeile {
  readonly ereignis_id: string
  readonly person_id: string
}

function beteiligungenLaden(db: Database.Database): readonly BeteiligungZeile[] {
  return db.prepare<[], BeteiligungZeile>(`SELECT ereignis_id AS ereignis_id, person_id AS person_id FROM beteiligung`).all()
}

interface AnzeigenameZeile {
  readonly person_id: string
  readonly anzeigename: string
}

function anzeigenamenLaden(db: Database.Database): ReadonlyMap<string, string> {
  const zeilen = db.prepare<[], AnzeigenameZeile>(`SELECT person_id AS person_id, anzeigename AS anzeigename FROM person_flach`).all()
  return new Map(zeilen.map((zeile) => [zeile.person_id, zeile.anzeigename] as const))
}

function bestandEingabeLaden(db: Database.Database): BestandEingabe {
  const geburtKarte = datumJePraedikatLaden(db, 'geburtsdatum')
  const todKarte = datumJePraedikatLaden(db, 'todesdatum')
  const bestattungKarte = bestattungLaden(db)

  const personen: readonly BestandPerson[] = personenLaden(db).map((zeile) => ({
    id: zeile.id,
    istPlatzhalter: zeile.ist_platzhalter === 1,
    geschlecht: alsGeschlecht(zeile.geschlecht),
    geburt: geburtKarte.get(zeile.id),
    tod: todKarte.get(zeile.id),
    bestattung: bestattungKarte.get(zeile.id),
  }))

  const elternschaften = elternschaftenLaden(db).map((zeile) => ({ elternteilId: zeile.elternteil_id, kindId: zeile.kind_id }))

  const beteiligteJePartnerschaft = new Map<string, string[]>()
  for (const zeile of partnerschaftBeteiligteLaden(db)) {
    const liste = beteiligteJePartnerschaft.get(zeile.partnerschaft_id) ?? []
    liste.push(zeile.person_id)
    beteiligteJePartnerschaft.set(zeile.partnerschaft_id, liste)
  }
  const partnerschaften: readonly BestandPartnerschaft[] = partnerschaftenLaden(db).map((zeile) => ({
    beginn: alsIntervall(zeile.beginn_von, zeile.beginn_bis),
    beteiligteIds: beteiligteJePartnerschaft.get(zeile.id) ?? [],
  }))

  const orte: readonly BestandOrt[] = orteLaden(db).map((zeile) => ({
    id: zeile.id,
    existiert: alsIntervall(zeile.existiert_von, zeile.existiert_bis),
  }))

  const beteiligteJeEreignis = new Map<string, string[]>()
  for (const zeile of beteiligungenLaden(db)) {
    const liste = beteiligteJeEreignis.get(zeile.ereignis_id) ?? []
    liste.push(zeile.person_id)
    beteiligteJeEreignis.set(zeile.ereignis_id, liste)
  }
  const ereignisse: readonly BestandEreignis[] = ereignisseLaden(db).map((zeile) => ({
    ortId: stringPflicht(zeile.ort_id, 'ereignis.ort_id'),
    datum: alsIntervall(zeile.datum_von, zeile.datum_bis),
    beteiligteIds: beteiligteJeEreignis.get(zeile.id) ?? [],
  }))

  return { personen, elternschaften, partnerschaften, orte, ereignisse }
}

/** `abfrage:pruefhinweise` (AP-1.8, 70_UX_Konzept.md §2). */
export function pruefhinweise(db: Database.Database): PruefhinweiseAus {
  const eingabe = bestandEingabeLaden(db)
  const anzeigenamenKarte = anzeigenamenLaden(db)

  const eintraege = pruefeBestand(eingabe).map((hinweis) => ({
    code: hinweis.code,
    personId: hinweis.personId,
    anzeigename: anzeigenamenKarte.get(hinweis.personId) ?? hinweis.personId,
  }))

  return { eintraege, anzahl: eintraege.length }
}
