// AP-1.3d: einziges Repository, das `diagnose`/`risikofaktor`-SQL schreibt (CLAUDE.md §2). Kein
// `BEGIN`/`COMMIT` hier (läuft in einer bereits offenen, armierten Transaktion, s.
// `person-repo.ts`-Kopf). M-08 (CLAUDE.md §8): beide Tabellen sind aus JEDEM Export
// ausgeschlossen — das ist Exportcode, betrifft diesen Schreibpfad nicht.
import type { Tx } from './basis'
import type { DatumSpaltengruppe } from '../import/datum-spalten'

/** Nutzlast von `diagnoseEinfuegen()`: alle Spalten von `diagnose` (docs/schema/0002_kern.sql
 * §2.12), außer `icd10` (kein Vertragsfeld, E-24: „Kein ICD-10"). */
export interface DiagnoseEinfuegenEin {
  readonly id: string
  readonly personId: string
  readonly kategorie: string
  readonly organ: string | null
  readonly bezeichnung: string
  readonly erstdiagnose: DatumSpaltengruppe
  readonly alterBeiDiagnose: number | null
  readonly status: string
  readonly konfidenz: number
  readonly notiz: string | null
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Legt eine `diagnose`-Zeile an (benannte Parameter, CLAUDE.md §6). */
export function diagnoseEinfuegen(tx: Tx, ein: DiagnoseEinfuegenEin): void {
  tx.prepare(
    `INSERT INTO diagnose (
       id, person_id, kategorie, organ, bezeichnung,
       erstdiagnose_kalender, erstdiagnose_modifikator, erstdiagnose_praezision, erstdiagnose_wert1, erstdiagnose_wert2,
       erstdiagnose_originaltext, erstdiagnose_sort_von, erstdiagnose_sort_bis, erstdiagnose_zweitkalender,
       erstdiagnose_zweitwert, erstdiagnose_doppeljahr,
       alter_bei_diagnose, status, konfidenz, notiz, erstellt_am, geaendert_am
     )
     VALUES (
       @id, @personId, @kategorie, @organ, @bezeichnung,
       @erstdiagnoseKalender, @erstdiagnoseModifikator, @erstdiagnosePraezision, @erstdiagnoseWert1, @erstdiagnoseWert2,
       @erstdiagnoseOriginaltext, @erstdiagnoseSortVon, @erstdiagnoseSortBis, @erstdiagnoseZweitkalender,
       @erstdiagnoseZweitwert, @erstdiagnoseDoppeljahr,
       @alterBeiDiagnose, @status, @konfidenz, @notiz, @erstelltAm, @geaendertAm
     )`,
  ).run({
    id: ein.id,
    personId: ein.personId,
    kategorie: ein.kategorie,
    organ: ein.organ,
    bezeichnung: ein.bezeichnung,
    erstdiagnoseKalender: ein.erstdiagnose.kalender,
    erstdiagnoseModifikator: ein.erstdiagnose.modifikator,
    erstdiagnosePraezision: ein.erstdiagnose.praezision,
    erstdiagnoseWert1: ein.erstdiagnose.wert1,
    erstdiagnoseWert2: ein.erstdiagnose.wert2,
    erstdiagnoseOriginaltext: ein.erstdiagnose.originaltext,
    erstdiagnoseSortVon: ein.erstdiagnose.sortVon,
    erstdiagnoseSortBis: ein.erstdiagnose.sortBis,
    erstdiagnoseZweitkalender: ein.erstdiagnose.zweitkalender,
    erstdiagnoseZweitwert: ein.erstdiagnose.zweitwert,
    erstdiagnoseDoppeljahr: ein.erstdiagnose.doppeljahr,
    alterBeiDiagnose: ein.alterBeiDiagnose,
    status: ein.status,
    konfidenz: ein.konfidenz,
    notiz: ein.notiz,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
}

/** Nutzlast von `risikofaktorEinfuegen()`: alle Spalten von `risikofaktor`
 * (docs/schema/0002_kern.sql §2.12), außer `quelle_beruf_id` (kein Vertragsfeld in AP-1.3d). */
export interface RisikofaktorEinfuegenEin {
  readonly id: string
  readonly personId: string
  readonly art: string
  readonly detail: string | null
  readonly intensitaet: string
  readonly beginn: DatumSpaltengruppe
  readonly ende: DatumSpaltengruppe
  readonly konfidenz: number
  readonly notiz: string | null
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Legt eine `risikofaktor`-Zeile an (benannte Parameter, CLAUDE.md §6). */
export function risikofaktorEinfuegen(tx: Tx, ein: RisikofaktorEinfuegenEin): void {
  tx.prepare(
    `INSERT INTO risikofaktor (
       id, person_id, art, detail, intensitaet,
       beginn_kalender, beginn_modifikator, beginn_praezision, beginn_wert1, beginn_wert2, beginn_originaltext,
       beginn_sort_von, beginn_sort_bis, beginn_zweitkalender, beginn_zweitwert, beginn_doppeljahr,
       ende_kalender, ende_modifikator, ende_praezision, ende_wert1, ende_wert2, ende_originaltext,
       ende_sort_von, ende_sort_bis, ende_zweitkalender, ende_zweitwert, ende_doppeljahr,
       konfidenz, notiz, erstellt_am, geaendert_am
     )
     VALUES (
       @id, @personId, @art, @detail, @intensitaet,
       @beginnKalender, @beginnModifikator, @beginnPraezision, @beginnWert1, @beginnWert2, @beginnOriginaltext,
       @beginnSortVon, @beginnSortBis, @beginnZweitkalender, @beginnZweitwert, @beginnDoppeljahr,
       @endeKalender, @endeModifikator, @endePraezision, @endeWert1, @endeWert2, @endeOriginaltext,
       @endeSortVon, @endeSortBis, @endeZweitkalender, @endeZweitwert, @endeDoppeljahr,
       @konfidenz, @notiz, @erstelltAm, @geaendertAm
     )`,
  ).run({
    id: ein.id,
    personId: ein.personId,
    art: ein.art,
    detail: ein.detail,
    intensitaet: ein.intensitaet,
    beginnKalender: ein.beginn.kalender,
    beginnModifikator: ein.beginn.modifikator,
    beginnPraezision: ein.beginn.praezision,
    beginnWert1: ein.beginn.wert1,
    beginnWert2: ein.beginn.wert2,
    beginnOriginaltext: ein.beginn.originaltext,
    beginnSortVon: ein.beginn.sortVon,
    beginnSortBis: ein.beginn.sortBis,
    beginnZweitkalender: ein.beginn.zweitkalender,
    beginnZweitwert: ein.beginn.zweitwert,
    beginnDoppeljahr: ein.beginn.doppeljahr,
    endeKalender: ein.ende.kalender,
    endeModifikator: ein.ende.modifikator,
    endePraezision: ein.ende.praezision,
    endeWert1: ein.ende.wert1,
    endeWert2: ein.ende.wert2,
    endeOriginaltext: ein.ende.originaltext,
    endeSortVon: ein.ende.sortVon,
    endeSortBis: ein.ende.sortBis,
    endeZweitkalender: ein.ende.zweitkalender,
    endeZweitwert: ein.ende.zweitwert,
    endeDoppeljahr: ein.ende.doppeljahr,
    konfidenz: ein.konfidenz,
    notiz: ein.notiz,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
}
