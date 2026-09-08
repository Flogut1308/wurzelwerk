import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Die Migrationswahrheit (55_Architektur.md §9.1). Jede Zeile ist eine SQL-Datei unter
 * `docs/schema/`, vierstellig numeriert, nur vorwärts. Eine angewendete Migrationsdatei wird nie
 * geändert — die Prüfsumme hier ist der Schutz davor (CLAUDE.md §6, §9.3).
 */
export interface MigrationEintrag {
  readonly version: number
  readonly datei: string
  readonly pruefsumme: string
}

export const MIGRATIONEN = [
  {
    version: 1,
    datei: '0001_grundgeruest.sql',
    pruefsumme: 'sha256-98d4929be1d8fa29fdca2a9d75afff8a5418edbb2dff2ba550a1d412b2629ccd',
  },
  {
    version: 2,
    datei: '0002_kern.sql',
    pruefsumme: 'sha256-6bbc912f3b43b212afffb4ad68508eaad55a20910544905996e5997e8ef3ca60',
  },
] as const satisfies readonly MigrationEintrag[]

/** Ziel von `PRAGMA user_version` nach vollständiger Migration — die höchste Version der Registry. */
export const SCHEMA_VERSION = 2

/** sha256 über den rohen Byte-Inhalt einer Migrationsdatei, Format `sha256-<hexdigest>`. */
export function pruefsummeBerechnen(inhalt: string | Buffer): string {
  return `sha256-${createHash('sha256').update(inhalt).digest('hex')}`
}

/**
 * Absoluter Pfad zur SQL-Datei einer Migration. Annahme (AP-0.5): `docs/schema/` liegt neben dem
 * aktuellen Arbeitsverzeichnis des Prozesses — das gilt für Vitest (cwd = Repo-Root, siehe
 * `vitest.config.ts`) und für `electron-vite dev` (ebenfalls Repo-Root). TODO: Für die gebaute,
 * gepackte App liegt `docs/` noch nicht im Programmpaket — das Bündeln der Migrations-SQL ins
 * Paket ist eine spätere Aufgabe (nicht AP-0.5), an dieser Stelle nur vermerkt.
 */
export function migrationsDateiPfad(datei: string): string {
  return join(process.cwd(), 'docs', 'schema', datei)
}

/** Liest den rohen Byte-Inhalt einer Migrationsdatei — Grundlage der Prüfsummenberechnung. */
export function migrationsRohInhaltLesen(eintrag: MigrationEintrag): Buffer {
  return readFileSync(migrationsDateiPfad(eintrag.datei))
}
