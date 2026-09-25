// AP-1.30 PR 6: relative Zeitangabe für den `Speicherstatus` („Gespeichert · gerade eben").
// Reine Funktion über zwei übergebene Zeitpunkte (Millisekunden seit Epoche) — der Baustein liest
// nie selbst die Uhr, damit Einheitstest und Bildvergleich deterministisch sind. Den Zeitpunkt
// `jetzt` liefert der Aufrufer (im Renderer z. B. aus einem Minutentakt).

const MINUTE_MS = 60_000
const STUNDE_MS = 60 * MINUTE_MS

export type RelativeSpeicherzeit =
  | { readonly art: 'gerade_eben' }
  | { readonly art: 'minuten'; readonly anzahl: number }
  | { readonly art: 'stunden'; readonly anzahl: number }

/** Unter einer Minute (auch bei einem Zeitpunkt in der Zukunft, z. B. nach einem Uhrensprung):
 * „gerade eben"; danach ganze Minuten bzw. ab einer Stunde ganze Stunden, jeweils abgerundet. */
export function relativeSpeicherzeit(gespeichertUm: number, jetzt: number): RelativeSpeicherzeit {
  const abstand = jetzt - gespeichertUm
  if (abstand < MINUTE_MS) return { art: 'gerade_eben' }
  if (abstand < STUNDE_MS) return { art: 'minuten', anzahl: Math.floor(abstand / MINUTE_MS) }
  return { art: 'stunden', anzahl: Math.floor(abstand / STUNDE_MS) }
}
