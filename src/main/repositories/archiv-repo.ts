// AP-1.17 PR-A1 (B-07, docs/schema/0002_kern.sql §2.7): einziges Repository, das `archiv`-SQL
// schreibt (CLAUDE.md §2). Nimmt ein Handle innerhalb einer bereits offenen (armierten)
// Transaktion entgegen — kein `BEGIN`/`COMMIT` hier, kein Journalcode (die
// `jrn_archiv_a{i,u,d}`-Trigger schreiben die `aenderung`-Zeilen automatisch, solange das Journal
// armiert ist, s. `person-repo.ts`-Kopf). `archiv` ist migrationsfrei seit Schema v1 vorhanden.
//
// SCOPE (CLAUDE.md §10, nicht vorgreifen): minimale Archivverwaltung von Hand (B-07 als [Lücke]
// markiert, docs/anforderungen.md) — genau die Spalten aus §2.7 (`name`/`ort_id`/`kontakt`/`url`/
// `notiz`). Bewusst KEIN `archiv.loeschen` in diesem PR (Kaskaden-Entscheidung offen, analog
// `ort-repo.ts`-Kopfkommentar: `quelle.archiv_id` referenziert `archiv` mit `ON DELETE SET NULL`,
// die Nutzerentscheidung dazu bleibt einem späteren PR vorbehalten).
import type { Tx } from './basis'

/** Nutzlast von `einfuegen()`: alle Spalten von `archiv` (docs/schema/0002_kern.sql §2.7) außer
 * `erstellt_am`/`geaendert_am`, die der Handler selbst als Parameter mitgibt (D-3). */
export interface ArchivEinfuegenEin {
  readonly id: string
  readonly name: string
  readonly ortId: string | null
  readonly kontakt: string | null
  readonly url: string | null
  readonly notiz: string | null
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Legt eine `archiv`-Zeile an (benannte Parameter, CLAUDE.md §6). */
export function archivEinfuegen(tx: Tx, ein: ArchivEinfuegenEin): void {
  tx.prepare(
    `INSERT INTO archiv (id, name, ort_id, kontakt, url, notiz, erstellt_am, geaendert_am)
     VALUES (@id, @name, @ortId, @kontakt, @url, @notiz, @erstelltAm, @geaendertAm)`,
  ).run({
    id: ein.id,
    name: ein.name,
    ortId: ein.ortId,
    kontakt: ein.kontakt,
    url: ein.url,
    notiz: ein.notiz,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
}

/** Spalten von `archiv` (docs/schema/0002_kern.sql §2.7), für `lesen()` (AP-0.22-Vergleich vor
 * `archiv.aendern`) UND für `abfrage:archiv.suche`. */
export interface ArchivZeile {
  readonly id: string
  readonly name: string | null
  readonly ort_id: string | null
  readonly kontakt: string | null
  readonly url: string | null
  readonly notiz: string | null
}

/** Liest eine `archiv`-Zeile (Spalten explizit, CLAUDE.md §6). `undefined`, wenn `id` nicht existiert. */
export function archivLesen(tx: Tx, id: string): ArchivZeile | undefined {
  return tx
    .prepare<{ readonly id: string }, ArchivZeile>(
      `SELECT id, name, ort_id, kontakt, url, notiz
       FROM archiv WHERE id = @id`,
    )
    .get({ id })
}

/** Nutzlast von `archivAktualisieren()`: alle editierbaren Spalten (`name`/`ort_id`/`kontakt`/
 * `url`/`notiz`) + der vom Handler gesetzte `geaendert_am`-Zeitstempel (D-3). */
export interface ArchivAktualisierenEin {
  readonly id: string
  readonly name: string
  readonly ortId: string | null
  readonly kontakt: string | null
  readonly url: string | null
  readonly notiz: string | null
  readonly geaendertAm: number
}

/** Aktualisiert alle editierbaren Spalten einer `archiv`-Zeile in einem `UPDATE`. */
export function archivAktualisieren(tx: Tx, ein: ArchivAktualisierenEin): void {
  tx.prepare(
    `UPDATE archiv SET
       name = @name, ort_id = @ortId, kontakt = @kontakt, url = @url, notiz = @notiz,
       geaendert_am = @geaendertAm
     WHERE id = @id`,
  ).run({
    id: ein.id,
    name: ein.name,
    ortId: ein.ortId,
    kontakt: ein.kontakt,
    url: ein.url,
    notiz: ein.notiz,
    geaendertAm: ein.geaendertAm,
  })
}

/** Ein Treffer aus `suchen()` — nur die Spalten, die `src/main/abfragen/archiv-suche.ts` zur
 * Trefferbildung braucht. Read-only, keine Transaktionsgrenze hier (CLAUDE.md §2). */
export interface ArchivSucheZeile {
  readonly id: string
  readonly name: string | null
  readonly ort_id: string | null
}

/** Findet `archiv`-Zeilen, deren `name` `text` als Teilstring hat (groß-/kleinschreibungs-
 * unabhängig, `INSTR(LOWER(...))` statt `LIKE` — dieselbe Begründung wie `ort-repo.ts::suchen`:
 * `%`/`_` in einem Archivnamen sollen keine Wildcard-Bedeutung bekommen). */
export function suchen(tx: Tx, ein: { readonly text: string; readonly grenze: number }): readonly ArchivSucheZeile[] {
  return tx
    .prepare<
      { readonly text: string; readonly grenze: number },
      ArchivSucheZeile
    >(`SELECT id, name, ort_id
       FROM archiv
       WHERE INSTR(LOWER(COALESCE(name, '')), LOWER(@text)) > 0
       ORDER BY id
       LIMIT @grenze`,
    )
    .all(ein)
}
