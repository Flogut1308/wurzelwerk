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

/** Eine gerichtete Elternkante (`elternteil_id -> kind_id`) — Eingabeform für
 * `src/core/graph/zyklus.ts::wuerdeZyklusErzeugen()` (AP-1.12, `elternschaft.anlegen`). */
export interface ElternkanteZeile {
  readonly elternteilId: string
  readonly kindId: string
}

/** Liest alle bestehenden Elternkanten (AP-1.12) — Grundlage für den Zyklusschutz vor jedem
 * `elternschaft.anlegen`. Für die zu erwartende Baumgröße (Ahnenforschung, kein Massendatensatz)
 * ist ein vollständiges Auslesen unkritisch; eine inkrementelle Prüfung könnte später über
 * `person_flach`/eine eigene Abfrage nachgerüstet werden, falls Performance-Budgets das verlangen. */
export function alleKanten(tx: Tx): readonly ElternkanteZeile[] {
  return tx.prepare<[], ElternkanteZeile>('SELECT elternteil_id AS elternteilId, kind_id AS kindId FROM elternschaft').all()
}

/** Spalten von `elternschaft` (docs/schema/0002_kern.sql §2.6), für `elternschaftLesen()`
 * (AP-1.12, AP-0.22-Vergleich vor `elternschaft.aendern`). */
export interface ElternschaftZeile {
  readonly id: string
  readonly elternteil_id: string
  readonly kind_id: string
  readonly typ: string
  readonly notiz: string | null
}

/** Liest eine `elternschaft`-Zeile. `undefined`, wenn `id` nicht existiert. */
export function elternschaftLesen(tx: Tx, id: string): ElternschaftZeile | undefined {
  return tx
    .prepare<{ readonly id: string }, ElternschaftZeile>('SELECT id, elternteil_id, kind_id, typ, notiz FROM elternschaft WHERE id = @id')
    .get({ id })
}

/** Nutzlast von `elternschaftAktualisieren()` — NUR `typ`/`notiz` (AP-1.12 Nutzerentscheidung,
 * s. `src/shared/schemata/befehle.ts::ElternschaftAendernEin`). */
export interface ElternschaftAktualisierenEin {
  readonly id: string
  readonly typ: string
  readonly notiz: string | null
  readonly geaendertAm: number
}

/** Aktualisiert `typ`/`notiz` einer `elternschaft`-Zeile (AP-1.12). */
export function elternschaftAktualisieren(tx: Tx, ein: ElternschaftAktualisierenEin): void {
  tx.prepare('UPDATE elternschaft SET typ = @typ, notiz = @notiz, geaendert_am = @geaendertAm WHERE id = @id').run({
    id: ein.id,
    typ: ein.typ,
    notiz: ein.notiz,
    geaendertAm: ein.geaendertAm,
  })
}

