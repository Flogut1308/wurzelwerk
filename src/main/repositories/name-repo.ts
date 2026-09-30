// AP-1.33: FLACHE Kompatibilitäts-Schnittstelle über `name_form` + `name_part`. Nach dem harten
// Schnitt (0006_namensformen.sql) gibt es keine `name`-Tabelle mehr; die flache Form
// (vornamen/rufname_*/nachname/…) bleibt aber die Vertragsform des Imports (56_Import_Vertrag.md
// §2.2, UNVERÄNDERT) und der bestehenden Namens-Schreibmaske im Renderer. Dieses Repository bildet
// diese flache Form 1:1 auf `name_form` (Rolle/Sprache/Umschrift/Hauptname) + `name_part`
// (zerlegte Bestandteile) ab — mit derselben Zerlegungslogik wie die Migration (src/core/name/
// zerlegung.ts). SQL läuft über `name-form-repo`/`name-part-repo` (dort liegt das eigentliche SQL);
// hier nur Orchestrierung + Rollen-/Bestandteil-Zuordnung. Kein `BEGIN`/`COMMIT` (armierte
// Bus-Transaktion).
import {
  montiereOriginalText,
  montiereOriginalTextDerTeile,
  rekonstruiereFlach,
  zerlegeName,
  type FlacherName,
  type GeladenerTeil,
  type ZerlegterTeil,
} from '../../core/name/zerlegung'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from './basis'
import * as nameFormRepo from './name-form-repo'
import * as namePartRepo from './name-part-repo'
import type { NamePartAktualisierenEin, NamePartEinfuegenEin, NamePartZeile } from './name-part-repo'

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
  // Teile weg, bevor deren eigene Rücknahme sie erreicht. `original_text` wird gesetzt (montiert,
  // wenn der Aufrufer keinen mitbringt) — s. `montiereOriginalText` (dort auch die Korrektur der
  // früheren FTS-Begründung, AP-1.30 PR 10a).
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

function geladenerTeilVon(teil: NamePartZeile): GeladenerTeil {
  return {
    art: alsArt(teil.art),
    wert: teil.wert,
    istRufname: teil.ist_rufname === 1,
    sortierIndex: teil.sortier_index,
  }
}

/** Die Teile einer Form als Eingabe der Kern-Rekonstruktion (`rekonstruiereFlach`). Auch von den
 * granularen `namensteil.*`-Befehlen genutzt (Nachführen einer montierten `original_text`, E3). */
export function geladeneTeile(tx: Tx, formId: string): readonly GeladenerTeil[] {
  return namePartRepo.teileFuerForm(tx, formId).map(geladenerTeilVon)
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
  /** Wie in `NameEinfuegenEin`: `null` entfernt einen vorhandenen Vatersname-Teil. */
  readonly vatersname: string | null
  readonly originalText: string | null
  readonly sprache: string | null
  readonly gueltigVon: number | null
  readonly gueltigBis: number | null
  readonly geaendertAm: number
}

/**
 * Aktualisiert eine Form über die flache Brücke. `ist_bevorzugt` bleibt unberührt.
 *
 * U-130-10a-bruecke-erhaelt (docs/80 §33): die Brücke überschreibt nur, was sie trägt. Die Kopf-Felder
 * AUSSERHALB des flachen Vertrags (`reihenfolge`, `rollen_notiz`, `konfidenz`, `sortier_index`) bleiben
 * wie gespeichert, und die Bestandteile werden abgeglichen statt neu aufgebaut (`teileAbgleichen`) —
 * vorher setzte jedes `name.aendern` diese Felder auf NULL und legte alle Teile neu an (neue IDs,
 * `feminine_variante` NULL, getrennte Nachnamen-Teile zusammengezogen).
 */
