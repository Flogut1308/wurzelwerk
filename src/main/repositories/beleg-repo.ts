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
 * §2.15 „mündlich"), außer `archiv_id` (kein Vertragsfeld für `archiv[]` in AP-1.3d). */
export interface QuelleEinfuegenEin {
  readonly id: string
  readonly typ: string
  readonly titel: string | null
  readonly autor: string | null
  readonly verlag: string | null
  readonly jahr: number | null
  readonly art: string | null
  readonly informationsart: string | null
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
       id, typ, titel, autor, verlag, jahr, art, informationsart, signatur, notiz, informant_person_id,
       gespraechsdatum_kalender, gespraechsdatum_modifikator, gespraechsdatum_praezision, gespraechsdatum_wert1,
       gespraechsdatum_wert2, gespraechsdatum_originaltext, gespraechsdatum_sort_von, gespraechsdatum_sort_bis,
       gespraechsdatum_zweitkalender, gespraechsdatum_zweitwert, gespraechsdatum_doppeljahr,
       form, unmittelbarkeit, audio_medium_id, erstellt_am, geaendert_am
     )
     VALUES (
       @id, @typ, @titel, @autor, @verlag, @jahr, @art, @informationsart, @signatur, @notiz, @informantPersonId,
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
