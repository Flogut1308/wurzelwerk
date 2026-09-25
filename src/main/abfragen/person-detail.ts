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
import { z } from 'zod'
import { anzahlUnterscheidbareWerte, hatWiderspruch, type AussageFuerWiderspruch } from '../../core/aussage/widerspruch'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { BeteiligungRolleEnum } from '../../shared/schemata/beteiligung'
import { ElternschaftTypEnum } from '../../shared/schemata/elternschaft'
import { EreignisTypEnum } from '../../shared/schemata/ereignis'
import { NamePartArtEnum, NameTypEnum, SchriftEnum } from '../../shared/schemata/name'
import { rekonstruiereFlach, type GeladenerTeil } from '../../core/name/zerlegung'
import { offenePunkteAuswerten, type OffenePunkteKind } from '../../core/person/offene-punkte'
import { sterbeortAufloesen } from '../../core/person/sterbeort'
import { istEigenerVorfahre } from '../../core/graph/zyklus'
import { feldwarnungenFuer } from '../../core/plausibilitaet/feldwarnungen'
import { pruefeBestand, type BestandHinweis } from '../../core/plausibilitaet/regeln'
import { PartnerschaftTypEnum } from '../../shared/schemata/partnerschaft'
import { GeschlechtEnum, LebendStatusEnum, PlatzhalterGrundEnum } from '../../shared/schemata/person'
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
  PersonDetailOffenerPunkt,
  PersonDetailSterbeort,
  PersonDetailWarnung,
} from '../../shared/schemata/person-detail'
import { datensatzExistiert } from '../repositories/basis'
import { personUmfeldLaden, vorfahrenKantenLaden } from './_person-umfeld'

interface KopfZeile {
  readonly person_id: string
  readonly anzeigename: string
  readonly konfidenz_min: number | null
  readonly ist_platzhalter: number
  readonly privat: number
  readonly notiz: string | null
  readonly geschlecht: string | null
  readonly platzhalter_grund: string | null
  readonly kennung: number | null
  readonly lebend_status: string | null
}

/** `person.kennung` beim Lesen prüfen (CHECK `kennung >= 1`, docs/schema/0007_kennung_textanker.sql)
 * — `kennungAnzeige` (src/core/person/kennung.ts) wirft bei allem anderen. */
const KennungSchema = z.number().int().min(1).nullable()

function kopfLaden(db: Database.Database, personId: string): KopfZeile | undefined {
  return db
    .prepare<
      { readonly personId: string },
      KopfZeile
    >(`SELECT pf.person_id AS person_id, pf.anzeigename AS anzeigename, pf.konfidenz_min AS konfidenz_min,
              p.ist_platzhalter AS ist_platzhalter, p.privat AS privat, p.notiz AS notiz,
              p.geschlecht AS geschlecht, p.platzhalter_grund AS platzhalter_grund, p.kennung AS kennung,
              p.lebend_status AS lebend_status
       FROM person_flach pf
       JOIN person p ON p.id = pf.person_id
       WHERE pf.person_id = @personId`,
    )
    .get({ personId })
}

interface FormZeile {
  readonly id: string
  readonly rolle: string | null
  readonly umschrift_von: string | null
  readonly schrift: string | null
}

interface TeilZeile {
  readonly name_form_id: string
  readonly art: string
  readonly wert: string
  readonly ist_rufname: number
  readonly sortier_index: number
}

/** `name_form`-Zeilen dieser Person (AP-1.14a Kernfelder-Schreibmaske; AP-1.33: Modell name_form/
 * name_part) — read-only als FLACHE `PersonDetailName` rekonstruiert (dieselbe Rekonstruktion wie die
 * Projektion, src/core/name/zerlegung.ts). Sortiert nach `ist_bevorzugt` (bevorzugte Form zuerst),
 * dann `id` als stabiler Tie-Break. */
