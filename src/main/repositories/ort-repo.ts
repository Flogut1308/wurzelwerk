// AP-1.3d/AP-1.16 PR-A: einziges Repository, das `ort`/`ortsname`/`ortszugehoerigkeit`/
// `ort_externe_id`-SQL schreibt (CLAUDE.md §2). Nimmt ein Handle innerhalb einer bereits offenen
// (armierten) Transaktion entgegen — kein `BEGIN`/`COMMIT` hier, kein Journalcode (die
// `jrn_ort_a{i,u,d}`/`jrn_ortsname_a{i,u,d}`/`jrn_ortszugehoerigkeit_a{i,u,d}`/
// `jrn_ort_externe_id_a{i,u,d}`-Trigger schreiben die `aenderung`-Zeilen automatisch, solange das
// Journal armiert ist, s. `person-repo.ts`-Kopf).
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

// -------------------------------------------------------------------------------------------
// AP-1.16 PR-A: volle Ortsverwaltung — `ort.aendern`, weitere `ortsname.*`, `ortszugehoerigkeit.*`
// (Zugehörigkeitsketten, politisch/kirchlich getrennt), `ort-externe-id.*`. Bewusst KEIN
// `ort.loeschen` (Kaskaden-Entscheidung offen, docs/80_Offene_Fragen.md).
// -------------------------------------------------------------------------------------------

/** Spalten von `ort` (docs/schema/0002_kern.sql §2.4), für `lesen()` (AP-0.22-Vergleich vor
 * `ort.aendern`). Ohne `nachfolger_ort_id` — wie bei `einfuegen()` oben, kein Vertragsfeld dafür. */
export interface OrtZeile {
  readonly id: string
  readonly typ: string | null
  readonly koordinaten_lat: number | null
  readonly koordinaten_lon: number | null
  readonly existiert_von: number | null
  readonly existiert_bis: number | null
  readonly notiz: string | null
}

/** Liest eine `ort`-Zeile (Spalten explizit, CLAUDE.md §6). `undefined`, wenn `id` nicht existiert. */
export function lesen(tx: Tx, id: string): OrtZeile | undefined {
  return tx
    .prepare<{ readonly id: string }, OrtZeile>(
      `SELECT id, typ, koordinaten_lat, koordinaten_lon, existiert_von, existiert_bis, notiz
       FROM ort WHERE id = @id`,
    )
    .get({ id })
}

/** Nutzlast von `aktualisieren()`: alle editierbaren Stammfelder (AP-1.16, `ort.aendern`) + der
 * vom Handler gesetzte `geaendert_am`-Zeitstempel (D-3). */
export interface OrtAktualisierenEin {
  readonly id: string
  readonly typ: string | null
  readonly koordinatenLat: number | null
  readonly koordinatenLon: number | null
  readonly existiertVon: number | null
  readonly existiertBis: number | null
  readonly notiz: string | null
  readonly geaendertAm: number
}

/** Aktualisiert alle editierbaren Stammfelder einer `ort`-Zeile in einem `UPDATE` (AP-1.16). */
export function aktualisieren(tx: Tx, ein: OrtAktualisierenEin): void {
  tx.prepare(
    `UPDATE ort SET
       typ = @typ, koordinaten_lat = @koordinatenLat, koordinaten_lon = @koordinatenLon,
       existiert_von = @existiertVon, existiert_bis = @existiertBis, notiz = @notiz,
       geaendert_am = @geaendertAm
     WHERE id = @id`,
  ).run({
    id: ein.id,
    typ: ein.typ,
    koordinatenLat: ein.koordinatenLat,
    koordinatenLon: ein.koordinatenLon,
    existiertVon: ein.existiertVon,
    existiertBis: ein.existiertBis,
    notiz: ein.notiz,
    geaendertAm: ein.geaendertAm,
  })
}

/** Spalten von `ortsname` (docs/schema/0002_kern.sql §2.4), für `ortsnameLesen()`
 * (AP-1.16, AP-0.22-Vergleich vor `ortsname.aendern`). */
export interface OrtsnameZeile {
  readonly id: string
  readonly ort_id: string
  readonly name: string | null
  readonly sprache: string | null
  readonly gueltig_von: number | null
  readonly gueltig_bis: number | null
  readonly ist_bevorzugt: 0 | 1 | null
  readonly original_text: string | null
}

/** Liest eine `ortsname`-Zeile. `undefined`, wenn `id` nicht existiert (AP-1.16). */
export function ortsnameLesen(tx: Tx, id: string): OrtsnameZeile | undefined {
  return tx
    .prepare<{ readonly id: string }, OrtsnameZeile>(
      `SELECT id, ort_id, name, sprache, gueltig_von, gueltig_bis, ist_bevorzugt, original_text
       FROM ortsname WHERE id = @id`,
    )
    .get({ id })
}

