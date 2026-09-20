// AP-1.7 PR-A (Profilseite, lesend), 55_Architektur.md §5. `abfrage:person.detail` — read-only SQL
// gegen `person_flach`/`person`/`aussage`/`aussage_zitat`/`zitat`/`quelle`/`ereignis`/`beteiligung`/
// `ortsname`/`elternschaft`/`partnerschaft`/`partnerschaft_person`/`diagnose`/`risikofaktor`
// (CLAUDE.md §2: SQL nur in src/main/abfragen/), KEINE Transaktion, Spalten aufgezählt, benannte
// Parameter, kein `SELECT *`.
//
// Freigegebene Entscheidungen (AP-1.7 PR-A, nicht neu aufmachen):
// - Belegzahl je Grunddaten-Feld = COUNT über ALLE `aussage_zitat` aller Aussagen dieses
//   `praedikat`s (nicht je einzelner Aussage).
// - Konfidenz-Kopf = `person_flach.konfidenz_min`, hier gelesen statt neu berechnet.
// - Beziehungen: nur direkte Kanten (Eltern/Kinder/Partner), KEINE Geschwister.
// - Widerspruch je Feld wird NICHT in SQL nachgebaut, sondern über die Kern-Funktionen
//   `hatWiderspruch()`/`anzahlUnterscheidbareWerte()` (src/core/aussage/widerspruch.ts, spiegelt
//   den generierten Trigger `abl_aussage_ai`, docs/schema/0003_abgeleitet.sql Z.66-75) auf den
//   bereits geladenen Aussagen berechnet. `hatKonkurrierende` (hueter-Auflage 1, PR #65) ist das
//   von `hat_widerspruch` UNABHÄNGIGE E21-Signal "es gibt konkurrierende Angaben" — bleibt `true`,
//   auch wenn eine Bevorzugung den Widerspruch bereits aufgelöst hat.
import type Database from 'better-sqlite3'
import { anzahlUnterscheidbareWerte, hatWiderspruch, type AussageFuerWiderspruch } from '../../core/aussage/widerspruch'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { BeteiligungRolleEnum } from '../../shared/schemata/beteiligung'
import { ElternschaftTypEnum } from '../../shared/schemata/elternschaft'
import { EreignisTypEnum } from '../../shared/schemata/ereignis'
import { NameTypEnum, SchriftEnum } from '../../shared/schemata/name'
import { PartnerschaftTypEnum } from '../../shared/schemata/partnerschaft'
import { GeschlechtEnum, PlatzhalterGrundEnum } from '../../shared/schemata/person'
import { QuelleTypEnum, UnmittelbarkeitEnum } from '../../shared/schemata/quelle'
import type {
  PersonDetailAus,
  PersonDetailBeleg,
  PersonDetailBeziehung,
  PersonDetailEin,
  PersonDetailEreignis,
  PersonDetailGesundheitseintrag,
  PersonDetailGrunddatenFeld,
  PersonDetailName,
} from '../../shared/schemata/person-detail'
import { datensatzExistiert } from '../repositories/basis'

interface KopfZeile {
  readonly person_id: string
  readonly anzeigename: string
  readonly konfidenz_min: number | null
  readonly ist_platzhalter: number
  readonly privat: number
  readonly notiz: string | null
  readonly geschlecht: string | null
  readonly platzhalter_grund: string | null
}

function kopfLaden(db: Database.Database, personId: string): KopfZeile | undefined {
  return db
    .prepare<
      { readonly personId: string },
      KopfZeile
    >(`SELECT pf.person_id AS person_id, pf.anzeigename AS anzeigename, pf.konfidenz_min AS konfidenz_min,
              p.ist_platzhalter AS ist_platzhalter, p.privat AS privat, p.notiz AS notiz,
              p.geschlecht AS geschlecht, p.platzhalter_grund AS platzhalter_grund
       FROM person_flach pf
       JOIN person p ON p.id = pf.person_id
       WHERE pf.person_id = @personId`,
    )
    .get({ personId })
}

interface NameZeile {
  readonly id: string
  readonly typ: string
  readonly schrift: string | null
  readonly vornamen: string | null
  readonly nachname: string | null
  readonly praefix: string | null
  readonly titel_vor: string | null
  readonly zusatz_nach: string | null
  readonly rufname_text: string | null
}

