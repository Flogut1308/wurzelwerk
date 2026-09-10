// AP-0.11, 55_Architektur.md §6.2/§6.4 (F-04, ADR-003): "bewusst grob und unbequem" - Projekt
// schließen, aktuelle Datei nach `snapshots/ersetzt-<Zeit>.sqlite` verschieben (NIE löschen),
// gewählten Schnappschuss zurückkopieren, wieder öffnen. Kein Zurückspielen im laufenden Betrieb
// (§6.2: Fenster und Abfragecache würden sonst auf einen Datenbestand zeigen, den es nicht mehr
// gibt).
import { copyFileSync, existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import type { Kontext } from '../ipc/huelle'
import type { SchnappschussWiederherstellenEin } from '../../shared/ipc/vertrag'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { offenesProjektPfade, projektOeffnen, projektSchliessen } from '../projekt/projekt-dienst'
import { ERSETZT_PRAEFIX, kolonfreieZeit, SCHNAPPSCHUSS_ENDUNG } from './dateiname'

/**
 * Stellt den unter `ein.id` bekannten Schnappschuss wieder her (55_Architektur.md §6.2/§6.4).
 * Wirft `PROJEKT_NICHT_GEOEFFNET` (über `offenesProjektPfade()`), wenn kein Projekt offen ist, und
 * `DATEI_NICHT_LESBAR`, wenn kein Schnappschuss mit dieser `id` existiert - beides GEPRÜFT, bevor
 * das Projekt geschlossen wird (ein Fehlschlag darf das offene Projekt nicht antasten). `jetzt` ist
 * injizierbar (Standard `Date.now`) — Test-Seam für den Dateinamen von `ersetzt-<Zeit>.sqlite`.
 */
export function schnappschussWiederherstellen(
  ein: SchnappschussWiederherstellenEin,
  ktx: Kontext,
  jetzt: () => number = Date.now,
): void {
  const pfade = offenesProjektPfade() // wirft PROJEKT_NICHT_GEOEFFNET

  const quellPfad = join(pfade.snapshotsPfad, `${ein.id}${SCHNAPPSCHUSS_ENDUNG}`)
  if (!existsSync(quellPfad)) {
    throw new WurzelFehler('DATEI_NICHT_LESBAR')
  }

  const ordnerPfad = pfade.ordnerPfad
  const ersetztPfad = join(pfade.snapshotsPfad, `${ERSETZT_PRAEFIX}${kolonfreieZeit(jetzt())}${SCHNAPPSCHUSS_ENDUNG}`)

  projektSchliessen()

  try {
    renameSync(pfade.dbPfad, ersetztPfad) // NIE löschen (§6.2/§6.4)
    copyFileSync(quellPfad, pfade.dbPfad)
  } catch {
    throw new WurzelFehler('DATEI_KEIN_PLATZ')
  }

  projektOeffnen({ pfad: ordnerPfad }, ktx)
}
