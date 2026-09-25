// AP-1.34 PR-C2b (F-07, docs/80_Offene_Fragen.md §31 U-1.34-C2-O1): lädt für EINE Person genau den
// Ausschnitt des Bestands, den `pruefeBestand` (src/core/plausibilitaet/regeln.ts) braucht, um alle
// Hinweise AN DIESER PERSON zu finden — statt des Gesamtbestands wie `abfrage:pruefhinweise`
// (./pruefhinweise.ts; Budget 1000 ms, für jede `person.detail`-Antwort zu teuer). Kein eigener
// Kanal, Hilfsmodul von `person-detail.ts` (Unterstrich-Präfix).
//
// Welche Regel braucht was (Hinweise an P = `personId`):
// - tod_vor_geburt / bestattung_vor_tod / alter_ueber_110: P mit Geburt, Tod, Bestattung.
// - mutter_alter / vater_alter (Hinweis am ELTERNTEIL): P mit Geschlecht, alle Elternschaften
//   `elternteil_id = P` und die Kinder mit Geburt und Platzhalter-Flag.
// - kind_vor_ehe (Hinweis am KIND): die Elternschaften `kind_id = P` und jede Partnerschaft, an der
//   einer von Ps Elternteilen beteiligt ist (mit Beginn und allen Beteiligten).
// - ereignis_vor_ortsexistenz: jedes Ereignis mit Ort und Datum, an dem P beteiligt ist, mit ALLEN
//   Beteiligungszeilen (eine doppelte Beteiligung von P ergibt wie im Gesamtbestand zwei Hinweise)
//   und dem Ort samt Existenzzeitraum.
// - zyklus: nicht über `pruefeBestand` (dessen `findeZyklusKnoten` meldet nur den ersten Zyklus des
//   Gesamtgraphen), sondern über die Vorfahrenkanten (`vorfahrenKantenLaden`) und
//   `istEigenerVorfahre` (src/core/graph/zyklus.ts).
// Hinweise an ANDEREN Personen, die dieser Ausschnitt nebenbei erzeugt, filtert
// `feldwarnungenFuer` (src/core/plausibilitaet/feldwarnungen.ts) heraus.
//
// Nur lesendes SQL (CLAUDE.md §2), keine Transaktion, Spalten aufgezählt, benannte Parameter. Die
// Datumsauswahl (bevorzugter Eintrag, sonst kleinste id) und die Bestattungsauswahl sind dieselben
// wie in ./pruefhinweise.ts — der Konsistenztest `test/einheit/abfrage-person-detail-warnungen.test.ts`
// (W6) hält beide gleich.
import type Database from 'better-sqlite3'
import type { Elternkante } from '../../core/graph/zyklus'
import type { BestandEingabe, BestandEreignis, BestandOrt, BestandPartnerschaft, BestandPerson, JdnIntervall } from '../../core/plausibilitaet/regeln'
import { alsGeschlecht, alsIntervall } from './pruefhinweise'

type PersonParameter = { readonly personId: string }

/** P selbst und Ps Kinder — die einzigen Personen, deren Daten eine Regel für einen Hinweis an P liest. */
const UMFELD_CTE = `umfeld(id) AS (
  SELECT @personId
  UNION
  SELECT kind_id FROM elternschaft WHERE elternteil_id = @personId
)`

interface PersonZeile {
  readonly id: string
  readonly ist_platzhalter: number
  readonly geschlecht: string | null
}

interface DatumZeile {
  readonly person_id: string
  readonly von: number
  readonly bis: number
}

function personenLaden(db: Database.Database, personId: string): readonly PersonZeile[] {
  return db
    .prepare<PersonParameter, PersonZeile>(
      `WITH ${UMFELD_CTE}
       SELECT p.id AS id, p.ist_platzhalter AS ist_platzhalter, p.geschlecht AS geschlecht
       FROM person p
       WHERE p.id IN (SELECT id FROM umfeld)
       ORDER BY p.id`,
    )
    .all({ personId })
}

function datumJePraedikatLaden(db: Database.Database, personId: string, praedikat: 'geburtsdatum' | 'todesdatum'): ReadonlyMap<string, JdnIntervall> {
  const zeilen = db
    .prepare<PersonParameter & { readonly praedikat: string }, DatumZeile>(
      `WITH ${UMFELD_CTE}
       SELECT person_id, von, bis FROM (
         SELECT subjekt_id AS person_id, datum_sort_von AS von, datum_sort_bis AS bis,
           ROW_NUMBER() OVER (PARTITION BY subjekt_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
         FROM aussage
         WHERE subjekt_typ = 'person' AND praedikat = @praedikat AND datum_sort_von IS NOT NULL AND datum_sort_bis IS NOT NULL
           AND subjekt_id IN (SELECT id FROM umfeld)
       ) WHERE rang = 1`,
    )
    .all({ personId, praedikat })
  return new Map(zeilen.map((zeile) => [zeile.person_id, { von: zeile.von, bis: zeile.bis }] as const))
}

