// AP-1.12: Handler für `aussage.loeschen`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier). `aussage_zitat` räumt CASCADE
// ab (`aussage_zitat.aussage_id ON DELETE CASCADE`, docs/schema/0002_kern.sql §2.7).
import type { AussageLoeschenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as aussageRepo from '../repositories/aussage-repo'

export function aussageLoeschen(tx: Tx, ein: AussageLoeschenEin): null {
  if (!datensatzExistiert(tx, 'aussage', ein.id)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_AUSSAGE')
  }
  aussageRepo.loeschen(tx, ein.id)
  return null
}
