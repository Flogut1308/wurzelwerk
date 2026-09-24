import { app } from 'electron'
import { join } from 'node:path'

/**
 * Verzeichnis der gebündelten Migrations-SQL (`docs/schema/*.sql`, `trigger_generiert.sql`) im
 * laufenden Prozess — die eine Laufzeit-Auflösung für alle drei Betriebsarten
 * (57_Phase0_Arbeitspakete.md AP-0.17, 55_Architektur.md §9.3):
 *
 * - **gepackte App:** `app.getAppPath()` zeigt auf den asar-Root; `docs/schema` liegt dort, weil
 *   `electron-builder.yml` (`files:`) es unverändert mit ins Paket nimmt. `readFileSync` liest
 *   transparent aus der asar.
 * - **`pnpm test:e2e`/`pnpm build`-Vorstufe (unverpackt, `electron out/main/index.js`):**
 *   `app.getAppPath()` liefert das Verzeichnis des Einstiegsskripts (`out/main`, empirisch
 *   geprüft, AP-0.17-SPIKE) — `electron.vite.config.ts` kopiert `docs/schema/**` deshalb
 *   byteweise dorthin.
 * - **`pnpm dev`:** `electron-vite dev` startet aus dem Repo-Root; `app.getAppPath()` liefert das
 *   Repo-Root, wo `docs/schema` ohnehin liegt.
 *
 * Nur die Aufrufer im laufenden Prozess (`src/main/projekt/projekt-dienst.ts`, für die
 * Migration vor dem Öffnen einer wiederhergestellten Datei `src/main/schnappschuss/
 * wiederherstellen.ts`, AP-1.34 A2b, und für die Import-Rücknahme über `undo()`
 * `src/main/ipc/registrierung.ts` und `src/main/menue/menue.ts`, AP-1.34 A2c — gesichert durch
 * `test/einheit/undo-aufrufer-verdrahtet.test.ts`) importieren diese Funktion — Vitest
 * und die Skripte unter `skripte/` bleiben electron-frei und nutzen stattdessen den
 * `process.cwd()`-Default in `src/main/datenbank/migration/laeufer.ts`.
 */
export function schemaBasisverzeichnis(): string {
  return join(app.getAppPath(), 'docs', 'schema')
}