/** Löscht eine `elternschaft`-Zeile (AP-1.12). */
export function elternschaftLoeschen(tx: Tx, id: string): void {
  tx.prepare('DELETE FROM elternschaft WHERE id = @id').run({ id })
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

/** Spalten von `partnerschaft` (docs/schema/0002_kern.sql §2.6), für `partnerschaftLesen()`
 * (AP-1.12, AP-0.22-Vergleich vor `partnerschaft.aendern`). */
export interface PartnerschaftZeile {
  readonly id: string
  readonly typ: string
  readonly beginn_kalender: string | null
  readonly beginn_modifikator: string | null
  readonly beginn_praezision: string | null
  readonly beginn_wert1: string | null
  readonly beginn_wert2: string | null
  readonly beginn_originaltext: string | null
  readonly beginn_sort_von: number | null
  readonly beginn_sort_bis: number | null
  readonly beginn_zweitkalender: string | null
  readonly beginn_zweitwert: string | null
  readonly beginn_doppeljahr: string | null
  readonly ende_kalender: string | null
  readonly ende_modifikator: string | null
  readonly ende_praezision: string | null
  readonly ende_wert1: string | null
  readonly ende_wert2: string | null
  readonly ende_originaltext: string | null
  readonly ende_sort_von: number | null
  readonly ende_sort_bis: number | null
  readonly ende_zweitkalender: string | null
  readonly ende_zweitwert: string | null
  readonly ende_doppeljahr: string | null
  readonly ende_grund: string | null
  readonly reihenfolge: number | null
  readonly notiz: string | null
}

/** Liest eine `partnerschaft`-Zeile. `undefined`, wenn `id` nicht existiert. */
export function partnerschaftLesen(tx: Tx, id: string): PartnerschaftZeile | undefined {
  return tx
    .prepare<{ readonly id: string }, PartnerschaftZeile>(
      `SELECT id, typ,
              beginn_kalender, beginn_modifikator, beginn_praezision, beginn_wert1, beginn_wert2, beginn_originaltext,
              beginn_sort_von, beginn_sort_bis, beginn_zweitkalender, beginn_zweitwert, beginn_doppeljahr,
              ende_kalender, ende_modifikator, ende_praezision, ende_wert1, ende_wert2, ende_originaltext,
              ende_sort_von, ende_sort_bis, ende_zweitkalender, ende_zweitwert, ende_doppeljahr,
              ende_grund, reihenfolge, notiz
       FROM partnerschaft WHERE id = @id`,
    )
    .get({ id })
}

/** Nutzlast von `partnerschaftAktualisieren()`: die editierbare Zeile selbst (ohne die
 * Beteiligten, `partnerschaft_person` — außerhalb des AP-1.12-Umfangs) + der vom Handler gesetzte
 * `geaendert_am`-Zeitstempel (D-3). */
export interface PartnerschaftAktualisierenEin {
  readonly id: string
  readonly typ: string
  readonly beginn: DatumSpaltengruppe
  readonly ende: DatumSpaltengruppe
  readonly endeGrund: string | null
  readonly reihenfolge: number | null
  readonly notiz: string | null
  readonly geaendertAm: number
}

/** Aktualisiert alle editierbaren Spalten einer `partnerschaft`-Zeile in einem `UPDATE` (AP-1.12). */
export function partnerschaftAktualisieren(tx: Tx, ein: PartnerschaftAktualisierenEin): void {
  tx.prepare(
    `UPDATE partnerschaft SET
       typ = @typ,
       beginn_kalender = @beginnKalender, beginn_modifikator = @beginnModifikator, beginn_praezision = @beginnPraezision,
       beginn_wert1 = @beginnWert1, beginn_wert2 = @beginnWert2, beginn_originaltext = @beginnOriginaltext,
       beginn_sort_von = @beginnSortVon, beginn_sort_bis = @beginnSortBis,
       beginn_zweitkalender = @beginnZweitkalender, beginn_zweitwert = @beginnZweitwert, beginn_doppeljahr = @beginnDoppeljahr,
       ende_kalender = @endeKalender, ende_modifikator = @endeModifikator, ende_praezision = @endePraezision,
       ende_wert1 = @endeWert1, ende_wert2 = @endeWert2, ende_originaltext = @endeOriginaltext,
       ende_sort_von = @endeSortVon, ende_sort_bis = @endeSortBis,
       ende_zweitkalender = @endeZweitkalender, ende_zweitwert = @endeZweitwert, ende_doppeljahr = @endeDoppeljahr,
       ende_grund = @endeGrund, reihenfolge = @reihenfolge, notiz = @notiz, geaendert_am = @geaendertAm
     WHERE id = @id`,
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
    geaendertAm: ein.geaendertAm,
  })
}

/** Löscht eine `partnerschaft`-Zeile (CASCADE räumt `partnerschaft_person` ab, AP-1.12). */
export function partnerschaftLoeschen(tx: Tx, id: string): void {
  tx.prepare('DELETE FROM partnerschaft WHERE id = @id').run({ id })
}
