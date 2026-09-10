// AP-0.11, 55_Architektur.md §4.6 (ADR-003): reine Auswahllogik für die Journalbegrenzung. Bekommt
// die Transaktionsliste UND "jetzt" als Eingabe (CLAUDE.md §4: kein `Date.now()` in `src/core/`) —
// das eigentliche Löschen der `aenderung`-Zeilen übernimmt der Aufrufer
// (`src/main/journal/aufraeumen.ts`).
//
// Behalte-Regel (55_Architektur.md §4.6): **alle** Transaktionen der letzten 30 Tage UND
// **mindestens die letzten 200** (nach `lfd`), was auch immer mehr ist. Der Rest wird
// zurückgegeben (zu begrenzen: deren `aenderung`-Zeilen werden aufgeräumt).

/** Eine Transaktion für die Begrenzungsauswahl — nur, was die Auswahl selbst braucht. */
export interface JournalTransaktionKandidat {
  readonly id: string
  readonly zeitpunktMs: number
  readonly lfd: number
}

const DREISSIG_TAGE_MS = 30 * 86_400_000
const MINDESTENS_BEHALTEN = 200

/**
 * Liefert die IDs der zu begrenzenden (aufzuräumenden) Transaktionen (55_Architektur.md §4.6):
 * alles außerhalb von "jünger als 30 Tage" ∪ "die letzten (nach `lfd`) 200". Sortiert aufsteigend
 * nach `lfd` (älteste zuerst) — rein für ein deterministisches, lesbares Ergebnis; die Reihenfolge
 * ist für den Aufrufer sonst unerheblich (jede zurückgegebene ID wird gleich behandelt).
 */
export function zuBegrenzendeTransaktionen(liste: readonly JournalTransaktionKandidat[], jetztMs: number): readonly string[] {
  const nachLfdAbsteigend = [...liste].sort((a, b) => b.lfd - a.lfd)

  const behalten = new Set<string>(nachLfdAbsteigend.slice(0, MINDESTENS_BEHALTEN).map((kandidat) => kandidat.id))
  for (const kandidat of nachLfdAbsteigend) {
    if (jetztMs - kandidat.zeitpunktMs < DREISSIG_TAGE_MS) {
      behalten.add(kandidat.id)
    }
  }

  return nachLfdAbsteigend
    .filter((kandidat) => !behalten.has(kandidat.id))
    .sort((a, b) => a.lfd - b.lfd)
    .map((kandidat) => kandidat.id)
}
