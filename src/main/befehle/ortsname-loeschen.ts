// AP-1.16 PR-A: Handler für `ortsname.loeschen`. Läuft in der vom Befehlsbus bereits geöffneten
// und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
import type { OrtsnameLoeschenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as ortRepo from '../repositories/ort-repo'

export function ortsnameLoeschen(tx: Tx, ein: OrtsnameLoeschenEin): null {
  if (!datensatzExistiert(tx, 'ortsname', ein.id)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ORTSNAME')
  }
  ortRepo.ortsnameLoeschen(tx, ein.id)
  return null
}