/** Nutzlast von `ortsnameAktualisieren()` — alle editierbaren Spalten ohne `ort_id` (AP-1.16
 * Nutzerentscheidung, analog `name-repo.ts::NameAktualisierenEin`: ein Ortsname wandert nicht
 * zwischen Orten) + der vom Handler gesetzte `geaendert_am`-Zeitstempel (D-3). */
export interface OrtsnameAktualisierenEin {
  readonly id: string
  readonly name: string
  readonly sprache: string | null
  readonly gueltigVon: number | null
  readonly gueltigBis: number | null
  readonly istBevorzugt: 0 | 1 | null
  readonly originalText: string | null
  readonly geaendertAm: number
}

/** Aktualisiert alle editierbaren Spalten einer `ortsname`-Zeile in einem `UPDATE` (AP-1.16). */
export function ortsnameAktualisieren(tx: Tx, ein: OrtsnameAktualisierenEin): void {
  tx.prepare(
    `UPDATE ortsname SET
       name = @name, sprache = @sprache, gueltig_von = @gueltigVon, gueltig_bis = @gueltigBis,
       ist_bevorzugt = @istBevorzugt, original_text = @originalText, geaendert_am = @geaendertAm
     WHERE id = @id`,
  ).run({
    id: ein.id,
    name: ein.name,
    sprache: ein.sprache,
    gueltigVon: ein.gueltigVon,
    gueltigBis: ein.gueltigBis,
    istBevorzugt: ein.istBevorzugt,
    originalText: ein.originalText,
    geaendertAm: ein.geaendertAm,
  })
}

/** Löscht eine `ortsname`-Zeile (AP-1.16). */
export function ortsnameLoeschen(tx: Tx, id: string): void {
  tx.prepare('DELETE FROM ortsname WHERE id = @id').run({ id })
}

/** Nutzlast von `ortszugehoerigkeitEinfuegen()`: alle Spalten von `ortszugehoerigkeit`
 * (docs/schema/0002_kern.sql §2.4). */
