// AP-1.30 PR 10-3 (A-02, A-19; docs/80 §33 V-130-10-3): Handler für `namensteil.aendern` — ändert Wert
// und/oder feminine Variante EINES Bestandteils (`name_part`). Läuft in der vom Befehlsbus bereits
// geöffneten und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
//
// Teil-Semantik je Feld wie `namensform.aendern` (E6): ein fehlendes Feld bleibt, `feminineVariante: null`
// leert, ein Wert setzt. `art`, `sortier_index` und `ist_rufname` bleiben immer unberührt — die Stelle
// wandert nie per UPDATE dieses Befehls, darum entsteht hier kein Zwischenzustand mit Doppel-`sortier_index`
// (E1) und kein zweiter Rufname, auch nicht beim Zurückspielen eines per Koaleszenz verdichteten Journals.
//
// AP-0.22: vorher lesen, Feld für Feld vergleichen (`wert` nach dem Trimmen); ist nichts geändert, bleibt
// der Aufruf ein No-op (kein Schreibvorgang) — der Bus verwirft die leere Transaktion. Geprüft (E2,
// nicht leer) wird `wert` nur, wenn er sich ändert: ein unveränderter Altbestandswert (etwa ein
// mehrwortiger Rufname aus Migration 0006) sperrt so nicht die Änderung der femininen Variante.
//
// E3: ein montierter `original_text` folgt dem neuen Wert, ein wortgetreuer bleibt (`mitOriginalTextNachfuehrung`).
import type { NamensteilAendernEin, NamensteilAendernFeld } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from '../repositories/basis'
import * as nameFormRepo from '../repositories/name-form-repo'
import * as namePartRepo from '../repositories/name-part-repo'
import type { NamePartZeile } from '../repositories/name-part-repo'
import { MIT_NACHFUEHRUNG, mitOriginalTextNachfuehrung, namensteilWertPruefen, type NachfuehrungOptionen } from './namensteil-hilfen'

/**
 * Die Vertragsfelder, deren gespeicherter Wert sich durch `ein` ändern würde — nur mitgegebene Felder
 * zählen, `wert` getrimmt verglichen. Zugleich der No-op-Vergleich des Handlers und die Grundlage des
 * Koaleszenzschlüssels (`koaleszenz-schluessel.ts::namensteilAendernSchluessel`). Wirft nie (der
 * Schlüssel entsteht vor dem Handler; ungültige Werte meldet erst der Handler).
 */
export function namensteilGeaenderteFelder(vorher: NamePartZeile, ein: NamensteilAendernEin): readonly NamensteilAendernFeld[] {
  const felder: NamensteilAendernFeld[] = []
  if (ein.wert !== undefined && ein.wert.trim() !== vorher.wert) felder.push('wert')
  if (ein.feminineVariante !== undefined && ein.feminineVariante !== vorher.feminine_variante) felder.push('feminineVariante')
  return felder
}

export function namensteilAendern(tx: Tx, ein: NamensteilAendernEin, optionen: NachfuehrungOptionen = MIT_NACHFUEHRUNG): null {
  const vorher = namePartRepo.lesen(tx, ein.id)
  if (vorher === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_NAMENSTEIL')
  }
  const geaendert = namensteilGeaenderteFelder(vorher, ein)
  if (geaendert.length === 0) {
    return null
  }
  const wert = geaendert.includes('wert') && ein.wert !== undefined ? namensteilWertPruefen(vorher.art, ein.wert) : vorher.wert
  const feminineVariante = ein.feminineVariante === undefined ? vorher.feminine_variante : ein.feminineVariante
  const form = nameFormRepo.lesen(tx, vorher.name_form_id)
  if (form === undefined) {
    // Unerreichbar: `name_part.name_form_id` ist ein Fremdschlüssel mit ON DELETE CASCADE (0006).
    throw new WurzelFehler('INTERN_UNERWARTET', 'namensteil.aendern: Namensteil ohne Namensform.')
  }
  const jetzt = Date.now()
  mitOriginalTextNachfuehrung(tx, form, jetzt, () => {
    namePartRepo.aktualisieren(tx, {
      id: vorher.id,
      art: vorher.art,
      wert,
      istRufname: vorher.ist_rufname === 1 ? 1 : 0,
      sortierIndex: vorher.sortier_index,
      feminineVariante,
      geaendertAm: jetzt,
    })
  }, optionen)
  return null
}
