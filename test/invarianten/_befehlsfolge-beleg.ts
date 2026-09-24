// AP-1.34 PR-B2 — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025). Beleg-Teil des Befehlsfolge-
// Generators (`_befehlsfolge-generator.ts`): Transkripte, Textanker (B-01, §31 U-1.34-E4/F4) und
// `feld` (§31 U-1.34-F1/C1b-feld-praedikat) für `aussage_zitat.anlegen`/`.aendern` und
// `zitat.aendern`. Ausgelagert, damit der Generator nicht weiter wächst; dieses Modul importiert den
// Generator NICHT (keine Zyklen) — was es vom Generatorzustand braucht, beschreibt `BelegZustand`
// strukturell.
//
// TRANSKRIPTE: `fc.string()` liefert unter fast-check 4 nur druckbares ASCII — ein Anker über „ä",
// „ß", „Ё", „ł" oder ein Emoji (UTF-16-Ersatzpaar, F4) käme so nie vor. `transkriptArbitrary()` baut
// Transkripte darum aus festen Bausteinen: ASCII, Apostroph (O'Brien), Umlaute, Kyrillisch,
// Polnisch, „é“, ein Emoji aus EINEM Ersatzpaar (👶) und eine ZWJ-Folge aus DREI
// Ersatzpaaren (👨‍👩‍👧). Bewusst KEINE einsamen Surrogate: better-sqlite3 ersetzt sie beim Schreiben
// durch U+FFFD (lokal geprüft, AP-1.34 PR-B2) — ein solches Transkript käme verändert zurück, und die
// einzige F4-Regel, die nur mit ihnen erreichbar ist (eine Grenze teilt im NEUEN Transkript ein
// Paar, §31 U-1.34-E4), ist über die Datenbank ohnehin nicht herstellbar.
import fc from 'fast-check'

/** Die Bausteine der Transkripte (s. Modul-Kommentar). */
const TRANSKRIPT_BAUSTEINE: readonly string[] = ['a', 'Z', ' ', "'", 'ä', 'ß', 'Ё', 'ł', 'é', '👶', '👨‍👩‍👧']

/** Ein Transkript aus 0 bis 12 Bausteinen (auch leer). */
export function transkriptArbitrary(): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...TRANSKRIPT_BAUSTEINE), { minLength: 0, maxLength: 12 })
    .map((teile) => teile.join(''))
}
