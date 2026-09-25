// AP-1.34 PR-D (docs/adr/ADR-031-kernangaben-vollstaendigkeitsgrad.md, docs/80_Offene_Fragen.md §31
// U-1.34-E7, Entwicklungsvorgaben §3.1 „68 % der Kernangaben belegt", §4.1 `completeness`):
// Vollständigkeitsgrad einer Person — die EINZIGE Stelle, an der er berechnet wird. Renderer,
// Personenliste, Statistik und Export rechnen ihn nie selbst nach (ADR-031).
//
// Kernangaben und wann sie erfüllt sind (ADR-031, Details U-1.34-D1…D11):
// - name          immer; die Hauptform trägt eine Aussage mit mindestens einem Beleg (D3).
// - geschlecht    immer; M, F oder X — U und „nicht erfasst" zählen nicht, ein Beleg ist nicht nötig (E7, D4).
// - geburtsdatum  immer; es gibt eine Aussage mit Wert UND Beleg (D1, D2).
// - geburtsort    immer; wie geburtsdatum (auch eine Aussage nur mit freiem Text), kein Ereignis-Rückfall (D9).
// - todesdatum    nur bei `lebend_status = 'verstorben'` (D5); wie geburtsdatum.
// - todesort      nur bei `verstorben`. Gibt es eine todesort-Aussage mit Wert, entscheidet allein sie
//                 (belegt ⇒ erfüllt, auch nur Text — U-1.34-C2a-wert-text-verdraengt). Sonst zählt ein
//                 Tod-Ereignis mit Ort, dessen Ort belegt ist (D6, E5).
// - vater, mutter immer, zwei Angaben; Platz besetzt (`elternPlaetze`) UND die Kante belegt (D7).
//                 Ist nur ein Elternteil unbestimmbarer Zuordnung da, heißen beide Angaben `elternteil`:
//                 die erste erfüllt, wenn er belegt ist, die zweite nie (D8).
//
// Nenner 6 bzw. 8 (verstorben); Prozent abgerundet; Platzhalter → `null` (A-17, E7).
//
// Rein (CLAUDE.md §4): kein Date/Math.random/process/globalThis, keine Mutation der Eingabe.
import { elternPlaetze, type ElternGeschlecht, type ElternteilEintrag } from './eltern-plaetze'

/** Einzige Quelle der Kernangaben-Ids; `src/shared/schemata/person-detail.ts` baut sein Zod-Enum daraus.
 * Reihenfolge = Reihenfolge in `fehlend`. */
export const KERNANGABE_IDS = ['name', 'geschlecht', 'geburtsdatum', 'geburtsort', 'todesdatum', 'todesort', 'vater', 'mutter', 'elternteil'] as const

export type KernangabeId = (typeof KERNANGABE_IDS)[number]

export type KernangabenLebendStatus = 'lebend' | 'verstorben' | 'vermutet_verstorben'

/** Eine Personen-Aussage eines Prädikats: trägt sie einen Wert (`wert_text`/`wert_zahl`/
 * `wert_ref_id`/`datum_wert1`), und hat sie mindestens einen Beleg (`aussage_zitat`)? */
export interface KernAussage {
  readonly hatWert: boolean
  readonly belegt: boolean
}

/** Ein Tod-Ereignis der Person (Rolle `verstorbener`, der Aufrufer filtert). `ortBelegt`: die
 * Existenz-Aussage des Ereignisses hat einen Beleg für den Ort (Feld NULL oder `ort`). */
export interface KernTodEreignis {
  readonly ortVorhanden: boolean
  readonly ortBelegt: boolean
}

/** Eine Elternkante; `belegt` = eine Aussage an genau dieser Kante hat einen Beleg. Doppelkanten
 * (gleiche `id`) sind ein Elternteil — belegt, wenn eine der Kanten belegt ist. */
export interface KernElternteil extends ElternteilEintrag {
  readonly belegt: boolean
}

export interface KernangabenEingabe {
  readonly istPlatzhalter: boolean
  readonly lebendStatus: KernangabenLebendStatus | null
  readonly geschlecht: ElternGeschlecht | null
  readonly hauptformBelegt: boolean
  readonly geburtsdatum: readonly KernAussage[]
  readonly geburtsort: readonly KernAussage[]
  readonly todesdatum: readonly KernAussage[]
  readonly todesort: readonly KernAussage[]
  readonly todEreignisse: readonly KernTodEreignis[]
  readonly eltern: readonly KernElternteil[]
}

export interface Kernangaben {
  readonly erfuellt: number
  readonly anwendbar: number
  /** `Math.floor(erfuellt * 100 / anwendbar)` — abgerundet (E7). */
  readonly prozent: number
  /** Multimenge der nicht erfüllten Angaben in `KERNANGABE_IDS`-Reihenfolge; `elternteil` kann zweimal
   * vorkommen. Immer `fehlend.length === anwendbar - erfuellt`. */
  readonly fehlend: readonly KernangabeId[]
}

function belegteAussage(aussagen: readonly KernAussage[]): boolean {
  return aussagen.some((a) => a.hatWert && a.belegt)
}

function todesortErfuellt(eingabe: KernangabenEingabe): boolean {
  if (eingabe.todesort.some((a) => a.hatWert)) return belegteAussage(eingabe.todesort)
  return eingabe.todEreignisse.some((e) => e.ortVorhanden && e.ortBelegt)
}

export function kernangabenAuswerten(eingabe: KernangabenEingabe): Kernangaben | null {
  if (eingabe.istPlatzhalter) return null

  const angaben: [KernangabeId, boolean][] = [
    ['name', eingabe.hauptformBelegt],
    ['geschlecht', eingabe.geschlecht === 'M' || eingabe.geschlecht === 'F' || eingabe.geschlecht === 'X'],
    ['geburtsdatum', belegteAussage(eingabe.geburtsdatum)],
    ['geburtsort', belegteAussage(eingabe.geburtsort)],
  ]
  if (eingabe.lebendStatus === 'verstorben') {
    angaben.push(['todesdatum', belegteAussage(eingabe.todesdatum)], ['todesort', todesortErfuellt(eingabe)])
  }

  const belegteEltern = new Set(eingabe.eltern.filter((e) => e.belegt).map((e) => e.id))
  const plaetze = elternPlaetze(eingabe.eltern)
  const platzBelegt = (id: string | null): boolean => id !== null && belegteEltern.has(id)
  if (plaetze.unbestimmt !== null) {
    angaben.push(['elternteil', platzBelegt(plaetze.unbestimmt)], ['elternteil', false])
  } else {
    angaben.push(['vater', platzBelegt(plaetze.vater)], ['mutter', platzBelegt(plaetze.mutter)])
  }

  const erfuellt = angaben.filter(([, ok]) => ok).length
  const anwendbar = angaben.length
  return {
    erfuellt,
    anwendbar,
    prozent: Math.floor((erfuellt * 100) / anwendbar),
    fehlend: angaben.filter(([, ok]) => !ok).map(([id]) => id),
  }
}
