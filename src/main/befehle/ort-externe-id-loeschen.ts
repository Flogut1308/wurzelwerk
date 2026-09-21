// AP-1.16 PR-A: Handler für `ort-externe-id.loeschen`. Läuft in der vom Befehlsbus bereits
// geöffneten und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier). Existenzprüfung
// über den zusammengesetzten Primärschlüssel `(ort_id, system)` — kein `datensatzExistiert()`
// (das nimmt einen skalaren `id`-Primärschlüssel an, den diese Tabelle nicht hat).
import type { OrtExterneIdLoeschenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from '../repositories/basis'
import * as ortRepo from '../repositories/ort-repo'

export function ortExterneIdLoeschen(tx: Tx, ein: OrtExterneIdLoeschenEin): null {
  if (ortRepo.ortExterneIdLesen(tx, ein.ortId, ein.system) === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ORT_EXTERNE_ID')
  }
  ortRepo.ortExterneIdLoeschen(tx, ein.ortId, ein.system)
  return null
}
