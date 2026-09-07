import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { SCHEMA_VERSION } from '../../shared/konstanten'

/** 50_Datenmodell.md §3: die Endung, die einen Ordner als Wurzelwerk-Projekt kennzeichnet. */
export const PROJEKT_ORDNER_ENDUNG = '.ahnen'

const DATEI_MANIFEST = 'manifest.json'
const DATEI_DB = 'baum.sqlite'
const ORDNER_MEDIEN = 'medien'
const ORDNER_SNAPSHOTS = 'snapshots'
const ORDNER_EXPORT = 'export'
const MANIFEST_TYP = 'wurzelwerk-projekt'

/** Inhalt von `manifest.json` (50_Datenmodell.md §3, AP-0.4). */
export interface ProjektManifest {
  readonly typ: typeof MANIFEST_TYP
  readonly schemaversion: string
  readonly appVersion: string
  readonly projektname: string
  readonly erstelltAm: string
}

const manifestSchema: z.ZodType<ProjektManifest> = z.object({
  typ: z.literal(MANIFEST_TYP),
  schemaversion: z.string(),
  appVersion: z.string(),
  projektname: z.string(),
  erstelltAm: z.string(),
})

/** Alle Pfade unterhalb eines `.ahnen`-Ordners, konsistent aus einer Stelle abgeleitet. */
export interface ProjektOrdnerPfade {
  readonly ordnerPfad: string
  readonly dbPfad: string
  readonly medienPfad: string
  readonly snapshotsPfad: string
  readonly exportPfad: string
  readonly manifestPfad: string
}

export function projektOrdnerPfade(ordnerPfad: string): ProjektOrdnerPfade {
  return {
    ordnerPfad,
    dbPfad: join(ordnerPfad, DATEI_DB),
    medienPfad: join(ordnerPfad, ORDNER_MEDIEN),
    snapshotsPfad: join(ordnerPfad, ORDNER_SNAPSHOTS),
    exportPfad: join(ordnerPfad, ORDNER_EXPORT),
    manifestPfad: join(ordnerPfad, DATEI_MANIFEST),
  }
}

export interface ProjektOrdnerAnlegenEin {
  readonly elternordner: string
  readonly projektname: string
}

export interface ProjektOrdnerAnlegenAus {
  readonly pfade: ProjektOrdnerPfade
  readonly manifest: ProjektManifest
}

/**
 * Legt `Name.ahnen/` unter `elternordner` an: die Unterordner aus 50_Datenmodell.md §3, ein
 * leeres `baum.sqlite` (die eigentliche Verbindung mit Pragmas öffnet erst
 * `src/main/datenbank/verbindung.ts`) und `manifest.json`. Alle Pfade über `path.join` (§11) —
 * funktioniert auch mit Leerzeichen und Umlauten im Projektnamen.
 */
export function projektOrdnerAnlegen(ein: ProjektOrdnerAnlegenEin): ProjektOrdnerAnlegenAus {
  const ordnerPfad = join(ein.elternordner, `${ein.projektname}${PROJEKT_ORDNER_ENDUNG}`)
  const pfade = projektOrdnerPfade(ordnerPfad)

  mkdirSync(pfade.ordnerPfad, { recursive: true })
  mkdirSync(pfade.medienPfad, { recursive: true })
  mkdirSync(pfade.snapshotsPfad, { recursive: true })
  mkdirSync(pfade.exportPfad, { recursive: true })
  writeFileSync(pfade.dbPfad, Buffer.alloc(0))

  const manifest: ProjektManifest = {
    typ: MANIFEST_TYP,
    schemaversion: SCHEMA_VERSION,
    appVersion: app.getVersion(),
    projektname: ein.projektname,
    erstelltAm: new Date().toISOString(),
  }
  writeFileSync(pfade.manifestPfad, JSON.stringify(manifest, null, 2), 'utf8')

  return { pfade, manifest }
}

/**
 * Liest und prüft `manifest.json` unterhalb von `ordnerPfad`. Fehlt die Datei, ist sie kein
 * gültiges JSON oder entspricht sie nicht dem erwarteten Aufbau (u. a. `typ`), ist der Ordner kein
 * Wurzelwerk-Projekt (§10.1).
 */
export function leseManifest(ordnerPfad: string): ProjektManifest {
  const manifestPfad = join(ordnerPfad, DATEI_MANIFEST)
  if (!existsSync(manifestPfad)) {
    throw new WurzelFehler('PROJEKT_KEIN_WURZELWERK_ORDNER')
  }

  let roh: unknown
  try {
    roh = JSON.parse(readFileSync(manifestPfad, 'utf8'))
  } catch {
    throw new WurzelFehler('PROJEKT_KEIN_WURZELWERK_ORDNER')
  }

  const geprueft = manifestSchema.safeParse(roh)
  if (!geprueft.success) {
    throw new WurzelFehler('PROJEKT_KEIN_WURZELWERK_ORDNER')
  }
  return geprueft.data
}
