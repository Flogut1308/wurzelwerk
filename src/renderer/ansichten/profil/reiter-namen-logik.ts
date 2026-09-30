// AP-1.30 PR 11b (A-02, C-26; docs/80 §33 V-130-11b): reine Logik des Vorschau-Umschalters im Reiter
// „Namen" (Artboard 2a, Entwicklungsvorgaben §3.5 „Vorschau-Umschalter"). Reines TypeScript ohne React
// und ohne i18next (Muster `reiter-person-logik.ts`): der Aufrufer reicht seinen Übersetzer herein.
//
// Die Rückfallkette Sprache → Umschrift → Hauptname gibt es genau einmal, in `anzeigenameFuer`
// (src/core/name/anzeigename.ts, AP-1.33). Dieses Modul bildet nur das Lesemodell auf deren Eingabe ab
// und wählt die Wunschsprache — es entscheidet keine Stufe selbst.
import { vonJdn } from '../../../core/datum/kalender'
import { anzeigeArtFolge, anzeigenameFuer, anzeigetextVon, sortierName, type AnzeigeForm, type AnzeigenameErgebnis, type AnzeigenameQuelle } from '../../../core/name/anzeigename'
import type { NameFormReihenfolge, NamePartArt, UmschriftNorm } from '../../../core/name/typen'
import type { PersonDetailName, PersonDetailNamensteil } from '../../../shared/schemata/person-detail'

/** Die Oberflächensprache (ADR-011: es gibt nur Deutsch, `src/renderer/i18n/einrichten.ts`). */
export const OBERFLAECHENSPRACHE = 'de'

/** `AnzeigeForm` mit PFLICHTFELD `reihenfolge`: in `AnzeigeForm` ist es optional (V-130-11-E2), ein
 * vergessenes Durchreichen fiele dem Compiler dort nicht auf (hueter #197 H4) — hier schon. */
export type VorschauForm = AnzeigeForm & { readonly reihenfolge: NameFormReihenfolge | null }

/** Eine Namensform des Lesemodells als Eingabe von `anzeigenameFuer` — dieselben Felder, die der
 * Hauptprozess für den Kopf aus der Datenbank liest (`src/main/abfragen/_anzeigenamen.ts`). */
export function anzeigeFormAus(name: PersonDetailName): VorschauForm {
  return {
    formId: name.id,
    sprache: name.sprache,
    schrift: name.schrift,
    istBevorzugt: name.ist_bevorzugt,
    umschriftVon: name.umschrift_von,
    originalText: name.original_text,
    reihenfolge: name.reihenfolge,
    teile: name.teile.map((teil) => ({ art: teil.art, wert: teil.wert, istRufname: teil.ist_rufname, sortierIndex: teil.sortier_index })),
  }
}

/**
 * Was die Vorschau für `sprache` zeigt. Die Oberflächensprache fragt nach KEINER Sprachform: so ruft
 * auch der Hauptprozess `anzeigenameFuer` für Kopf, Liste und Suche auf (docs/80 §32 V-4-wunschsprache)
 * — „Deutsch" zeigt damit genau den Namen, den die App in deutscher Oberfläche zeigt. Jede andere
 * Sprache wird als Wunschsprache übergeben. `null` = die Person hat keine Namensform.
 */
export function vorschauFuer(namen: readonly PersonDetailName[], sprache: string): AnzeigenameErgebnis | null {
  const formen = namen.map(anzeigeFormAus)
  return sprache === OBERFLAECHENSPRACHE ? anzeigenameFuer(formen) : anzeigenameFuer(formen, sprache)
}

/** Die wählbaren Sprachen: die Oberflächensprache zuerst, danach jede Sprache einer Form genau einmal,
 * nach Code binär geordnet (wie die Kartenfolge, V-130-11-E10). Formen ohne Sprache tragen nichts bei. */
export function vorschauSprachen(namen: readonly PersonDetailName[]): readonly string[] {
  const weitere = new Set<string>()
  for (const name of namen) {
    if (name.sprache !== null && name.sprache !== OBERFLAECHENSPRACHE) weitere.add(name.sprache)
  }
  return [OBERFLAECHENSPRACHE, ...[...weitere].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))]
}

/** i18n-Schlüssel (`profil.json`) der Sprachen mit eigener Beschriftung — Endonyme, wie im Entwurf
 * („Русский", „Ирон"). Offene Eingabemenge (BCP-47-Codes): eine Sprache ohne Eintrag zeigt ihren Code. */
export const VORSCHAU_SPRACHE_SCHLUESSEL: Readonly<Record<string, string>> = {
  de: 'vorschau_sprache_de',
  en: 'vorschau_sprache_en',
  os: 'vorschau_sprache_os',
  ru: 'vorschau_sprache_ru',
}

