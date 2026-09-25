// AP-1.30 PR 2 (docs/80_Offene_Fragen.md §32 V-4-ohne-namen): EINE Stelle entscheidet, was der
// Renderer für einen Personen-Anzeigenamen zeigt — Platzhalter (A-17) „Platzhalter", eine Person
// ohne Namensform (Anzeigename leer oder nur Leerraum) „(ohne Namen)", sonst den Namen. Die
// Abfragen liefern weiter `''` (sichtbare Texte gehören in den Renderer, ADR-011). Reines
// TypeScript ohne i18next (Muster `lebensdaten-anzeige.ts`): der Aufrufer reicht seinen Übersetzer
// für den Namensraum `allgemein` herein.

/** Schlüssel der Ersatztexte in `src/shared/i18n/de/allgemein.json`. */
export const PERSONENNAME_SCHLUESSEL = {
  platzhalter: 'person_platzhalter',
  ohne_namen: 'person_ohne_namen',
} as const

export type PersonennameSchluessel = (typeof PERSONENNAME_SCHLUESSEL)[keyof typeof PERSONENNAME_SCHLUESSEL]

/** Was eine Aufrufstelle über die Person weiß. `ist_platzhalter` fehlt, wo der Vertrag es nicht
 * trägt (Prüfhinweise schließen Platzhalter ohnehin aus, der Informant einer Quelle kennt es nicht). */
export interface PersonennameEingabe {
  readonly anzeigename: string
  readonly ist_platzhalter?: boolean
}

export type PersonennameAnzeige =
  | { readonly art: 'name'; readonly text: string }
  | { readonly art: 'platzhalter'; readonly schluessel: typeof PERSONENNAME_SCHLUESSEL.platzhalter }
  | { readonly art: 'ohne_namen'; readonly schluessel: typeof PERSONENNAME_SCHLUESSEL.ohne_namen }

export function personennameAnzeige(person: PersonennameEingabe): PersonennameAnzeige {
  // Platzhalter zeigen nie einen Namen (A-17), auch wenn der Vertrag einen liefert.
  if (person.ist_platzhalter === true) return { art: 'platzhalter', schluessel: PERSONENNAME_SCHLUESSEL.platzhalter }
  if (person.anzeigename.trim() === '') return { art: 'ohne_namen', schluessel: PERSONENNAME_SCHLUESSEL.ohne_namen }
  return { art: 'name', text: person.anzeigename }
}

/** Sichtbarer Text; `t` ist der Übersetzer des Namensraums `allgemein`. */
export function personennameText(person: PersonennameEingabe, t: (schluessel: string) => string): string {
  const anzeige = personennameAnzeige(person)
  return anzeige.art === 'name' ? anzeige.text : t(anzeige.schluessel)
}

/** `true`, wenn statt eines Namens ein Ersatztext steht — die Aufrufstelle setzt ihn dann als
 * Hilfstext (`--wz-text-tertiaer`, docs/71_Designsystem.md: „Hilfetexte, Zähler, Platzhaltertexte"). */
export function personennameIstErsatz(person: PersonennameEingabe): boolean {
  return personennameAnzeige(person).art !== 'name'
}
