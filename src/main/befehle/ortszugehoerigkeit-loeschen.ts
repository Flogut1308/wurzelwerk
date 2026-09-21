// AP-1.16 PR-A: Handler für `ortszugehoerigkeit.loeschen`. Läuft in der vom Befehlsbus bereits
// geöffneten und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
import type { OrtszugehoerigkeitLoeschenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as ortRepo from '../repositories/ort-repo'

export function ortszugehoerigkeitLoeschen(tx: Tx, ein: OrtszugehoerigkeitLoeschenEin): null {
  if (!datensatzExistiert(tx, 'ortszugehoerigkeit', ein.id)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ORTSZUGEHOERIGKEIT')
  }
  ortRepo.ortszugehoerigkeitLoeschen(tx, ein.id)
  return null
}
