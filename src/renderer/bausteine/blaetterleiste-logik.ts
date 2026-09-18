// AP-1.6 Stufe 3 (C-16): reine Anzeigelogik der `Blaetterleiste` (docs/71_Designsystem.md §2.2)
// — von der eigentlichen Komponente getrennt, damit sie ohne React/DOM getestet werden kann
// (CLAUDE.md §5: „wo reine Logik steckt, einen kleinen Einheitstest ergänzen").
export interface BlaetterleisteZustand {
  readonly seite: number
  readonly proSeite: number
  readonly gesamt: number
}

export interface BlaetterleisteAnzeige {
  /** Mindestens 1, auch wenn `gesamt === 0` — eine leere Liste hat trotzdem „Seite 1 von 1". */
  readonly gesamtSeiten: number
  /** 1-basierter Index des ersten angezeigten Treffers, 0 wenn `gesamt === 0`. */
  readonly von: number
  /** 1-basierter Index des letzten angezeigten Treffers, 0 wenn `gesamt === 0`. */
  readonly bis: number
  readonly zurueckMoeglich: boolean
  readonly vorMoeglich: boolean
}

/**
 * Berechnet die Anzeigewerte der Blätterleiste aus `seite`/`proSeite`/`gesamt`
 * (`src/shared/schemata/person-liste.ts` — `PersonListeEin`). Reine Funktion: kein `Date.now`,
 * kein `Math.random`, keine Rundungsüberraschung bei `gesamt === 0`.
 */
export function blaetterleisteBerechnen({ seite, proSeite, gesamt }: BlaetterleisteZustand): BlaetterleisteAnzeige {
  const gesamtSeiten = gesamt === 0 ? 1 : Math.ceil(gesamt / proSeite)
  const von = gesamt === 0 ? 0 : (seite - 1) * proSeite + 1
  const bis = gesamt === 0 ? 0 : Math.min(seite * proSeite, gesamt)
  return {
    gesamtSeiten,
    von,
    bis,
    zurueckMoeglich: seite > 1,
    vorMoeglich: seite < gesamtSeiten,
  }
}
