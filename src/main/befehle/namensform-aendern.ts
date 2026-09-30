// AP-1.30 PR 10-1 (A-02, A-19; docs/80 §33 V-130-10-1): Handler für `namensform.aendern` — ändert die
// Kopf-Felder einer Namensform (`name_form`), nie `ist_bevorzugt` (→ `hauptname.wechseln`) und nie
// `person_id`. Läuft in der vom Befehlsbus bereits geöffneten und armierten Transaktion (CLAUDE.md §2:
// kein `BEGIN`/`COMMIT` hier).
//
// Teil-Semantik (E6): ein fehlendes Feld bleibt, `null` leert, ein Wert setzt. Damit überschreibt der
// Befehl nie eine manuell korrigierte Umschrift (`umschrift_norm = 'manuell'`), solange der Aufrufer
// `umschriftNorm` nicht ausdrücklich mitgibt (A-19, ADR-014) — auch nicht beim Umhängen von
// `umschriftVon`. Bestandteile (`name_part`) und `sortier_index` bleiben unberührt.
//
// AP-0.22: vorher lesen, Feld für Feld vergleichen; ist nichts geändert, bleibt der Aufruf ein No-op
// (kein Schreibvorgang, kein neuer `geaendert_am`) — der Bus verwirft die leere Transaktion.
import type { NamensformAendernEin, NamensformAendernFeld } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from '../repositories/basis'
import * as nameFormRepo from '../repositories/name-form-repo'
import type { NameFormZeile } from '../repositories/name-form-repo'
import { umschriftBezugPruefen } from './namensform-anlegen'

/** `true`, wenn der Aufruf das Feld mitgibt UND der Wert vom gespeicherten abweicht. */
function weichtAb<T>(neu: T | undefined, gespeichert: T): boolean {
  return neu !== undefined && neu !== gespeichert
}

/** Der Wert nach der Änderung: mitgegeben (auch `null`) gewinnt, sonst bleibt der gespeicherte. */
function nachher<T>(neu: T | undefined, gespeichert: T): T {
  return neu === undefined ? gespeichert : neu
}

/**
 * Die Vertragsfelder, deren gespeicherter Wert sich durch `ein` ändern würde — nur mitgegebene Felder
 * zählen (Teil-Semantik). Zugleich der No-op-Vergleich des Handlers und die Grundlage des
 * Koaleszenzschlüssels (`koaleszenz-schluessel.ts::namensformAendernSchluessel`) — eine Stelle, keine
 * zweite, auseinanderlaufende Kopie.
 */
export function namensformGeaenderteFelder(vorher: NameFormZeile, ein: NamensformAendernEin): readonly NamensformAendernFeld[] {
  const felder: NamensformAendernFeld[] = []
  if (weichtAb<string | null>(ein.rolle, vorher.rolle)) felder.push('rolle')
  if (weichtAb<string | null>(ein.rollenNotiz, vorher.rollen_notiz)) felder.push('rollenNotiz')
  if (weichtAb<string | null>(ein.sprache, vorher.sprache)) felder.push('sprache')
  if (weichtAb<string | null>(ein.schrift, vorher.schrift)) felder.push('schrift')
  if (weichtAb<string | null>(ein.reihenfolge, vorher.reihenfolge)) felder.push('reihenfolge')
  if (weichtAb<string | null>(ein.umschriftVon, vorher.umschrift_von)) felder.push('umschriftVon')
  if (weichtAb<string | null>(ein.umschriftNorm, vorher.umschrift_norm)) felder.push('umschriftNorm')
  if (weichtAb<number | null>(ein.konfidenz, vorher.konfidenz)) felder.push('konfidenz')
  if (weichtAb<number | null>(ein.gueltigVon, vorher.gueltig_von)) felder.push('gueltigVon')
  if (weichtAb<number | null>(ein.gueltigBis, vorher.gueltig_bis)) felder.push('gueltigBis')
  if (weichtAb<string | null>(ein.originalText, vorher.original_text)) felder.push('originalText')
  return felder
}

/**
 * Die Prüfungen von `namensform.aendern` für die Änderung `ein` an `vorher` (nur lesend, wirft
 * `VALIDIERUNG_UMSCHRIFT_BEZUG` bzw. `NICHT_GEFUNDEN_NAME`). Eigene Funktion, damit
 * `namensform.uebernehmen` den Kopf VOR seinem ersten Schreibvorgang mit derselben Logik prüfen kann.
 */
export function namensformAenderungPruefen(tx: Tx, vorher: NameFormZeile, ein: NamensformAendernEin): void {
  const geaendert = namensformGeaenderteFelder(vorher, ein)
  const rolle = nachher<string | null>(ein.rolle, vorher.rolle)
  const umschriftVon = nachher<string | null>(ein.umschriftVon, vorher.umschrift_von)
  if (geaendert.includes('umschriftVon') && umschriftVon !== null) {
    umschriftBezugPruefen(tx, vorher.person_id, vorher.id, umschriftVon)
  }
  // E7: eine Form ohne Rolle ist eine Umschrift und braucht eine Ursprungsform. Geprüft nur, wenn der
  // Aufruf `rolle` oder `umschriftVon` ändert — Altbestand ohne beides (Migration 0006 bildete
  // 'transliteriert' ohne `umschrift_von` auf `rolle = NULL` ab; `ON DELETE SET NULL` beim Löschen der
  // Ursprungsform) bleibt in seinen übrigen Feldern bearbeitbar.
  if ((geaendert.includes('rolle') || geaendert.includes('umschriftVon')) && rolle === null && umschriftVon === null) {
    throw new WurzelFehler('VALIDIERUNG_UMSCHRIFT_BEZUG', 'Eine Form ohne Rolle braucht eine Ursprungsform.')
  }
}

export function namensformAendern(tx: Tx, ein: NamensformAendernEin): null {
  const vorher = nameFormRepo.lesen(tx, ein.id)
  if (vorher === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_NAME')
  }
  const geaendert = namensformGeaenderteFelder(vorher, ein)
  if (geaendert.length === 0) {
    return null
  }
  namensformAenderungPruefen(tx, vorher, ein)
  const rolle = nachher<string | null>(ein.rolle, vorher.rolle)
  const umschriftVon = nachher<string | null>(ein.umschriftVon, vorher.umschrift_von)
  nameFormRepo.aktualisieren(tx, {
    id: ein.id,
    sprache: nachher<string | null>(ein.sprache, vorher.sprache),
    schrift: nachher<string | null>(ein.schrift, vorher.schrift),
    reihenfolge: nachher<string | null>(ein.reihenfolge, vorher.reihenfolge),
    rolle,
    rollenNotiz: nachher<string | null>(ein.rollenNotiz, vorher.rollen_notiz),
    umschriftVon,
    umschriftNorm: nachher<string | null>(ein.umschriftNorm, vorher.umschrift_norm),
    konfidenz: nachher<number | null>(ein.konfidenz, vorher.konfidenz),
    sortierIndex: vorher.sortier_index,
    gueltigVon: nachher<number | null>(ein.gueltigVon, vorher.gueltig_von),
    gueltigBis: nachher<number | null>(ein.gueltigBis, vorher.gueltig_bis),
    originalText: nachher<string | null>(ein.originalText, vorher.original_text),
    geaendertAm: Date.now(),
  })
  return null
}
