// AP-1.30 PR 11b (A-02, C-26; docs/80 §33 V-130-11b): reine Logik des Vorschau-Umschalters im Reiter
// „Namen" (Artboard 2a, Entwicklungsvorgaben §3.5 „Vorschau-Umschalter"). Reines TypeScript ohne React
// und ohne i18next (Muster `reiter-person-logik.ts`): der Aufrufer reicht seinen Übersetzer herein.
//
// Die Rückfallkette Sprache → Umschrift → Hauptname gibt es genau einmal, in `anzeigenameFuer`
// (src/core/name/anzeigename.ts, AP-1.33). Dieses Modul bildet nur das Lesemodell auf deren Eingabe ab
// und wählt die Wunschsprache — es entscheidet keine Stufe selbst.
import { anzeigenameFuer, type AnzeigeForm, type AnzeigenameErgebnis, type AnzeigenameQuelle } from '../../../core/name/anzeigename'
import type { NameFormReihenfolge } from '../../../core/name/typen'
import type { PersonDetailName } from '../../../shared/schemata/person-detail'

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
