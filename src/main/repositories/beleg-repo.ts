// AP-1.3d: einziges Repository, das `quelle`/`zitat`-SQL schreibt (CLAUDE.md §2). Kein
// `BEGIN`/`COMMIT` hier (läuft in einer bereits offenen, armierten Transaktion, s.
// `person-repo.ts`-Kopf). Name "beleg-repo" (nicht "quelle-repo"), weil dieses Modul beide Seiten
// eines Belegs trägt: die Quelle UND den konkreten Zitatnachweis (56_Import_Vertrag.md §2.3).
import type { Tx } from './basis'
import type { DatumSpaltengruppe } from '../import/datum-spalten'

function datumSpaltenParameter(praefix: string, gruppe: DatumSpaltengruppe): Record<string, string | number | null> {
  return {
    [`${praefix}Kalender`]: gruppe.kalender,
    [`${praefix}Modifikator`]: gruppe.modifikator,
    [`${praefix}Praezision`]: gruppe.praezision,
    [`${praefix}Wert1`]: gruppe.wert1,
    [`${praefix}Wert2`]: gruppe.wert2,
    [`${praefix}Originaltext`]: gruppe.originaltext,
    [`${praefix}SortVon`]: gruppe.sortVon,
    [`${praefix}SortBis`]: gruppe.sortBis,
    [`${praefix}Zweitkalender`]: gruppe.zweitkalender,
    [`${praefix}Zweitwert`]: gruppe.zweitwert,
    [`${praefix}Doppeljahr`]: gruppe.doppeljahr,
  }
}

/** Nutzlast von `quelleEinfuegen()`: alle Spalten von `quelle` (docs/schema/0002_kern.sql §2.7 +
 * §2.15 „mündlich"). `archivId` kam erst mit AP-1.17 PR-A2 hinzu (der Nutzer-Befehl `quelle.
 * anlegen` erlaubt ein Archiv, der Import-Pfad — `src/main/import/schreiben.ts` — setzt weiterhin
 * `null`, kein Vertragsfeld für `archiv[]` im Importvertrag). */
