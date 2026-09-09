// AP-0.9: Handler für `person.loeschen`. Läuft innerhalb der vom Befehlsbus bereits geöffneten
// und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
import type { PersonLoeschenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import { loeschen } from '../repositories/person-repo'

export function personLoeschen(tx: Tx, ein: PersonLoeschenEin): null {
  if (!datensatzExistiert(tx, 'person', ein.id)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_PERSON')
  }
  loeschen(tx, ein.id)
  return null
}
