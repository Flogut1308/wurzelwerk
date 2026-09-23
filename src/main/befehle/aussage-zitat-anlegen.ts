// AP-1.29 PR-A: Handler für `aussage_zitat.anlegen`. Läuft in der vom Befehlsbus bereits
// geöffneten und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier). Verknüpft EINEN
// bestehenden Beleg (`zitat`) mit einer bestehenden `aussage`, analog dem `belege`-Zweig von
// `aussage.anlegen` (`src/main/befehle/aussage-anlegen.ts`), hier als eigenständiger Befehl für
// eine bereits bestehende Aussage.
import type { AussageZitatAnlegenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as aussageRepo from '../repositories/aussage-repo'

export function aussageZitatAnlegen(tx: Tx, ein: AussageZitatAnlegenEin): null {
  if (!datensatzExistiert(tx, 'aussage', ein.aussageId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_AUSSAGE')
  }
  if (!datensatzExistiert(tx, 'zitat', ein.zitatId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ZITAT')
  }
  if (aussageRepo.verknuepfungExistiert(tx, ein.aussageId, ein.zitatId)) {
    throw new WurzelFehler('KONFLIKT_BEREITS_VORHANDEN')
  }

  const jetzt = Date.now()
  aussageRepo.zitatVerknuepfen(tx, { aussageId: ein.aussageId, zitatId: ein.zitatId, erstelltAm: jetzt, geaendertAm: jetzt })
  return null
}