function bestattungLaden(db: Database.Database, personId: string): ReadonlyMap<string, JdnIntervall> {
  const zeilen = db
    .prepare<PersonParameter, DatumZeile>(
      `WITH ${UMFELD_CTE}
       SELECT person_id, von, bis FROM (
         SELECT b.person_id AS person_id, e.datum_sort_von AS von, e.datum_sort_bis AS bis,
           ROW_NUMBER() OVER (PARTITION BY b.person_id ORDER BY e.id) AS rang
         FROM ereignis e
         JOIN beteiligung b ON b.ereignis_id = e.id
         WHERE e.typ = 'beerdigung' AND b.rolle = 'verstorbener' AND e.datum_sort_von IS NOT NULL AND e.datum_sort_bis IS NOT NULL
           AND b.person_id IN (SELECT id FROM umfeld)
       ) WHERE rang = 1`,
    )
    .all({ personId })
  return new Map(zeilen.map((zeile) => [zeile.person_id, { von: zeile.von, bis: zeile.bis }] as const))
}

interface ElternschaftZeile {
  readonly elternteil_id: string
  readonly kind_id: string
}

function elternschaftenLaden(db: Database.Database, personId: string): readonly ElternschaftZeile[] {
  return db
    .prepare<PersonParameter, ElternschaftZeile>(
      `SELECT elternteil_id AS elternteil_id, kind_id AS kind_id
       FROM elternschaft
       WHERE elternteil_id = @personId OR kind_id = @personId
       ORDER BY id`,
    )
    .all({ personId })
}

interface PartnerschaftZeile {
  readonly id: string
  readonly beginn_von: number | null
  readonly beginn_bis: number | null
}

interface ZuordnungZeile {
  readonly gruppe_id: string
  readonly person_id: string
}

/** Partnerschaften mit mindestens einem Elternteil von P unter den Beteiligten. */
const ELTERN_PARTNERSCHAFTEN = `SELECT pp.partnerschaft_id FROM partnerschaft_person pp
  WHERE pp.person_id IN (SELECT elternteil_id FROM elternschaft WHERE kind_id = @personId)`

function partnerschaftenLaden(db: Database.Database, personId: string): readonly BestandPartnerschaft[] {
  const zeilen = db
    .prepare<PersonParameter, PartnerschaftZeile>(
      `SELECT id AS id, beginn_sort_von AS beginn_von, beginn_sort_bis AS beginn_bis
       FROM partnerschaft
       WHERE id IN (${ELTERN_PARTNERSCHAFTEN})
       ORDER BY id`,
    )
    .all({ personId })
  const beteiligte = db
    .prepare<PersonParameter, ZuordnungZeile>(
      `SELECT partnerschaft_id AS gruppe_id, person_id AS person_id
       FROM partnerschaft_person
       WHERE partnerschaft_id IN (${ELTERN_PARTNERSCHAFTEN})
       ORDER BY partnerschaft_id, person_id`,
    )
    .all({ personId })
  const karte = gruppieren(beteiligte)
  return zeilen.map((zeile) => ({ beginn: alsIntervall(zeile.beginn_von, zeile.beginn_bis), beteiligteIds: karte.get(zeile.id) ?? [] }))
}

interface EreignisZeile {
  readonly id: string
  readonly ort_id: string
  readonly datum_von: number
  readonly datum_bis: number
}

/** Ereignisse mit Ort UND Datum, an denen P beteiligt ist — nur die sind für
 * `ereignis_vor_ortsexistenz` relevant (wie `ereignisseLaden` in ./pruefhinweise.ts). */
const EIGENE_EREIGNISSE = `SELECT e.id FROM ereignis e
  WHERE e.ort_id IS NOT NULL AND e.datum_sort_von IS NOT NULL AND e.datum_sort_bis IS NOT NULL
    AND e.id IN (SELECT ereignis_id FROM beteiligung WHERE person_id = @personId)`

