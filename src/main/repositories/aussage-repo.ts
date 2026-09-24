// AP-1.3d: einziges Repository, das `aussage`/`aussage_zitat`-SQL schreibt (CLAUDE.md §2). Kein
// `BEGIN`/`COMMIT` hier (läuft in einer bereits offenen, armierten Transaktion, s.
// `person-repo.ts`-Kopf). Trägt sowohl die Vertrags-`aussagen[]` als auch die importinternen
// Existenz-/abgeleiteten Aussagen (ADR-026, 50_Datenmodell.md §2.7) — beide landen in derselben
// Tabelle, es gibt keinen zweiten `aussage`-Schreibpfad.
import { z } from 'zod'
import type { Tx } from './basis'
import type { DatumSpaltengruppe } from '../import/datum-spalten'

/** Nutzlast von `einfuegen()`: alle Spalten von `aussage` (docs/schema/0002_kern.sql §2.7 +
 * docs/schema/0005_import_luecken.sql: `unsicherheit`, `gueltig_von`, `gueltig_bis`). */
export interface AussageEinfuegenEin {
  readonly id: string
  readonly subjektTyp: string
  readonly subjektId: string
  readonly praedikat: string
  readonly wertText: string | null
  readonly wertZahl: number | null
  readonly wertRefId: string | null
  readonly datum: DatumSpaltengruppe
  readonly konfidenz: number
  readonly istBevorzugt: 0 | 1 | null
  readonly begruendung: string | null
  readonly unsicherheit: string | null
  readonly gueltigVon: number | null
  readonly gueltigBis: number | null
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Legt eine `aussage`-Zeile an (benannte Parameter, CLAUDE.md §6). */
export function einfuegen(tx: Tx, ein: AussageEinfuegenEin): void {
  tx.prepare(
    `INSERT INTO aussage (
       id, subjekt_typ, subjekt_id, praedikat, wert_text, wert_zahl, wert_ref_id,
       datum_kalender, datum_modifikator, datum_praezision, datum_wert1, datum_wert2, datum_originaltext,
       datum_sort_von, datum_sort_bis, datum_zweitkalender, datum_zweitwert, datum_doppeljahr,
       konfidenz, ist_bevorzugt, begruendung, unsicherheit, gueltig_von, gueltig_bis, erstellt_am, geaendert_am
     )
     VALUES (
       @id, @subjektTyp, @subjektId, @praedikat, @wertText, @wertZahl, @wertRefId,
       @datumKalender, @datumModifikator, @datumPraezision, @datumWert1, @datumWert2, @datumOriginaltext,
       @datumSortVon, @datumSortBis, @datumZweitkalender, @datumZweitwert, @datumDoppeljahr,
       @konfidenz, @istBevorzugt, @begruendung, @unsicherheit, @gueltigVon, @gueltigBis, @erstelltAm, @geaendertAm
     )`,
  ).run({
    id: ein.id,
    subjektTyp: ein.subjektTyp,
    subjektId: ein.subjektId,
    praedikat: ein.praedikat,
    wertText: ein.wertText,
    wertZahl: ein.wertZahl,
    wertRefId: ein.wertRefId,
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
    konfidenz: ein.konfidenz,
    istBevorzugt: ein.istBevorzugt,
    begruendung: ein.begruendung,
    unsicherheit: ein.unsicherheit,
    gueltigVon: ein.gueltigVon,
    gueltigBis: ein.gueltigBis,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
}

/**
 * Demotet eine bestehende bevorzugte Aussage (`ist_bevorzugt = 0`, AP-1.5, §2.1 Schutzregel/
 * ADR-026): einziger Schreibpfad für die `ueberschreiben: true`-Ersetzung aus
 * `src/main/import/schreiben.ts`. Läuft in einer bereits offenen, armierten Transaktion — die
 * `jrn_*`-Trigger schreiben das UPDATE dadurch wie jeden anderen Schreibvorgang ins Journal.
 */
export function bevorzugungAberkennen(tx: Tx, aussageId: string): void {
  tx.prepare('UPDATE aussage SET ist_bevorzugt = 0 WHERE id = @id').run({ id: aussageId })
}

/** Alle Spalten von `aussage` (docs/schema/0002_kern.sql §2.7 + docs/schema/0005_import_luecken.sql),
 * für `lesen()` (AP-0.22-Vergleich vor `aussage.aendern`, AP-1.29 PR-A). */
export interface AussageZeile {
  readonly id: string
  readonly subjekt_typ: string
  readonly subjekt_id: string
  readonly praedikat: string
  readonly wert_text: string | null
  readonly wert_zahl: number | null
  readonly wert_ref_id: string | null
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
  readonly konfidenz: number | null
  readonly ist_bevorzugt: 0 | 1 | null
  readonly begruendung: string | null
  readonly unsicherheit: string | null
  readonly gueltig_von: number | null
  readonly gueltig_bis: number | null
}

/** Liest eine `aussage`-Zeile (Spalten explizit, CLAUDE.md §6). `undefined`, wenn `id` nicht existiert. */
export function lesen(tx: Tx, id: string): AussageZeile | undefined {
  return tx
    .prepare<{ readonly id: string }, AussageZeile>(
      `SELECT id, subjekt_typ, subjekt_id, praedikat, wert_text, wert_zahl, wert_ref_id,
              datum_kalender, datum_modifikator, datum_praezision, datum_wert1, datum_wert2, datum_originaltext,
              datum_sort_von, datum_sort_bis, datum_zweitkalender, datum_zweitwert, datum_doppeljahr,
              konfidenz, ist_bevorzugt, begruendung, unsicherheit, gueltig_von, gueltig_bis
       FROM aussage WHERE id = @id`,
    )
    .get({ id })
}

/** Nutzlast von `aktualisieren()`: NUR die per `aussage.aendern` editierbaren Spalten (AP-1.29
 * PR-A) — `subjekt_typ`/`subjekt_id`/`praedikat`/`ist_bevorzugt` fehlen bewusst (s.
 * Abschnittskommentar `src/shared/schemata/befehle.ts`: Identität bzw. dem Anlegen-Pfad
 * vorbehalten). */
export interface AussageAktualisierenEin {
  readonly id: string
  readonly wertText: string | null
  readonly wertZahl: number | null
  readonly wertRefId: string | null
  readonly datum: DatumSpaltengruppe
  readonly konfidenz: number
  readonly begruendung: string | null
  readonly unsicherheit: string | null
  readonly gueltigVon: number | null
  readonly gueltigBis: number | null
  readonly geaendertAm: number
}

/** Aktualisiert die editierbaren Spalten einer `aussage`-Zeile in einem `UPDATE` (AP-1.29 PR-A). */
export function aktualisieren(tx: Tx, ein: AussageAktualisierenEin): void {
  tx.prepare(
    `UPDATE aussage SET
       wert_text = @wertText, wert_zahl = @wertZahl, wert_ref_id = @wertRefId,
       datum_kalender = @datumKalender, datum_modifikator = @datumModifikator, datum_praezision = @datumPraezision,
       datum_wert1 = @datumWert1, datum_wert2 = @datumWert2, datum_originaltext = @datumOriginaltext,
       datum_sort_von = @datumSortVon, datum_sort_bis = @datumSortBis,
       datum_zweitkalender = @datumZweitkalender, datum_zweitwert = @datumZweitwert, datum_doppeljahr = @datumDoppeljahr,
       konfidenz = @konfidenz, begruendung = @begruendung, unsicherheit = @unsicherheit,
       gueltig_von = @gueltigVon, gueltig_bis = @gueltigBis, geaendert_am = @geaendertAm
     WHERE id = @id`,
  ).run({
    id: ein.id,
    wertText: ein.wertText,
    wertZahl: ein.wertZahl,
    wertRefId: ein.wertRefId,
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
    konfidenz: ein.konfidenz,
    begruendung: ein.begruendung,
    unsicherheit: ein.unsicherheit,
    gueltigVon: ein.gueltigVon,
    gueltigBis: ein.gueltigBis,
    geaendertAm: ein.geaendertAm,
  })
}

/** Nutzlast von `zitatVerknuepfen()`: Spalten von `aussage_zitat` (docs/schema/0002_kern.sql §2.7,
 * Verknüpfungstabelle ohne eigenes `id`). `textankerVon`/`textankerBis` (0007, AP-1.34 PR-C1a)
 * sind optional, Standard NULL — nur `aussage_zitat.anlegen` setzt sie, nach der Prüfung gegen das
 * Transkript. `feld` (0007) schreibt dieser Weg noch nicht (PR-C1b), es bleibt NULL. */
export interface AussageZitatVerknuepfenEin {
  readonly aussageId: string
  readonly zitatId: string
  readonly textankerVon?: number | undefined
  readonly textankerBis?: number | undefined
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Verknüpft eine `aussage`-Zeile mit einem `zitat` (benannte Parameter, CLAUDE.md §6). */
export function zitatVerknuepfen(tx: Tx, ein: AussageZitatVerknuepfenEin): void {
  tx.prepare(
    `INSERT INTO aussage_zitat (aussage_id, zitat_id, textanker_von, textanker_bis, erstellt_am, geaendert_am)
     VALUES (@aussageId, @zitatId, @textankerVon, @textankerBis, @erstelltAm, @geaendertAm)`,
  ).run({
    aussageId: ein.aussageId,
    zitatId: ein.zitatId,
    textankerVon: ein.textankerVon ?? null,
    textankerBis: ein.textankerBis ?? null,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
}

/** Prüft, ob eine `aussage_zitat`-Verknüpfung existiert (zusammengesetzter Primärschlüssel
 * `(aussage_id, zitat_id)`, kein eigenes `id` — darum kein `datensatzExistiert()`, das nimmt einen
 * skalaren `id`-Primärschlüssel an, analog `ort-repo.ts::ortExterneIdLesen`). Für die Duplikat-
 * prüfung vor `aussage_zitat.anlegen` und die Existenzprüfung vor `aussage_zitat.loeschen`
 * (AP-1.29 PR-A). */
export function verknuepfungExistiert(tx: Tx, aussageId: string, zitatId: string): boolean {
  const zeile = tx
    .prepare<{ readonly aussageId: string; readonly zitatId: string }, { readonly vorhanden: number }>(
      'SELECT 1 AS vorhanden FROM aussage_zitat WHERE aussage_id = @aussageId AND zitat_id = @zitatId LIMIT 1',
    )
    .get({ aussageId, zitatId })
  return zeile !== undefined
}

/** Ein gesetzter Textanker eines Zitats (AP-1.34 PR-C1a): die Aussage und ihr Intervall [von, bis). */
export interface AnkerZeile {
  readonly aussage_id: string
  readonly textanker_von: number
  readonly textanker_bis: number
}

const ankerZeileSchema: z.ZodType<AnkerZeile> = z.object({
  aussage_id: z.string(),
  textanker_von: z.number().int().min(0),
  textanker_bis: z.number().int(),
})

/** Alle gesetzten Textanker an einem `zitat` (Spalten explizit, CLAUDE.md §6), sortiert nach
 * `aussage_id`. Verknüpfungen ohne Anker fehlen. Für `zitat.aendern` (E4). */
export function ankerJeZitatLesen(tx: Tx, zitatId: string): readonly AnkerZeile[] {
  return tx
    .prepare<{ readonly zitatId: string }, unknown>(
      `SELECT aussage_id, textanker_von, textanker_bis
       FROM aussage_zitat
       WHERE zitat_id = @zitatId AND textanker_von IS NOT NULL
       ORDER BY aussage_id`,
    )
    .all({ zitatId })
    .map((roh) => ankerZeileSchema.parse(roh))
}

/** Entwertet den Textanker einer Verknüpfung (`textanker_von = textanker_bis = NULL`, E4) — `feld`
 * bleibt. Einziger UPDATE-Weg auf `aussage_zitat`; die `jrn_aussage_zitat_au`-Trigger journalisieren
 * ihn wie jeden Schreibvorgang. */
export function ankerAufheben(tx: Tx, aussageId: string, zitatId: string, geaendertAm: number): void {
  tx.prepare(
    `UPDATE aussage_zitat SET textanker_von = NULL, textanker_bis = NULL, geaendert_am = @geaendertAm
     WHERE aussage_id = @aussageId AND zitat_id = @zitatId`,
  ).run({ aussageId, zitatId, geaendertAm })
}

/** Löst eine `aussage_zitat`-Verknüpfung wieder — anders als `loeschen()`/`loeschenNachSubjekt()`
 * bleiben die `aussage`- UND die `zitat`-Zeile dabei unberührt (`aussage_zitat.loeschen`,
 * AP-1.29 PR-A). */
export function zitatLoesen(tx: Tx, aussageId: string, zitatId: string): void {
  tx.prepare('DELETE FROM aussage_zitat WHERE aussage_id = @aussageId AND zitat_id = @zitatId').run({ aussageId, zitatId })
}

/** Löscht eine `aussage`-Zeile (`aussage.loeschen`, AP-1.12) — CASCADE räumt `aussage_zitat` ab. */
export function loeschen(tx: Tx, id: string): void {
  tx.prepare('DELETE FROM aussage WHERE id = @id').run({ id })
}

/**
 * Löscht ALLE `aussage`-Zeilen zu einem Subjekt (`subjekt_typ`/`subjekt_id`, AP-1.12) —
 * `aussage.subjekt_id` ist polymorph OHNE Fremdschlüssel-`CASCADE` (E-7): wird die referenzierte
 * Zeile selbst gelöscht (`elternschaft.loeschen`/`partnerschaft.loeschen`/`ereignis.loeschen`),
 * bliebe ohne diesen Aufruf jede Aussage über sie verwaist — sichtbar u. a. als Undo-Bitgleich-
 * Bruch (CLAUDE.md §5: „Undo(Aktion) stellt den Datenbestand bitgleich wieder her"). `aussage_zitat`
 * folgt automatisch über `ON DELETE CASCADE` auf `aussage_zitat.aussage_id`.
 */
export function loeschenNachSubjekt(tx: Tx, subjektTyp: string, subjektId: string): void {
  tx.prepare('DELETE FROM aussage WHERE subjekt_typ = @subjektTyp AND subjekt_id = @subjektId').run({ subjektTyp, subjektId })
}
