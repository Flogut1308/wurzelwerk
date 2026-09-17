// AP-1.5, 56_Import_Vertrag.md §3.8: "Mediendateien werden beim Import in den Projektordner
// kopiert, nicht verschoben — das Original bleibt, wo es war." Läuft NUR im echten Import (NICHT
// in der Sondierung, s. `src/main/import/ausfuehrung.ts`), VOR dem eigentlichen Schreiben
// (`schreibeImport()`) — ein Kopierfehler (IMP-502) darf keine halb geschriebene Transaktion
// hinterlassen; die aufrufende Transaktion (`src/main/befehle/import-ausfuehren.ts`) rollt bei
// einem Wurf hier vollständig zurück.
import { copyFileSync, mkdirSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { ImportDatei } from '../../shared/schemata/import-v1'
import { neueId as neueIdStandard } from '../id'

type MediumEintrag = NonNullable<ImportDatei['medien']>[number]

/** Ziel eines kopierten Mediums: der neue, projektinterne Dateiname (relativ zu `medien/`) + der
 * ursprüngliche Dateiname (für die Anzeige, `medium.dateiname`). */
export interface MedienkopieZiel {
  readonly relativerPfad: string
  readonly dateiname: string
}

/** Abbildung vom ORIGINALEN `medien[].relativer_pfad` (wie im Importvertrag, relativ zur
 * Importdatei) auf das kopierte Ziel — Eingabe für `src/main/import/schreiben.ts`
 * (`SchreibOptionen.medienAufloesung`). */
export type MedienkopieAbbildung = ReadonlyMap<string, MedienkopieZiel>

export interface MedienkopieOptionen {
  readonly neueId?: () => string
}

/**
 * Kopiert (NIE verschiebt, §3.8) jede `medien[].relativer_pfad`-Quelle (relativ zu `importOrdner`,
 * dem Ordner der Importdatei) nach `<medienPfad>/<uuid7><endung>`. Wirft
 * `IMPORT_MEDIUM_NICHT_KOPIERBAR` (IMP-502) beim ersten Kopierfehler — der Aufrufer schreibt in
 * diesem Fall nichts (56_Import_Vertrag.md §6.3 Ablauf, AP-1.5).
 */
export function medienKopieren(
  medien: readonly MediumEintrag[],
  importOrdner: string,
  medienPfad: string,
  opt: MedienkopieOptionen = {},
): MedienkopieAbbildung {
  const neueId = opt.neueId ?? neueIdStandard
  mkdirSync(medienPfad, { recursive: true })

  const abbildung = new Map<string, MedienkopieZiel>()
  for (const m of medien) {
    const quellPfad = join(importOrdner, m.relativer_pfad)
    const endung = extname(m.relativer_pfad)
    const zielDateiname = `${neueId()}${endung}`
    const zielPfad = join(medienPfad, zielDateiname)
    try {
      copyFileSync(quellPfad, zielPfad)
    } catch (u) {
      throw new WurzelFehler('IMPORT_MEDIUM_NICHT_KOPIERBAR', u instanceof Error ? u.message : String(u))
    }
    abbildung.set(m.relativer_pfad, { relativerPfad: zielDateiname, dateiname: basename(m.relativer_pfad) })
  }
  return abbildung
}
