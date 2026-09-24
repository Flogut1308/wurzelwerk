// AP-1.34: einziges Repository, das `kennung_zaehler`-SQL schreibt (CLAUDE.md §2). Wie alle
// Repositories ohne `BEGIN`/`COMMIT`: `kennungZiehen` läuft in der Transaktion des Aufrufers
// (Befehl oder Import) — ein Rollback/Trockenlauf nimmt das Hochzählen darum mit zurück und
// verbraucht keine Nummer. `kennung_zaehler` ist NICHT_JOURNALISIERT (src/main/journal/
// journalisierung.ts): ein Undo nimmt die Person zurück, lässt den Zähler aber stehen, damit eine
// vergebene Nummer nie neu vergeben wird (docs/schema/0007_kennung_textanker.sql).
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
