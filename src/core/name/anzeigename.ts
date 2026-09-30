// AP-1.33: der eine kanonische Anzeigename über MEHRERE Namensformen einer Person (name_form +
// name_part). Reine Funktion, KEIN Node/SQL/shared (CLAUDE.md §2/§4: kein Date.now/Math.random). Die
// Rückfallkette ist: gewünschte Sprache → Umschrift der Hauptform (umschrift_von = Hauptform, mit
// Anzeigetext; Eigentümer 25.09.2026) → Hauptname (ist_bevorzugt). `text` ist ein zusammengesetzter
// Anzeigestring aus den Bestandteilen; die endgültige, i18n-abhängige Formatierung (Rufname hervorheben o. Ä.) bleibt dem Renderer über
// `anzeige.ts` (Segment-Builder) vorbehalten — dieses Modul liefert den flachen Text + die Herkunft.
import type { NameFormReihenfolge, NamePartArt } from './typen'
import { NAME_PART_ART_REIHENFOLGE, rekonstruiereFlach, type GeladenerTeil, type RekonstruierterName } from './zerlegung'

/** Eine geladene Namensform mit ihren Bestandteilen — Eingabe (bereits aus der DB geladen). */
export interface AnzeigeForm {
  readonly formId: string
  readonly sprache: string | null
  readonly schrift: string | null
  readonly istBevorzugt: boolean
  readonly umschriftVon: string | null
  readonly originalText: string | null
  /** `name_form.reihenfolge` (AP-1.30 PR 11-1, V-130-11-E2/E3). Optional: fehlt sie oder ist sie
   * `null`, gilt die bisherige Wortfolge bitgleich. */
  readonly reihenfolge?: NameFormReihenfolge | null
  readonly teile: readonly GeladenerTeil[]
}

export type AnzeigenameQuelle = 'sprache' | 'umschrift' | 'hauptname'

export interface AnzeigenameErgebnis {
  readonly text: string
  readonly quelle: AnzeigenameQuelle
  readonly formId: string
}

/** Baut den flachen Anzeigetext einer Form: Titel Vornamen Vatersname Präfix Nachname Zusatz
 * (Leerzeichen-getrennt; Vatersname zwischen Vornamen und Nachname, „Iwan Petrowitsch Iwanow",
 * Eigentümer 25.09.2026), oder `original_text`, falls keine Bestandteile vorliegen. Exportiert, weil auch die
 * Kernangabe `name` („vorhanden" = die Hauptform hat Anzeigetext, Nachtrag ADR-031) genau diese
 * Textregel braucht — keine zweite.
 *
 * AP-1.30 PR 11-1 (V-130-11-E2/E3; Vorgaben §8, Abnahme 2a): bei `reihenfolge = 'nachname_zuerst'`
 * lautet die Folge Titel Präfix Nachname Vornamen Vatersname Zusatz (ossetisch „Гуытнаты Карл"). Bei
 * `null`, fehlender Reihenfolge oder `'vorname_zuerst'` bleibt die obige Folge bitgleich.
 * `original_text` ist wortgetreu gespeichert und wird nie umgestellt. */
export function anzeigetextVon(form: Pick<AnzeigeForm, 'teile' | 'originalText' | 'reihenfolge'>): string {
  const flach = rekonstruiereFlach(form.teile)
  const folge = anzeigeArtFolge(form.reihenfolge).map((art) => flachesFeld(flach, art))
  const segmente = folge.filter((segment): segment is string => segment !== null && segment.trim() !== '')
  const zusammengesetzt = segmente.join(' ').trim()
  if (zusammengesetzt !== '') return zusammengesetzt
  return form.originalText ?? ''
}

/** Wortfolge bei `reihenfolge = 'nachname_zuerst'` (V-130-11-E3). */
const ART_FOLGE_NACHNAME_ZUERST: readonly NamePartArt[] = ['titel', 'praefix', 'nachname', 'vorname', 'vatersname', 'suffix']

/**
 * Die Folge der Bestandteil-Arten im Anzeigetext einer Form (AP-1.30 PR 11c-1, V-130-11-E3): bei
 * `nachname_zuerst` Titel, Präfix, Nachname, Vornamen, Vatersname, Zusatz, sonst (NULL, fehlend,
 * `vorname_zuerst`) die Folge `NAME_PART_ART_REIHENFOLGE`. Exportiert, damit die Karten im Reiter „Namen"
 * die Teile in derselben Folge zeigen, in der `anzeigetextVon` sie verbindet — die Regel gibt es einmal.
 */
