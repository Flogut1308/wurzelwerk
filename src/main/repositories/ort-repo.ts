// AP-1.3d: einziges Repository, das `ort`/`ortsname`-SQL schreibt (CLAUDE.md §2). Nimmt ein
// Handle innerhalb einer bereits offenen (armierten) Transaktion entgegen — kein `BEGIN`/`COMMIT`
// hier, kein Journalcode (die `jrn_ort_a{i,u,d}`/`jrn_ortsname_a{i,u,d}`-Trigger schreiben die
// `aenderung`-Zeilen automatisch, solange das Journal armiert ist, s. `person-repo.ts`-Kopf).
import type { Tx } from './basis'

/** Nutzlast von `einfuegen()`: alle Spalten von `ort` (docs/schema/0002_kern.sql §2.4) außer
 * `nachfolger_ort_id` (Selbstverweis, in AP-1.3d nicht befüllt — kein Vertragsfeld dafür). `typ`
 * ist `string | null` (AP-1.13 PR-C erweitert): die Spalte selbst ist nullbar (`ort.typ`,
 * 0002_kern.sql) — der Import-Vertrag verlangt `typ` zwar verpflichtend (`ortSchema` in
 * `src/shared/schemata/import-v1.ts`), aber `befehl:ort.anlegen` (minimale Ortsverwaltung fürs
 * `Ortsfeld`, AP-1.16 hat die volle Fassung) lässt `typ` bewusst offen. */
export interface OrtEinfuegenEin {
  readonly id: string
  readonly typ: string | null
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

/** Ein Treffer aus `suchen()` — nur die Spalten, die `src/main/abfragen/ort-suche.ts` zur
 * Trefferbildung braucht (AP-1.13 PR-C). Read-only, keine Transaktionsgrenze hier (CLAUDE.md §2). */
export interface OrtSucheZeile {
  readonly id: string
  readonly typ: string | null
}

/** Findet `ort`-Zeilen, deren Bestand mindestens EINEN `ortsname.name` mit `text` als
 * Teilstring hat (groß-/kleinschreibungsunabhängig, `INSTR(LOWER(...))` statt `LIKE` — dieselbe
 * Begründung wie `filterBedingungen()` in `src/main/abfragen/person-liste.ts`: `%`/`_` in einem
 * Ortsnamen sollen keine Wildcard-Bedeutung bekommen). Sucht bewusst über ALLE Namenszeilen eines
 * Orts, nicht nur den bevorzugten — ein historischer Name (z. B. "Marienwerder" für den heute
 * "Kwidzyn" genannten Ort) muss ebenfalls treffen. */
export function suchen(tx: Tx, ein: { readonly text: string; readonly grenze: number }): readonly OrtSucheZeile[] {
  return tx
    .prepare<
      { readonly text: string; readonly grenze: number },
      OrtSucheZeile
    >(`SELECT DISTINCT o.id AS id, o.typ AS typ
       FROM ort o
       JOIN ortsname n ON n.ort_id = o.id
       WHERE INSTR(LOWER(COALESCE(n.name, '')), LOWER(@text)) > 0
       ORDER BY o.id
       LIMIT @grenze`,
    )
    .all(ein)
}

/** Eine `ortsname`-Zeile, wie `namenLesen()` sie liefert — genau die Felder, die
 * `src/core/ort/zeitbezug.ts::gueltigerOrtsname` braucht (plus `ort_id` zum Gruppieren). */
export interface OrtsnameLeseZeile {
  readonly id: string
  readonly ort_id: string
  readonly name: string | null
  readonly gueltig_von: number | null
  readonly gueltig_bis: number | null
  readonly ist_bevorzugt: 0 | 1 | null
}

/** Lädt ALLE `ortsname`-Zeilen der übergebenen `ortIds` — für die datumsgültige Namensauswahl
 * (`gueltigerOrtsname`) braucht die Abfrage die vollständige Namensgeschichte je Ort, nicht nur
 * den bevorzugten Namen. `ortIds` kommt aus `suchen()` (begrenzt über `grenze`), nie aus einer
 * Nutzereingabe direkt — die dynamische `IN (...)`-Platzhalterliste bindet trotzdem jeden Wert
 * benannt (CLAUDE.md §6), analog `idsBedingung()` in `src/main/abfragen/suche.ts`. */
export function namenLesen(tx: Tx, ortIds: readonly string[]): readonly OrtsnameLeseZeile[] {
  if (ortIds.length === 0) return []
  const platzhalter = ortIds.map((_, index) => `@id${index}`).join(', ')
  const parameter: Record<string, string> = {}
  ortIds.forEach((id, index) => {
    parameter[`id${index}`] = id
  })
  return tx
    .prepare<
      Record<string, string>,
      OrtsnameLeseZeile
    >(`SELECT id, ort_id, name, gueltig_von, gueltig_bis, ist_bevorzugt
       FROM ortsname
       WHERE ort_id IN (${platzhalter})`,
    )
    .all(parameter)
}
