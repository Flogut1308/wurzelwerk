// AP-1.17 PR-A2 (docs/71_Designsystem.md §3.2, docs/arbeitspakete.md AP-1.17). `abfrage:quelle.
// detail` — read-only SQL gegen `quelle`/`archiv`/`zitat` (CLAUDE.md §2: SQL nur in
// src/main/repositories/, src/main/abfragen/ — hier direkt, analog `ort-detail.ts`, KEIN Umweg
// über `beleg-repo.ts`), KEINE Transaktion, Spalten aufgezählt, benannte Parameter.
import type Database from 'better-sqlite3'
import { InformationsartEnum, QuelleArtEnum, QuelleFormEnum, QuelleTypEnum, UnmittelbarkeitEnum } from '../../shared/schemata/quelle'
import { KalenderEnum, DatumModifikatorEnum, DatumPraezisionEnum } from '../../shared/schemata/gemeinsam'
import type { QuelleDetailAus, QuelleDetailEin, QuelleDetailKopf, QuelleDetailZitat } from '../../shared/schemata/quelle-detail'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert } from '../repositories/basis'

interface KopfZeile {
  readonly id: string
  readonly typ: string
  readonly titel: string | null
  readonly autor: string | null
  readonly verlag: string | null
  readonly jahr: number | null
  readonly art: string | null
  readonly informationsart: string | null
  readonly archiv_id: string | null
  readonly archiv_name: string | null
  readonly signatur: string | null
  readonly notiz: string | null
  readonly informant_person_id: string | null
  readonly gespraechsdatum_kalender: string | null
  readonly gespraechsdatum_modifikator: string | null
  readonly gespraechsdatum_praezision: string | null
  readonly gespraechsdatum_wert1: string | null
  readonly gespraechsdatum_wert2: string | null
  readonly gespraechsdatum_originaltext: string | null
  readonly gespraechsdatum_zweitkalender: string | null
  readonly gespraechsdatum_zweitwert: string | null
  readonly gespraechsdatum_doppeljahr: string | null
  readonly form: string | null
  readonly unmittelbarkeit: string | null
  readonly audio_medium_id: string | null
}

function kopfLaden(db: Database.Database, quelleId: string): KopfZeile | undefined {
  return db
    .prepare<
      { readonly quelleId: string },
      KopfZeile
    >(`SELECT q.id AS id, q.typ AS typ, q.titel AS titel, q.autor AS autor, q.verlag AS verlag, q.jahr AS jahr,
              q.art AS art, q.informationsart AS informationsart, q.archiv_id AS archiv_id, a.name AS archiv_name,
              q.signatur AS signatur, q.notiz AS notiz, q.informant_person_id AS informant_person_id,
              q.gespraechsdatum_kalender AS gespraechsdatum_kalender, q.gespraechsdatum_modifikator AS gespraechsdatum_modifikator,
              q.gespraechsdatum_praezision AS gespraechsdatum_praezision, q.gespraechsdatum_wert1 AS gespraechsdatum_wert1,
              q.gespraechsdatum_wert2 AS gespraechsdatum_wert2, q.gespraechsdatum_originaltext AS gespraechsdatum_originaltext,
              q.gespraechsdatum_zweitkalender AS gespraechsdatum_zweitkalender, q.gespraechsdatum_zweitwert AS gespraechsdatum_zweitwert,
              q.gespraechsdatum_doppeljahr AS gespraechsdatum_doppeljahr,
              q.form AS form, q.unmittelbarkeit AS unmittelbarkeit, q.audio_medium_id AS audio_medium_id
       FROM quelle q
       LEFT JOIN archiv a ON a.id = q.archiv_id
       WHERE q.id = @quelleId`,
    )
    .get({ quelleId })
}

interface ZitatZeile {
  readonly id: string
  readonly seite: string | null
  readonly eintragsnummer: string | null
  readonly band: string | null
  readonly jahr: number | null
  readonly zeitmarke_sekunden: number | null
  readonly digitalisat_url: string | null
  readonly transkript: string | null
  readonly uebersetzung: string | null
  readonly konfidenz: number | null
}

