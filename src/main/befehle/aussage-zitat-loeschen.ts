// AP-1.29 PR-A: Handler für `aussage_zitat.loeschen`. Läuft in der vom Befehlsbus bereits
// geöffneten und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier). Löst NUR die
// `aussage_zitat`-Verknüpfung — die `aussage`- UND die `zitat`-Zeile bleiben unberührt (dafür gibt
// es `aussage.loeschen`/`zitat.loeschen`). Existenzprüfung über den zusammengesetzten
// Primärschlüssel `(aussage_id, zitat_id)` — kein `datensatzExistiert()` (das nimmt einen skalaren
// `id`-Primärschlüssel an, den diese Verknüpfungstabelle nicht hat, analog
// `ort-externe-id-loeschen.ts`). Eine fehlende Verknüpfung meldet den eigenen Code
// `NICHT_GEFUNDEN_AUSSAGE_ZITAT` — auch dann, wenn `aussage` und `zitat` beide bestehen (vorher
// fälschlich `NICHT_GEFUNDEN_AUSSAGE`, Folgepunkt aus AP-1.29).
import type { AussageZitatLoeschenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from '../repositories/basis'
import * as aussageRepo from '../repositories/aussage-repo'

export function aussageZitatLoeschen(tx: Tx, ein: AussageZitatLoeschenEin): null {
  if (!aussageRepo.verknuepfungExistiert(tx, ein.aussageId, ein.zitatId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_AUSSAGE_ZITAT')
  }
  aussageRepo.zitatLoesen(tx, ein.aussageId, ein.zitatId)
  return null
}
