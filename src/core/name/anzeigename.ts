// AP-1.33: der eine kanonische Anzeigename über MEHRERE Namensformen einer Person (name_form +
// name_part). Reine Funktion, KEIN Node/SQL/shared (CLAUDE.md §2/§4: kein Date.now/Math.random). Die
// Rückfallkette ist: gewünschte Sprache → lateinische Umschrift (umschrift_von gesetzt) → Hauptname
// (ist_bevorzugt). `text` ist ein zusammengesetzter Anzeigestring aus den Bestandteilen; die
// endgültige, i18n-abhängige Formatierung (Rufname hervorheben o. Ä.) bleibt dem Renderer über
// `anzeige.ts` (Segment-Builder) vorbehalten — dieses Modul liefert den flachen Text + die Herkunft.
import { rekonstruiereFlach, type GeladenerTeil } from './zerlegung'

/** Eine geladene Namensform mit ihren Bestandteilen — Eingabe (bereits aus der DB geladen). */
export interface AnzeigeForm {
  readonly formId: string
  readonly sprache: string | null
  readonly schrift: string | null
  readonly istBevorzugt: boolean
  readonly umschriftVon: string | null
  readonly originalText: string | null
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
 * Textregel braucht — keine zweite. */
export function anzeigetextVon(form: Pick<AnzeigeForm, 'teile' | 'originalText'>): string {
  const flach = rekonstruiereFlach(form.teile)
  const segmente = [flach.titelVor, flach.vornamen, flach.vatersname, flach.praefix, flach.nachname, flach.zusatzNach].filter(
    (segment): segment is string => segment !== null && segment.trim() !== '',
  )
  const zusammengesetzt = segmente.join(' ').trim()
  if (zusammengesetzt !== '') return zusammengesetzt
  return form.originalText ?? ''
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

  const umschrift = [...formen].filter((form) => form.umschriftVon !== null).sort(vergleiche)[0]
  if (umschrift !== undefined) {
    return { text: anzeigetextVon(umschrift), quelle: 'umschrift', formId: umschrift.formId }
  }

  const hauptname = [...formen].sort(vergleiche)[0]
  if (hauptname === undefined) return null
  return { text: anzeigetextVon(hauptname), quelle: 'hauptname', formId: hauptname.formId }
}

/** Deterministische Reihung: bevorzugte Form zuerst, dann stabil nach `formId`. */
function vergleiche(a: AnzeigeForm, b: AnzeigeForm): number {
  const rang = (a.istBevorzugt ? 0 : 1) - (b.istBevorzugt ? 0 : 1)
  if (rang !== 0) return rang
  return a.formId < b.formId ? -1 : a.formId > b.formId ? 1 : 0
}