/** Sichtbare Beschriftung einer Sprache; `t` ist der Übersetzer des Namensraums `profil`. */
export function vorschauSpracheBeschriftung(sprache: string, t: (schluessel: string) => string): string {
  const schluessel = Object.hasOwn(VORSCHAU_SPRACHE_SCHLUESSEL, sprache) ? VORSCHAU_SPRACHE_SCHLUESSEL[sprache] : undefined
  return schluessel === undefined ? sprache : t(schluessel)
}

/** i18n-Schlüssel der Herkunft, also der Stufe der Rückfallkette, die den Text geliefert hat. */
export function herkunftSchluessel(quelle: AnzeigenameQuelle): string {
  switch (quelle) {
    case 'sprache':
      return 'vorschau_herkunft_sprache'
    case 'umschrift':
      return 'vorschau_herkunft_umschrift'
    case 'hauptname':
      return 'vorschau_herkunft_hauptname'
  }
}

/** Zielindex einer Taste in der Optionsgruppe, `null` = die Taste gehört nicht der Gruppe. Pfeile laufen
 * am Rand um (WAI-ARIA APG „Radio Group"), Pos1/Ende springen an die Enden. */
export function vorschauZielIndex(taste: string, index: number, anzahl: number): number | null {
  if (anzahl === 0) return null
  switch (taste) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (index + 1) % anzahl
    case 'ArrowLeft':
    case 'ArrowUp':
      return (index - 1 + anzahl) % anzahl
    case 'Home':
      return 0
    case 'End':
      return anzahl - 1
    default:
      return null
  }
}

// -----------------------------------------------------------------------------------------------
// AP-1.30 PR 11c-1 (A-02, A-19, C-26; docs/80 §33 V-130-11-E3, E6, E8, E10): die Karten im Reiter
// „Namen" — reine Anzeige, bearbeitet wird allein im Modal (E8).
// -----------------------------------------------------------------------------------------------

