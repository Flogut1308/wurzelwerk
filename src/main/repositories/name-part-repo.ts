// AP-1.33: Repository für `name_part` (docs/schema/0006_namensformen.sql). SQL nur hier + in
// `name-form-repo.ts` (CLAUDE.md §2). Kein `BEGIN`/`COMMIT` (läuft in der bereits offenen,
// armierten Bus-Transaktion).
import type { Tx } from './basis'

export interface NamePartEinfuegenEin {
  readonly id: string
  readonly nameFormId: string
  readonly art: string
  readonly wert: string
  readonly istRufname: 0 | 1
  readonly sortierIndex: number
  readonly feminineVariante: string | null
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Legt eine `name_part`-Zeile an (benannte Parameter, CLAUDE.md §6). */
export function einfuegen(tx: Tx, ein: NamePartEinfuegenEin): void {
  tx.prepare(
    `INSERT INTO name_part (id, name_form_id, art, wert, ist_rufname, sortier_index, feminine_variante, erstellt_am, geaendert_am)
     VALUES (@id, @nameFormId, @art, @wert, @istRufname, @sortierIndex, @feminineVariante, @erstelltAm, @geaendertAm)`,
  ).run(ein)
}

export interface NamePartZeile {
  readonly id: string
  readonly name_form_id: string
  readonly art: string
  readonly wert: string
  readonly ist_rufname: number
  readonly sortier_index: number
  readonly feminine_variante: string | null
}

/** Liest eine `name_part`-Zeile. `undefined`, wenn `id` nicht existiert. */
export function lesen(tx: Tx, id: string): NamePartZeile | undefined {
  return tx
    .prepare<{ readonly id: string }, NamePartZeile>(
      `SELECT id, name_form_id, art, wert, ist_rufname, sortier_index, feminine_variante
       FROM name_part WHERE id = @id`,
    )
    .get({ id })
}

/** Alle Bestandteile einer Form, aufsteigend nach `art`, `sortier_index`. */
export function teileFuerForm(tx: Tx, nameFormId: string): readonly NamePartZeile[] {
  return tx
    .prepare<{ readonly nameFormId: string }, NamePartZeile>(
      `SELECT id, name_form_id, art, wert, ist_rufname, sortier_index, feminine_variante
       FROM name_part WHERE name_form_id = @nameFormId ORDER BY art, sortier_index`,
    )
    .all({ nameFormId })
}

/** AP-1.30 PR 10-2: die Bestandteile EINER Art einer Form, aufsteigend nach `sortier_index` (bei einem
 * Doppel aus Altbestand stabil nach `id`). Grundlage des Anhängens (MAX + 1) und des Umnummerierens. */
export function teileDerArt(tx: Tx, nameFormId: string, art: string): readonly NamePartZeile[] {
  return tx
    .prepare<{ readonly nameFormId: string; readonly art: string }, NamePartZeile>(
      `SELECT id, name_form_id, art, wert, ist_rufname, sortier_index, feminine_variante
       FROM name_part WHERE name_form_id = @nameFormId AND art = @art ORDER BY sortier_index, id`,
    )
    .all({ nameFormId, art })
}

export interface SortierIndexSetzenEin {
  readonly id: string
  readonly sortierIndex: number
  readonly geaendertAm: number
}

/** AP-1.30 PR 10-2: verschiebt EINEN Teil auf eine andere Stelle (nur `sortier_index`/`geaendert_am`).
 * Der Aufrufer ist dafür verantwortlich, dass die Zielstelle frei ist (E1: kein Zwischenzustand mit
 * doppeltem `sortier_index` je Form und Art — die FTS-Trigger `abl_name_part_*` setzen das voraus). */
export function sortierIndexSetzen(tx: Tx, ein: SortierIndexSetzenEin): void {
  tx.prepare('UPDATE name_part SET sortier_index = @sortierIndex, geaendert_am = @geaendertAm WHERE id = @id').run(ein)
}

export interface NamePartAktualisierenEin {
  readonly id: string
  readonly art: string
  readonly wert: string
  readonly istRufname: 0 | 1
  readonly sortierIndex: number
  readonly feminineVariante: string | null
  readonly geaendertAm: number
}

export function aktualisieren(tx: Tx, ein: NamePartAktualisierenEin): void {
  tx.prepare(
    `UPDATE name_part SET art = @art, wert = @wert, ist_rufname = @istRufname,
       sortier_index = @sortierIndex, feminine_variante = @feminineVariante, geaendert_am = @geaendertAm
     WHERE id = @id`,
  ).run(ein)
}

export function loeschen(tx: Tx, id: string): void {
  tx.prepare('DELETE FROM name_part WHERE id = @id').run({ id })
}