export function aktualisieren(tx: Tx, ein: NameAktualisierenEin, neueId: () => string): void {
  const vorher = nameFormRepo.lesen(tx, ein.id)
  if (vorher === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_NAME')
  }
  const flach = flachVon(ein)
  nameFormRepo.aktualisieren(tx, {
    id: ein.id,
    sprache: ein.sprache,
    schrift: ein.schrift,
    reihenfolge: vorher.reihenfolge,
    rolle: rolleAusTyp(ein.typ),
    rollenNotiz: vorher.rollen_notiz,
    umschriftVon: ein.umschriftVon,
    umschriftNorm: ein.umschriftNorm,
    konfidenz: vorher.konfidenz,
    sortierIndex: vorher.sortier_index,
    gueltigVon: ein.gueltigVon,
    gueltigBis: ein.gueltigBis,
    // U-130-rufname-montage: die Montage der neu geschriebenen Teile (inkl. angehängtem Rufnamen).
    originalText: ein.originalText ?? montiereOriginalTextDerTeile(flach),
    geaendertAm: ein.geaendertAm,
  })
  teileAbgleichen(tx, ein.id, flach, ein.geaendertAm, neueId)
}

const ARTEN: readonly GeladenerTeil['art'][] = ['vorname', 'nachname', 'vatersname', 'praefix', 'titel', 'suffix']

/** Die Werte einer Art in `sortier_index`-Reihenfolge, leerzeichengetrennt und ROH (anders als
 * `rekonstruiereFlach` zählen hier auch Teile aus reinem Leerraum: ein gespeicherter „ "-Teil ist ein
 * Unterschied zu „kein Teil" und wird vom Abgleich entfernt, wie vorher vom Neuaufbau). */
function rohKette(teile: readonly { readonly wert: string; readonly sortierIndex: number }[]): string | null {
  if (teile.length === 0) return null
  return [...teile]
    .sort((a, b) => a.sortierIndex - b.sortierIndex)
    .map((teil) => teil.wert)
    .join(' ')
}

/** Ist die flache Sicht einer Art unverändert? Dann bleiben ALLE ihre Teile, wie sie sind — auch eine
 * feinere Zerlegung, die die flache Form nicht ausdrücken kann (zwei Nachnamen-Teile zu „Müller
 * Lüdenscheidt", ein mehrwortiger Vorname-Teil). Für die Einzelarten vergleicht `rohKette` die
 * gespeicherten mit den zu schreibenden Teilen. Für den Vornamen zählt die Wirkung (`rekonstruiereFlach
 * ∘ zerlegeName`: Kette, Rufname-Position, Rufname-Text) und zusätzlich die rohe Eingabe — dieselbe
 * Doppelregel wie der No-op-Vergleich in `name-aendern.ts` (die Kern-Rundreise ist bei einem angehängten
 * mehrwortigen Rufnamen keine Identität, U-130-rufname-mehrteilig). */
function artUnveraendert(art: GeladenerTeil['art'], alt: readonly GeladenerTeil[], neu: readonly ZerlegterTeil[], roh: FlacherName): boolean {
  if (art !== 'vorname') {
    return rohKette(alt.filter((teil) => teil.art === art)) === rohKette(neu.filter((teil) => teil.art === art))
  }
  const altFlach = rekonstruiereFlach(alt)
  const neuFlach = rekonstruiereFlach(neu)
  return (
    (altFlach.vornamen === neuFlach.vornamen && altFlach.rufnameIndex === neuFlach.rufnameIndex && altFlach.rufnameText === neuFlach.rufnameText) ||
    (altFlach.vornamen === (roh.vornamen ?? null) && altFlach.rufnameIndex === (roh.rufnameIndex ?? null) && altFlach.rufnameText === (roh.rufnameText ?? null))
  )
}

/**
 * Gleicht die gespeicherten Bestandteile einer Form mit `zerlegeName(flach)` ab — Diff statt Löschen +
 * Neuanlegen (U-130-10a-bruecke-erhaelt). Je Art:
 *  - flache Sicht unverändert (`artUnveraendert`) -> kein Schreibvorgang;
 *  - sonst behält ein Teil Zeile und ID, wenn ein neuer Teil dieselbe Stelle (`sortier_index`) und
 *    dieselbe Rufname-Markierung hat; nur ein abweichender Wert wird per UPDATE geschrieben. Übrige
 *    alte Teile werden gelöscht, übrige neue eingefügt.
 * `feminine_variante` folgt dem Wert: ein Teil trägt die Variante des gespeicherten Teils derselben Art
 * mit gleichem Wert (auch wenn er an eine andere Stelle rückt), ein neuer Wert hat keine.
 *
 * Warum Stelle und Markierung nie per UPDATE wandern: `sortier_index` ist je (Form, Art) eindeutig zu
 * halten (die FTS-Trigger `abl_name_part_*` rekonstruieren den zuletzt indizierten Text per
 * `ORDER BY sortier_index`; ein Doppel macht die Folge unbestimmt und beschädigt den contentless-FTS5-
 * Index), `ist_rufname` höchstens einmal je Form (`idx_name_part_ein_rufname`). Mit der Reihenfolge
 * Löschen -> UPDATE (nur Wert/Variante) -> Einfügen verletzt kein Zwischenzustand eine der beiden Regeln.
 * Und weil ein UPDATE nie Stelle oder Markierung ändert, gilt das auch für die Rücknahme eines per
 * Koaleszenz zusammengefassten Journals, das die Zeilen in Erst-Sicht-Reihenfolge statt in
 * Schreibreihenfolge zurückspielt (`verdichteAenderungen`): zurückgeschrieben werden dann nur
 * gelöschte Ausgangsteile, deren Stelle kein bleibender Teil belegt.
 */
