// AP-1.15 PR-A: Handler für `beteiligung.loeschen`. Läuft in der vom Befehlsbus bereits geöffneten
// und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier). Löscht NUR die
// `beteiligung`-Zeile — das zugehörige `ereignis` bleibt bestehen (s. Kommentar an
// `BeteiligungLoeschenEin`, `src/shared/schemata/befehle.ts`). Undo/Redo laufen wie überall über
// die generischen Journal-Trigger (`beteiligung` ist bereits journalisiert, s.
// `docs/schema/trigger_generiert.sql`) — kein manueller Wiederherstellungscode hier nötig.
import type { BeteiligungLoeschenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as ereignisRepo from '../repositories/ereignis-repo'

export function beteiligungLoeschen(tx: Tx, ein: BeteiligungLoeschenEin): null {
  if (!datensatzExistiert(tx, 'beteiligung', ein.id)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_BETEILIGUNG')
  }
  ereignisRepo.beteiligungLoeschen(tx, ein.id)
  return null
}