export interface OrtszugehoerigkeitEinfuegenEin {
  readonly id: string
  readonly ortId: string
  readonly uebergeordnetId: string
  readonly art: string
  readonly gueltigVon: number | null
  readonly gueltigBis: number | null
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Legt eine `ortszugehoerigkeit`-Zeile an (benannte Parameter, CLAUDE.md §6). */
export function ortszugehoerigkeitEinfuegen(tx: Tx, ein: OrtszugehoerigkeitEinfuegenEin): void {
  tx.prepare(
    `INSERT INTO ortszugehoerigkeit (id, ort_id, uebergeordnet_id, art, gueltig_von, gueltig_bis, erstellt_am, geaendert_am)
     VALUES (@id, @ortId, @uebergeordnetId, @art, @gueltigVon, @gueltigBis, @erstelltAm, @geaendertAm)`,
  ).run({
    id: ein.id,
    ortId: ein.ortId,
    uebergeordnetId: ein.uebergeordnetId,
    art: ein.art,
    gueltigVon: ein.gueltigVon,
    gueltigBis: ein.gueltigBis,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
}

/** Spalten von `ortszugehoerigkeit` (docs/schema/0002_kern.sql §2.4), für
 * `ortszugehoerigkeitLesen()` (AP-1.16, AP-0.22-Vergleich vor `ortszugehoerigkeit.aendern`). */
export interface OrtszugehoerigkeitZeile {
  readonly id: string
  readonly ort_id: string
  readonly uebergeordnet_id: string
  readonly art: string
  readonly gueltig_von: number | null
  readonly gueltig_bis: number | null
}

/** Liest eine `ortszugehoerigkeit`-Zeile. `undefined`, wenn `id` nicht existiert (AP-1.16). */
export function ortszugehoerigkeitLesen(tx: Tx, id: string): OrtszugehoerigkeitZeile | undefined {
  return tx
    .prepare<{ readonly id: string }, OrtszugehoerigkeitZeile>(
      `SELECT id, ort_id, uebergeordnet_id, art, gueltig_von, gueltig_bis
       FROM ortszugehoerigkeit WHERE id = @id`,
    )
    .get({ id })
}

/** Nutzlast von `ortszugehoerigkeitAktualisieren()` — NUR `gueltig_von`/`gueltig_bis` (AP-1.16
 * Nutzerentscheidung, analog `elternschaft-repo.ts`: `ort_id`/`uebergeordnet_id`/`art` ändern
 * heißt fachlich eine andere Kante, nicht dieselbe bearbeiten) + der vom Handler gesetzte
 * `geaendert_am`-Zeitstempel (D-3). */
export interface OrtszugehoerigkeitAktualisierenEin {
  readonly id: string
  readonly gueltigVon: number | null
  readonly gueltigBis: number | null
  readonly geaendertAm: number
}

/** Aktualisiert `gueltig_von`/`gueltig_bis` einer `ortszugehoerigkeit`-Zeile (AP-1.16). */
export function ortszugehoerigkeitAktualisieren(tx: Tx, ein: OrtszugehoerigkeitAktualisierenEin): void {
  tx.prepare(
    `UPDATE ortszugehoerigkeit SET gueltig_von = @gueltigVon, gueltig_bis = @gueltigBis, geaendert_am = @geaendertAm
     WHERE id = @id`,
  ).run({
    id: ein.id,
    gueltigVon: ein.gueltigVon,
    gueltigBis: ein.gueltigBis,
    geaendertAm: ein.geaendertAm,
  })
}

/** Löscht eine `ortszugehoerigkeit`-Zeile (AP-1.16). */
export function ortszugehoerigkeitLoeschen(tx: Tx, id: string): void {
  tx.prepare('DELETE FROM ortszugehoerigkeit WHERE id = @id').run({ id })
}

/** Eine bestehende Ortszugehörigkeits-Kante EINER `art` — Eingabeform für
 * `src/core/ort/zyklus.ts::wuerdeZyklusErzeugen()` (AP-1.16, `ortszugehoerigkeit.anlegen`).
 * Politisch/kirchlich werden NIE gemischt geprüft (s. `src/core/ort/zeitbezug.ts`-Kopfkommentar),
 * darum filtert diese Abfrage bereits nach `art`. */
export interface OrtszugehoerigkeitKanteZeile {
  readonly ortId: string
  readonly uebergeordnetId: string
}

/** Liest alle bestehenden Ortszugehörigkeits-Kanten EINER `art` (AP-1.16) — Grundlage für den
 * Zyklusschutz vor jedem `ortszugehoerigkeit.anlegen`. Für die zu erwartende Ortsanzahl
 * (Ahnenforschung, kein Massendatensatz) ist ein vollständiges Auslesen unkritisch, analog
 * `beziehung-repo.ts::alleKanten()`. */
export function zugehoerigkeitenLesen(tx: Tx, art: string): readonly OrtszugehoerigkeitKanteZeile[] {
  return tx
    .prepare<{ readonly art: string }, OrtszugehoerigkeitKanteZeile>(
      'SELECT ort_id AS ortId, uebergeordnet_id AS uebergeordnetId FROM ortszugehoerigkeit WHERE art = @art',
    )
    .all({ art })
}

/** Nutzlast von `ortExterneIdEinfuegen()`: alle Spalten von `ort_externe_id`
 * (docs/schema/0002_kern.sql §2.4, Verknüpfungstabelle ohne eigenes `id`). */
export interface OrtExterneIdEinfuegenEin {
  readonly ortId: string
  readonly system: string
  readonly wert: string
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Legt eine `ort_externe_id`-Zeile an (benannte Parameter, CLAUDE.md §6). */
export function ortExterneIdEinfuegen(tx: Tx, ein: OrtExterneIdEinfuegenEin): void {
  tx.prepare(
    `INSERT INTO ort_externe_id (ort_id, system, wert, erstellt_am, geaendert_am)
     VALUES (@ortId, @system, @wert, @erstelltAm, @geaendertAm)`,
  ).run({
    ortId: ein.ortId,
    system: ein.system,
    wert: ein.wert,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
}

/** Spalten von `ort_externe_id` (docs/schema/0002_kern.sql §2.4), für `ortExterneIdLesen()`
 * (AP-1.16: Existenz-/Duplikatprüfung vor `ort-externe-id.anlegen`/`ort-externe-id.loeschen`). */
export interface OrtExterneIdZeile {
  readonly ort_id: string
  readonly system: string
  readonly wert: string
}

/** Liest eine `ort_externe_id`-Zeile über ihren zusammengesetzten Primärschlüssel
 * (`ort_id`, `system`) — die Tabelle hat kein eigenes `id` (s. Schema-Kommentar), darum kein
 * `datensatzExistiert()` (das nimmt einen skalaren `id`-Primärschlüssel an). `undefined`, wenn
 * die Kombination nicht existiert (AP-1.16). */
export function ortExterneIdLesen(tx: Tx, ortId: string, system: string): OrtExterneIdZeile | undefined {
  return tx
    .prepare<{ readonly ortId: string; readonly system: string }, OrtExterneIdZeile>(
      'SELECT ort_id, system, wert FROM ort_externe_id WHERE ort_id = @ortId AND system = @system',
    )
    .get({ ortId, system })
}

/** Löscht eine `ort_externe_id`-Zeile über ihren zusammengesetzten Primärschlüssel (AP-1.16). */
export function ortExterneIdLoeschen(tx: Tx, ortId: string, system: string): void {
  tx.prepare('DELETE FROM ort_externe_id WHERE ort_id = @ortId AND system = @system').run({ ortId, system })
}
