// A-02, AP-1.30 (Folgepunkt U-130-rufname-doppelt, docs/80 §33): Erkennung des Falls, in dem
// `zerlegeName` (zerlegung.ts, Regel 3 — bitgleich zu Migration 0006 (c)) einen mehrwortigen Rufnamen
// ANHÄNGEN würde, obwohl seine Wörter schon als zusammenhängende Folge in den Vornamen stehen:
// „Hans Peter" + Rufname „Hans Peter" -> „Hans Peter Hans Peter". `zerlegeName` selbst bleibt
// unverändert (wie ein mehrteiliger Rufname zu modellieren ist, ist eine offene Eigentümerfrage,
// U-130-rufname-mehrteilig); die Schreibwege weisen den Fall stattdessen SICHTBAR ab
// (`name.anlegen`/`name.aendern`: `VALIDIERUNG_RUFNAME_VERDOPPELT`; Import: Prüfhinweis IMP-311).
// Reines TypeScript, kein Node/SQL/shared-Import (CLAUDE.md §2).
import type { FlacherName } from './zerlegung'

function woerter(text: string | null | undefined): readonly string[] {
  if (text === null || text === undefined) return []
  return text
    .trim()
    .split(/\s+/u)
    .filter((wort) => wort.length > 0)
}

/** `true`, wenn `folge` als zusammenhängende Teilfolge in `kette` vorkommt. */
function enthaeltFolge(kette: readonly string[], folge: readonly string[]): boolean {
  for (let start = 0; start + folge.length <= kette.length; start += 1) {
    if (folge.every((wort, i) => kette[start + i] === wort)) return true
  }
  return false
}

/**
 * `true` genau dann, wenn
 *  1. kein gültiger `rufnameIndex` vorliegt (fehlt, ist negativ oder zeigt hinter die Vornamen — dann
 *     gewänne in `zerlegeName` Regel 1 und nichts würde angehängt),
 *  2. `rufnameText` nach Leerraum-Normierung aus MINDESTENS ZWEI Wörtern besteht (ein einwortiger
 *     Rufname, der einem Vornamen gleicht, wird von Regel 2 markiert, nicht angehängt), und
 *  3. diese Wörter als zusammenhängende Folge in derselben Reihenfolge in den Vornamen stehen.
 * Verglichen wird wortweise und exakt (kein Teilwort: „Hans Peter" steht nicht in „Hans Peterson").
 */
export function rufnameWuerdeVerdoppelt(flach: FlacherName): boolean {
  const vornamen = woerter(flach.vornamen)
  const index = flach.rufnameIndex
  if (index !== null && index !== undefined && index >= 0 && index < vornamen.length) return false
  const rufname = woerter(flach.rufnameText)
  if (rufname.length < 2) return false
  return enthaeltFolge(vornamen, rufname)
}
