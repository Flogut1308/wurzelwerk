// AP-0.9: Handler für `person.feldSetzen`. Läuft innerhalb der vom Befehlsbus bereits geöffneten
// und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
import type { PersonFeldSetzenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import { feldSetzen } from '../repositories/person-repo'

/** `geaendert_am` kommt vom Handler (D-3); `erstellt_am` bleibt unverändert (nur dieses eine Repo-Update rührt es nicht an). */
export function personFeldSetzen(tx: Tx, ein: PersonFeldSetzenEin): null {
  if (!datensatzExistiert(tx, 'person', ein.id)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_PERSON')
  }
  feldSetzen(tx, { ...ein, geaendertAm: Date.now() })
  return null
}