/** `name`-Zeilen dieser Person (AP-1.14a, Kernfelder-Schreibmaske) — sortiert nach `ist_bevorzugt`
 * (bevorzugter Name zuerst), dann `id` als stabiler Tie-Break (analog `ereignisseSortierenUndWandeln`). */
function namenLaden(db: Database.Database, personId: string): readonly PersonDetailName[] {
  const zeilen = db
    .prepare<
      { readonly personId: string },
      NameZeile
    >(`SELECT id AS id, typ AS typ, schrift AS schrift, vornamen AS vornamen, nachname AS nachname,
              praefix AS praefix, titel_vor AS titel_vor, zusatz_nach AS zusatz_nach, rufname_text AS rufname_text
       FROM name
       WHERE person_id = @personId
       ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id`,
    )
    .all({ personId })
  return zeilen.map((zeile) => ({
    id: zeile.id,
    typ: NameTypEnum.parse(zeile.typ),
    schrift: zeile.schrift === null ? null : SchriftEnum.parse(zeile.schrift),
    vornamen: zeile.vornamen,
    nachname: zeile.nachname,
    praefix: zeile.praefix,
    titel_vor: zeile.titel_vor,
    zusatz_nach: zeile.zusatz_nach,
    rufname_text: zeile.rufname_text,
  }))
}

interface AussageZeile {
  readonly id: string
  readonly praedikat: string
  readonly wert_text: string | null
  readonly wert_zahl: number | null
  readonly wert_ref_id: string | null
  readonly datum_wert1: string | null
  readonly datum_wert2: string | null
  readonly konfidenz: number | null
  readonly ist_bevorzugt: number | null
  readonly begruendung: string | null
}

function aussagenLaden(db: Database.Database, personId: string): readonly AussageZeile[] {
  return db
    .prepare<
      { readonly personId: string },
      AussageZeile
    >(`SELECT id AS id, praedikat AS praedikat, wert_text AS wert_text, wert_zahl AS wert_zahl,
              wert_ref_id AS wert_ref_id, datum_wert1 AS datum_wert1, datum_wert2 AS datum_wert2,
              konfidenz AS konfidenz, ist_bevorzugt AS ist_bevorzugt, begruendung AS begruendung
       FROM aussage
       WHERE subjekt_typ = 'person' AND subjekt_id = @personId
       ORDER BY praedikat, id`,
    )
    .all({ personId })
}

/** Baut die `IN (@id0, @id1, …)`-Platzhalterliste + das dazugehörige Parameterobjekt für eine
 * variable Anzahl von IDs — wiederverwendet von `belegeJeAussageLaden`/`ortsnamenLaden`/
 * `personennamenLaden` (benannte Parameter, CLAUDE.md §6, kein zusammengesetztes SQL). */
function inKlausel(ids: readonly string[]): { readonly platzhalter: string; readonly parameter: Record<string, string> } {
  const parameter: Record<string, string> = {}
  ids.forEach((id, index) => {
    parameter[`id${index}`] = id
  })
  return { platzhalter: ids.map((_, index) => `@id${index}`).join(', '), parameter }
}

interface BelegzahlZeile {
  readonly praedikat: string
  readonly belegzahl: number
}

/** Belegzahl je Prädikat (Entscheidung: COUNT über ALLE `aussage_zitat`-Zeilen ALLER Aussagen
 * dieses Prädikats, nicht je einzelner Aussage). */
function belegzahlJePraedikatLaden(db: Database.Database, personId: string): ReadonlyMap<string, number> {
  const zeilen = db
    .prepare<
      { readonly personId: string },
      BelegzahlZeile
    >(`SELECT a.praedikat AS praedikat, COUNT(az.zitat_id) AS belegzahl
       FROM aussage a
       LEFT JOIN aussage_zitat az ON az.aussage_id = a.id
       WHERE a.subjekt_typ = 'person' AND a.subjekt_id = @personId
       GROUP BY a.praedikat`,
    )
    .all({ personId })
  const karte = new Map<string, number>()
  for (const zeile of zeilen) karte.set(zeile.praedikat, zeile.belegzahl)
  return karte
}

