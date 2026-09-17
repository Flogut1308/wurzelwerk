// AP-1.3d: einziges Repository, das `interview_sitzung`-SQL schreibt (CLAUDE.md §2). Kein
// `BEGIN`/`COMMIT` hier (läuft in einer bereits offenen, armierten Transaktion, s.
// `person-repo.ts`-Kopf).
import type { Tx } from './basis'
import type { DatumSpaltengruppe } from '../import/datum-spalten'

/** Nutzlast von `einfuegen()`: alle Spalten von `interview_sitzung` (docs/schema/0002_kern.sql
 * §2.15). */
export interface InterviewSitzungEinfuegenEin {
  readonly id: string
  readonly informantPersonId: string | null
  readonly datum: DatumSpaltengruppe
  readonly ortId: string | null
  readonly audioMediumId: string | null
  readonly notizen: string | null
  readonly status: string | null
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Legt eine `interview_sitzung`-Zeile an (benannte Parameter, CLAUDE.md §6). */
export function einfuegen(tx: Tx, ein: InterviewSitzungEinfuegenEin): void {
  tx.prepare(
    `INSERT INTO interview_sitzung (
       id, informant_person_id,
       datum_kalender, datum_modifikator, datum_praezision, datum_wert1, datum_wert2, datum_originaltext,
       datum_sort_von, datum_sort_bis, datum_zweitkalender, datum_zweitwert, datum_doppeljahr,
       ort_id, audio_medium_id, notizen, status, erstellt_am, geaendert_am
     )
     VALUES (
       @id, @informantPersonId,
       @datumKalender, @datumModifikator, @datumPraezision, @datumWert1, @datumWert2, @datumOriginaltext,
       @datumSortVon, @datumSortBis, @datumZweitkalender, @datumZweitwert, @datumDoppeljahr,
       @ortId, @audioMediumId, @notizen, @status, @erstelltAm, @geaendertAm
     )`,
  ).run({
    id: ein.id,
    informantPersonId: ein.informantPersonId,
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
    audioMediumId: ein.audioMediumId,
    notizen: ein.notizen,
    status: ein.status,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
}
