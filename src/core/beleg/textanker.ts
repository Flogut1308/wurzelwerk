// AP-1.34 PR-C1a (B-01): Textanker eines Belegs (`aussage_zitat.textanker_von/_bis`,
// docs/schema/0007_kennung_textanker.sql). Ein Anker ist ein halboffenes Intervall [von, bis) in
// UTF-16-Codeeinheiten des Zitat-Transkripts — genau der JavaScript-String-Index, darum ohne
// Umrechnung `transkript.slice(von, bis)`.
//
// Regeln (docs/80_Offene_Fragen.md §31):
// - F4 (Nutzer 24.09.2026): keine Grenze darf ein UTF-16-Ersatzpaar teilen.
// - E4: ein Anker bleibt bei einer Transkriptänderung genau dann, wenn Position UND Text des
//   Ausschnitts gleich bleiben — kein Suchen, kein Verschieben.
//
// Reine Funktionen (CLAUDE.md §4: kein Date.now/Math.random/process/globalThis in src/core).

/** Ergebnis von `ankerPruefen()`. `ok` ist der einzige Wert, der gespeichert werden darf. */
export type AnkerPruefung = 'ok' | 'kein_transkript' | 'ausserhalb' | 'leer_oder_verkehrt' | 'teilt_ersatzpaar'

function istHighSurrogate(einheit: number): boolean {
  return einheit >= 0xd800 && einheit <= 0xdbff
}

function istLowSurrogate(einheit: number): boolean {
  return einheit >= 0xdc00 && einheit <= 0xdfff
}

/** `true`, wenn die Grenze `index` zwischen High- und Low-Surrogate eines Ersatzpaares liegt. */
function teiltErsatzpaar(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) {
    return false
  }
  return istHighSurrogate(text.charCodeAt(index - 1)) && istLowSurrogate(text.charCodeAt(index))
}

/** Prüft einen Anker [von, bis) gegen ein Transkript. Reihenfolge der Prüfungen: Transkript
 * vorhanden, nicht leer/verkehrt, innerhalb, kein geteiltes Ersatzpaar. */
export function ankerPruefen(transkript: string | null, von: number, bis: number): AnkerPruefung {
  if (transkript === null) {
    return 'kein_transkript'
  }
  if (von >= bis) {
    return 'leer_oder_verkehrt'
  }
  if (!Number.isInteger(von) || !Number.isInteger(bis) || von < 0 || bis > transkript.length) {
    return 'ausserhalb'
  }
  if (teiltErsatzpaar(transkript, von) || teiltErsatzpaar(transkript, bis)) {
    return 'teilt_ersatzpaar'
  }
  return 'ok'
}

/** Der Ausschnitt [von, bis) des Transkripts oder `null`, wenn der Anker nicht `ok` wäre. */
export function ausschnitt(transkript: string | null, von: number, bis: number): string | null {
  if (transkript === null || ankerPruefen(transkript, von, bis) !== 'ok') {
    return null
  }
  return transkript.slice(von, bis)
}

/**
 * E4: bleibt der Anker [von, bis) gültig, wenn das Transkript von `alt` zu `neu` wechselt?
 * Genau dann, wenn `neu` nicht NULL ist, der Anker in `neu` gültig ist (insbesondere
 * `bis <= neu.length`, F4) und der Ausschnitt an derselben Position textgleich ist.
 */
export function ankerBleibt(alt: string | null, neu: string | null, von: number, bis: number): boolean {
  const vorher = ausschnitt(alt, von, bis)
  const nachher = ausschnitt(neu, von, bis)
  return vorher !== null && nachher !== null && vorher === nachher
}