interface BelegZeile {
  readonly aussage_id: string
  readonly transkript: string | null
  readonly quelle_typ: string
  readonly quelle_titel: string | null
  readonly quelle_signatur: string | null
  readonly quelle_unmittelbarkeit: string | null
  readonly archiv_name: string | null
  readonly zitat_seite: string | null
  readonly zitat_eintragsnummer: string | null
  readonly zitat_zugriffsdatum_wert1: string | null
  readonly zitat_digitalisat_url: string | null
}

/** Belege je Aussage-ID — ein Beleg ist eine `aussage_zitat`-Zeile, aufgelöst über
 * `zitat`/`quelle`/`archiv` (LEFT JOIN, ein Archiv ist optional). DREISTUFIG (S-08,
 * U-1.7-belegliste-zweistufig, AP-1.10 PR-B): Quelle → Zitat → Transkript. */
function belegeJeAussageLaden(db: Database.Database, aussageIds: readonly string[]): ReadonlyMap<string, readonly PersonDetailBeleg[]> {
  const karte = new Map<string, PersonDetailBeleg[]>()
  if (aussageIds.length === 0) return karte

  const { platzhalter, parameter } = inKlausel(aussageIds)

  const zeilen = db
    .prepare<
      Record<string, string>,
      BelegZeile
    >(`SELECT az.aussage_id AS aussage_id, z.transkript AS transkript,
              q.typ AS quelle_typ, q.titel AS quelle_titel, q.signatur AS quelle_signatur,
              q.unmittelbarkeit AS quelle_unmittelbarkeit, a.name AS archiv_name,
              z.seite AS zitat_seite, z.eintragsnummer AS zitat_eintragsnummer,
              z.zugriffsdatum_wert1 AS zitat_zugriffsdatum_wert1, z.digitalisat_url AS zitat_digitalisat_url
       FROM aussage_zitat az
       JOIN zitat z ON z.id = az.zitat_id
       JOIN quelle q ON q.id = z.quelle_id
       LEFT JOIN archiv a ON a.id = q.archiv_id
       WHERE az.aussage_id IN (${platzhalter})
       ORDER BY az.aussage_id, z.id`,
    )
    .all(parameter)

  for (const zeile of zeilen) {
    const beleg: PersonDetailBeleg = {
      quelle: {
        typ: QuelleTypEnum.parse(zeile.quelle_typ),
        titel: zeile.quelle_titel,
        archiv_name: zeile.archiv_name,
        signatur: zeile.quelle_signatur,
        unmittelbarkeit: zeile.quelle_unmittelbarkeit === null ? null : UnmittelbarkeitEnum.parse(zeile.quelle_unmittelbarkeit),
      },
      zitat: {
        seite: zeile.zitat_seite,
        eintragsnummer: zeile.zitat_eintragsnummer,
        zugriffsdatum_wert1: zeile.zitat_zugriffsdatum_wert1,
        digitalisat_url: zeile.zitat_digitalisat_url,
      },
      transkript: zeile.transkript,
    }
    const liste = karte.get(zeile.aussage_id) ?? []
    liste.push(beleg)
    karte.set(zeile.aussage_id, liste)
  }
  return karte
}

/** `aussage.praedikat`-Werte, deren `wert_ref_id` auf `ort` zeigt (`docs/import-vertrag.md` §3:
 * „wert_ref zeigt auf einen Ort oder eine Person" — E-7, polymorph, bewusst KEIN `wert_ref_typ`,
 * `docs/schema/0002_kern.sql` Z.323, darum PRÄDIKATGESTEUERT statt spaltengesteuert aufgelöst).
 * Bugfix (vorbestehend, `docs/80_Offene_Fragen.md` §22 U-1.25-profil-fixture): jedes andere
 * Prädikat mit `wert_ref_id` (z. B. `pate`, ein Personenverweis) löst gegen `person_flach` auf —
 * die einzigen beiden laut Import-Vertrag zulässigen Verweisziele. */
const PRAEDIKATE_MIT_ORT_REFERENZ: ReadonlySet<string> = new Set(['geburtsort', 'wohnort'])

