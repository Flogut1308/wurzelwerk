// AP-1.33: FLACHE Kompatibilitäts-Schnittstelle über `name_form` + `name_part`. Nach dem harten
// Schnitt (0006_namensformen.sql) gibt es keine `name`-Tabelle mehr; die flache Form
// (vornamen/rufname_*/nachname/…) bleibt aber die Vertragsform des Imports (56_Import_Vertrag.md
// §2.2, UNVERÄNDERT) und der bestehenden Namens-Schreibmaske im Renderer. Dieses Repository bildet
// diese flache Form 1:1 auf `name_form` (Rolle/Sprache/Umschrift/Hauptname) + `name_part`
// (zerlegte Bestandteile) ab — mit derselben Zerlegungslogik wie die Migration (src/core/name/
// zerlegung.ts). SQL läuft über `name-form-repo`/`name-part-repo` (dort liegt das eigentliche SQL);
// hier nur Orchestrierung + Rollen-/Bestandteil-Zuordnung. Kein `BEGIN`/`COMMIT` (armierte
// Bus-Transaktion).
import { montiereOriginalText, rekonstruiereFlach, zerlegeName, type FlacherName, type GeladenerTeil } from '../../core/name/zerlegung'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from './basis'
import * as nameFormRepo from './name-form-repo'
import * as namePartRepo from './name-part-repo'

/** `typ` (flach, inkl. `'transliteriert'`) -> `name_form.rolle` (Umschrift -> `rolle IS NULL`). */
function rolleAusTyp(typ: string): string | null {
  return typ === 'transliteriert' ? null : typ
}

/** `name_form.rolle`/`umschrift_von` -> flacher `typ` (rolle IS NULL + umschrift_von gesetzt -> transliteriert). */
function typAusForm(rolle: string | null, umschriftVon: string | null): string {
  if (rolle !== null) return rolle
  return umschriftVon !== null ? 'transliteriert' : 'sonstiges'
}

/** Nutzlast von `einfuegen()` — dieselben Felder wie die alte flache `name`-Zeile. `istBevorzugt` ist
 * jetzt zwingend `0|1` (name_form.ist_bevorzugt ist NOT NULL, „genau ein Hauptname je Person"). */
export interface NameEinfuegenEin {
  readonly id: string
  readonly personId: string
  readonly typ: string
  readonly schrift: string | null
  readonly umschriftVon: string | null
  readonly umschriftNorm: string | null
  readonly vornamen: string | null
  readonly rufnameIndex: number | null
  readonly rufnameText: string | null
  readonly nachname: string | null
  readonly praefix: string | null
  readonly titelVor: string | null
  readonly zusatzNach: string | null
  /** AP-1.30 PR 3 (V-3-flache-bruecke-vatersname): EIN `name_part(art = 'vatersname')`; kein Feld des
   * Importvertrags v1 (der Import gibt `null`). */
  readonly vatersname: string | null
  readonly originalText: string | null
  readonly sprache: string | null
  readonly istBevorzugt: 0 | 1
  readonly gueltigVon: number | null
  readonly gueltigBis: number | null
  readonly erstelltAm: number
  readonly geaendertAm: number
}

function flachVon(ein: NameEinfuegenEin | NameAktualisierenEin): FlacherName {
  return {
    vornamen: ein.vornamen,
    rufnameIndex: ein.rufnameIndex,
    rufnameText: ein.rufnameText,
    nachname: ein.nachname,
    praefix: ein.praefix,
    titelVor: ein.titelVor,
    zusatzNach: ein.zusatzNach,
    vatersname: ein.vatersname,
  }
}

/** Legt eine Form (`name_form`) + ihre Bestandteile (`name_part`) an. `neueId` vergibt die
 * `name_part`-IDs (D-3: der Aufrufer bringt die ID-Quelle mit — `neueId` im Betrieb, der Fixture-/
 * Import-Seed im Test/Import). */
