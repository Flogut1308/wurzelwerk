// AP-1.30 PR 10-2/10-3 (A-02, A-19; docs/80 §33 V-130-10-2, V-130-10-3): gemeinsame Hilfen der
// `namensteil.*`-Befehle und von `namensform.rufnameSetzen` (hueter #193 H4: vorher in
// `namensteil-anlegen.ts`, von den übrigen Befehlen quer importiert). Kein `BEGIN`/`COMMIT` (CLAUDE.md
// §2), kein SQL (nur über die Repositories).
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { istMontierterOriginalText, montiereOriginalText, rekonstruiereFlach } from '../../core/name/zerlegung'
import type { Tx } from '../repositories/basis'
import * as nameFormRepo from '../repositories/name-form-repo'
import type { NameFormZeile } from '../repositories/name-form-repo'
import { geladeneTeile } from '../repositories/name-repo'

/**
 * Prüft und normiert den Wert eines Namensteils: getrimmt, nicht leer (`VALIDIERUNG_NAMENSTEIL_LEER`);
 * ein Vorname-Teil ohne Leerraum (`VALIDIERUNG_NAMENSTEIL_LEERRAUM`, E2 — was „Hans Peter" als EIN
 * Vorname-Teil bedeutet, ist die offene Modellfrage U-130-rufname-mehrteilig). Andere Arten dürfen
 * mehrwortig sein („von der", „Lüdenscheidt-Meyer genannt Schulte"). `art` darf der rohe Spaltenwert
 * sein (`namensteil.aendern` liest ihn aus `name_part`); geprüft wird nur auf `'vorname'`.
 */
export function namensteilWertPruefen(art: string, roh: string): string {
  const wert = roh.trim()
  if (wert === '') {
    throw new WurzelFehler('VALIDIERUNG_NAMENSTEIL_LEER')
  }
  if (art === 'vorname' && /\s/u.test(wert)) {
    throw new WurzelFehler('VALIDIERUNG_NAMENSTEIL_LEERRAUM')
  }
  return wert
}

/**
 * E3-Entscheidung: ist `original_text` von `form` eine automatische Montage der JETZT gespeicherten Teile
 * (`istMontierterOriginalText`; `NULL` zählt als automatisch, wie in `name.aendern`)? Nur dann folgt er
 * einer Teiländerung. Aufzurufen VOR der Änderung — und je Befehl genau einmal.
 */
export function originalTextFolgtDenTeilen(tx: Tx, form: NameFormZeile): boolean {
  return istMontierterOriginalText(form.original_text, rekonstruiereFlach(geladeneTeile(tx, form.id)))
}

/** Die automatische Montage (`montiereOriginalText`) der jetzt gespeicherten Teile der Form. */
export function montageDerTeile(tx: Tx, formId: string): string | null {
  return montiereOriginalText(rekonstruiereFlach(geladeneTeile(tx, formId)))
}

/**
 * Interner Schalter der Teil-Befehlsfunktionen (`namensteilAnlegen`/`Aendern`/`Loeschen`/`Verschieben`,
 * `namensformRufnameSetzen`), NICHT Teil des IPC-Vertrags: der Bus ruft sie mit zwei Argumenten, also immer
 * mit Nachführung. `namensform.uebernehmen` ruft sie mit `OHNE_NACHFUEHRUNG`, weil es die E3-Entscheidung
 * EINMAL für den ganzen Aufruf trifft (vor dem ersten Teilschritt) — je Einzelschritt entschieden, würde eine
 * wortgetreue Schreibung, die einem Zwischenstand gleicht, überschrieben (U-130-11-0b-e3-zwischenstand).
 */
export interface NachfuehrungOptionen {
  readonly nachfuehren: boolean
}
export const MIT_NACHFUEHRUNG: NachfuehrungOptionen = { nachfuehren: true }
export const OHNE_NACHFUEHRUNG: NachfuehrungOptionen = { nachfuehren: false }

/**
 * E3: führt `aendern` (die Teiländerung) aus und hält `original_text` der Form nach — aber nur, wenn er
 * VOR der Änderung eine automatische Montage der gespeicherten Teile war (`originalTextFolgtDenTeilen`).
 * Dann wird er aus den Teilen NACH der Änderung neu montiert und nur bei einem Unterschied geschrieben.
 * Eine wortgetreue Schreibung bleibt unberührt. Mit `OHNE_NACHFUEHRUNG` nur `aendern` (die Entscheidung
 * trifft dann der Aufrufer, s. `NachfuehrungOptionen`).
 * Geschrieben wird der Kopf NACH den Teilen: die FTS-Trigger von `name_form` rekonstruieren den
 * indizierten Stand aus `OLD.original_text` und den dann schon geänderten Teilen — genau dem Stand, den
 * die `name_part`-Trigger zuletzt indiziert haben.
 */
export function mitOriginalTextNachfuehrung(
  tx: Tx,
  form: NameFormZeile,
  jetzt: number,
  aendern: () => void,
  optionen: NachfuehrungOptionen = MIT_NACHFUEHRUNG,
): void {
  if (!optionen.nachfuehren) {
    aendern()
    return
  }
  const folgtDenTeilen = originalTextFolgtDenTeilen(tx, form)
  aendern()
  if (!folgtDenTeilen) return
  const montiert = montageDerTeile(tx, form.id)
  if (montiert === form.original_text) return
  nameFormRepo.aktualisieren(tx, {
    id: form.id,
    sprache: form.sprache,
    schrift: form.schrift,
    reihenfolge: form.reihenfolge,
    rolle: form.rolle,
    rollenNotiz: form.rollen_notiz,
    umschriftVon: form.umschrift_von,
    umschriftNorm: form.umschrift_norm,
    konfidenz: form.konfidenz,
    sortierIndex: form.sortier_index,
    gueltigVon: form.gueltig_von,
    gueltigBis: form.gueltig_bis,
    originalText: montiert,
    geaendertAm: jetzt,
  })
}