/** Anzeigewert einer Aussage: `wert_text` vor `datum_wert1` (Datumsprädikate wie `todesdatum`
 * tragen ihren Wert im Datum, nicht in `wert_text`) vor `wert_zahl` vor `wert_ref_id` — Letzteres
 * NICHT mehr die rohe UUID (vorbestehender Bugfix), sondern der aufgelöste Orts- oder Personenname
 * aus `ortsnamenKarte`/`personennamenKarte` (s. `PRAEDIKATE_MIT_ORT_REFERENZ`), analog wie
 * `ereignisseLaden()` bereits `ereignis.ort_id` auf `ortsname` joint. Fehlt der aufgelöste Name
 * (z. B. verwaister Verweis), liefert die Funktion `null` statt einer rohen ID — konsistent mit
 * jedem anderen unbekannten Wert in dieser Abfrage. */
function aussageWertAnzeige(
  zeile: AussageZeile,
  ortsnamenKarte: ReadonlyMap<string, string>,
  personennamenKarte: ReadonlyMap<string, string>,
): string | null {
  if (zeile.wert_text !== null) return zeile.wert_text
  if (zeile.datum_wert1 !== null) return zeile.datum_wert1
  if (zeile.wert_zahl !== null) return String(zeile.wert_zahl)
  if (zeile.wert_ref_id !== null) {
    const karte = PRAEDIKATE_MIT_ORT_REFERENZ.has(zeile.praedikat) ? ortsnamenKarte : personennamenKarte
    return karte.get(zeile.wert_ref_id) ?? null
  }
  return null
}

/** Bevorzugter Ortsname je `ort.id` (analog der Rang-Subquery in `ereignisseLaden`). */
function ortsnamenLaden(db: Database.Database, ortIds: readonly string[]): ReadonlyMap<string, string> {
  const karte = new Map<string, string>()
  if (ortIds.length === 0) return karte
  const { platzhalter, parameter } = inKlausel(ortIds)
  const zeilen = db
    .prepare<
      Record<string, string>,
      { readonly ort_id: string; readonly name: string | null }
    >(`SELECT o.id AS ort_id, go.name AS name
       FROM ort o
       LEFT JOIN (
         SELECT ort_id, name,
           ROW_NUMBER() OVER (PARTITION BY ort_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
         FROM ortsname
       ) go ON go.ort_id = o.id AND go.rang = 1
       WHERE o.id IN (${platzhalter})`,
    )
    .all(parameter)
  for (const zeile of zeilen) {
    if (zeile.name !== null) karte.set(zeile.ort_id, zeile.name)
  }
  return karte
}

/** Anzeigename je `person.id` — `person_flach.anzeigename` (dieselbe abgeleitete Spalte wie
 * überall sonst in dieser Abfrage, kein Neuaufbau des bevorzugten Namens hier). */
function personennamenLaden(db: Database.Database, personIds: readonly string[]): ReadonlyMap<string, string> {
  const karte = new Map<string, string>()
  if (personIds.length === 0) return karte
  const { platzhalter, parameter } = inKlausel(personIds)
  const zeilen = db
    .prepare<
      Record<string, string>,
      { readonly person_id: string; readonly anzeigename: string }
    >(`SELECT person_id AS person_id, anzeigename AS anzeigename FROM person_flach WHERE person_id IN (${platzhalter})`)
    .all(parameter)
  for (const zeile of zeilen) karte.set(zeile.person_id, zeile.anzeigename)
  return karte
}

/** Alle `wert_ref_id`-Werte der Aussagen, deren Prädikat auf die gewünschte Zielart zeigt
 * (`ortBezogen`) — Vorstufe für die zwei IN-Abfragen `ortsnamenLaden`/`personennamenLaden`. */
function wertRefIdsFuer(aussagen: readonly AussageZeile[], ortBezogen: boolean): readonly string[] {
  const ids: string[] = []
  for (const aussage of aussagen) {
    if (aussage.wert_ref_id === null) continue
    if (PRAEDIKATE_MIT_ORT_REFERENZ.has(aussage.praedikat) === ortBezogen) ids.push(aussage.wert_ref_id)
  }
  return ids
}

