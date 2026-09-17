// AP-1.3d: einziges Repository, das `ort`/`ortsname`-SQL schreibt (CLAUDE.md §2). Nimmt ein
// Handle innerhalb einer bereits offenen (armierten) Transaktion entgegen — kein `BEGIN`/`COMMIT`
// hier, kein Journalcode (die `jrn_ort_a{i,u,d}`/`jrn_ortsname_a{i,u,d}`-Trigger schreiben die
// `aenderung`-Zeilen automatisch, solange das Journal armiert ist, s. `person-repo.ts`-Kopf).
import type { Tx } from './basis'

/** Nutzlast von `einfuegen()`: alle Spalten von `ort` (docs/schema/0002_kern.sql §2.4) außer
 * `nachfolger_ort_id` (Selbstverweis, in AP-1.3d nicht befüllt — kein Vertragsfeld dafür). */
export interface OrtEinfuegenEin {
  readonly id: string
  readonly typ: string
  readonly koordinatenLat: number | null
  readonly koordinatenLon: number | null
  readonly existiertVon: number | null
  readonly existiertBis: number | null
  readonly notiz: string | null
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Legt eine `ort`-Zeile an (benannte Parameter, CLAUDE.md §6). */
export function einfuegen(tx: Tx, ein: OrtEinfuegenEin): void {
  tx.prepare(
    `INSERT INTO ort (id, typ, koordinaten_lat, koordinaten_lon, existiert_von, existiert_bis, notiz, erstellt_am, geaendert_am)
     VALUES (@id, @typ, @koordinatenLat, @koordinatenLon, @existiertVon, @existiertBis, @notiz, @erstelltAm, @geaendertAm)`,
  ).run({
    id: ein.id,
    typ: ein.typ,
    koordinatenLat: ein.koordinatenLat,
    koordinatenLon: ein.koordinatenLon,
    existiertVon: ein.existiertVon,
    existiertBis: ein.existiertBis,
    notiz: ein.notiz,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
}

/** Nutzlast von `ortsnameEinfuegen()`: alle Spalten von `ortsname` (docs/schema/0002_kern.sql §2.4). */
export interface OrtsnameEinfuegenEin {
  readonly id: string
  readonly ortId: string
  readonly name: string
  readonly sprache: string | null
  readonly gueltigVon: number | null
  readonly gueltigBis: number | null
  readonly istBevorzugt: 0 | 1 | null
  readonly originalText: string | null
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Legt eine `ortsname`-Zeile an (benannte Parameter, CLAUDE.md §6). */
export function ortsnameEinfuegen(tx: Tx, ein: OrtsnameEinfuegenEin): void {
  tx.prepare(
    `INSERT INTO ortsname (id, ort_id, name, sprache, gueltig_von, gueltig_bis, ist_bevorzugt, original_text, erstellt_am, geaendert_am)
     VALUES (@id, @ortId, @name, @sprache, @gueltigVon, @gueltigBis, @istBevorzugt, @originalText, @erstelltAm, @geaendertAm)`,
  ).run({
    id: ein.id,
    ortId: ein.ortId,
    name: ein.name,
    sprache: ein.sprache,
    gueltigVon: ein.gueltigVon,
    gueltigBis: ein.gueltigBis,
    istBevorzugt: ein.istBevorzugt,
    originalText: ein.originalText,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
}
