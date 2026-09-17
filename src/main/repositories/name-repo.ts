// AP-1.3d: einziges Repository, das `name`-SQL schreibt (CLAUDE.md §2). Kein `BEGIN`/`COMMIT`
// hier (läuft in einer bereits offenen, armierten Transaktion, s. `person-repo.ts`-Kopf).
import type { Tx } from './basis'

/** Nutzlast von `einfuegen()`: alle Spalten von `name` (docs/schema/0002_kern.sql §2.2). Der
 * Vertrag kennt zusätzlich `nachname_unbekannt` (§3.3) — das Schema hat dafür KEINE Spalte
 * (`NULL` in `nachname` trägt dieselbe Information); der Orchestrator (`src/main/import/
 * schreiben.ts`) lässt das Feld darum bewusst weg, statt es hier zu verwerfen. */
export interface NameEinfuegenEin {
  readonly id: string
  readonly personId: string
  readonly typ: string
  readonly schrift: string | null
  readonly umschriftVon: string | null
  readonly umschriftNorm: string | null
  readonly vornamen: string | null
  readonly rufnameIndex: number | null
  readonly rufnameText: string | null
  readonly nachname: string | null
  readonly praefix: string | null
  readonly titelVor: string | null
  readonly zusatzNach: string | null
  readonly originalText: string | null
  readonly sprache: string | null
  readonly istBevorzugt: 0 | 1 | null
  readonly gueltigVon: number | null
  readonly gueltigBis: number | null
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Legt eine `name`-Zeile an (benannte Parameter, CLAUDE.md §6). */
export function einfuegen(tx: Tx, ein: NameEinfuegenEin): void {
  tx.prepare(
    `INSERT INTO name (
       id, person_id, typ, schrift, umschrift_von, umschrift_norm, vornamen, rufname_index, rufname_text,
       nachname, praefix, titel_vor, zusatz_nach, original_text, sprache, ist_bevorzugt, gueltig_von, gueltig_bis,
       erstellt_am, geaendert_am
     )
     VALUES (
       @id, @personId, @typ, @schrift, @umschriftVon, @umschriftNorm, @vornamen, @rufnameIndex, @rufnameText,
       @nachname, @praefix, @titelVor, @zusatzNach, @originalText, @sprache, @istBevorzugt, @gueltigVon, @gueltigBis,
       @erstelltAm, @geaendertAm
     )`,
  ).run({
    id: ein.id,
    personId: ein.personId,
    typ: ein.typ,
    schrift: ein.schrift,
    umschriftVon: ein.umschriftVon,
    umschriftNorm: ein.umschriftNorm,
    vornamen: ein.vornamen,
    rufnameIndex: ein.rufnameIndex,
    rufnameText: ein.rufnameText,
    nachname: ein.nachname,
    praefix: ein.praefix,
    titelVor: ein.titelVor,
    zusatzNach: ein.zusatzNach,
    originalText: ein.originalText,
    sprache: ein.sprache,
    istBevorzugt: ein.istBevorzugt,
    gueltigVon: ein.gueltigVon,
    gueltigBis: ein.gueltigBis,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
}