function grunddatenBauen(
  aussagen: readonly AussageZeile[],
  belegzahlKarte: ReadonlyMap<string, number>,
  belegeKarte: ReadonlyMap<string, readonly PersonDetailBeleg[]>,
  ortsnamenKarte: ReadonlyMap<string, string>,
  personennamenKarte: ReadonlyMap<string, string>,
): readonly PersonDetailGrunddatenFeld[] {
  const gruppenNachPraedikat = new Map<string, AussageZeile[]>()
  for (const aussage of aussagen) {
    const gruppe = gruppenNachPraedikat.get(aussage.praedikat) ?? []
    gruppe.push(aussage)
    gruppenNachPraedikat.set(aussage.praedikat, gruppe)
  }

  const felder: PersonDetailGrunddatenFeld[] = []
  for (const [praedikat, gruppe] of gruppenNachPraedikat) {
    const wertTupel: readonly AussageFuerWiderspruch[] = gruppe.map((aussage) => ({
      wert: {
        wertText: aussage.wert_text,
        wertZahl: aussage.wert_zahl,
        wertRefId: aussage.wert_ref_id,
        datumWert1: aussage.datum_wert1,
        datumWert2: aussage.datum_wert2,
      },
      istBevorzugt: aussage.ist_bevorzugt === 1,
    }))

    // Anzeigewert/Konfidenz des Felds: die bevorzugte Aussage, sonst (kein Widerspruchsfall ohne
    // Bevorzugung, oder eine einzelne Aussage) die erste der Gruppe.
    const bevorzugte = gruppe.find((aussage) => aussage.ist_bevorzugt === 1) ?? gruppe[0]

    felder.push({
      praedikat,
      wert: bevorzugte !== undefined ? aussageWertAnzeige(bevorzugte, ortsnamenKarte, personennamenKarte) : null,
      konfidenz: bevorzugte?.konfidenz ?? null,
      belegzahl: belegzahlKarte.get(praedikat) ?? 0,
      hat_widerspruch: hatWiderspruch(wertTupel),
      hatKonkurrierende: anzahlUnterscheidbareWerte(wertTupel) >= 2,
      aussagen: gruppe.map((aussage) => ({
        aussage_id: aussage.id,
        wert: aussageWertAnzeige(aussage, ortsnamenKarte, personennamenKarte),
        konfidenz: aussage.konfidenz,
        ist_bevorzugt: aussage.ist_bevorzugt === 1,
        begruendung: aussage.begruendung,
        belege: belegeKarte.get(aussage.id) ?? [],
      })),
    })
  }
  return felder
}

interface EreignisZeile {
  readonly ereignis_id: string
  readonly typ: string
  readonly rolle: string
  readonly datum_wert1: string | null
  readonly datum_sort_von: number | null
  readonly ort_name: string | null
  readonly beschreibung: string | null
}

function ereignisseLaden(db: Database.Database, personId: string): readonly EreignisZeile[] {
  return db
    .prepare<
      { readonly personId: string },
      EreignisZeile
    >(`SELECT e.id AS ereignis_id, e.typ AS typ, b.rolle AS rolle, e.datum_wert1 AS datum_wert1,
              e.datum_sort_von AS datum_sort_von, e.beschreibung AS beschreibung, go.name AS ort_name
       FROM beteiligung b
       JOIN ereignis e ON e.id = b.ereignis_id
       LEFT JOIN (
         SELECT ort_id, name,
           ROW_NUMBER() OVER (PARTITION BY ort_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
         FROM ortsname
       ) go ON go.ort_id = e.ort_id AND go.rang = 1
       WHERE b.person_id = @personId`,
    )
    .all({ personId })
}

/** Zahlenvergleich mit NULL-Werten immer am Ende (analog `vergleicheZahlNullsLetzten` in
 * `src/main/abfragen/person-liste.ts`) — ein unbekanntes Ereignisdatum ist kein frühestes Datum. */
function vergleicheSortVonNullsLetzten(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a - b
}