/** Binärer Vergleich von Zeichenketten (Codepunkte, wie `vorschauSprachen`), unabhängig vom Gebietsschema. */
function binaer(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** `null` zuletzt, sonst `vergleich`. */
function nullZuletzt<T>(a: T | null, b: T | null, vergleich: (x: T, y: T) => number): number {
  if (a === null) return b === null ? 0 : 1
  if (b === null) return -1
  return vergleich(a, b)
}

/**
 * Kartenfolge (V-130-11-E10): Hauptname zuerst, dann nach Sprache (Code binär, `NULL` zuletzt), dann nach
 * `name_form.sortier_index` (`NULL` zuletzt), dann nach `id`. Deterministisch und unabhängig von der
 * Ladereihenfolge; die Eingabe bleibt unverändert.
 */
export function kartenFolge(namen: readonly PersonDetailName[]): readonly PersonDetailName[] {
  return [...namen].sort(
    (a, b) =>
      (a.ist_bevorzugt ? 0 : 1) - (b.ist_bevorzugt ? 0 : 1) ||
      nullZuletzt(a.sprache, b.sprache, binaer) ||
      nullZuletzt(a.sortier_index, b.sortier_index, (x, y) => x - y) ||
      binaer(a.id, b.id),
  )
}

/**
 * Die Teile einer Form in Anzeigefolge: nach der Wortfolge des Kerns (`anzeigeArtFolge`, dieselbe, in der
 * `anzeigetextVon` die Teile verbindet — bei `nachname_zuerst` umgestellt), innerhalb einer Art nach
 * `sortier_index`, dann `id`. Das Lesemodell liefert die Teile in fester Art-Folge (V-130-10-4), nicht so.
 */
export function teileInAnzeigefolge(name: PersonDetailName): readonly PersonDetailNamensteil[] {
  const folge = anzeigeArtFolge(name.reihenfolge)
  return [...name.teile].sort((a, b) => folge.indexOf(a.art) - folge.indexOf(b.art) || a.sortier_index - b.sortier_index || binaer(a.id, b.id))
}

/** Eine Form ohne Rolle ist eine Umschrift (0006: `rolle IS NULL` statt 'transliteriert', E7) — auch dann,
 * wenn ihre Ursprungsform inzwischen gelöscht ist (`umschrift_von` auf NULL, U-130-10-umschrift-set-null). */
export function istUmschrift(name: PersonDetailName): boolean {
  return name.rolle === null
}

/** Anzeigetext einer einzelnen Form, über den Kern (`anzeigetextVon`, Reihenfolge eingeschlossen). */
export function anzeigetextDerForm(name: PersonDetailName): string {
  return anzeigetextVon(anzeigeFormAus(name))
}

/** „Sortiert unter" einer Form, über den Kern (`sortierName`: Präfix zählt nicht). */
export function sortiertUnter(name: PersonDetailName): string {
  return sortierName(anzeigeFormAus(name))
}

/** Gültigkeit einer Form als gregorianische Jahre. `gueltig_von`/`gueltig_bis` sind Sortierschlüssel (JDN,
 * docs/datenmodell.md §2, wie `datum_sort_von`); eine offene Grenze bleibt offen. */
export function gueltigkeitJahre(name: PersonDetailName): { readonly von?: number; readonly bis?: number } {
  return {
    ...(name.gueltig_von === null ? {} : { von: vonJdn(name.gueltig_von, 'gregorian').jahr }),
    ...(name.gueltig_bis === null ? {} : { bis: vonJdn(name.gueltig_bis, 'gregorian').jahr }),
  }
}

/** i18n-Schlüssel (`profil.json`) der Art eines Bestandteils. */
export function namensteilSchluessel(art: NamePartArt): string {
  switch (art) {
    case 'vorname':
      return 'namensteil_vorname'
    case 'praefix':
      return 'namensteil_praefix'
    case 'nachname':
      return 'namensteil_nachname'
    case 'suffix':
      return 'namensteil_suffix'
    case 'titel':
      return 'namensteil_titel'
    case 'vatersname':
      return 'namensteil_vatersname'
  }
}

/** Nummer je Teil innerhalb seiner Art (1, 2, …) in der gegebenen Folge — `null`, wenn die Art nur einmal
 * vorkommt („Vorname" statt „Vorname 1"). Beschriftet Karten und Modal gleich. */
export function artNummern(teile: readonly { readonly art: NamePartArt }[]): readonly (number | null)[] {
  const anzahl = new Map<NamePartArt, number>()
  for (const teil of teile) anzahl.set(teil.art, (anzahl.get(teil.art) ?? 0) + 1)
  const gezaehlt = new Map<NamePartArt, number>()
  return teile.map((teil) => {
    const nummer = (gezaehlt.get(teil.art) ?? 0) + 1
    gezaehlt.set(teil.art, nummer)
    return (anzahl.get(teil.art) ?? 0) > 1 ? nummer : null
  })
}

/** Die Arten, die das Modal mit „+ …" anbietet (Artboard 2a, Vorgaben §3.5). Nachname und Vatersname nicht:
 * der Nachname hat immer eine Zeile, der Vatersname folgt mit den Teilen im Detail (V-130-11-zuschnitt, 11c-3). */
export const NEU_ANLEGBARE_ARTEN = ['vorname', 'praefix', 'suffix', 'titel'] as const

/** i18n-Schlüssel der Schaltfläche „+ …" einer anlegbaren Art. */
export function namensteilNeuSchluessel(art: (typeof NEU_ANLEGBARE_ARTEN)[number]): string {
  switch (art) {
    case 'vorname':
      return 'namensteil_neu_vorname'
    case 'praefix':
      return 'namensteil_neu_praefix'
    case 'suffix':
      return 'namensteil_neu_suffix'
    case 'titel':
      return 'namensteil_neu_titel'
  }
}

/** i18n-Schlüssel einer Reihenfolge; `null` = nicht angegeben (angezeigt wie Vorname → Nachname). */
export function reihenfolgeSchluessel(reihenfolge: NameFormReihenfolge | null): string {
  switch (reihenfolge) {
    case null:
      return 'reihenfolge_unbestimmt'
    case 'vorname_zuerst':
      return 'reihenfolge_vorname_zuerst'
    case 'nachname_zuerst':
      return 'reihenfolge_nachname_zuerst'
  }
}

/** i18n-Schlüssel der Kennzeichnung einer Umschrift (E6: automatisch bzw. selbst eingetragen). */
export function umschriftNormSchluessel(norm: UmschriftNorm): string {
  switch (norm) {
    case 'iso9':
      return 'umschrift_norm_iso9'
    case 'din1460':
      return 'umschrift_norm_din1460'
    case 'manuell':
      return 'umschrift_norm_manuell'
  }
}

/** Die Sprachen, die das Modal zur Wahl stellt: die mit eigener Beschriftung, dazu die gespeicherte Sprache
 * der Form, falls sie eine andere ist (sonst ginge sie beim Öffnen als Auswahl verloren). */
export function spracheOptionen(aktuell: string | null): readonly string[] {
  const bekannt = Object.keys(VORSCHAU_SPRACHE_SCHLUESSEL)
  return aktuell === null || bekannt.includes(aktuell) ? bekannt : [...bekannt, aktuell]
}
