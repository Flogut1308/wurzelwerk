// AP-1.3d: einziges Repository, das `medium`-SQL schreibt (CLAUDE.md §2). Kein `BEGIN`/`COMMIT`
// hier (läuft in einer bereits offenen, armierten Transaktion, s. `person-repo.ts`-Kopf). Legt NUR
// die DB-Zeile an — das Kopieren der Mediendatei in den Projektordner ist AP-1.5
// (`src/main/import/medienkopie.ts`).
import type { Tx } from './basis'
import type { DatumSpaltengruppe } from '../import/datum-spalten'

/** Nutzlast von `einfuegen()`: alle Spalten von `medium` (docs/schema/0002_kern.sql §2.9), außer
 * `hash`/`mime_typ`/`groesse` (bleiben `NULL` — kein Datensatz braucht sie bis Phase 2, AP-1.5
 * ergänzt nur `dateiname`, den Originaldateinamen aus `medienkopie.ts`). */
export interface MediumEinfuegenEin {
  readonly id: string
  readonly relativerPfad: string
  readonly dateiname: string | null
  readonly titel: string | null
  readonly beschreibung: string | null
  readonly datum: DatumSpaltengruppe
  readonly ortId: string | null
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Legt eine `medium`-Zeile an (benannte Parameter, CLAUDE.md §6). */
export function einfuegen(tx: Tx, ein: MediumEinfuegenEin): void {
  tx.prepare(
    `INSERT INTO medium (
       id, dateiname, relativer_pfad, titel, beschreibung,
       datum_kalender, datum_modifikator, datum_praezision, datum_wert1, datum_wert2, datum_originaltext,
       datum_sort_von, datum_sort_bis, datum_zweitkalender, datum_zweitwert, datum_doppeljahr,
       ort_id, erstellt_am, geaendert_am
     )
     VALUES (
       @id, @dateiname, @relativerPfad, @titel, @beschreibung,
       @datumKalender, @datumModifikator, @datumPraezision, @datumWert1, @datumWert2, @datumOriginaltext,
       @datumSortVon, @datumSortBis, @datumZweitkalender, @datumZweitwert, @datumDoppeljahr,
       @ortId, @erstelltAm, @geaendertAm
     )`,
  ).run({
    id: ein.id,
    dateiname: ein.dateiname,
    relativerPfad: ein.relativerPfad,
    titel: ein.titel,
    beschreibung: ein.beschreibung,
    datumKalender: ein.datum.kalender,
    datumModifikator: ein.datum.modifikator,
    datumPraezision: ein.datum.praezision,
    datumWert1: ein.datum.wert1,
    datumWert2: ein.datum.wert2,
    datumOriginaltext: ein.datum.originaltext,
    datumSortVon: ein.datum.sortVon,
    datumSortBis: ein.datum.sortBis,
    datumZweitkalender: ein.datum.zweitkalender,
    datumZweitwert: ein.datum.zweitwert,
    datumDoppeljahr: ein.datum.doppeljahr,
    ortId: ein.ortId,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
}