export function anzeigeArtFolge(reihenfolge: NameFormReihenfolge | null | undefined): readonly NamePartArt[] {
  return reihenfolge === 'nachname_zuerst' ? ART_FOLGE_NACHNAME_ZUERST : NAME_PART_ART_REIHENFOLGE
}

/** Das flache Feld einer Art in der Rekonstruktion. */
function flachesFeld(flach: RekonstruierterName, art: NamePartArt): string | null {
  switch (art) {
    case 'titel':
      return flach.titelVor
    case 'vorname':
      return flach.vornamen
    case 'vatersname':
      return flach.vatersname
    case 'praefix':
      return flach.praefix
    case 'nachname':
      return flach.nachname
    case 'suffix':
      return flach.zusatzNach
  }
}

/** Hat die Form einen nicht-leeren Anzeigetext? Die Kernangabe `name` gilt genau dann als vorhanden
 * (Nachtrag ADR-031, §32 V-D1-name-vorhanden) — hier im Kern, damit kein Leser die Regel nachbaut. */
export function hatAnzeigetext(form: Pick<AnzeigeForm, 'teile' | 'originalText'>): boolean {
  return anzeigetextVon(form).trim() !== ''
}

/**
 * Sortiername einer Form: `"Nachname, Vornamen"` — das Präfix (van/von/zu) zählt bewusst NICHT mit
 * (E-Namensregeln: „von Gutnoff" sortiert unter „G"). Ohne Nachname bleibt es bei den Vornamen.
 */
export function sortierName(form: AnzeigeForm): string {
  const flach = rekonstruiereFlach(form.teile)
  if (flach.nachname !== null && flach.nachname.trim() !== '') {
    return flach.vornamen !== null && flach.vornamen.trim() !== '' ? `${flach.nachname}, ${flach.vornamen}` : flach.nachname
  }
  return flach.vornamen ?? (form.originalText ?? '')
}

/**
 * Wählt aus allen Formen einer Person die anzuzeigende nach der Rückfallkette Sprache → Umschrift →
 * Hauptname und liefert `{ text, quelle, formId }`. `null`, wenn die Person gar keine Form hat.
 * Die Umschrift-Stufe zählt nur eine Umschrift der Hauptform mit Anzeigetext; die Umschrift einer
 * Nebenform oder eine leere Umschrift verdrängt den Hauptnamen nicht (docs/80 §32 V-4-umschrift).
 * `wunschSprache` steuert die erste Stufe (z. B. die UI-Sprache); fehlt sie oder gibt es keine
 * passende Form, wird sie übersprungen.
 */
export function anzeigenameFuer(formen: readonly AnzeigeForm[], wunschSprache?: string): AnzeigenameErgebnis | null {
  if (formen.length === 0) return null

  if (wunschSprache !== undefined) {
    const sprachTreffer = [...formen].filter((form) => form.sprache === wunschSprache).sort(vergleiche)[0]
    if (sprachTreffer !== undefined) {
      return { text: anzeigetextVon(sprachTreffer), quelle: 'sprache', formId: sprachTreffer.formId }
    }
  }

  const hauptname = [...formen].sort(vergleiche)[0]
  if (hauptname === undefined) return null

  // Eigentümer 25.09.2026 (docs/80 §32 V-4-umschrift-nebenform/-leer): nur eine Umschrift DER
  // Hauptform mit Anzeigetext verdrängt den Hauptnamen — nicht die Umschrift einer Nebenform, nicht
  // eine leere Umschrift. Hauptform ist die Form, die sonst Stufe 3 wählt (§32 V-4b-hauptform); ein
  // Selbstverweis (umschrift_von = eigene id, vom Schema nicht verhindert) macht sie nicht zu ihrer
  // eigenen Umschrift.
  const umschrift = formen
    .filter((form) => form.formId !== hauptname.formId && form.umschriftVon === hauptname.formId && hatAnzeigetext(form))
    .sort(vergleiche)[0]
  if (umschrift !== undefined) {
    return { text: anzeigetextVon(umschrift), quelle: 'umschrift', formId: umschrift.formId }
  }

  return { text: anzeigetextVon(hauptname), quelle: 'hauptname', formId: hauptname.formId }
}

/** Deterministische Reihung: bevorzugte Form zuerst, dann stabil nach `formId`. */
function vergleiche(a: AnzeigeForm, b: AnzeigeForm): number {
  const rang = (a.istBevorzugt ? 0 : 1) - (b.istBevorzugt ? 0 : 1)
  if (rang !== 0) return rang
  return a.formId < b.formId ? -1 : a.formId > b.formId ? 1 : 0
}