function namenLaden(db: Database.Database, personId: string): readonly PersonDetailName[] {
  const formen = db
    .prepare<
      { readonly personId: string },
      FormZeile
    >(`SELECT id AS id, rolle AS rolle, umschrift_von AS umschrift_von, schrift AS schrift
       FROM name_form
       WHERE person_id = @personId
       ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id`,
    )
    .all({ personId })
  if (formen.length === 0) return []

  const teileJeForm = new Map<string, GeladenerTeil[]>()
  const teile = db
    .prepare<
      { readonly personId: string },
      TeilZeile
    >(`SELECT tp.name_form_id AS name_form_id, tp.art AS art, tp.wert AS wert,
              tp.ist_rufname AS ist_rufname, tp.sortier_index AS sortier_index
       FROM name_part tp
       JOIN name_form fm ON fm.id = tp.name_form_id
       WHERE fm.person_id = @personId`,
    )
    .all({ personId })
  for (const zeile of teile) {
    const liste = teileJeForm.get(zeile.name_form_id) ?? []
    liste.push({ art: NamePartArtEnum.parse(zeile.art), wert: zeile.wert, istRufname: zeile.ist_rufname === 1, sortierIndex: zeile.sortier_index })
    teileJeForm.set(zeile.name_form_id, liste)
  }

  return formen.map((form) => {
    const flach = rekonstruiereFlach(teileJeForm.get(form.id) ?? [])
    const typ = form.rolle ?? (form.umschrift_von !== null ? 'transliteriert' : 'sonstiges')
    return {
      id: form.id,
      typ: NameTypEnum.parse(typ),
      schrift: form.schrift === null ? null : SchriftEnum.parse(form.schrift),
      vornamen: flach.vornamen,
      nachname: flach.nachname,
      praefix: flach.praefix,
      titel_vor: flach.titelVor,
      zusatz_nach: flach.zusatzNach,
      rufname_text: flach.rufnameText,
    }
  })
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
  readonly zitat_id: string
  readonly feld: string | null
  readonly textanker_von: number | null
  readonly textanker_bis: number | null
  readonly transkript: string | null
  readonly quelle_id: string
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
    >(`SELECT az.aussage_id AS aussage_id, az.zitat_id AS zitat_id, az.feld AS feld,
              az.textanker_von AS textanker_von, az.textanker_bis AS textanker_bis, z.transkript AS transkript,
              q.id AS quelle_id, q.typ AS quelle_typ, q.titel AS quelle_titel, q.signatur AS quelle_signatur,
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
      zitat_id: zeile.zitat_id,
      quelle: {
        id: zeile.quelle_id,
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
      feld: zeile.feld,
      // DB-CHECK „beide oder keine" (0007): ein halber Anker ist nicht speicherbar.
      textanker: zeile.textanker_von !== null && zeile.textanker_bis !== null ? { von: zeile.textanker_von, bis: zeile.textanker_bis } : null,
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
const PRAEDIKATE_MIT_ORT_REFERENZ: ReadonlySet<string> = new Set(['geburtsort', 'todesort', 'wohnort'])

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
  readonly beteiligung_id: string
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
    >(`SELECT e.id AS ereignis_id, b.id AS beteiligung_id, e.typ AS typ, b.rolle AS rolle, e.datum_wert1 AS datum_wert1,
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
    beteiligung_id: zeile.beteiligung_id,
    typ: EreignisTypEnum.parse(zeile.typ),
    rolle: BeteiligungRolleEnum.parse(zeile.rolle),
    datum_wert1: zeile.datum_wert1,
    datum_sort_von: zeile.datum_sort_von,
    ort_name: zeile.ort_name,
    beschreibung: zeile.beschreibung,
  }))
}

interface TodEreignisZeile {
  readonly id: string
  readonly ort_id: string | null
}

/** Tod-Ereignisse, an denen die Person als `verstorbener` beteiligt ist (AP-1.34 PR-C2a, §31
 * U-1.34-E5) — der Rückfall für den Sterbeort. Andere Rollen (`informant`, `pfarrer`, …) und andere
 * Ereignistypen zählen bewusst nicht. `DISTINCT`: eine doppelte Beteiligung derselben Person im
 * selben Ereignis ist kein zweites Ereignis. */
function todEreignisseLaden(db: Database.Database, personId: string): readonly TodEreignisZeile[] {
  return db
    .prepare<
      { readonly personId: string },
      TodEreignisZeile
    >(`SELECT DISTINCT e.id AS id, e.ort_id AS ort_id
       FROM beteiligung b
       JOIN ereignis e ON e.id = b.ereignis_id
       WHERE b.person_id = @personId AND b.rolle = 'verstorbener' AND e.typ = 'tod'
       ORDER BY e.id`,
    )
    .all({ personId })
}

/** Sterbeort (AP-1.34 PR-C2a): Auswahl im Kern (`sterbeortAufloesen`), hier nur Laden + Namens-
 * auflösung. Der Ortsname kommt wie bei `geburtsort` aus dem bevorzugten `ortsname`. */
function sterbeortBauen(db: Database.Database, personId: string, aussagen: readonly AussageZeile[]): PersonDetailSterbeort | null {
  const todesorte = aussagen
    .filter((aussage) => aussage.praedikat === 'todesort')
    .map((aussage) => ({ id: aussage.id, istBevorzugt: aussage.ist_bevorzugt === 1, wertRefId: aussage.wert_ref_id, wertText: aussage.wert_text }))
  const todEreignisse = todEreignisseLaden(db, personId).map((zeile) => ({ id: zeile.id, ortId: zeile.ort_id }))
  const sterbeort = sterbeortAufloesen(todesorte, todEreignisse)
  if (sterbeort === null) return null
  const ortName = sterbeort.ortId === null ? null : (ortsnamenLaden(db, [sterbeort.ortId]).get(sterbeort.ortId) ?? null)
  return { herkunft: sterbeort.herkunft, ort_id: sterbeort.ortId, ort_name: ortName, aussage_id: sterbeort.aussageId }
}

