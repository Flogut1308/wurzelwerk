// AP-1.17 PR-A4: einziges Repository, das `negativbefund`-SQL schreibt (CLAUDE.md §2). Kein
// `BEGIN`/`COMMIT` hier (läuft in einer bereits offenen, armierten Transaktion, s.
// `person-repo.ts`-Kopf). `negativbefund` ist eine eigenständige, personengebundene Tabelle
// (docs/schema/0002_kern.sql §2.7) — der Befund „an Ort X im Zeitraum Y wurde Person Z gesucht und
// NICHT gefunden".
import type { Tx } from './basis'

/** Nutzlast von `negativbefundEinfuegen()`: alle Spalten von `negativbefund`
 * (docs/schema/0002_kern.sql §2.7) außer `id`/`erstellt_am`/`geaendert_am`, die der Handler setzt. */
export interface NegativbefundEinfuegenEin {
  readonly id: string
  readonly quelleId: string | null
  readonly gesuchtePersonId: string
  readonly gesuchtesPraedikat: string | null
  readonly zeitraumVon: number | null
  readonly zeitraumBis: number | null
  readonly beschreibung: string | null
  readonly datumDerPruefung: string | null
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Legt eine `negativbefund`-Zeile an (benannte Parameter, CLAUDE.md §6). */
export function negativbefundEinfuegen(tx: Tx, ein: NegativbefundEinfuegenEin): void {
  tx.prepare(
    `INSERT INTO negativbefund (
       id, quelle_id, gesuchte_person_id, gesuchtes_praedikat, zeitraum_von, zeitraum_bis,
       beschreibung, datum_der_pruefung, erstellt_am, geaendert_am
     )
     VALUES (
       @id, @quelleId, @gesuchtePersonId, @gesuchtesPraedikat, @zeitraumVon, @zeitraumBis,
       @beschreibung, @datumDerPruefung, @erstelltAm, @geaendertAm
     )`,
  ).run({
    id: ein.id,
    quelleId: ein.quelleId,
    gesuchtePersonId: ein.gesuchtePersonId,
    gesuchtesPraedikat: ein.gesuchtesPraedikat,
    zeitraumVon: ein.zeitraumVon,
    zeitraumBis: ein.zeitraumBis,
    beschreibung: ein.beschreibung,
    datumDerPruefung: ein.datumDerPruefung,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
}

/** Spalten von `negativbefund` (docs/schema/0002_kern.sql §2.7), für `negativbefundLesen()`
 * (AP-0.22-Vergleich vor `negativbefund.aendern`) UND für `abfrage:negativbefund.liste`. */
export interface NegativbefundZeile {
  readonly id: string
  readonly quelle_id: string | null
  readonly gesuchte_person_id: string
  readonly gesuchtes_praedikat: string | null
  readonly zeitraum_von: number | null
  readonly zeitraum_bis: number | null
  readonly beschreibung: string | null
  readonly datum_der_pruefung: string | null
}

/** Liest eine `negativbefund`-Zeile (Spalten explizit, CLAUDE.md §6). `undefined`, wenn `id` nicht existiert. */
export function negativbefundLesen(tx: Tx, id: string): NegativbefundZeile | undefined {
  return tx
    .prepare<{ readonly id: string }, NegativbefundZeile>(
      `SELECT id, quelle_id, gesuchte_person_id, gesuchtes_praedikat, zeitraum_von, zeitraum_bis,
              beschreibung, datum_der_pruefung
       FROM negativbefund WHERE id = @id`,
    )
    .get({ id })
}

/** Nutzlast von `negativbefundAktualisieren()`: alle editierbaren Spalten (s. `NegativbefundZeile`)
 * + der vom Handler gesetzte `geaendert_am`-Zeitstempel (D-3). */
export interface NegativbefundAktualisierenEin {
  readonly id: string
  readonly quelleId: string | null
  readonly gesuchtePersonId: string
  readonly gesuchtesPraedikat: string | null
  readonly zeitraumVon: number | null
  readonly zeitraumBis: number | null
  readonly beschreibung: string | null
  readonly datumDerPruefung: string | null
  readonly geaendertAm: number
}

/** Aktualisiert alle editierbaren Spalten einer `negativbefund`-Zeile in einem `UPDATE`. */
export function negativbefundAktualisieren(tx: Tx, ein: NegativbefundAktualisierenEin): void {
  tx.prepare(
    `UPDATE negativbefund SET
       quelle_id = @quelleId, gesuchte_person_id = @gesuchtePersonId, gesuchtes_praedikat = @gesuchtesPraedikat,
       zeitraum_von = @zeitraumVon, zeitraum_bis = @zeitraumBis, beschreibung = @beschreibung,
       datum_der_pruefung = @datumDerPruefung, geaendert_am = @geaendertAm
     WHERE id = @id`,
  ).run({
    id: ein.id,
    quelleId: ein.quelleId,
    gesuchtePersonId: ein.gesuchtePersonId,
    gesuchtesPraedikat: ein.gesuchtesPraedikat,
    zeitraumVon: ein.zeitraumVon,
    zeitraumBis: ein.zeitraumBis,
    beschreibung: ein.beschreibung,
    datumDerPruefung: ein.datumDerPruefung,
    geaendertAm: ein.geaendertAm,
  })
}

/** Löscht eine `negativbefund`-Zeile. Keine abhängigen Tabellen (kein `ON DELETE CASCADE` zeigt
 * auf `negativbefund.id`), keine zusätzliche Aufräumung nötig. */
export function negativbefundLoeschen(tx: Tx, id: string): void {
  tx.prepare(`DELETE FROM negativbefund WHERE id = @id`).run({ id })
}

/** Alle Negativbefunde einer gesuchten Person, `erstellt_am` aufsteigend (fürs Profil in
 * AP-1.17 PR-C, `abfrage:negativbefund.liste`). */
export function negativbefundListeFuerPerson(tx: Tx, gesuchtePersonId: string): readonly NegativbefundZeile[] {
  return tx
    .prepare<{ readonly gesuchtePersonId: string }, NegativbefundZeile>(
      `SELECT id, quelle_id, gesuchte_person_id, gesuchtes_praedikat, zeitraum_von, zeitraum_bis,
              beschreibung, datum_der_pruefung
       FROM negativbefund
       WHERE gesuchte_person_id = @gesuchtePersonId
       ORDER BY erstellt_am, id`,
    )
    .all({ gesuchtePersonId })
}
