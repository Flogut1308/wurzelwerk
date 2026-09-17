// AP-1.3d: einziges Repository, das `elternschaft`/`partnerschaft`/`partnerschaft_person`-SQL
// schreibt (CLAUDE.md §2). Kein `BEGIN`/`COMMIT` hier (läuft in einer bereits offenen, armierten
// Transaktion, s. `person-repo.ts`-Kopf).
import type { Tx } from './basis'
import type { DatumSpaltengruppe } from '../import/datum-spalten'

/** Nutzlast von `elternschaftEinfuegen()`: alle Spalten von `elternschaft`
 * (docs/schema/0002_kern.sql §2.6). `konfidenz` bleibt IMMER `NULL` (ADR-026, 50_Datenmodell.md
 * §2.7: „elternschaft.konfidenz … wird nicht mehr geschrieben") — deshalb kein Parameter dafür,
 * die Konfidenz einer Elternschaft lebt ausschließlich in ihrer Existenz-Aussage. */
export interface ElternschaftEinfuegenEin {
  readonly id: string
  readonly elternteilId: string
  readonly kindId: string
  readonly typ: string
  readonly notiz: string | null
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Legt eine `elternschaft`-Zeile an (benannte Parameter, CLAUDE.md §6). */
export function elternschaftEinfuegen(tx: Tx, ein: ElternschaftEinfuegenEin): void {
  tx.prepare(
    `INSERT INTO elternschaft (id, elternteil_id, kind_id, typ, konfidenz, notiz, erstellt_am, geaendert_am)
     VALUES (@id, @elternteilId, @kindId, @typ, NULL, @notiz, @erstelltAm, @geaendertAm)`,
  ).run({
    id: ein.id,
    elternteilId: ein.elternteilId,
    kindId: ein.kindId,
    typ: ein.typ,
    notiz: ein.notiz,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
}

/** Nutzlast von `partnerschaftEinfuegen()`: alle Spalten von `partnerschaft`
 * (docs/schema/0002_kern.sql §2.6) — die Tabelle hat KEINE eigene `konfidenz`-Spalte (die
 * Konfidenz einer Partnerschaft lebt in ihrer Existenz-Aussage, ADR-026). */
export interface PartnerschaftEinfuegenEin {
  readonly id: string
  readonly typ: string
  readonly beginn: DatumSpaltengruppe
  readonly ende: DatumSpaltengruppe
  readonly endeGrund: string | null
  readonly reihenfolge: number | null
  readonly notiz: string | null
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Legt eine `partnerschaft`-Zeile an (benannte Parameter, CLAUDE.md §6). */
export function partnerschaftEinfuegen(tx: Tx, ein: PartnerschaftEinfuegenEin): void {
  tx.prepare(
    `INSERT INTO partnerschaft (
       id, typ,
       beginn_kalender, beginn_modifikator, beginn_praezision, beginn_wert1, beginn_wert2, beginn_originaltext,
       beginn_sort_von, beginn_sort_bis, beginn_zweitkalender, beginn_zweitwert, beginn_doppeljahr,
       ende_kalender, ende_modifikator, ende_praezision, ende_wert1, ende_wert2, ende_originaltext,
       ende_sort_von, ende_sort_bis, ende_zweitkalender, ende_zweitwert, ende_doppeljahr,
       ende_grund, reihenfolge, notiz, erstellt_am, geaendert_am
     )
     VALUES (
       @id, @typ,
       @beginnKalender, @beginnModifikator, @beginnPraezision, @beginnWert1, @beginnWert2, @beginnOriginaltext,
       @beginnSortVon, @beginnSortBis, @beginnZweitkalender, @beginnZweitwert, @beginnDoppeljahr,
       @endeKalender, @endeModifikator, @endePraezision, @endeWert1, @endeWert2, @endeOriginaltext,
       @endeSortVon, @endeSortBis, @endeZweitkalender, @endeZweitwert, @endeDoppeljahr,
       @endeGrund, @reihenfolge, @notiz, @erstelltAm, @geaendertAm
     )`,
  ).run({
    id: ein.id,
    typ: ein.typ,
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
    endeGrund: ein.endeGrund,
    reihenfolge: ein.reihenfolge,
    notiz: ein.notiz,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
}

/** Nutzlast von `partnerschaftPersonEinfuegen()`: alle Spalten von `partnerschaft_person`
 * (docs/schema/0002_kern.sql §2.6, Verknüpfungstabelle ohne eigenes `id`). */
export interface PartnerschaftPersonEinfuegenEin {
  readonly partnerschaftId: string
  readonly personId: string
  readonly rolle: string | null
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Legt eine `partnerschaft_person`-Zeile an (benannte Parameter, CLAUDE.md §6). */
export function partnerschaftPersonEinfuegen(tx: Tx, ein: PartnerschaftPersonEinfuegenEin): void {
  tx.prepare(
    `INSERT INTO partnerschaft_person (partnerschaft_id, person_id, rolle, erstellt_am, geaendert_am)
     VALUES (@partnerschaftId, @personId, @rolle, @erstelltAm, @geaendertAm)`,
  ).run({
    partnerschaftId: ein.partnerschaftId,
    personId: ein.personId,
    rolle: ein.rolle,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
}
