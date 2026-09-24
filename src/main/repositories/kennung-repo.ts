// AP-1.34: einziges Repository, das `kennung_zaehler`-SQL schreibt (CLAUDE.md §2). Wie alle
// Repositories ohne `BEGIN`/`COMMIT`: `kennungZiehen` läuft in der Transaktion des Aufrufers
// (Befehl oder Import) — ein Rollback/Trockenlauf nimmt das Hochzählen darum mit zurück und
// verbraucht keine Nummer. `kennung_zaehler` ist NICHT_JOURNALISIERT (src/main/journal/
// journalisierung.ts): ein Undo nimmt die Person zurück, lässt den Zähler aber stehen, damit eine
// vergebene Nummer nie neu vergeben wird (docs/schema/0007_kennung_textanker.sql).
import { z } from 'zod'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { kennungZaehlerSchema, type KennungBereich, type KennungZaehler } from '../../shared/schemata/kennung-zaehler'
import type { Tx } from './basis'

/**
 * Zieht die nächste Kennung für `bereich` und zählt den Zähler in einem Statement weiter
 * (`UPDATE … RETURNING`, kein Lese-dann-Schreib-Fenster). Rückgabe ist die gezogene Nummer
 * (= Zählerstand vor dem Hochzählen).
 */
export function kennungZiehen(tx: Tx, bereich: KennungBereich): number {
  const zeile = tx
    .prepare<{ readonly bereich: KennungBereich }, { readonly gezogen: number }>(
      'UPDATE kennung_zaehler SET naechste = naechste + 1 WHERE bereich = @bereich RETURNING naechste - 1 AS gezogen',
    )
    .get({ bereich })
  if (zeile === undefined) {
    throw new WurzelFehler('INTERN_UNERWARTET', `kennungZiehen(): kennung_zaehler hat keine Zeile für bereich "${bereich}".`)
  }
  return zeile.gezogen
}

/** Alle Zählerstände (für E12: vor einer Datei-Wiederherstellung sichern). */
export function zaehlerstaendeLesen(tx: Tx): readonly KennungZaehler[] {
  return tx
    .prepare<[], unknown>('SELECT bereich, naechste FROM kennung_zaehler ORDER BY bereich')
    .all()
    .map((zeile) => kennungZaehlerSchema.parse(zeile))
}

/**
 * Zieht den Zähler auf mindestens `mindestens` vor — nur wenn er darunter steht (E12:
 * `max(alt, wiederhergestellt)`). Der WHERE-Filter hält den „nur vorwärts"-Trigger
 * (`chk_kennung_zaehler_vorwaerts`) aus dem Spiel: ein Gleichstand wird gar nicht erst geschrieben.
 */
export function zaehlerMindestensSetzen(tx: Tx, bereich: KennungBereich, mindestens: number): void {
  tx.prepare('UPDATE kennung_zaehler SET naechste = @mindestens WHERE bereich = @bereich AND naechste < @mindestens').run({
    bereich,
    mindestens,
  })
}

/**
 * Ob die Datei `kennung_zaehler` überhaupt kennt — eine per Schnappschuss wiederhergestellte Datei
 * kann älter als Migration 0007 sein (E12/E13); dann gibt es nichts nachzuziehen, der Zähler
 * entsteht beim nächsten Öffnen durch die Migration selbst.
 */
