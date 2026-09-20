// AP-1.12: Handler für `partnerschaft.loeschen`. Läuft in der vom Befehlsbus bereits geöffneten
// und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier). `partnerschaft_person`
// räumt CASCADE ab; die Existenz-Aussage (polymorph, kein FK-`CASCADE`, E-7) muss manuell entfernt
// werden (s. `elternschaft-loeschen.ts`-Kommentar).
import type { PartnerschaftLoeschenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as beziehungRepo from '../repositories/beziehung-repo'
import * as aussageRepo from '../repositories/aussage-repo'

export function partnerschaftLoeschen(tx: Tx, ein: PartnerschaftLoeschenEin): null {
  if (!datensatzExistiert(tx, 'partnerschaft', ein.id)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_PARTNERSCHAFT')
  }
  beziehungRepo.partnerschaftLoeschen(tx, ein.id)
  aussageRepo.loeschenNachSubjekt(tx, 'partnerschaft', ein.id)
  return null
}
