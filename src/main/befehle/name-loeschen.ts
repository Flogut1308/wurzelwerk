// AP-1.12: Handler für `name.loeschen`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier). `name.anlegen` schreibt keine
// Existenz-Aussage (s. dort) — darum ist hier keine zusätzliche `aussage`-Aufräumung nötig.
import type { NameLoeschenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as nameRepo from '../repositories/name-repo'

export function nameLoeschen(tx: Tx, ein: NameLoeschenEin): null {
  if (!datensatzExistiert(tx, 'name', ein.id)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_NAME')
  }
  nameRepo.loeschen(tx, ein.id)
  return null
}