function teileAbgleichen(tx: Tx, formId: string, flach: FlacherName, geaendertAm: number, neueId: () => string): void {
  const alt = namePartRepo.teileFuerForm(tx, formId)
  const altGeladen = alt.map(geladenerTeilVon)
  const neu = zerlegeName(flach)

  const loeschen: string[] = []
  const aendern: NamePartAktualisierenEin[] = []
  const einfuegen: NamePartEinfuegenEin[] = []

  for (const art of ARTEN) {
    if (artUnveraendert(art, altGeladen, neu, flach)) continue
    const altArt = alt.filter((teil) => teil.art === art)
    const neuArt = neu.filter((teil) => teil.art === art)
    const varianteNachWert = new Map<string, string | null>()
    for (const teil of altArt) {
      if (!varianteNachWert.has(teil.wert)) varianteNachWert.set(teil.wert, teil.feminine_variante)
    }
    const vergeben = new Set<string>()
    const offen: ZerlegterTeil[] = []
    // 1. Gleiche Stelle, gleiche Markierung, gleicher Wert: bleibt unberührt.
    for (const teil of neuArt) {
      const gleich = altArt.find((a) => !vergeben.has(a.id) && a.sortier_index === teil.sortierIndex && a.ist_rufname === (teil.istRufname ? 1 : 0) && a.wert === teil.wert)
      if (gleich === undefined) offen.push(teil)
      else vergeben.add(gleich.id)
    }
    // 2. Gleiche Stelle, gleiche Markierung, anderer Wert: Wert (und Variante) per UPDATE.
    for (const teil of offen) {
      const stelle = altArt.find((a) => !vergeben.has(a.id) && a.sortier_index === teil.sortierIndex && a.ist_rufname === (teil.istRufname ? 1 : 0))
      if (stelle !== undefined) {
        vergeben.add(stelle.id)
        aendern.push({
          id: stelle.id,
          art,
          wert: teil.wert,
          istRufname: stelle.ist_rufname === 1 ? 1 : 0,
          sortierIndex: stelle.sortier_index,
          feminineVariante: varianteNachWert.get(teil.wert) ?? null,
          geaendertAm,
        })
      } else {
        einfuegen.push({
          id: neueId(),
          nameFormId: formId,
          art,
          wert: teil.wert,
          istRufname: teil.istRufname ? 1 : 0,
          sortierIndex: teil.sortierIndex,
          feminineVariante: varianteNachWert.get(teil.wert) ?? null,
          erstelltAm: geaendertAm,
          geaendertAm,
        })
      }
    }
    for (const teil of altArt) {
      if (!vergeben.has(teil.id)) loeschen.push(teil.id)
    }
  }

  for (const id of loeschen) namePartRepo.loeschen(tx, id)
  for (const teil of aendern) namePartRepo.aktualisieren(tx, teil)
  for (const teil of einfuegen) namePartRepo.einfuegen(tx, teil)
}

/** Löscht eine Form (name_part räumt sich per ON DELETE CASCADE ab). War es die bevorzugte Form einer
 * Person mit weiteren Formen, rückt deterministisch die verbliebene Form mit der niedrigsten `id` als
 * neue bevorzugte nach (undo-bitgleich, s. `name-form-repo.loeschenMitNachruecken`). */
export function loeschen(tx: Tx, id: string): void {
  nameFormRepo.loeschenMitNachruecken(tx, id)
}
