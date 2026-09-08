/**
 * Schemaversion für `manifest.json` (String, AP-0.4) und `abfrage:version`. Muss `String(...)` der
 * Integer-Migrationswahrheit `SCHEMA_VERSION` aus `src/main/datenbank/migration/registrierung.ts`
 * entsprechen — `src/shared` darf `src/main` aber nicht importieren (Grenze §2), darum steht der
 * Wert hier separat und wird durch `test/einheit/schemaversion-konsistenz.test.ts` maschinell
 * gegen Divergenz abgesichert.
 */
export const MANIFEST_SCHEMAVERSION = '3'

/** Version des IPC-Vertrags selbst (`src/shared/ipc/vertrag.ts`). */
export const VERTRAG_VERSION = 1
