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
  {
    version: 3,
    datei: '0003_abgeleitet.sql',
    pruefsumme: 'sha256-1ecfb25b8403cec826317ae8e155bb43bc87aaac08efb48e4da2badabf168ec1',
  },
  {
    version: 4,
    datei: '0004_journal.sql',
    pruefsumme: 'sha256-459ec06276e0b59ecbcc75886d0274e6a27a4426a507dbcba844ce777a4d9d54',
  },
] as const satisfies readonly MigrationEintrag[]

/** Ziel von `PRAGMA user_version` nach vollständiger Migration — die höchste Version der Registry. */
export const SCHEMA_VERSION = 4

/** sha256 über den rohen Byte-Inhalt einer Migrationsdatei, Format `sha256-<hexdigest>`. */
export function pruefsummeBerechnen(inhalt: string | Buffer): string {
  return `sha256-${createHash('sha256').update(inhalt).digest('hex')}`
}

/**
 * Absoluter Pfad zur SQL-Datei einer Migration, angehängt an ein **übergebenes**
 * Basisverzeichnis (AP-0.17). Diese Funktion trifft selbst keine Annahme über den Prozess — der
 * Aufrufer entscheidet, welches `docs/schema`-Verzeichnis gilt: `src/main/datenbank/migration/
 * laeufer.ts` reicht standardmäßig `process.cwd()`-basiert durch (Vitest, `electron-vite dev`,
 * Skripte unter `skripte/`), `src/main/projekt/projekt-dienst.ts` übergibt stattdessen
 * `schemaBasisverzeichnis()` (`app.getAppPath()`, gilt auch für die gepackte App).
 */
export function migrationsDateiPfad(basisverzeichnis: string, datei: string): string {
  return join(basisverzeichnis, datei)
}

/** Liest den rohen Byte-Inhalt einer Migrationsdatei — Grundlage der Prüfsummenberechnung. */
export function migrationsRohInhaltLesen(basisverzeichnis: string, eintrag: MigrationEintrag): Buffer {
  return readFileSync(migrationsDateiPfad(basisverzeichnis, eintrag.datei))
}