function zitateLaden(db: Database.Database, quelleId: string): readonly QuelleDetailZitat[] {
  return db
    .prepare<
      { readonly quelleId: string },
      ZitatZeile
    >(`SELECT id, seite, eintragsnummer, band, jahr, zeitmarke_sekunden, digitalisat_url, transkript, uebersetzung, konfidenz
       FROM zitat
       WHERE quelle_id = @quelleId
       ORDER BY id`,
    )
    .all({ quelleId })
}

/** `abfrage:quelle.detail` (docs/arbeitspakete.md AP-1.17 PR-A2). */
export function quelleDetail(db: Database.Database, ein: QuelleDetailEin): QuelleDetailAus {
  if (!datensatzExistiert(db, 'quelle', ein.quelleId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_QUELLE')
  }
  const kopfZeile = kopfLaden(db, ein.quelleId)
  if (kopfZeile === undefined) {
    // Defensiv (CLAUDE.md §4: kein `!`): die vorstehende `datensatzExistiert`-Prüfung hat die
    // Zeile bereits bestätigt — dieser Zweig sollte unerreichbar sein.
    throw new WurzelFehler('INTERN_UNERWARTET', `quelle fehlt trotz datensatzExistiert() für "${ein.quelleId}".`)
  }

  const kopf: QuelleDetailKopf = {
    id: kopfZeile.id,
    typ: QuelleTypEnum.parse(kopfZeile.typ),
    titel: kopfZeile.titel,
    autor: kopfZeile.autor,
    verlag: kopfZeile.verlag,
    jahr: kopfZeile.jahr,
    art: kopfZeile.art === null ? null : QuelleArtEnum.parse(kopfZeile.art),
    informationsart: kopfZeile.informationsart === null ? null : InformationsartEnum.parse(kopfZeile.informationsart),
    archiv_id: kopfZeile.archiv_id,
    archiv_name: kopfZeile.archiv_name,
    signatur: kopfZeile.signatur,
    notiz: kopfZeile.notiz,
    informant_person_id: kopfZeile.informant_person_id,
    gespraechsdatum_kalender: kopfZeile.gespraechsdatum_kalender === null ? null : KalenderEnum.parse(kopfZeile.gespraechsdatum_kalender),
    gespraechsdatum_modifikator:
      kopfZeile.gespraechsdatum_modifikator === null ? null : DatumModifikatorEnum.parse(kopfZeile.gespraechsdatum_modifikator),
    gespraechsdatum_praezision:
      kopfZeile.gespraechsdatum_praezision === null ? null : DatumPraezisionEnum.parse(kopfZeile.gespraechsdatum_praezision),
    gespraechsdatum_wert1: kopfZeile.gespraechsdatum_wert1,
    gespraechsdatum_wert2: kopfZeile.gespraechsdatum_wert2,
    gespraechsdatum_originaltext: kopfZeile.gespraechsdatum_originaltext,
    gespraechsdatum_zweitkalender:
      kopfZeile.gespraechsdatum_zweitkalender === null ? null : KalenderEnum.parse(kopfZeile.gespraechsdatum_zweitkalender),
    gespraechsdatum_zweitwert: kopfZeile.gespraechsdatum_zweitwert,
    gespraechsdatum_doppeljahr: kopfZeile.gespraechsdatum_doppeljahr,
    form: kopfZeile.form === null ? null : QuelleFormEnum.parse(kopfZeile.form),
    unmittelbarkeit: kopfZeile.unmittelbarkeit === null ? null : UnmittelbarkeitEnum.parse(kopfZeile.unmittelbarkeit),
    audio_medium_id: kopfZeile.audio_medium_id,
  }

  return {
    kopf,
    zitate: zitateLaden(db, ein.quelleId),
  }
}