export function einfuegen(tx: Tx, ein: NameEinfuegenEin, neueId: () => string): void {
  // Form ZUERST (Eltern), Teile DANACH (Kinder) — die Journal-Reihenfolge (die Rücknahme löscht in
  // umgekehrter Reihenfolge, `src/main/journal/undo.ts`) verlangt, dass die Kinder eine höhere
  // `reihenfolge` tragen als ihr Elternteil, sonst kaskadiert das Löschen der Form beim Undo die
  // Teile weg, bevor deren eigene Rücknahme sie erreicht. Damit `abl_name_form_ai` (das die
  // FTS-Normalform beim Einfügen indiziert, BEVOR die Teile existieren) einen konsistenten Wert
  // indiziert, wird `original_text` gesetzt (montiert, wenn der Aufrufer keinen mitbringt) — s.
  // `montiereOriginalText` für die FTS-Begründung.
  const flach = flachVon(ein)
  nameFormRepo.einfuegen(tx, {
    id: ein.id,
    personId: ein.personId,
    sprache: ein.sprache,
    schrift: ein.schrift,
    reihenfolge: null,
    rolle: rolleAusTyp(ein.typ),
    rollenNotiz: null,
    istBevorzugt: ein.istBevorzugt,
    umschriftVon: ein.umschriftVon,
    umschriftNorm: ein.umschriftNorm,
    konfidenz: null,
    sortierIndex: null,
    gueltigVon: ein.gueltigVon,
    gueltigBis: ein.gueltigBis,
    originalText: ein.originalText ?? montiereOriginalText(flach),
    erstelltAm: ein.erstelltAm,
    geaendertAm: ein.geaendertAm,
  })
  for (const teil of zerlegeName(flach)) {
    namePartRepo.einfuegen(tx, {
      id: neueId(),
      nameFormId: ein.id,
      art: teil.art,
      wert: teil.wert,
      istRufname: teil.istRufname ? 1 : 0,
      sortierIndex: teil.sortierIndex,
      feminineVariante: null,
      erstelltAm: ein.erstelltAm,
      geaendertAm: ein.geaendertAm,
    })
  }
}

/** Spalten der alten flachen `name`-Zeile — rekonstruiert aus `name_form` + `name_part`. */
export interface NameZeile {
  readonly id: string
  readonly person_id: string
  readonly typ: string
  readonly schrift: string | null
  readonly umschrift_von: string | null
  readonly umschrift_norm: string | null
  readonly vornamen: string | null
  readonly rufname_index: number | null
  readonly rufname_text: string | null
  readonly nachname: string | null
  readonly praefix: string | null
  readonly titel_vor: string | null
  readonly zusatz_nach: string | null
  /** Rekonstruiert aus `name_part(art = 'vatersname')` (AP-1.30 PR 3) — ohne ihn sähe der No-op-
   * Vergleich in `name-aendern.ts` eine Vatersnamen-Änderung nicht. */
  readonly vatersname: string | null
  readonly original_text: string | null
  readonly sprache: string | null
  readonly ist_bevorzugt: 0 | 1
  readonly gueltig_von: number | null
  readonly gueltig_bis: number | null
}

function geladeneTeile(tx: Tx, formId: string): readonly GeladenerTeil[] {
  return namePartRepo.teileFuerForm(tx, formId).map((teil) => ({
    art: alsArt(teil.art),
    wert: teil.wert,
    istRufname: teil.ist_rufname === 1,
    sortierIndex: teil.sortier_index,
  }))
}

/** Verengt `name_part.art` (roher DB-String) auf den Kern-Literaltyp — die Spalte ist per CHECK
 * eingeschränkt (docs/schema/0006), aber die Rekonstruktion braucht den Literaltyp. */
function alsArt(art: string): GeladenerTeil['art'] {
  switch (art) {
    case 'vorname':
    case 'praefix':
    case 'nachname':
    case 'suffix':
    case 'titel':
    case 'vatersname':
      return art
    default:
      // Unerreichbar: name_part.art ist per CHECK auf die sechs Werte eingeschränkt (docs/schema/0006).
      throw new WurzelFehler('INTERN_UNERWARTET', `name-repo: unbekannte name_part.art "${art}".`)
  }
}

