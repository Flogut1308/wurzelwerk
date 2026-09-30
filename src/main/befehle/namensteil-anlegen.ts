// AP-1.30 PR 10-2 (A-02, A-19; docs/80 §33 V-130-10-2): Handler für `namensteil.anlegen` — legt EINEN
// Bestandteil (`name_part`, docs/schema/0006_namensformen.sql) einer bestehenden Namensform an. Läuft in
// der vom Befehlsbus bereits geöffneten und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT`
// hier). Kein Koaleszenzschlüssel: jedes Anlegen ist ein eigener Undo-Schritt.
//
// E1 (U-130-10-sortierindex-constraint): `sortier_index` ist je (Form, Art) eindeutig, und das in JEDEM
// Zwischenzustand — die FTS-Trigger `abl_name_part_*` rekonstruieren den zuletzt indizierten Text per
// `ORDER BY sortier_index`, ein Doppel macht diese Folge unbestimmt und beschädigt den contentless-FTS5-
// Index. Darum rücken die Teile ab der Einfügestelle EINZELN und VON HINTEN NACH VORN um eins auf: jede
// Zielstelle ist beim Schreiben frei (die höhere Stelle hat ihr Vorgänger in der Schleife gerade
// geräumt), erst danach wird der neue Teil auf die frei gewordene Stelle geschrieben. Das Journal spielt
// die Schritte beim Undo rückwärts (Löschen, dann von vorn nach hinten zurück) und beim Redo vorwärts —
// beide Folgen sind ebenfalls doppelfrei. Ein freier „Parkwert" (etwa −1) ist nicht nötig: es wird nie
// ein Teil an einem anderen vorbeibewegt, nur alle ab der Stelle gemeinsam um eins.
//
// E3: ist `original_text` eine automatische Montage der Teile (`istMontierterOriginalText`), folgt er
// der Teiländerung (neu montiert); eine wortgetreue Schreibung bleibt (`mitOriginalTextNachfuehrung`).
import type { NamensteilAnlegenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { istMontierterOriginalText, montiereOriginalText, rekonstruiereFlach } from '../../core/name/zerlegung'
import type { Tx } from '../repositories/basis'
import * as nameFormRepo from '../repositories/name-form-repo'
import type { NameFormZeile } from '../repositories/name-form-repo'
import * as namePartRepo from '../repositories/name-part-repo'
import { geladeneTeile } from '../repositories/name-repo'
import { neueId } from '../id'

/**
 * Prüft und normiert den Wert eines Namensteils: getrimmt, nicht leer (`VALIDIERUNG_NAMENSTEIL_LEER`);
 * ein Vorname-Teil ohne Leerraum (`VALIDIERUNG_NAMENSTEIL_LEERRAUM`, E2 — was „Hans Peter" als EIN
 * Vorname-Teil bedeutet, ist die offene Modellfrage U-130-rufname-mehrteilig). Andere Arten dürfen
 * mehrwortig sein („von der", „Lüdenscheidt-Meyer genannt Schulte").
 */
export function namensteilWertPruefen(art: NamensteilAnlegenEin['art'], roh: string): string {
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
 * E3: führt `aendern` (die Teiländerung) aus und hält `original_text` der Form nach — aber nur, wenn er
 * VOR der Änderung eine automatische Montage der gespeicherten Teile war (`istMontierterOriginalText`;
 * `NULL` zählt als automatisch, wie in `name.aendern`). Dann wird er aus den Teilen NACH der Änderung neu
 * montiert und nur bei einem Unterschied geschrieben. Eine wortgetreue Schreibung bleibt unberührt.
 * Geschrieben wird der Kopf NACH den Teilen: die FTS-Trigger von `name_form` rekonstruieren den
 * indizierten Stand aus `OLD.original_text` und den dann schon geänderten Teilen — genau dem Stand, den
 * die `name_part`-Trigger zuletzt indiziert haben.
 */
export function mitOriginalTextNachfuehrung(tx: Tx, form: NameFormZeile, jetzt: number, aendern: () => void): void {
  const folgtDenTeilen = istMontierterOriginalText(form.original_text, rekonstruiereFlach(geladeneTeile(tx, form.id)))
  aendern()
  if (!folgtDenTeilen) return
  const montiert = montiereOriginalText(rekonstruiereFlach(geladeneTeile(tx, form.id)))
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

export function namensteilAnlegen(tx: Tx, ein: NamensteilAnlegenEin): { readonly id: string } {
  const form = nameFormRepo.lesen(tx, ein.namensformId)
  if (form === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_NAME')
  }
  const wert = namensteilWertPruefen(ein.art, ein.wert)
  const vorhanden = namePartRepo.teileDerArt(tx, form.id, ein.art)
  const position = ein.position ?? vorhanden.length
  if (position > vorhanden.length) {
    throw new WurzelFehler('VALIDIERUNG_WERTEBEREICH', 'namensteil.anlegen: position liegt hinter dem letzten Teil dieser Art.')
  }
  // Die Stelle des neuen Teils: die des Teils, der bisher an `position` stand — sonst hinten (MAX + 1).
  // Bei lückenlosem Bestand ist das `position` selbst; eine Lücke aus Altbestand bleibt erhalten.
  const bisher = vorhanden[position]
  const letzter = vorhanden[vorhanden.length - 1]
  const sortierIndex = bisher !== undefined ? bisher.sortier_index : letzter !== undefined ? letzter.sortier_index + 1 : 0
  const jetzt = Date.now()
  const id = neueId()
  mitOriginalTextNachfuehrung(tx, form, jetzt, () => {
    for (const teil of vorhanden.slice(position).reverse()) {
      namePartRepo.sortierIndexSetzen(tx, { id: teil.id, sortierIndex: teil.sortier_index + 1, geaendertAm: jetzt })
    }
    namePartRepo.einfuegen(tx, {
      id,
      nameFormId: form.id,
      art: ein.art,
      wert,
      istRufname: 0,
      sortierIndex,
      feminineVariante: ein.feminineVariante ?? null,
      erstelltAm: jetzt,
      geaendertAm: jetzt,
    })
  })
  return { id }
}