function ereignisseSortierenUndWandeln(zeilen: readonly EreignisZeile[]): readonly PersonDetailEreignis[] {
  const sortiert = [...zeilen].sort((a, b) => {
    const vergleich = vergleicheSortVonNullsLetzten(a.datum_sort_von, b.datum_sort_von)
    if (vergleich !== 0) return vergleich
    // Stabiler Tie-Break, analog abfrage:person.liste.
    if (a.ereignis_id < b.ereignis_id) return -1
    if (a.ereignis_id > b.ereignis_id) return 1
    return 0
  })
  return sortiert.map((zeile) => ({
    ereignis_id: zeile.ereignis_id,
    typ: EreignisTypEnum.parse(zeile.typ),
    rolle: BeteiligungRolleEnum.parse(zeile.rolle),
    datum_wert1: zeile.datum_wert1,
    datum_sort_von: zeile.datum_sort_von,
    ort_name: zeile.ort_name,
    beschreibung: zeile.beschreibung,
  }))
}

interface ElternKindZeile {
  readonly person_id: string
  readonly anzeigename: string
  readonly kantentyp: string
  readonly ist_platzhalter: number
}

function elternLaden(db: Database.Database, personId: string): readonly ElternKindZeile[] {
  return db
    .prepare<
      { readonly personId: string },
      ElternKindZeile
    >(`SELECT el.elternteil_id AS person_id, pf.anzeigename AS anzeigename, el.typ AS kantentyp, p.ist_platzhalter AS ist_platzhalter
       FROM elternschaft el
       JOIN person_flach pf ON pf.person_id = el.elternteil_id
       JOIN person p ON p.id = el.elternteil_id
       WHERE el.kind_id = @personId`,
    )
    .all({ personId })
}

function kinderLaden(db: Database.Database, personId: string): readonly ElternKindZeile[] {
  return db
    .prepare<
      { readonly personId: string },
      ElternKindZeile
    >(`SELECT el.kind_id AS person_id, pf.anzeigename AS anzeigename, el.typ AS kantentyp, p.ist_platzhalter AS ist_platzhalter
       FROM elternschaft el
       JOIN person_flach pf ON pf.person_id = el.kind_id
       JOIN person p ON p.id = el.kind_id
       WHERE el.elternteil_id = @personId`,
    )
    .all({ personId })
}

function partnerLaden(db: Database.Database, personId: string): readonly ElternKindZeile[] {
  return db
    .prepare<
      { readonly personId: string },
      ElternKindZeile
    >(`SELECT pp2.person_id AS person_id, pf.anzeigename AS anzeigename, part.typ AS kantentyp, p.ist_platzhalter AS ist_platzhalter
       FROM partnerschaft_person pp1
       JOIN partnerschaft_person pp2 ON pp2.partnerschaft_id = pp1.partnerschaft_id AND pp2.person_id <> pp1.person_id
       JOIN partnerschaft part ON part.id = pp1.partnerschaft_id
       JOIN person_flach pf ON pf.person_id = pp2.person_id
       JOIN person p ON p.id = pp2.person_id
       WHERE pp1.person_id = @personId`,
    )
    .all({ personId })
}

function beziehungenLaden(db: Database.Database, personId: string): readonly PersonDetailBeziehung[] {
  const beziehungen: PersonDetailBeziehung[] = []
  for (const zeile of elternLaden(db, personId)) {
    beziehungen.push({ person_id: zeile.person_id, anzeigename: zeile.anzeigename, richtung: 'elternteil', kantentyp: ElternschaftTypEnum.parse(zeile.kantentyp), ist_platzhalter: zeile.ist_platzhalter === 1 })
  }
  for (const zeile of kinderLaden(db, personId)) {
    beziehungen.push({ person_id: zeile.person_id, anzeigename: zeile.anzeigename, richtung: 'kind', kantentyp: ElternschaftTypEnum.parse(zeile.kantentyp), ist_platzhalter: zeile.ist_platzhalter === 1 })
  }
  for (const zeile of partnerLaden(db, personId)) {
    beziehungen.push({ person_id: zeile.person_id, anzeigename: zeile.anzeigename, richtung: 'partner', kantentyp: PartnerschaftTypEnum.parse(zeile.kantentyp), ist_platzhalter: zeile.ist_platzhalter === 1 })
  }
  return beziehungen
}

interface DiagnoseZeile {
  readonly id: string
  readonly bezeichnung: string | null
  readonly status: string | null
  readonly konfidenz: number | null
  readonly notiz: string | null
}

