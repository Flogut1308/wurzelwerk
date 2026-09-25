// AP-1.34 PR-C2c (docs/80_Offene_Fragen.md §31 U-1.34-C2-O2, Nutzer 25.09.2026): Verteilung der
// Eltern einer Person auf die zwei Elternplätze der Bearbeitungsansicht (Vorgaben §3.2: Zeilen
// Vater/Mutter). Genutzt von der Regel „Elternteil nicht zugeordnet" (./offene-punkte.ts) und von
// PR-D (Kernangaben Vater und Mutter getrennt, U-1.34-E7).
//
// Regel:
// 1. Geschlecht M belegt den Vaterplatz, F den Mutterplatz — je der erste (kleinste `id`).
// 2. Jeder weitere Elternteil (ein zweites M/F, U, X oder ohne Geschlecht) ist „frei" und füllt
//    einen freien Platz: reichen die freien Elternteile für alle freien Plätze, werden sie in
//    `id`-Reihenfolge erst dem Vater-, dann dem Mutterplatz zugewiesen.
// 3. Zwei freie Plätze, aber nur EIN freier Elternteil: welcher Platz fehlt, ist unbestimmbar —
//    der Elternteil steht in `unbestimmt`, offen ist genau ein `elternteil`.
// 4. Mehr Eltern als Plätze: der Rest steht in `ueberzaehlig` (keine dritte Platzart).
//
// Jeder Elternschaftstyp zählt, ein Platzhalter-Elternteil gilt als zugeordnet (U-1.34-E6) —
// darum kennt die Eingabe weder Typ noch Platzhalterflag.
//
// Rein (CLAUDE.md §4): kein Date/Math.random/process/globalThis, keine Mutation der Eingabe.

/** Geschlecht wie `person.geschlecht` (docs/schema/0002_kern.sql) — core-lokal, kein Import aus shared. */
export type ElternGeschlecht = 'M' | 'F' | 'U' | 'X'

export interface ElternteilEintrag {
  readonly id: string
  readonly geschlecht: ElternGeschlecht | null
}

/** Ein leerer Elternplatz; `elternteil` = unbestimmbar, ob Vater oder Mutter fehlt. */
export const ELTERN_PLATZ_OFFEN = ['vater', 'mutter', 'elternteil'] as const

export type ElternPlatzOffen = (typeof ELTERN_PLATZ_OFFEN)[number]

export interface ElternPlaetze {
  readonly vater: string | null
  readonly mutter: string | null
  /** Der eine Elternteil, dessen Platz unbestimmbar ist (Regel 3), sonst `null`. */
  readonly unbestimmt: string | null
  readonly ueberzaehlig: readonly string[]
  /** In fester Reihenfolge `vater`, `mutter` bzw. genau `elternteil`. */
  readonly offen: readonly ElternPlatzOffen[]
}

function nachId(a: ElternteilEintrag, b: ElternteilEintrag): number {
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}

export function elternPlaetze(eltern: readonly ElternteilEintrag[]): ElternPlaetze {
  // Doppelte Kanten zu derselben Person (z. B. biologisch UND adoptiv) sind EIN Elternteil.
  const eindeutig = [...new Map(eltern.map((e) => [e.id, e])).values()].sort(nachId)

  let vater: string | null = null
  let mutter: string | null = null
  const frei: string[] = []
  for (const eintrag of eindeutig) {
    if (eintrag.geschlecht === 'M' && vater === null) vater = eintrag.id
    else if (eintrag.geschlecht === 'F' && mutter === null) mutter = eintrag.id
    else frei.push(eintrag.id)
  }

  const freiePlaetze = (vater === null ? 1 : 0) + (mutter === null ? 1 : 0)
  if (freiePlaetze === 2 && frei.length === 1) {
    return { vater: null, mutter: null, unbestimmt: frei[0] ?? null, ueberzaehlig: [], offen: ['elternteil'] }
  }

  const rest = [...frei]
  if (vater === null) vater = rest.shift() ?? null
  if (mutter === null) mutter = rest.shift() ?? null

  const offen: ElternPlatzOffen[] = []
  if (vater === null) offen.push('vater')
  if (mutter === null) offen.push('mutter')
  return { vater, mutter, unbestimmt: null, ueberzaehlig: rest, offen }
}