export interface QuelleEinfuegenEin {
  readonly id: string
  readonly typ: string
  readonly titel: string | null
  readonly autor: string | null
  readonly verlag: string | null
  readonly jahr: number | null
  readonly art: string | null
  readonly informationsart: string | null
  readonly archivId: string | null
  readonly signatur: string | null
  readonly notiz: string | null
  readonly informantPersonId: string | null
  readonly gespraechsdatum: DatumSpaltengruppe
  readonly form: string | null
  readonly unmittelbarkeit: string | null
  readonly audioMediumId: string | null
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Legt eine `quelle`-Zeile an (benannte Parameter, CLAUDE.md §6). */
export function quelleEinfuegen(tx: Tx, ein: QuelleEinfuegenEin): void {
  tx.prepare(
    `INSERT INTO quelle (
       id, typ, titel, autor, verlag, jahr, art, informationsart, archiv_id, signatur, notiz, informant_person_id,
       gespraechsdatum_kalender, gespraechsdatum_modifikator, gespraechsdatum_praezision, gespraechsdatum_wert1,
       gespraechsdatum_wert2, gespraechsdatum_originaltext, gespraechsdatum_sort_von, gespraechsdatum_sort_bis,
       gespraechsdatum_zweitkalender, gespraechsdatum_zweitwert, gespraechsdatum_doppeljahr,
       form, unmittelbarkeit, audio_medium_id, erstellt_am, geaendert_am
     )
     VALUES (
       @id, @typ, @titel, @autor, @verlag, @jahr, @art, @informationsart, @archivId, @signatur, @notiz, @informantPersonId,
       @gespraechsdatumKalender, @gespraechsdatumModifikator, @gespraechsdatumPraezision, @gespraechsdatumWert1,
       @gespraechsdatumWert2, @gespraechsdatumOriginaltext, @gespraechsdatumSortVon, @gespraechsdatumSortBis,
       @gespraechsdatumZweitkalender, @gespraechsdatumZweitwert, @gespraechsdatumDoppeljahr,
       @form, @unmittelbarkeit, @audioMediumId, @erstelltAm, @geaendertAm
     )`,
  ).run({
    id: ein.id,
    typ: ein.typ,
    titel: ein.titel,
    autor: ein.autor,
    verlag: ein.verlag,
    jahr: ein.jahr,
    art: ein.art,
    informationsart: ein.informationsart,
    archivId: ein.archivId,
    signatur: ein.signatur,
    notiz: ein.notiz,
    informantPersonId: ein.informantPersonId,
    ...datumSpaltenParameter('gespraechsdatum', ein.gespraechsdatum),
    form: ein.form,
    unmittelbarkeit: ein.unmittelbarkeit,
    audioMediumId: ein.audioMediumId,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
}

/** Spalten von `quelle` (docs/schema/0002_kern.sql §2.7 + §2.15), für `quelleLesen()` (AP-0.22-
 * Vergleich vor `quelle.aendern`) UND für `abfrage:quelle.detail` (AP-1.17 PR-A2). */
export interface QuelleZeile {
  readonly id: string
  readonly typ: string
  readonly titel: string | null
  readonly autor: string | null
  readonly verlag: string | null
  readonly jahr: number | null
  readonly art: string | null
  readonly informationsart: string | null
  readonly archiv_id: string | null
  readonly signatur: string | null
  readonly notiz: string | null
  readonly informant_person_id: string | null
  readonly gespraechsdatum_kalender: string | null
  readonly gespraechsdatum_modifikator: string | null
  readonly gespraechsdatum_praezision: string | null
  readonly gespraechsdatum_wert1: string | null
  readonly gespraechsdatum_wert2: string | null
  readonly gespraechsdatum_originaltext: string | null
  readonly gespraechsdatum_sort_von: number | null
  readonly gespraechsdatum_sort_bis: number | null
  readonly gespraechsdatum_zweitkalender: string | null
  readonly gespraechsdatum_zweitwert: string | null
  readonly gespraechsdatum_doppeljahr: string | null
  readonly form: string | null
  readonly unmittelbarkeit: string | null
  readonly audio_medium_id: string | null
}

/** Liest eine `quelle`-Zeile (Spalten explizit, CLAUDE.md §6). `undefined`, wenn `id` nicht existiert. */
export function quelleLesen(tx: Tx, id: string): QuelleZeile | undefined {
  return tx
    .prepare<{ readonly id: string }, QuelleZeile>(
      `SELECT id, typ, titel, autor, verlag, jahr, art, informationsart, archiv_id, signatur, notiz,
              informant_person_id, gespraechsdatum_kalender, gespraechsdatum_modifikator, gespraechsdatum_praezision,
              gespraechsdatum_wert1, gespraechsdatum_wert2, gespraechsdatum_originaltext, gespraechsdatum_sort_von,
              gespraechsdatum_sort_bis, gespraechsdatum_zweitkalender, gespraechsdatum_zweitwert, gespraechsdatum_doppeljahr,
              form, unmittelbarkeit, audio_medium_id
       FROM quelle WHERE id = @id`,
    )
    .get({ id })
}

/** Nutzlast von `quelleAktualisieren()`: alle editierbaren Spalten (s. `QuelleZeile`) + der vom
 * Handler gesetzte `geaendert_am`-Zeitstempel (D-3). */
export interface QuelleAktualisierenEin {
  readonly id: string
  readonly typ: string
  readonly titel: string | null
  readonly autor: string | null
  readonly verlag: string | null
  readonly jahr: number | null
  readonly art: string | null
  readonly informationsart: string | null
  readonly archivId: string | null
  readonly signatur: string | null
  readonly notiz: string | null
  readonly informantPersonId: string | null
  readonly gespraechsdatum: DatumSpaltengruppe
  readonly form: string | null
  readonly unmittelbarkeit: string | null
  readonly audioMediumId: string | null
  readonly geaendertAm: number
}

/** Aktualisiert alle editierbaren Spalten einer `quelle`-Zeile in einem `UPDATE`. */
export function quelleAktualisieren(tx: Tx, ein: QuelleAktualisierenEin): void {
  tx.prepare(
    `UPDATE quelle SET
       typ = @typ, titel = @titel, autor = @autor, verlag = @verlag, jahr = @jahr, art = @art,
       informationsart = @informationsart, archiv_id = @archivId, signatur = @signatur, notiz = @notiz,
       informant_person_id = @informantPersonId,
       gespraechsdatum_kalender = @gespraechsdatumKalender, gespraechsdatum_modifikator = @gespraechsdatumModifikator,
       gespraechsdatum_praezision = @gespraechsdatumPraezision, gespraechsdatum_wert1 = @gespraechsdatumWert1,
       gespraechsdatum_wert2 = @gespraechsdatumWert2, gespraechsdatum_originaltext = @gespraechsdatumOriginaltext,
       gespraechsdatum_sort_von = @gespraechsdatumSortVon, gespraechsdatum_sort_bis = @gespraechsdatumSortBis,
       gespraechsdatum_zweitkalender = @gespraechsdatumZweitkalender, gespraechsdatum_zweitwert = @gespraechsdatumZweitwert,
       gespraechsdatum_doppeljahr = @gespraechsdatumDoppeljahr,
       form = @form, unmittelbarkeit = @unmittelbarkeit, audio_medium_id = @audioMediumId,
       geaendert_am = @geaendertAm
     WHERE id = @id`,
  ).run({
    id: ein.id,
    typ: ein.typ,
    titel: ein.titel,
    autor: ein.autor,
    verlag: ein.verlag,
    jahr: ein.jahr,
    art: ein.art,
    informationsart: ein.informationsart,
    archivId: ein.archivId,
    signatur: ein.signatur,
    notiz: ein.notiz,
    informantPersonId: ein.informantPersonId,
    ...datumSpaltenParameter('gespraechsdatum', ein.gespraechsdatum),
    form: ein.form,
    unmittelbarkeit: ein.unmittelbarkeit,
    audioMediumId: ein.audioMediumId,
    geaendertAm: ein.geaendertAm,
  })
}

/** Nutzlast von `zitatEinfuegen()`: alle `$defs/Beleg`-Spalten (56_Import_Vertrag.md §2.3) +
 * `quelle_id`. `zugriffsdatum_*`/`medium_id` (docs/schema/0002_kern.sql §2.7) sind im Vertrag
 * nicht vorgesehen und bleiben darum `NULL`. */
export interface ZitatEinfuegenEin {
  readonly id: string
  readonly quelleId: string
  readonly seite: string | null
  readonly eintragsnummer: string | null
  readonly band: string | null
  readonly jahr: number | null
  readonly zeitmarkeSekunden: number | null
  readonly transkript: string | null
  readonly uebersetzung: string | null
  readonly digitalisatUrl: string | null
  readonly konfidenz: number
  readonly erstelltAm: number
  readonly geaendertAm: number
}

/** Legt eine `zitat`-Zeile an (benannte Parameter, CLAUDE.md §6). `zeitmarke_sekunden` ist die
 * 0005-Spalte (AP-1.3c, A-16). */
export function zitatEinfuegen(tx: Tx, ein: ZitatEinfuegenEin): void {
  tx.prepare(
    `INSERT INTO zitat (
       id, quelle_id, seite, eintragsnummer, band, jahr, zeitmarke_sekunden, digitalisat_url,
       transkript, uebersetzung, konfidenz, erstellt_am, geaendert_am
     )
     VALUES (
       @id, @quelleId, @seite, @eintragsnummer, @band, @jahr, @zeitmarkeSekunden, @digitalisatUrl,
       @transkript, @uebersetzung, @konfidenz, @erstelltAm, @geaendertAm
     )`,
  ).run({
    id: ein.id,
    quelleId: ein.quelleId,
    seite: ein.seite,
    eintragsnummer: ein.eintragsnummer,
    band: ein.band,
    jahr: ein.jahr,
    zeitmarkeSekunden: ein.zeitmarkeSekunden,
    digitalisatUrl: ein.digitalisatUrl,
    transkript: ein.transkript,
    uebersetzung: ein.uebersetzung,
    konfidenz: ein.konfidenz,
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
}
