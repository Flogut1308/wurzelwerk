// AP-1.3d: einziges Repository, das `ereignis`/`beteiligung`-SQL schreibt (CLAUDE.md §2). Kein
// `BEGIN`/`COMMIT` hier (läuft in einer bereits offenen, armierten Transaktion, s.
// `person-repo.ts`-Kopf).
import type { Tx } from './basis'
import type { DatumSpaltengruppe } from '../import/datum-spalten'

/** Nutzlast von `einfuegen()`: alle Spalten von `ereignis` (docs/schema/0002_kern.sql §2.5). */
export interface EreignisEinfuegenEin {
  readonly id: string
  readonly typ: string
  readonly ortId: string | null
  readonly datum: DatumSpaltengruppe
  readonly beschreibung: string | null
  readonly notiz: string | null
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Legt eine `ereignis`-Zeile an (benannte Parameter, CLAUDE.md §6). */
export function einfuegen(tx: Tx, ein: EreignisEinfuegenEin): void {
  tx.prepare(
    `INSERT INTO ereignis (
       id, typ, ort_id, datum_kalender, datum_modifikator, datum_praezision, datum_wert1, datum_wert2,
       datum_originaltext, datum_sort_von, datum_sort_bis, datum_zweitkalender, datum_zweitwert, datum_doppeljahr,
       beschreibung, notiz, erstellt_am, geaendert_am
     )
     VALUES (
       @id, @typ, @ortId, @datumKalender, @datumModifikator, @datumPraezision, @datumWert1, @datumWert2,
       @datumOriginaltext, @datumSortVon, @datumSortBis, @datumZweitkalender, @datumZweitwert, @datumDoppeljahr,
       @beschreibung, @notiz, @erstelltAm, @geaendertAm
     )`,
  ).run({
    id: ein.id,
    typ: ein.typ,
    ortId: ein.ortId,
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
    beschreibung: ein.beschreibung,
    notiz: ein.notiz,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
}

/** Nutzlast von `beteiligungEinfuegen()`: alle Spalten von `beteiligung` (docs/schema/0002_kern.sql §2.5). */
export interface BeteiligungEinfuegenEin {
  readonly id: string
  readonly ereignisId: string
  readonly personId: string
  readonly rolle: string
  readonly reihenfolge: number | null
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Legt eine `beteiligung`-Zeile an (benannte Parameter, CLAUDE.md §6). */
export function beteiligungEinfuegen(tx: Tx, ein: BeteiligungEinfuegenEin): void {
  tx.prepare(
    `INSERT INTO beteiligung (id, ereignis_id, person_id, rolle, reihenfolge, erstellt_am, geaendert_am)
     VALUES (@id, @ereignisId, @personId, @rolle, @reihenfolge, @erstelltAm, @geaendertAm)`,
  ).run({
    id: ein.id,
    ereignisId: ein.ereignisId,
    personId: ein.personId,
    rolle: ein.rolle,
    reihenfolge: ein.reihenfolge,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
}

/** Spalten von `ereignis` (docs/schema/0002_kern.sql §2.5), für `lesen()` (AP-1.12,
 * AP-0.22-Vergleich vor `ereignis.aendern`). */
export interface EreignisZeile {
  readonly id: string
  readonly typ: string
  readonly ort_id: string | null
  readonly datum_kalender: string | null
  readonly datum_modifikator: string | null
  readonly datum_praezision: string | null
  readonly datum_wert1: string | null
  readonly datum_wert2: string | null
  readonly datum_originaltext: string | null
  readonly datum_sort_von: number | null
  readonly datum_sort_bis: number | null
  readonly datum_zweitkalender: string | null
  readonly datum_zweitwert: string | null
  readonly datum_doppeljahr: string | null
  readonly beschreibung: string | null
  readonly notiz: string | null
}

/** Liest eine `ereignis`-Zeile. `undefined`, wenn `id` nicht existiert. */
export function lesen(tx: Tx, id: string): EreignisZeile | undefined {
  return tx
    .prepare<{ readonly id: string }, EreignisZeile>(
      `SELECT id, typ, ort_id, datum_kalender, datum_modifikator, datum_praezision, datum_wert1, datum_wert2,
              datum_originaltext, datum_sort_von, datum_sort_bis, datum_zweitkalender, datum_zweitwert, datum_doppeljahr,
              beschreibung, notiz
       FROM ereignis WHERE id = @id`,
    )
    .get({ id })
}

/** Nutzlast von `aktualisieren()`: die editierbare Zeile selbst (ohne die Beteiligungen —
 * außerhalb des AP-1.12-Umfangs) + der vom Handler gesetzte `geaendert_am`-Zeitstempel (D-3). */
export interface EreignisAktualisierenEin {
  readonly id: string
  readonly typ: string
  readonly ortId: string | null
  readonly datum: DatumSpaltengruppe
  readonly beschreibung: string | null
  readonly notiz: string | null
  readonly geaendertAm: number
}

/** Aktualisiert alle editierbaren Spalten einer `ereignis`-Zeile in einem `UPDATE` (AP-1.12). */
export function aktualisieren(tx: Tx, ein: EreignisAktualisierenEin): void {
  tx.prepare(
    `UPDATE ereignis SET
       typ = @typ, ort_id = @ortId,
       datum_kalender = @datumKalender, datum_modifikator = @datumModifikator, datum_praezision = @datumPraezision,
       datum_wert1 = @datumWert1, datum_wert2 = @datumWert2, datum_originaltext = @datumOriginaltext,
       datum_sort_von = @datumSortVon, datum_sort_bis = @datumSortBis,
       datum_zweitkalender = @datumZweitkalender, datum_zweitwert = @datumZweitwert, datum_doppeljahr = @datumDoppeljahr,
       beschreibung = @beschreibung, notiz = @notiz, geaendert_am = @geaendertAm
     WHERE id = @id`,
  ).run({
    id: ein.id,
    typ: ein.typ,
    ortId: ein.ortId,
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
    beschreibung: ein.beschreibung,
    notiz: ein.notiz,
    geaendertAm: ein.geaendertAm,
  })
}

/** Löscht eine `ereignis`-Zeile (CASCADE räumt `beteiligung` ab, AP-1.12). */
export function loeschen(tx: Tx, id: string): void {
  tx.prepare('DELETE FROM ereignis WHERE id = @id').run({ id })
}

/** Spalten von `beteiligung` (docs/schema/0002_kern.sql §2.5), für `beteiligungLesen()` (AP-1.15
 * PR-A, Existenzprüfung vor `beteiligung.loeschen`). */
export interface BeteiligungZeile {
  readonly id: string
  readonly ereignis_id: string
  readonly person_id: string
  readonly rolle: string
  readonly reihenfolge: number | null
}

/** Liest eine `beteiligung`-Zeile. `undefined`, wenn `id` nicht existiert. */
export function beteiligungLesen(tx: Tx, id: string): BeteiligungZeile | undefined {
  return tx
    .prepare<{ readonly id: string }, BeteiligungZeile>(
      `SELECT id, ereignis_id, person_id, rolle, reihenfolge FROM beteiligung WHERE id = @id`,
    )
    .get({ id })
}

/** Löscht NUR eine `beteiligung`-Zeile (AP-1.15 PR-A, Variante A) — das zugehörige `ereignis`
 * bleibt bestehen, auch wenn danach keine `beteiligung`-Zeile mehr übrig ist (s. Kommentar an
 * `BeteiligungLoeschenEin`, `src/shared/schemata/befehle.ts`). */
export function beteiligungLoeschen(tx: Tx, id: string): void {
  tx.prepare('DELETE FROM beteiligung WHERE id = @id').run({ id })
}
