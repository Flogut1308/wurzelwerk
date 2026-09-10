// AP-0.11, 55_Architektur.md §6.2 (F-04, ADR-003): die Schnappschussliste kommt live aus dem
// Dateisystem, es gibt dafür keine Datenbanktabelle (Variante A, freigegebener Plan). `ersetzt-
// *.sqlite`-Dateien (§6.4) sind NIE ein Kandidat - sie sind die verdrängte Vorgängerdatei einer
// Wiederherstellung, kein Schnappschuss.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { SchnappschussEintrag } from '../../shared/ipc/vertrag'
import { basisnameOhneEndung, ERSETZT_PRAEFIX, zeitAusDateiname } from './dateiname'

/**
 * Liest `snapshotsPfad` und liefert alle gültigen Schnappschuss-Kandidaten, jüngste zuerst. Ein
 * (noch) fehlender Ordner liefert eine leere Liste, statt zu werfen (frisch angelegtes Projekt vor
 * dem ersten Schnappschuss).
 */
export function schnappschussListeLesen(snapshotsPfad: string): readonly SchnappschussEintrag[] {
  let dateinamen: readonly string[]
  try {
    dateinamen = readdirSync(snapshotsPfad)
  } catch {
    return []
  }

  const eintraege: SchnappschussEintrag[] = []
  for (const dateiname of dateinamen) {
    if (dateiname.startsWith(ERSETZT_PRAEFIX)) {
      continue // NIE als Kandidat (55_Architektur.md §6.2/§6.4)
    }
    const basisname = basisnameOhneEndung(dateiname)
    if (basisname === undefined) {
      continue
    }
    const zeitpunktMs = zeitAusDateiname(basisname)
    if (zeitpunktMs === undefined) {
      continue // fremde Datei im snapshots/-Ordner, kein erkannter Schnappschuss-Dateiname
    }
    const pfad = join(snapshotsPfad, dateiname)
    eintraege.push({ id: basisname, pfad, zeitpunktMs, groesseBytes: statSync(pfad).size })
  }

  return eintraege.slice().sort((a, b) => b.zeitpunktMs - a.zeitpunktMs)
}
