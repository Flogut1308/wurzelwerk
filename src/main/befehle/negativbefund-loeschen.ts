// AP-1.17 PR-A4: Handler für `negativbefund.loeschen`. Läuft in der vom Befehlsbus bereits
// geöffneten und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier). Keine
// abhängigen Tabellen referenzieren `negativbefund.id` — keine zusätzliche Aufräumung nötig.
import type { NegativbefundLoeschenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as negativbefundRepo from '../repositories/negativbefund-repo'

export function negativbefundLoeschen(tx: Tx, ein: NegativbefundLoeschenEin): null {
  if (!datensatzExistiert(tx, 'negativbefund', ein.id)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_NEGATIVBEFUND')
  }
  negativbefundRepo.negativbefundLoeschen(tx, ein.id)
  return null
}
