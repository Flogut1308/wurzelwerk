// AP-1.30 PR 9a (Entscheidung D1): EINE Wahrheit dafür, welche Wertangaben eine direkt erfasste
// Aussage (`aussage.anlegen`/`.aendern`) trägt. Grundregel (Nutzerentscheidung AP-1.12): genau einer
// von `wertText`/`wertZahl`/`wertRefId`. Ausnahme D1: an Prädikaten, deren Wert ein Datum IST
// (`DATUMS_PRAEDIKATE`), gilt die Datumsgruppe selbst als Wert — so schreibt sie der Import
// (src/main/import/schreiben.ts: `geburtsdatum`/`todesdatum` nur mit `datum`). Der bisherige Weg
// (genau ein Wert, mit oder ohne Datum — so schreiben Oberfläche, Tests und Altbestand seit AP-1.12)
// bleibt dort gültig; zwei Werte zugleich sind nirgends zulässig.
//
// Genutzt vom Vertragsschema (`src/shared/schemata/befehle.ts`, Anlegen: Prädikat bekannt) und vom
// Handler `aussage.aendern` (src/main/befehle/aussage-aendern.ts, Prädikat erst aus der Zeile bekannt).
//
// Rein (CLAUDE.md §4).

/** Prädikate, deren Wert ein Datum ist. Heute genau die zwei, die der Import aus Geburt/Tod ableitet
 * und die Profil/Kernangaben/Personenliste als Lebensdaten lesen; eine neue Datumsangabe (z. B. ein
 * künftiges `taufdatum`) gehört hierher, nicht in eine zweite Liste. */
export const DATUMS_PRAEDIKATE = ['geburtsdatum', 'todesdatum'] as const

export type DatumsPraedikat = (typeof DATUMS_PRAEDIKATE)[number]

export function istDatumsPraedikat(praedikat: string): boolean {
  return DATUMS_PRAEDIKATE.some((datumsPraedikat) => datumsPraedikat === praedikat)
}

/** Was an den Wertangaben einer Aussage nicht stimmt: kein Wert (`keiner`) oder mehr als einer. */
export type AussageWertVerletzung = 'keiner' | 'mehrere'

/**
 * Die Wertregel: `anzahlWerte` = gesetzte von `wertText`/`wertZahl`/`wertRefId`; `hatDatum` = die
 * Aussage trägt nach dem Schreiben eine Datumsgruppe. `null`, wenn nichts verletzt ist.
 */
export function aussageWertVerletzung(praedikat: string, werte: { readonly anzahlWerte: number; readonly hatDatum: boolean }): AussageWertVerletzung | null {
  if (werte.anzahlWerte > 1) return 'mehrere'
  if (werte.anzahlWerte === 1) return null
  return istDatumsPraedikat(praedikat) && werte.hatDatum ? null : 'keiner'
}
