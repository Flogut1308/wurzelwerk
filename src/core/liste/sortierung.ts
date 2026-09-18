// AP-1.6 PR1, Entscheidung A (freigegeben): eigene Kollation für die Personenliste
// (`abfrage:person.liste`, C-16/C-17/A-19). `person_flach.sortier_nachname`/`sortier_vornamen`
// (suchnormalform(), src/core/name/suchnormalform.ts) entfernen Diakritika VOLLSTÄNDIG (NFD +
// Diakritika-Entfernung) — "Müller" würde dadurch zu "muller" und wäre von "Mueller" ("mueller")
// nicht mehr unterscheidbar bzw. läge nicht mehr direkt daneben. Für die Personenliste ist das
// falsch: Entscheidung A schreibt Umlaute stattdessen AUS (ü→ue, ö→oe, ä→ae, ß→ss), damit "Müller"
// und "Mueller" auf denselben Sortierschlüssel fallen und direkt nebeneinanderstehen — und bei
// sonst gleichem Schlüssel steht die Umlautform VOR der ausgeschriebenen Form (Tie-Break: Umlaut <
// ASCII). Zielreihenfolge: Müller → Mueller → Nagel.
//
// Reine, deterministische Funktionen (CLAUDE.md §4: kein Date.now/Math.random/process/globalThis
// in src/core) — dieselbe Eingabe liefert immer dieselbe Ausgabe.

const UMLAUT_AUSSCHREIBEN: ReadonlyMap<string, string> = new Map([
  ['ä', 'ae'],
  ['ö', 'oe'],
  ['ü', 'ue'],
  ['ß', 'ss'],
  ['Ä', 'ae'],
  ['Ö', 'oe'],
  ['Ü', 'ue'],
])

/** Enthält `name` mindestens ein rohes Umlaut-/ß-Zeichen (vor dem Ausschreiben)? Grundlage des
 * Tie-Breaks: bei gleichem `sortierschluessel()` gewinnt die Form, die dieses Zeichen noch trägt. */
function enthaeltUmlaut(name: string): boolean {
  for (const zeichen of name) {
    if (UMLAUT_AUSSCHREIBEN.has(zeichen)) return true
  }
  return false
}

/**
 * Sortierschlüssel für die Personenliste (Entscheidung A): Umlaute/ß ausgeschrieben, kleingeschrieben.
 * `suchnormalform()` (src/core/name/suchnormalform.ts) bleibt für die Suche zuständig (dort ist
 * "so viel wie möglich zusammenfassen" richtig) — hier ist "Umlautform und ausgeschriebene Form
 * bleiben direkt benachbart" das Ziel, kein Schriftsystem-Transfer.
 */
export function sortierschluessel(name: string): string {
  let ausgeschrieben = ''
  for (const zeichen of name) {
    ausgeschrieben += UMLAUT_AUSSCHREIBEN.get(zeichen) ?? zeichen
  }
  return ausgeschrieben.toLowerCase()
}

/**
 * Vergleicht zwei Namen nach Entscheidung A: primär nach `sortierschluessel()`, bei Gleichstand
 * nach dem Umlaut-Tie-Break (Umlautform < ausgeschriebene Form). Liefert `< 0`, `0` oder `> 0` wie
 * ein gewöhnlicher `Array.prototype.sort`-Vergleicher.
 */
export function vergleicheNamen(a: string, b: string): number {
  const schluesselA = sortierschluessel(a)
  const schluesselB = sortierschluessel(b)
  if (schluesselA !== schluesselB) {
    return schluesselA < schluesselB ? -1 : 1
  }
  const umlautA = enthaeltUmlaut(a)
  const umlautB = enthaeltUmlaut(b)
  if (umlautA !== umlautB) {
    return umlautA ? -1 : 1
  }
  return 0
}
