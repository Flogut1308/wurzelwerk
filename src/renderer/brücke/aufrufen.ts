import type { Ergebnis } from '../../shared/ipc/ergebnis'
import type { Aus, Ein, Kanal } from '../../shared/ipc/vertrag'
// `global.d.ts` im selben Ordner deklariert `window.wurzelwerk` programmweit (tsconfig "include"),
// kein Import nötig.

/**
 * Typisierter Wrapper um `window.wurzelwerk.aufrufen` (§2.3). Der Preload prüft den Kanalnamen
 * gegen die Weißliste und antwortet immer mit einem `Ergebnis`, nie mit einer Ausnahme — der Cast
 * hier überträgt nur, was die IPC-Hülle für bekannte Kanäle bereits zusichert.
 */
export async function aufrufen<K extends Kanal>(kanal: K, ein: Ein<K>): Promise<Ergebnis<Aus<K>>> {
  const ergebnis = await window.wurzelwerk.aufrufen(kanal, ein)
  return ergebnis as Ergebnis<Aus<K>> // von huelle.ts/preload für Kanal K zugesichert, s.o.
}