function ereignisseLaden(db: Database.Database, personId: string): { readonly ereignisse: readonly BestandEreignis[]; readonly orte: readonly BestandOrt[] } {
  const zeilen = db
    .prepare<PersonParameter, EreignisZeile>(
      `SELECT id AS id, ort_id AS ort_id, datum_sort_von AS datum_von, datum_sort_bis AS datum_bis
       FROM ereignis
       WHERE id IN (${EIGENE_EREIGNISSE})
       ORDER BY id`,
    )
    .all({ personId })
  const beteiligungen = db
    .prepare<PersonParameter, ZuordnungZeile>(
      `SELECT ereignis_id AS gruppe_id, person_id AS person_id
       FROM beteiligung
       WHERE ereignis_id IN (${EIGENE_EREIGNISSE})
       ORDER BY ereignis_id, id`,
    )
    .all({ personId })
  const orte = db
    .prepare<PersonParameter, { readonly id: string; readonly existiert_von: number | null; readonly existiert_bis: number | null }>(
      `SELECT id AS id, existiert_von AS existiert_von, existiert_bis AS existiert_bis
       FROM ort
       WHERE id IN (SELECT ort_id FROM ereignis WHERE id IN (${EIGENE_EREIGNISSE}))
       ORDER BY id`,
    )
    .all({ personId })
  const karte = gruppieren(beteiligungen)
  return {
    ereignisse: zeilen.map((zeile) => ({ ortId: zeile.ort_id, datum: { von: zeile.datum_von, bis: zeile.datum_bis }, beteiligteIds: karte.get(zeile.id) ?? [] })),
    orte: orte.map((zeile) => ({ id: zeile.id, existiert: alsIntervall(zeile.existiert_von, zeile.existiert_bis) })),
  }
}

function gruppieren(zeilen: readonly ZuordnungZeile[]): ReadonlyMap<string, readonly string[]> {
  const karte = new Map<string, string[]>()
  for (const zeile of zeilen) {
    const liste = karte.get(zeile.gruppe_id) ?? []
    liste.push(zeile.person_id)
    karte.set(zeile.gruppe_id, liste)
  }
  return karte
}

/** Das Umfeld von P als `BestandEingabe` für `pruefeBestand` (ohne `zyklus`, s. Kopfkommentar). */
export function personUmfeldLaden(db: Database.Database, personId: string): BestandEingabe {
  const geburt = datumJePraedikatLaden(db, personId, 'geburtsdatum')
  const tod = datumJePraedikatLaden(db, personId, 'todesdatum')
  const bestattung = bestattungLaden(db, personId)
  const personen: readonly BestandPerson[] = personenLaden(db, personId).map((zeile) => ({
    id: zeile.id,
    istPlatzhalter: zeile.ist_platzhalter === 1,
    geschlecht: alsGeschlecht(zeile.geschlecht),
    geburt: geburt.get(zeile.id),
    tod: tod.get(zeile.id),
    bestattung: bestattung.get(zeile.id),
  }))
  const elternschaften = elternschaftenLaden(db, personId).map((zeile) => ({ elternteilId: zeile.elternteil_id, kindId: zeile.kind_id }))
  const { ereignisse, orte } = ereignisseLaden(db, personId)
  return { personen, elternschaften, partnerschaften: partnerschaftenLaden(db, personId), orte, ereignisse }
}

/** Alle Elternkanten oberhalb von P (Vorfahren, transitiv), ohne Kanten mit einem Platzhalter auf
 * einer Seite — wie `pruefeBestandZyklus` (A-17). `UNION` statt `UNION ALL` bricht die Rekursion
 * bei einem Zyklus ab: jede Person wird höchstens einmal Vorfahre, die Menge ist durch den Bestand
 * begrenzt. */
export function vorfahrenKantenLaden(db: Database.Database, personId: string): readonly Elternkante[] {
  const zeilen = db
    .prepare<PersonParameter, ElternschaftZeile>(
      `WITH RECURSIVE vorfahren(id) AS (
         SELECT @personId
         UNION
         SELECT e.elternteil_id
         FROM vorfahren v
         JOIN elternschaft e ON e.kind_id = v.id
         JOIN person pe ON pe.id = e.elternteil_id
         JOIN person pk ON pk.id = e.kind_id
         WHERE pe.ist_platzhalter = 0 AND pk.ist_platzhalter = 0
       )
       SELECT e.elternteil_id AS elternteil_id, e.kind_id AS kind_id
       FROM elternschaft e
       JOIN person pe ON pe.id = e.elternteil_id
       JOIN person pk ON pk.id = e.kind_id
       WHERE e.kind_id IN (SELECT id FROM vorfahren) AND pe.ist_platzhalter = 0 AND pk.ist_platzhalter = 0
       ORDER BY e.kind_id, e.elternteil_id`,
    )
    .all({ personId })
  return zeilen.map((zeile) => ({ elternteilId: zeile.elternteil_id, kindId: zeile.kind_id }))
}
