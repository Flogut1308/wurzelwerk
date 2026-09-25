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
//
// AP-1.10 PR-A (U-1.6-suche-ohne-filter-sortierung-seite): `ein.grenze` bleibt das Kandidatenfenster
// über Volltext+Phonetik (wie bisher), aber Filter/Sortierung/Seite wirken jetzt DARAUF — mit genau
// den Funktionen aus `src/main/abfragen/person-liste.ts` (`filterBedingungen`, `whereSql`,
// `zeilenLaden`, `vergleicheZeilen`, `zeileZuAusgabe`), keine zweite Implementierung. Die
// Bedienelemente der Listenansicht bleiben darum während einer aktiven Suche wirksam, statt
// sichtbar gesperrt zu werden (`src/renderer/ansichten/liste/listen-ansicht.tsx`).
import type Database from 'better-sqlite3'
import { sucheAnfrageBauen } from '../../core/suche/anfrage'
import type { SucheAus, SucheEin, SucheTreffer } from '../../shared/schemata/person-liste'
import { anzeigenamenLaden } from './_anzeigenamen'
import { filterBedingungen, vergleicheZeilen, whereSql, zeileZuAusgabe, zeilenLaden } from './person-liste'

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
       LEFT JOIN name_form n ON q.quelle_typ = 'name' AND n.id = q.quelle_id
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
    >(`SELECT DISTINCT nf.person_id AS person_id
       FROM name_phonetik np
       JOIN name_part tp ON tp.id = np.name_id
       JOIN name_form nf ON nf.id = tp.name_form_id
       WHERE np.verfahren = 'koelner' AND np.code IN (${platzhalter})`,
    )
    .all(parameter)

  return zeilen.map((zeile) => zeile.person_id)
}

/** `pf.person_id IN (...)`-Bedingung für eine feste Liste von Kandidaten-IDs — eigener Helfer statt
 * `filterBedingungen()`-Erweiterung: die ID-Liste kommt aus der Volltext-/Phonetiksuche, nicht aus
 * `PersonListeFilter`, und ist damit kein Filter im Sinn dieses Typs. */
function idsBedingung(ids: readonly string[]): { readonly bedingung: string; readonly parameter: Record<string, string> } {
  const platzhalter = ids.map((_, index) => `@sid${index}`).join(', ')
  const parameter: Record<string, string> = {}
  ids.forEach((id, index) => {
    parameter[`sid${index}`] = id
  })
  return { bedingung: `pf.person_id IN (${platzhalter})`, parameter }
}

/** `abfrage:suche` (55_Architektur.md §5.2, AP-1.6 PR1, AP-1.10 PR-A). */
export function suche(db: Database.Database, ein: SucheEin): SucheAus {
  const anfrage = sucheAnfrageBauen(ein.text)

  const gesehen = new Set<string>()
  const quelleJePersonId = new Map<string, SucheTreffer['quelle']>()
  const kandidatenIds: string[] = []

  for (const personId of volltextPersonenIds(db, anfrage.matchAusdruck)) {
    if (kandidatenIds.length >= ein.grenze) break
    gesehen.add(personId)
    quelleJePersonId.set(personId, 'volltext')
    kandidatenIds.push(personId)
  }

  // Phonetik nur bei GENAU einem Suchwort: `name_phonetik` codiert ausschließlich `name.nachname`
  // (Trigger `abl_name_ai`/`abl_name_au`, docs/schema/0003_abgeleitet.sql) — bei mehreren Wörtern
  // (z. B. "Anna Krause") ist unklar, welches Wort der Nachname wäre, und ein Code-Treffer auf nur
  // eines der Wörter würde ansonsten Personen liefern, die dem GESAMTEN Suchtext gar nicht ähneln
  // (die AND-Semantik der Volltextsuche über mehrere Phrasen hätte für die Phonetik kein Gegenstück).
  if (kandidatenIds.length < ein.grenze && anfrage.tokens.length === 1) {
    for (const personId of phonetikPersonenIds(db, anfrage.koelnerCodes)) {
      if (kandidatenIds.length >= ein.grenze) break
      if (gesehen.has(personId)) continue
      gesehen.add(personId)
      quelleJePersonId.set(personId, 'phonetik')
      kandidatenIds.push(personId)
    }
  }

  if (kandidatenIds.length === 0) {
    return { treffer: [], gesamt: 0 }
  }

  const { bedingungen, parameter } = filterBedingungen(ein.filter)
  const { bedingung: idsBedingungText, parameter: idsParameter } = idsBedingung(kandidatenIds)
  const whereKlausel = whereSql([...bedingungen, idsBedingungText])
  const zeilen = zeilenLaden(db, whereKlausel, { ...parameter, ...idsParameter })

  const sortiert = [...zeilen].sort((a, b) => vergleicheZeilen(a, b, ein))
  const start = (ein.seite - 1) * ein.proSeite
  const seite = sortiert.slice(start, start + ein.proSeite)

  // Sichtbarer Name aus dem Kern, nur für die Treffer der Seite (Vorarbeiten AP-1.30, PR 4a).
  const anzeigenamen = anzeigenamenLaden(
    db,
    seite.map((zeile) => zeile.person_id),
  )
  const treffervoll: SucheTreffer[] = []
  for (const zeile of seite) {
    const quelle = quelleJePersonId.get(zeile.person_id)
    // Defensiv (CLAUDE.md §4: kein `!`): `zeile` kommt aus `kandidatenIds`, jede dieser IDs hat beim
    // Einsammeln oben einen Eintrag in `quelleJePersonId` erhalten — dieser Zweig sollte unerreichbar
    // sein, schützt aber vor einer stillen `undefined`-Weitergabe, falls sich das je ändert.
    if (quelle === undefined) continue
    treffervoll.push({ ...zeileZuAusgabe(zeile, anzeigenamen), quelle })
  }

  return { treffer: treffervoll, gesamt: zeilen.length }
}
