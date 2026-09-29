// AP-1.30 U-130-9b-unlesbar (docs/80 §33 V-130-unlesbar, Entscheidung B): erkennt in einem Text,
// den `parse()` nicht auflösen kann, eine vierstellige Jahreszahl — Grundlage für das Angebot „als
// ‚etwa JJJJ‘ mit Originaltext speichern". Bewusst KEIN Teil von `parse()` (kein Parser-Umbau): das
// Ergebnis ist ein Vorschlag, den die Nutzerin bestätigt, keine Deutung des Texts.

/** Kleinstes und größtes Jahr, das als plausible Jahreszahl gilt (genealogischer Rahmen). */
const JAHR_MIN = 1000
const JAHR_MAX = 2999

/** Genau vier Ziffern, nicht Teil einer längeren Ziffernfolge. */
const MUSTER_VIERSTELLIG = /(?<!\d)\d{4}(?!\d)/gu

/**
 * Erstes plausibles Jahr (1000–2999) im Text, als freistehende vierstellige Zahl; `undefined`, wenn
 * es keines gibt. Rein und deterministisch, wirft nie.
 */
export function erkennbaresJahr(text: string): number | undefined {
  for (const treffer of text.matchAll(MUSTER_VIERSTELLIG)) {
    const jahr = Number(treffer[0])
    if (jahr >= JAHR_MIN && jahr <= JAHR_MAX) return jahr
  }
  return undefined
}
