// AP-1.3d: einziges Repository, das `aussage`/`aussage_zitat`-SQL schreibt (CLAUDE.md §2). Kein
// `BEGIN`/`COMMIT` hier (läuft in einer bereits offenen, armierten Transaktion, s.
// `person-repo.ts`-Kopf). Trägt sowohl die Vertrags-`aussagen[]` als auch die importinternen
// Existenz-/abgeleiteten Aussagen (ADR-026, 50_Datenmodell.md §2.7) — beide landen in derselben
// Tabelle, es gibt keinen zweiten `aussage`-Schreibpfad.
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

/** Nutzlast von `zitatVerknuepfen()`: alle Spalten von `aussage_zitat`
 * (docs/schema/0002_kern.sql §2.7, Verknüpfungstabelle ohne eigenes `id`). */
export interface AussageZitatVerknuepfenEin {
  readonly aussageId: string
  readonly zitatId: string
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Verknüpft eine `aussage`-Zeile mit einem `zitat` (benannte Parameter, CLAUDE.md §6). */
export function zitatVerknuepfen(tx: Tx, ein: AussageZitatVerknuepfenEin): void {
  tx.prepare(
    `INSERT INTO aussage_zitat (aussage_id, zitat_id, erstellt_am, geaendert_am)
     VALUES (@aussageId, @zitatId, @erstelltAm, @geaendertAm)`,
  ).run({
    aussageId: ein.aussageId,
    zitatId: ein.zitatId,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
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