export function zaehlerTabelleVorhanden(tx: Tx): boolean {
  const zeile = tx
    .prepare<[], { readonly name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'kennung_zaehler'")
    .get()
  return zeile !== undefined
}

/** Eine Zeile `person(id, kennung)` mit vergebener Kennung (CHECK `kennung >= 1`, 0007). */
const personKennungZeileSchema = z.object({
  id: z.string(),
  kennung: z.number().int().min(1),
})

/** Eine Zeile `person(id)` für die Neunummerierung ohne Treffer (O-2). */
const personIdZeileSchema = z.object({ id: z.string() })

/**
 * Zuordnung `person.id → person.kennung` aller Personen mit Kennung (AP-1.34, H6b): vor einer
 * Datei-Wiederherstellung aus der ersetzten Datei gesichert. Personen ohne Kennung (E13, Undo alter
 * Journaleinträge) fehlen in der Zuordnung.
 */
export function personKennungenLesen(tx: Tx): ReadonlyMap<string, number> {
  const zuordnung = new Map<string, number>()
  for (const roh of tx.prepare<[], unknown>('SELECT id, kennung FROM person WHERE kennung IS NOT NULL ORDER BY id').all()) {
    const zeile = personKennungZeileSchema.parse(roh)
    zuordnung.set(zeile.id, zeile.kennung)
  }
  return zuordnung
}

/**
 * Übernimmt die Kennungen der ersetzten Datei in eine gerade auf v7 migrierte Datei (AP-1.34, H6b,
 * O-1/O-2). Läuft ausschließlich im Migrations-Hook (`nachMigrationsSql`, Version 7) — also in der
 * Transaktion und bei ausgeschaltetem Journal des Migrationslaufs; eigenes `BEGIN` gibt es hier
 * nicht (CLAUDE.md §2). Zweiter Schreibweg für `person.kennung` neben `personRepo.einfuegen` (B2).
 *
 * 1. Alle Kennungen auf NULL — `idx_person_kennung` (UNIQUE) prüft je Zeile, eine Permutation
 *    kollidierte sonst unterwegs; negative Zwischenwerte verbietet `CHECK (kennung >= 1)`.
 * 2. In `ORDER BY id`: Treffer (`zuordnung.get(id)`) bekommen ihre alte Kennung, alle übrigen
 *    fortlaufend ab `zaehlerVorher` (O-2, deterministisch wie der E2-Nachtrag).
 * 3. Der Zähler wird auf mindestens `max(zaehlerVorher + k, größter Treffer + 1)` gezogen (k =
 *    Personen ohne Treffer) — nie gesenkt (`zaehlerMindestensSetzen`). 0007 hat ihn auf m + 1
 *    gesetzt; da die Treffer eindeutige Kennungen < `zaehlerVorher` tragen, gilt
 *    `zaehlerVorher + k >= m + 1` ohnehin. Die Maxima decken einen inkonsistenten Randfall trotzdem
 *    ab: keine vergebene Nummer wird je erneut gezogen.
 *
 * Trägt die Zuordnung eine Kennung ≥ `zaehlerVorher` (inkonsistente Ersatzdatei), kann Schritt 2 an
 * der UNIQUE-Bedingung scheitern — der Wurf rollt die Migration zurück (fail-closed).
 */
export function personKennungenUebernehmen(tx: Tx, zuordnung: ReadonlyMap<string, number>, zaehlerVorher: number): void {
  if (!Number.isInteger(zaehlerVorher) || zaehlerVorher < 1) {
    throw new WurzelFehler('INTERN_UNERWARTET', `personKennungenUebernehmen(): ungültiger Zählerstand ${String(zaehlerVorher)}.`)
  }
  const ids = tx
    .prepare<[], unknown>('SELECT id FROM person ORDER BY id')
    .all()
    .map((roh) => personIdZeileSchema.parse(roh).id)

  tx.prepare('UPDATE person SET kennung = NULL WHERE kennung IS NOT NULL').run()

  const setzen = tx.prepare<{ readonly id: string; readonly kennung: number }>('UPDATE person SET kennung = @kennung WHERE id = @id')
  let naechste = zaehlerVorher
  let groessterTreffer = 0
  for (const id of ids) {
    const treffer = zuordnung.get(id)
    if (treffer !== undefined) {
      setzen.run({ id, kennung: treffer })
      groessterTreffer = Math.max(groessterTreffer, treffer)
    } else {
      setzen.run({ id, kennung: naechste })
      naechste += 1
    }
  }

  zaehlerMindestensSetzen(tx, 'person', Math.max(naechste, groessterTreffer + 1))
}
