import { app } from 'electron'
// Der explizite Hauptprozess-Einstiegspunkt, nicht das auto-erkennende `electron-log`: Der
// Wurzeleinstieg wählt anhand von `process.type` zwischen Node-/Main-/Renderer-Logger, und in
// Vitest (reines Node, kein Electron) ist `process.type` nie `'browser'` — der Import hier läuft
// ausschließlich im Hauptprozess, darum ist die Wahl fest statt erraten.
import log from 'electron-log/main'
import { join } from 'node:path'
import { z } from 'zod'

/**
 * Schmale Fassade um electron-log (ADR-024, 55_Architektur.md §10.2). Es gibt keinen Weg, rohe
 * Nutzlast ins Protokoll zu schreiben: Jede öffentliche Funktion nimmt `unknown` entgegen und
 * lässt nur die Felder der Weißliste durch — auch wenn ein Aufrufer versehentlich mehr mitschickt
 * (etwa den Namen einer Person aus einer gefangenen Ausnahme), entfernt `zulaessig()` es, bevor
 * überhaupt eine Zeile geschrieben wird. Was nie protokolliert wird: Namen, Notizen, Transkripte,
 * Ortsnamen, Datumswerte, Diagnosetexte, Dateipfade innerhalb des Projektordners.
 */
const protokollEintragSchema = z.object({
  vorgangsId: z.string().optional(),
  kanal: z.string().optional(),
  befehlsname: z.string().optional(),
  // Herkunft einer weitergeleiteten Renderer-Ausnahme (Enum, kein Inhalt) — §10.3.
  quelle: z.string().optional(),
  code: z.string().optional(),
  dauerMs: z.number().optional(),
  transaktionId: z.string().optional(),
  schemaVersion: z.string().optional(),
  zeilenzahl: z.number().optional(),
  migrationsschritt: z.string().optional(),
})

export type ProtokollEintrag = Readonly<z.infer<typeof protokollEintragSchema>>

function zulaessig(roh: unknown): ProtokollEintrag {
  const geprueft = protokollEintragSchema.safeParse(roh)
  return geprueft.success ? geprueft.data : {}
}

/**
 * Muss vor der ersten Protokollzeile aufgerufen werden (`src/main/index.ts`). Setzt Ort, Rotation
 * und Stufe. Der Ort wird bewusst explizit über `app.getPath('logs')` gesetzt statt über
 * electron-logs eigene Heuristik (die den Pfad OS-nativ neu herleitet, ohne Electron zu fragen) —
 * so bleibt die Zusage aus 55_Architektur.md §10.2 wörtlich wahr und ist ohne echtes Electron
 * testbar.
 */
export function protokollEinrichten(): void {
  log.transports.file.level = app.isPackaged ? 'info' : 'debug'
  // 2 MB, Standard-Archivierung (eine `.old`-Datei) — kein eigener Ring, Entscheidung AP-0.2.
  log.transports.file.maxSize = 2 * 1024 * 1024
  log.transports.file.resolvePathFn = () => join(app.getPath('logs'), 'wurzelwerk.log')
}

export function protokollDebug(roh: unknown): void {
  log.debug(zulaessig(roh))
}

export function protokollInfo(roh: unknown): void {
  log.info(zulaessig(roh))
}

export function protokollFehler(roh: unknown): void {
  log.error(zulaessig(roh))
}