interface ElternKindZeile {
  readonly person_id: string
  readonly anzeigename: string
  readonly kantentyp: string
  readonly ist_platzhalter: number
}

/** Elternzeile mit Geschlecht — `elternPlaetze` (offene Punkte, AP-1.34 PR-C2c) braucht es. */
interface ElternZeile extends ElternKindZeile {
  readonly geschlecht: string | null
}

function elternLaden(db: Database.Database, personId: string): readonly ElternZeile[] {
  return db
    .prepare<
      { readonly personId: string },
      ElternZeile
    >(`SELECT el.elternteil_id AS person_id, pf.anzeigename AS anzeigename, el.typ AS kantentyp, p.ist_platzhalter AS ist_platzhalter,
              p.geschlecht AS geschlecht
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

interface BeziehungsZeilen {
  readonly eltern: readonly ElternZeile[]
  readonly kinder: readonly ElternKindZeile[]
  readonly partner: readonly ElternKindZeile[]
}

function beziehungsZeilenLaden(db: Database.Database, personId: string): BeziehungsZeilen {
  return { eltern: elternLaden(db, personId), kinder: kinderLaden(db, personId), partner: partnerLaden(db, personId) }
}

function beziehungenBauen(zeilen: BeziehungsZeilen): readonly PersonDetailBeziehung[] {
  const beziehungen: PersonDetailBeziehung[] = []
  for (const zeile of zeilen.eltern) {
    beziehungen.push({ person_id: zeile.person_id, anzeigename: zeile.anzeigename, richtung: 'elternteil', kantentyp: ElternschaftTypEnum.parse(zeile.kantentyp), ist_platzhalter: zeile.ist_platzhalter === 1 })
  }
  for (const zeile of zeilen.kinder) {
    beziehungen.push({ person_id: zeile.person_id, anzeigename: zeile.anzeigename, richtung: 'kind', kantentyp: ElternschaftTypEnum.parse(zeile.kantentyp), ist_platzhalter: zeile.ist_platzhalter === 1 })
  }
  for (const zeile of zeilen.partner) {
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

/** Feldwarnungen (AP-1.34 PR-C2b, §31 U-1.34-C2-O1): `pruefeBestand` auf dem Umfeld der Person,
 * `zyklus` stattdessen über `istEigenerVorfahre` auf den Vorfahrenkanten (der Gesamtbestand meldet
 * über `findeZyklusKnoten` nur den ersten Zyklus; hier bekommt jede Person auf einem Zyklus ihren
 * Befund). Nur beim Lesen — kein Befehl prüft Warnungen, darum blockieren sie nie (Vorgaben §1). */
function warnungenBauen(db: Database.Database, personId: string): readonly PersonDetailWarnung[] {
  const hinweise: BestandHinweis[] = pruefeBestand(personUmfeldLaden(db, personId)).filter((hinweis) => hinweis.code !== 'zyklus')
  if (istEigenerVorfahre(personId, vorfahrenKantenLaden(db, personId))) {
    hinweise.push({ code: 'zyklus', personId })
  }
  return feldwarnungenFuer(hinweise, personId)
}

interface KindElternZeile {
  readonly kind_id: string
  readonly elternteil_id: string
}

/** Alle Elternkanten aller Kinder der Person (auch die zur Person selbst) — für
 * `kind_ohne_partnerschaft` (§31 U-1.34-C2-O5). Ein JOIN statt einer Abfrage je Kind. */
function kinderElternLaden(db: Database.Database, personId: string): readonly KindElternZeile[] {
  return db
    .prepare<
      { readonly personId: string },
      KindElternZeile
    >(`SELECT el2.kind_id AS kind_id, el2.elternteil_id AS elternteil_id
       FROM elternschaft el1
       JOIN elternschaft el2 ON el2.kind_id = el1.kind_id
       WHERE el1.elternteil_id = @personId
       ORDER BY el2.kind_id, el2.elternteil_id`,
    )
    .all({ personId })
}

/** Vorläufige Porträt-Eingabe (§31 U-1.34-E8): ein Medium als Titelbild der Person. Die Regel
 * `kein_portraet` ist bis AP-1.31b inaktiv; die Abfrage steht, damit das Einschalten nur die
 * Regeltabelle ändert. */
function hatTitelbild(db: Database.Database, personId: string): boolean {
  const zeile = db
    .prepare<
      { readonly personId: string; readonly subjektTyp: string },
      { readonly vorhanden: number }
    >(`SELECT EXISTS (
         SELECT 1 FROM medium_zuordnung
         WHERE subjekt_typ = @subjektTyp AND subjekt_id = @personId AND ist_titelbild = 1
       ) AS vorhanden`,
    )
    .get({ personId, subjektTyp: 'person' })
  return zeile?.vorhanden === 1
}

/** Offene Punkte (AP-1.34 PR-C2c, Vorgaben §5.5): Auswertung im Kern (`offenePunkteAuswerten`),
 * hier nur die Eingabe aus bereits geladenen Teilen plus zwei gezielte Nachladungen (Elternkanten
 * der Kinder, Titelbild). Platzhalter: keine Punkte, darum auch kein Nachladen (O4). */
function offenePunkteBauen(
  db: Database.Database,
  kopfZeile: KopfZeile,
  beziehungen: BeziehungsZeilen,
  grunddaten: readonly PersonDetailGrunddatenFeld[],
  sterbeort: PersonDetailSterbeort | null,
  warnungen: readonly PersonDetailWarnung[],
): readonly PersonDetailOffenerPunkt[] {
  if (kopfZeile.ist_platzhalter === 1) return []

  const kinderIstPlatzhalter = new Map(beziehungen.kinder.map((zeile) => [zeile.person_id, zeile.ist_platzhalter === 1]))
  const elternJeKind = new Map<string, string[]>()
  for (const zeile of kinderElternLaden(db, kopfZeile.person_id)) {
    const liste = elternJeKind.get(zeile.kind_id) ?? []
    liste.push(zeile.elternteil_id)
    elternJeKind.set(zeile.kind_id, liste)
  }
  const kinder: OffenePunkteKind[] = [...elternJeKind].map(([id, elternIds]) => ({ id, istPlatzhalter: kinderIstPlatzhalter.get(id) ?? false, elternIds }))

  const punkte = offenePunkteAuswerten({
    personId: kopfZeile.person_id,
    istPlatzhalter: false,
    lebendStatus: kopfZeile.lebend_status === null ? null : LebendStatusEnum.parse(kopfZeile.lebend_status),
    hatSterbeort: sterbeort !== null,
    eltern: beziehungen.eltern.map((zeile) => ({ id: zeile.person_id, geschlecht: zeile.geschlecht === null ? null : GeschlechtEnum.parse(zeile.geschlecht) })),
    hatPortraet: hatTitelbild(db, kopfZeile.person_id),
    kinder,
    partnerIds: beziehungen.partner.map((zeile) => zeile.person_id),
    widerspruchPraedikate: grunddaten.filter((feld) => feld.hat_widerspruch).map((feld) => feld.praedikat),
    feldwarnungen: warnungen.map((warnung) => ({ reiter: warnung.reiter, feld: warnung.feld })),
  })
  return punkte.map((punkt) => ({
    regel_id: punkt.regelId,
    reiter: punkt.reiter,
    feld: punkt.feld,
    meldungsschluessel: punkt.meldungsschluessel,
    bezug_id: punkt.bezugId,
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

  const beziehungsZeilen = beziehungsZeilenLaden(db, ein.personId)
  const grunddaten = grunddatenBauen(aussagen, belegzahlKarte, belegeKarte, ortsnamenKarte, personennamenKarte)
  const sterbeort = sterbeortBauen(db, ein.personId, aussagen)
  const warnungen = warnungenBauen(db, ein.personId)

  return {
    kopf: {
      person_id: kopfZeile.person_id,
      anzeigename: kopfZeile.anzeigename,
      konfidenz_min: kopfZeile.konfidenz_min,
      ist_platzhalter: kopfZeile.ist_platzhalter === 1,
      privat: kopfZeile.privat === 1,
      geschlecht: kopfZeile.geschlecht === null ? null : GeschlechtEnum.parse(kopfZeile.geschlecht),
      platzhalter_grund: kopfZeile.platzhalter_grund === null ? null : PlatzhalterGrundEnum.parse(kopfZeile.platzhalter_grund),
      kennung: KennungSchema.parse(kopfZeile.kennung),
      lebend_status: kopfZeile.lebend_status === null ? null : LebendStatusEnum.parse(kopfZeile.lebend_status),
    },
    namen: namenLaden(db, ein.personId),
    grunddaten,
    ereignisse: ereignisseSortierenUndWandeln(ereignisseLaden(db, ein.personId)),
    beziehungen: beziehungenBauen(beziehungsZeilen),
    gesundheit: [...diagnosenLaden(db, ein.personId), ...risikofaktorenLaden(db, ein.personId)],
    notiz: kopfZeile.notiz,
    sterbeort,
    warnungen,
    offene_punkte: offenePunkteBauen(db, kopfZeile, beziehungsZeilen, grunddaten, sterbeort, warnungen),
  }
}
