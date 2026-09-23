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

/** Löscht alle Bestandteile einer Form (für den vollständigen Neuaufbau der Teile bei `name.aendern`). */
export function loescheFuerForm(tx: Tx, nameFormId: string): void {
  tx.prepare('DELETE FROM name_part WHERE name_form_id = @nameFormId').run({ nameFormId })
}
