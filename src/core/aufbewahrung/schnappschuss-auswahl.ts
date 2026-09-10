// AP-0.11, 55_Architektur.md §6.2 (F-04, ADR-003): reine Auswahllogik für die
// Schnappschuss-Aufbewahrung. Bekommt die Kandidatenliste UND "jetzt" als Eingabe (CLAUDE.md §4:
// kein `Date.now()`/`new Date()` in `src/core/`) — Datei-I/O (`readdir`/`unlink`) übernimmt der
// Aufrufer (`src/main/schnappschuss/aufbewahrung.ts`).
//
// Behalte-Regel (55_Architektur.md §6.2): die letzten 10 (nach `zeitpunktMs` absteigend) UND einer
// pro UTC-Tag der letzten 7 Tage UND einer pro UTC-Woche der letzten 4 Wochen. Alles andere wird
// zurückgegeben (zu löschen).

/** Ein Schnappschuss-Kandidat für die Aufbewahrungsauswahl — nur, was die Auswahl selbst braucht. */
export interface SchnappschussKandidat {
  readonly id: string
  readonly zeitpunktMs: number
}

const TAG_MS = 86_400_000
const WOCHE_MS = 604_800_000
const ANZAHL_LETZTE_BEHALTEN = 10
const TAGE_BEHALTEN = 7
const WOCHEN_BEHALTEN = 4

/**
 * Stabil nach `zeitpunktMs` absteigend sortiert — bei Gleichstand nach `id` aufsteigend (rein
 * deterministischer Tie-Break, unabhängig von der Eingabereihenfolge; UUID v7 sortiert ohnehin
 * praktisch nie mit exakt gleichem `zeitpunktMs`).
 */
function nachZeitAbsteigendSortiert(liste: readonly SchnappschussKandidat[]): readonly SchnappschussKandidat[] {
  return [...liste].sort((a, b) => b.zeitpunktMs - a.zeitpunktMs || a.id.localeCompare(b.id))
}

/**
 * Behält je Bucket (Tag oder Woche) genau den JÜNGSTEN Kandidaten innerhalb der letzten
 * `anzahlBuckets` Buckets (inklusive des aktuellen). `sortiertAbsteigend` muss bereits nach
 * `zeitpunktMs` absteigend sortiert sein — dadurch ist der erste Treffer je Bucket automatisch der
 * jüngste ("bei gleichem Bucket der jüngste behalten").
 */
function proBucketJuengstenBehalten(
  sortiertAbsteigend: readonly SchnappschussKandidat[],
  bucketGroesseMs: number,
  anzahlBuckets: number,
  jetztMs: number,
): ReadonlySet<string> {
  const aktuellerBucket = Math.floor(jetztMs / bucketGroesseMs)
  const gesehen = new Set<number>()
  const behalten = new Set<string>()
  for (const kandidat of sortiertAbsteigend) {
    const bucket = Math.floor(kandidat.zeitpunktMs / bucketGroesseMs)
    const abstand = aktuellerBucket - bucket
    if (abstand < 0 || abstand >= anzahlBuckets) {
      continue
    }
    if (gesehen.has(bucket)) {
      continue
    }
    gesehen.add(bucket)
    behalten.add(kandidat.id)
  }
  return behalten
}

/**
 * Liefert die IDs der zu löschenden Schnappschüsse (55_Architektur.md §6.2): alles außerhalb von
 * "letzte 10" ∪ "einer pro Tag der letzten 7 Tage" ∪ "einer pro Woche der letzten 4 Wochen".
 */
export function zuLoeschendeSchnappschuesse(liste: readonly SchnappschussKandidat[], jetztMs: number): readonly string[] {
  const sortiert = nachZeitAbsteigendSortiert(liste)

  const behalten = new Set<string>(sortiert.slice(0, ANZAHL_LETZTE_BEHALTEN).map((kandidat) => kandidat.id))
  for (const id of proBucketJuengstenBehalten(sortiert, TAG_MS, TAGE_BEHALTEN, jetztMs)) {
    behalten.add(id)
  }
  for (const id of proBucketJuengstenBehalten(sortiert, WOCHE_MS, WOCHEN_BEHALTEN, jetztMs)) {
    behalten.add(id)
  }

  return sortiert.filter((kandidat) => !behalten.has(kandidat.id)).map((kandidat) => kandidat.id)
}
