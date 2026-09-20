// AP-1.12: Handler für `ereignis.loeschen`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier). `beteiligung` räumt CASCADE
// ab; die Existenz-Aussage (polymorph, kein FK-`CASCADE`, E-7) muss manuell entfernt werden (s.
// `elternschaft-loeschen.ts`-Kommentar).
import type { EreignisLoeschenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as ereignisRepo from '../repositories/ereignis-repo'
import * as aussageRepo from '../repositories/aussage-repo'

export function ereignisLoeschen(tx: Tx, ein: EreignisLoeschenEin): null {
  if (!datensatzExistiert(tx, 'ereignis', ein.id)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_EREIGNIS')
  }
  ereignisRepo.loeschen(tx, ein.id)
  aussageRepo.loeschenNachSubjekt(tx, 'ereignis', ein.id)
  return null
}