function diagnosenLaden(db: Database.Database, personId: string): readonly PersonDetailGesundheitseintrag[] {
  const zeilen = db
    .prepare<
      { readonly personId: string },
      DiagnoseZeile
    >(`SELECT id AS id, bezeichnung AS bezeichnung, status AS status, konfidenz AS konfidenz, notiz AS notiz
       FROM diagnose
       WHERE person_id = @personId`,
    )
    .all({ personId })
  return zeilen.map((zeile) => ({ id: zeile.id, art: 'diagnose' as const, bezeichnung: zeile.bezeichnung, status: zeile.status, konfidenz: zeile.konfidenz, notiz: zeile.notiz }))
}

interface RisikofaktorZeile {
  readonly id: string
  readonly art: string | null
  readonly detail: string | null
  readonly intensitaet: string | null
  readonly konfidenz: number | null
  readonly notiz: string | null
}

function risikofaktorenLaden(db: Database.Database, personId: string): readonly PersonDetailGesundheitseintrag[] {
  const zeilen = db
    .prepare<
      { readonly personId: string },
      RisikofaktorZeile
    >(`SELECT id AS id, art AS art, detail AS detail, intensitaet AS intensitaet, konfidenz AS konfidenz, notiz AS notiz
       FROM risikofaktor
       WHERE person_id = @personId`,
    )
    .all({ personId })
  return zeilen.map((zeile) => ({
    id: zeile.id,
    art: 'risikofaktor' as const,
    bezeichnung: zeile.detail ?? zeile.art,
    status: zeile.intensitaet,
    konfidenz: zeile.konfidenz,
    notiz: zeile.notiz,
  }))
}

/** `abfrage:person.detail` (55_Architektur.md §5, AP-1.7 PR-A). */
export function personDetail(db: Database.Database, ein: PersonDetailEin): PersonDetailAus {
  if (!datensatzExistiert(db, 'person', ein.personId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_PERSON')
  }
  const kopfZeile = kopfLaden(db, ein.personId)
  if (kopfZeile === undefined) {
    // Defensiv (CLAUDE.md §4: kein `!`): `person_flach` wird für jede `person`-Zeile durch
    // `abl_person_ai` (docs/schema/0003_abgeleitet.sql) mit angelegt - dieser Zweig sollte
    // unerreichbar sein, solange die abgeleiteten Tabellen konsistent sind.
    throw new WurzelFehler('INTERN_UNERWARTET', `person_flach fehlt für existierende Person "${ein.personId}".`)
  }

  const aussagen = aussagenLaden(db, ein.personId)
  const belegzahlKarte = belegzahlJePraedikatLaden(db, ein.personId)
  const belegeKarte = belegeJeAussageLaden(db, aussagen.map((aussage) => aussage.id))

  // Bugfix `aussageWertAnzeige` (s. Kommentar dort): `wert_ref_id` prädikatgesteuert in zwei
  // getrennten IN-Abfragen auflösen, statt je Aussage einzeln nachzuschlagen.
  const ortsnamenKarte = ortsnamenLaden(db, wertRefIdsFuer(aussagen, true))
  const personennamenKarte = personennamenLaden(db, wertRefIdsFuer(aussagen, false))

  return {
    kopf: {
      person_id: kopfZeile.person_id,
      anzeigename: kopfZeile.anzeigename,
      konfidenz_min: kopfZeile.konfidenz_min,
      ist_platzhalter: kopfZeile.ist_platzhalter === 1,
      privat: kopfZeile.privat === 1,
      geschlecht: kopfZeile.geschlecht === null ? null : GeschlechtEnum.parse(kopfZeile.geschlecht),
      platzhalter_grund: kopfZeile.platzhalter_grund === null ? null : PlatzhalterGrundEnum.parse(kopfZeile.platzhalter_grund),
    },
    namen: namenLaden(db, ein.personId),
    grunddaten: grunddatenBauen(aussagen, belegzahlKarte, belegeKarte, ortsnamenKarte, personennamenKarte),
    ereignisse: ereignisseSortierenUndWandeln(ereignisseLaden(db, ein.personId)),
    beziehungen: beziehungenLaden(db, ein.personId),
    gesundheit: [...diagnosenLaden(db, ein.personId), ...risikofaktorenLaden(db, ein.personId)],
    notiz: kopfZeile.notiz,
  }
}
