// AP-1.3d: bildet den Vertrags-`Datumswert` (56_Import_Vertrag.md §2.4) auf die DB-Spaltengruppe
// ab (`_kalender…_doppeljahr`, 50_Datenmodell.md §2.3). `wert1`/`wert2` sind im Vertrag Strings
// ('1750'|'1750-03'|'1750-03-14') — hier zu einem `Teildatum` (src/core/datum/sortierschluessel.ts)
// zerlegt und über `sortIntervall()` (AP-1.1) zu den `_sort_von`/`_sort_bis`-Spalten verrechnet.
// Reine Orchestrierung, kein SQL (CLAUDE.md §2 — SQL nur in src/main/repositories/).
import { sortIntervall } from '../../core/datum/sortierschluessel'
import type { Teildatum } from '../../core/datum/sortierschluessel'
import type { Kalender } from '../../core/datum/typen'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Datumswert as VertragsDatumswert } from '../../shared/schemata/import-v1'

/** Eine DB-Datumsspaltengruppe (z. B. `datum_*`/`beginn_*`/`erstdiagnose_*`) OHNE Spaltenpräfix —
 * die Repositories binden diese Felder unter ihrem jeweiligen Präfix (CLAUDE.md §6: benannte
 * Parameter). `null` in jedem Feld, wenn der Vertrag an dieser Stelle keinen Datumswert trägt
 * (optionales Feld, z. B. `ereignis.datum`). */
export interface DatumSpaltengruppe {
  readonly kalender: string | null
  readonly modifikator: string | null
  readonly praezision: string | null
  readonly wert1: string | null
  readonly wert2: string | null
  readonly originaltext: string | null
  readonly sortVon: number | null
  readonly sortBis: number | null
  readonly zweitkalender: string | null
  readonly zweitwert: string | null
  readonly doppeljahr: string | null
}

const LEERE_SPALTENGRUPPE: DatumSpaltengruppe = {
  kalender: null,
  modifikator: null,
  praezision: null,
  wert1: null,
  wert2: null,
  originaltext: null,
  sortVon: null,
  sortBis: null,
  zweitkalender: null,
  zweitwert: null,
  doppeljahr: null,
}

/** Vorgabe aus §2.4: "kalender nein (Vorgabe gregorian)". */
const STANDARDKALENDER: Kalender = 'gregorian'

/** Zerlegt ein Vertrags-Teildatum-String ('1750'|'1750-03'|'1750-03-14', DATUMSWERT_REGEX in
 * import-v1.ts) in ein `Teildatum`. Die drei `undefined`-Prüfungen sind defensiv (CLAUDE.md §4:
 * kein `!`) — die Regex garantiert bereits, dass mindestens die Jahreskomponente vorhanden ist. */
function teildatumAusWert(wert: string): Teildatum {
  const teile = wert.split('-')
  const jahrText = teile[0]
  if (jahrText === undefined || jahrText === '') {
    throw new WurzelFehler('INTERN_UNERWARTET', `datumSpalten(): "${wert}" ohne Jahreskomponente (Vertrags-Regex verletzt).`)
  }
  const jahr = Number(jahrText)
  const monatText = teile[1]
  if (monatText === undefined) {
    return { jahr }
  }
  const tagText = teile[2]
  if (tagText === undefined) {
    return { jahr, monat: Number(monatText) }
  }
  return { jahr, monat: Number(monatText), tag: Number(tagText) }
}

/**
 * Vertrags-`Datumswert` → DB-Spaltengruppe. `undefined` (optionales Datumsfeld im Vertrag, z. B.
 * `ereignis.datum`) → alle Spalten `null`. Setzt bei fehlendem `kalender` die Vorgabe `gregorian`
 * (§2.4); `wert1` fehlt nur bei `modifikator` ∈ {`zwischen`,`von_bis`} OHNE begleitendes `wert2` —
 * beides hätte die Zod-Prüfung (`import-v1.ts` `datumswertSchema`, IMP-106) bereits vor Erreichen
 * dieser Funktion abgelehnt, ein Fehlen hier ist also ein Programmierfehler, kein Nutzerfehler.
 */
export function datumSpalten(dw: VertragsDatumswert | undefined): DatumSpaltengruppe {
  if (dw === undefined) {
    return LEERE_SPALTENGRUPPE
  }
  if (dw.wert1 === undefined) {
    throw new WurzelFehler('INTERN_UNERWARTET', 'datumSpalten(): wert1 fehlt — der Vertrag (IMP-106) hätte das schon abgelehnt.')
  }

  const kalender = dw.kalender ?? STANDARDKALENDER
  const datum = teildatumAusWert(dw.wert1)
  // `exactOptionalPropertyTypes` (CLAUDE.md §4): `zweitesDatum` darf im Eingabeobjekt nur
  // auftauchen, wenn es tatsächlich gesetzt ist — ein explizites `undefined` ist ein anderer Typ
  // als "Property fehlt".
  const { sortVon, sortBis } =
    dw.wert2 !== undefined
      ? sortIntervall({ kalender, modifikator: dw.modifikator, praezision: dw.praezision, datum, zweitesDatum: teildatumAusWert(dw.wert2) })
      : sortIntervall({ kalender, modifikator: dw.modifikator, praezision: dw.praezision, datum })

  return {
    kalender,
    modifikator: dw.modifikator,
    praezision: dw.praezision,
    wert1: dw.wert1,
    wert2: dw.wert2 ?? null,
    originaltext: dw.original_text ?? null,
    sortVon,
    sortBis,
    zweitkalender: dw.zweitkalender ?? null,
    zweitwert: dw.zweitwert ?? null,
    doppeljahr: dw.doppeljahr ?? null,
  }
}
