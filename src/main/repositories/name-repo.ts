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

/** Spalten von `name` (docs/schema/0002_kern.sql §2.2), für `lesen()` (AP-1.12, AP-0.22-Vergleich
 * vor `name.aendern`). */
export interface NameZeile {
  readonly id: string
  readonly person_id: string
  readonly typ: string
  readonly schrift: string | null
  readonly umschrift_von: string | null
  readonly umschrift_norm: string | null
  readonly vornamen: string | null
  readonly rufname_index: number | null
  readonly rufname_text: string | null
  readonly nachname: string | null
  readonly praefix: string | null
  readonly titel_vor: string | null
  readonly zusatz_nach: string | null
  readonly original_text: string | null
  readonly sprache: string | null
  readonly ist_bevorzugt: 0 | 1 | null
  readonly gueltig_von: number | null
  readonly gueltig_bis: number | null
}

/** Liest eine `name`-Zeile (Spalten explizit, CLAUDE.md §6). `undefined`, wenn `id` nicht existiert. */
export function lesen(tx: Tx, id: string): NameZeile | undefined {
  return tx
    .prepare<{ readonly id: string }, NameZeile>(
      `SELECT id, person_id, typ, schrift, umschrift_von, umschrift_norm, vornamen, rufname_index, rufname_text,
              nachname, praefix, titel_vor, zusatz_nach, original_text, sprache, ist_bevorzugt, gueltig_von, gueltig_bis
       FROM name WHERE id = @id`,
    )
    .get({ id })
}

/** Nutzlast von `aktualisieren()`: alle editierbaren Spalten (ohne `person_id`, AP-1.12
 * Nutzerentscheidung: ein Name wandert nicht zwischen Personen) + der vom Handler gesetzte
 * `geaendert_am`-Zeitstempel (D-3). */
export interface NameAktualisierenEin {
  readonly id: string
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
  readonly geaendertAm: number
}

/** Aktualisiert alle editierbaren Spalten einer `name`-Zeile in einem `UPDATE` (anders als
 * `person.feldSetzen`: hier EIN Handler je Entität für ALLE Felder zugleich, AP-1.12). */
export function aktualisieren(tx: Tx, ein: NameAktualisierenEin): void {
  tx.prepare(
    `UPDATE name SET
       typ = @typ, schrift = @schrift, umschrift_von = @umschriftVon, umschrift_norm = @umschriftNorm,
       vornamen = @vornamen, rufname_index = @rufnameIndex, rufname_text = @rufnameText, nachname = @nachname,
       praefix = @praefix, titel_vor = @titelVor, zusatz_nach = @zusatzNach, original_text = @originalText,
       sprache = @sprache, ist_bevorzugt = @istBevorzugt, gueltig_von = @gueltigVon, gueltig_bis = @gueltigBis,
       geaendert_am = @geaendertAm
     WHERE id = @id`,
  ).run({
    id: ein.id,
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
    geaendertAm: ein.geaendertAm,
  })
}

/** Löscht eine `name`-Zeile (AP-1.12). */
export function loeschen(tx: Tx, id: string): void {
  tx.prepare('DELETE FROM name WHERE id = @id').run({ id })
}
