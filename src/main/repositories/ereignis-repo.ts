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
