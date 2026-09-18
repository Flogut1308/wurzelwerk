// AP-1.6 PR1, C-16/C-17, 55_Architektur.md §5.2. `abfrage:suche` — read-only SQL gegen `suche_fts`/
// `suche_fts_quelle`/`name_phonetik`/`person_flach` (CLAUDE.md §2: SQL nur in src/main/abfragen/),
// KEINE Transaktion, Spalten aufgezählt, benannte Parameter.
//
// Zwei Suchquellen, Volltext vor Phonetik (freigegebene Reihenfolge):
// 1. Volltext über `suche_fts MATCH` (drei ADR-014-Ebenen original/umschrift/normalform + notiz),
//    Rang über `bm25()` (kleinerer/negativerer Wert = besserer Treffer, SQLite-Doku).
//    `suche_fts_quelle.quelle_typ` ist entweder `'name'` (→ `name.person_id` auflösen) oder
//    `'person_notiz'` (→ `quelle_id` IST bereits die `person_id`, s. Trigger `abl_person_ai` in
//    docs/schema/0003_abgeleitet.sql). `'zitat_transkript'` hat keinen direkten Personenbezug und
//    wird hier bewusst nicht aufgelöst (kein Verlust an Personentreffern, nur diese eine
//    Quellenart ist für DIESE personenzentrierte Abfrage nicht relevant).
// 2. Kölner Phonetik (`name_phonetik`, `verfahren = 'koelner'`) als schwächere zweite Quelle — nur
//    für Personen, die die Volltextsuche NICHT bereits gefunden hat (Dedupe).
import type Database from 'better-sqlite3'
import { sucheAnfrageBauen } from '../../core/suche/anfrage'
import type { SucheAus, SucheEin, SucheTreffer } from '../../shared/schemata/person-liste'

interface AnzeigeZeile {
  readonly person_id: string
  readonly anzeigename: string
  readonly geburt_jahr: number | null
  readonly tod_jahr: number | null
  readonly geburt_ort_name: string | null
  readonly konfidenz_min: number | null
  readonly hat_widerspruch: number
  readonly ist_platzhalter: number
}

/** Lädt die Anzeigefelder aus `person_flach`/`person` für genau die übergebenen `person_id`s, in
 * derselben Reihenfolge irrelevant — Aufrufer liest über die zurückgegebene `Map`. */
function anzeigeZeilenLaden(db: Database.Database, personIds: readonly string[]): ReadonlyMap<string, AnzeigeZeile> {
  const karte = new Map<string, AnzeigeZeile>()
  if (personIds.length === 0) return karte

  const platzhalter = personIds.map((_, index) => `@id${index}`).join(', ')
  const parameter: Record<string, string> = {}
  personIds.forEach((id, index) => {
    parameter[`id${index}`] = id
  })

  const zeilen = db
    .prepare<
      Record<string, string>,
      AnzeigeZeile
    >(`SELECT pf.person_id AS person_id, pf.anzeigename AS anzeigename, pf.geburt_jahr AS geburt_jahr,
              pf.tod_jahr AS tod_jahr, pf.geburt_ort_name AS geburt_ort_name, pf.konfidenz_min AS konfidenz_min,
              pf.hat_widerspruch AS hat_widerspruch, p.ist_platzhalter AS ist_platzhalter
       FROM person_flach pf
       JOIN person p ON p.id = pf.person_id
       WHERE pf.person_id IN (${platzhalter})`,
    )
    .all(parameter)

  for (const zeile of zeilen) karte.set(zeile.person_id, zeile)
  return karte
}

interface VolltextZeile {
  readonly person_id: string | null
  readonly rang: number
}

/** Personen-IDs aus der Volltextsuche, absteigend nach Trefferqualität (bester Treffer zuerst),
 * ohne Duplikate — eine Person kann über mehrere `name`-Zeilen (verschiedene Namensvarianten)
 * mehrfach treffen, hier zählt nur ihr bester Rang. */
function volltextPersonenIds(db: Database.Database, matchAusdruck: string): readonly string[] {
  if (matchAusdruck === '') return []

  const zeilen = db
    .prepare<
      { readonly matchAusdruck: string },
      VolltextZeile
    >(`SELECT
         CASE WHEN q.quelle_typ = 'person_notiz' THEN q.quelle_id
              WHEN q.quelle_typ = 'name' THEN n.person_id
              ELSE NULL END AS person_id,
         bm25(suche_fts) AS rang
       FROM suche_fts
       JOIN suche_fts_quelle q ON q.rowid = suche_fts.rowid
       LEFT JOIN name n ON q.quelle_typ = 'name' AND n.id = q.quelle_id
       WHERE suche_fts MATCH @matchAusdruck
       ORDER BY rang ASC`,
    )
    .all({ matchAusdruck })

  const gesehen = new Set<string>()
  const ergebnis: string[] = []
  for (const zeile of zeilen) {
    if (zeile.person_id === null) continue
    if (gesehen.has(zeile.person_id)) continue
    gesehen.add(zeile.person_id)
    ergebnis.push(zeile.person_id)
  }
  return ergebnis
}