/** Liest eine Form flach (rekonstruiert). `undefined`, wenn `id` nicht existiert. */
export function lesen(tx: Tx, id: string): NameZeile | undefined {
  const form = nameFormRepo.lesen(tx, id)
  if (form === undefined) return undefined
  const flach = rekonstruiereFlach(geladeneTeile(tx, id))
  return {
    id: form.id,
    person_id: form.person_id,
    typ: typAusForm(form.rolle, form.umschrift_von),
    schrift: form.schrift,
    umschrift_von: form.umschrift_von,
    umschrift_norm: form.umschrift_norm,
    vornamen: flach.vornamen,
    rufname_index: flach.rufnameIndex,
    rufname_text: flach.rufnameText,
    nachname: flach.nachname,
    praefix: flach.praefix,
    titel_vor: flach.titelVor,
    zusatz_nach: flach.zusatzNach,
    vatersname: flach.vatersname,
    original_text: form.original_text,
    sprache: form.sprache,
    ist_bevorzugt: form.ist_bevorzugt === 1 ? 1 : 0,
    gueltig_von: form.gueltig_von,
    gueltig_bis: form.gueltig_bis,
  }
}

/** Nutzlast von `aktualisieren()` — wie `NameEinfuegenEin`, ohne `person_id` (ein Name wandert nicht
 * zwischen Personen) und ohne `istBevorzugt` (Hauptname-Wechsel läuft über `name-form-repo`). */
export interface NameAktualisierenEin {
  readonly id: string
  readonly typ: string
  readonly schrift: string | null
  readonly umschriftVon: string | null
  readonly umschriftNorm: string | null
  readonly vornamen: string | null
  readonly rufnameIndex: number | null
  readonly rufnameText: string | null
  readonly nachname: string | null
  readonly praefix: string | null
  readonly titelVor: string | null
  readonly zusatzNach: string | null
  /** Wie in `NameEinfuegenEin`: `null` entfernt einen vorhandenen Vatersname-Teil (die Bestandteile
   * werden vollständig neu aufgebaut). */
  readonly vatersname: string | null
  readonly originalText: string | null
  readonly sprache: string | null
  readonly gueltigVon: number | null
  readonly gueltigBis: number | null
  readonly geaendertAm: number
}

/** Aktualisiert eine Form (Kopf-Spalten) und baut ihre Bestandteile vollständig neu auf (löschen +
 * neu einfügen — die flache Form kennt keine stabilen Teil-IDs). `ist_bevorzugt` bleibt unberührt. */
export function aktualisieren(tx: Tx, ein: NameAktualisierenEin, neueId: () => string): void {
  const flach = flachVon(ein)
  nameFormRepo.aktualisieren(tx, {
    id: ein.id,
    sprache: ein.sprache,
    schrift: ein.schrift,
    reihenfolge: null,
    rolle: rolleAusTyp(ein.typ),
    rollenNotiz: null,
    umschriftVon: ein.umschriftVon,
    umschriftNorm: ein.umschriftNorm,
    konfidenz: null,
    sortierIndex: null,
    gueltigVon: ein.gueltigVon,
    gueltigBis: ein.gueltigBis,
    originalText: ein.originalText ?? montiereOriginalText(flach),
    geaendertAm: ein.geaendertAm,
  })
  namePartRepo.loescheFuerForm(tx, ein.id)
  for (const teil of zerlegeName(flach)) {
    namePartRepo.einfuegen(tx, {
      id: neueId(),
      nameFormId: ein.id,
      art: teil.art,
      wert: teil.wert,
      istRufname: teil.istRufname ? 1 : 0,
      sortierIndex: teil.sortierIndex,
      feminineVariante: null,
      erstelltAm: ein.geaendertAm,
      geaendertAm: ein.geaendertAm,
    })
  }
}

/** Löscht eine Form (name_part räumt sich per ON DELETE CASCADE ab). War es die bevorzugte Form einer
 * Person mit weiteren Formen, rückt deterministisch die verbliebene Form mit der niedrigsten `id` als
 * neue bevorzugte nach (undo-bitgleich, s. `name-form-repo.loeschenMitNachruecken`). */
export function loeschen(tx: Tx, id: string): void {
  nameFormRepo.loeschenMitNachruecken(tx, id)
}
