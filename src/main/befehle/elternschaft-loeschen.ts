// AP-1.12: Handler für `elternschaft.loeschen`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier). `aussage.subjekt_id` ist
// polymorph OHNE Fremdschlüssel-`CASCADE` (E-7) — die Existenz-Aussage (+`aussage_zitat`) muss
// darum nach dem Löschen der Kernzeile manuell entfernt werden, sonst bleibt sie verwaist
// (CLAUDE.md §5: „Undo(Aktion) stellt den Datenbestand bitgleich wieder her").
import type { ElternschaftLoeschenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as beziehungRepo from '../repositories/beziehung-repo'
import * as aussageRepo from '../repositories/aussage-repo'

export function elternschaftLoeschen(tx: Tx, ein: ElternschaftLoeschenEin): null {
  if (!datensatzExistiert(tx, 'elternschaft', ein.id)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ELTERNSCHAFT')
  }
  beziehungRepo.elternschaftLoeschen(tx, ein.id)
  aussageRepo.loeschenNachSubjekt(tx, 'elternschaft', ein.id)
  return null
}
