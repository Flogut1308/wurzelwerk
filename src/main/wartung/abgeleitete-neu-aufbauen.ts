// AP-0.7, 55_Architektur.md §5.3: `alleAbgeleitetenNeuAufbauen()` ist "auch ein Menüpunkt unter
// Wartung" - dieses Modul ist der eine Ort, den sowohl der IPC-Kanal
// (`befehl:wartung.abgeleiteteNeuAufbauen`, src/main/ipc/registrierung.ts) als auch der
// Menüpunkt (src/main/menue/menue.ts) aufrufen, damit beide Einstiege exakt dasselbe tun.
import { alleAbgeleitetenNeuAufbauen } from '../datenbank/trigger'
import { offenesProjektDatenbank } from '../projekt/projekt-dienst'
import { protokollInfo } from '../protokoll/logger'

/**
 * Baut `person_flach`, `name_phonetik`, `suche_fts` und `suche_fts_quelle` für das aktuell offene
 * Projekt vollständig neu auf (§5.3: die Notfall-Reparaturfunktion, falls ein `abl_*`-Trigger
 * einmal einen Fall vergisst). Wirft `PROJEKT_NICHT_GEOEFFNET`, wenn kein Projekt offen ist.
 */
export function wartungAbgeleiteteNeuAufbauen(): null {
  const db = offenesProjektDatenbank()
  alleAbgeleitetenNeuAufbauen(db)
  protokollInfo({ befehlsname: 'wartung.abgeleiteteNeuAufbauen' })
  return null
}