interface PhonetikZeile {
  readonly person_id: string
}

/** Personen-IDs, deren bevorzugter (oder auch unbevorzugter — `name_phonetik` kennt keinen
 * Bevorzugt-Filter) Nachname einen der übergebenen Kölner-Codes trägt. */
function phonetikPersonenIds(db: Database.Database, koelnerCodes: readonly string[]): readonly string[] {
  if (koelnerCodes.length === 0) return []

  const platzhalter = koelnerCodes.map((_, index) => `@code${index}`).join(', ')
  const parameter: Record<string, string> = {}
  koelnerCodes.forEach((code, index) => {
    parameter[`code${index}`] = code
  })

  const zeilen = db
    .prepare<
      Record<string, string>,
      PhonetikZeile
    >(`SELECT DISTINCT n.person_id AS person_id
       FROM name_phonetik np
       JOIN name n ON n.id = np.name_id
       WHERE np.verfahren = 'koelner' AND np.code IN (${platzhalter})`,
    )
    .all(parameter)

  return zeilen.map((zeile) => zeile.person_id)
}

function treffer(personId: string, quelle: SucheTreffer['quelle'], anzeige: AnzeigeZeile): SucheTreffer {
  return {
    person_id: anzeige.person_id,
    anzeigename: anzeige.anzeigename,
    geburt_jahr: anzeige.geburt_jahr,
    tod_jahr: anzeige.tod_jahr,
    geburt_ort_name: anzeige.geburt_ort_name,
    konfidenz_min: anzeige.konfidenz_min,
    hat_widerspruch: anzeige.hat_widerspruch === 1,
    ist_platzhalter: anzeige.ist_platzhalter === 1,
    quelle,
  }
}

/** `abfrage:suche` (55_Architektur.md §5.2, AP-1.6 PR1). */
export function suche(db: Database.Database, ein: SucheEin): SucheAus {
  const anfrage = sucheAnfrageBauen(ein.text)

  const gesehen = new Set<string>()
  const eintraege: Array<{ readonly personId: string; readonly quelle: SucheTreffer['quelle'] }> = []

  for (const personId of volltextPersonenIds(db, anfrage.matchAusdruck)) {
    if (eintraege.length >= ein.grenze) break
    gesehen.add(personId)
    eintraege.push({ personId, quelle: 'volltext' })
  }

  // Phonetik nur bei GENAU einem Suchwort: `name_phonetik` codiert ausschließlich `name.nachname`
  // (Trigger `abl_name_ai`/`abl_name_au`, docs/schema/0003_abgeleitet.sql) — bei mehreren Wörtern
  // (z. B. "Anna Krause") ist unklar, welches Wort der Nachname wäre, und ein Code-Treffer auf nur
  // eines der Wörter würde ansonsten Personen liefern, die dem GESAMTEN Suchtext gar nicht ähneln
  // (die AND-Semantik der Volltextsuche über mehrere Phrasen hätte für die Phonetik kein Gegenstück).
  if (eintraege.length < ein.grenze && anfrage.tokens.length === 1) {
    for (const personId of phonetikPersonenIds(db, anfrage.koelnerCodes)) {
      if (eintraege.length >= ein.grenze) break
      if (gesehen.has(personId)) continue
      gesehen.add(personId)
      eintraege.push({ personId, quelle: 'phonetik' })
    }
  }

  const anzeigeKarte = anzeigeZeilenLaden(
    db,
    eintraege.map((eintrag) => eintrag.personId),
  )

  const treffervoll: SucheTreffer[] = []
  for (const eintrag of eintraege) {
    const anzeige = anzeigeKarte.get(eintrag.personId)
    // Defensiv: eine Person könnte zwischen Indexsuche und Anzeige-Join gelöscht worden sein
    // (theoretisch möglich, da diese Abfrage ohne eigene Transaktion läuft) — dann einfach auslassen
    // statt eine unvollständige Zeile zurückzugeben.
    if (anzeige === undefined) continue
    treffervoll.push(treffer(eintrag.personId, eintrag.quelle, anzeige))
  }

  return { treffer: treffervoll }
}
