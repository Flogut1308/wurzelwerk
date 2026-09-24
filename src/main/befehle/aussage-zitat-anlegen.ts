// AP-1.29 PR-A: Handler für `aussage_zitat.anlegen`. Läuft in der vom Befehlsbus bereits
// geöffneten und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier). Verknüpft EINEN
// bestehenden Beleg (`zitat`) mit einer bestehenden `aussage`, analog dem `belege`-Zweig von
// `aussage.anlegen` (`src/main/befehle/aussage-anlegen.ts`), hier als eigenständiger Befehl für
// eine bereits bestehende Aussage.
// AP-1.34 PR-C1a (B-01): optionaler Textanker [von, bis) — geprüft gegen das Transkript des Zitats
// (`ankerPruefen`, src/core/beleg/textanker.ts: Transkript vorhanden, innerhalb, kein geteiltes
// Ersatzpaar F4). Ein ungültiger Anker wirft VOR jedem Schreibvorgang.
import type { AussageZitatAnlegenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as aussageRepo from '../repositories/aussage-repo'
import * as belegRepo from '../repositories/beleg-repo'
import { ankerPruefen } from '../../core/beleg/textanker'

export function aussageZitatAnlegen(tx: Tx, ein: AussageZitatAnlegenEin): null {
  if (!datensatzExistiert(tx, 'aussage', ein.aussageId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_AUSSAGE')
  }
  const zitat = belegRepo.zitatLesen(tx, ein.zitatId)
  if (zitat === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ZITAT')
  }
  if (aussageRepo.verknuepfungExistiert(tx, ein.aussageId, ein.zitatId)) {
    throw new WurzelFehler('KONFLIKT_BEREITS_VORHANDEN')
  }

  const anker = ein.textanker
  if (anker !== undefined) {
    const pruefung = ankerPruefen(zitat.transkript, anker.von, anker.bis)
    if (pruefung !== 'ok') {
      throw new WurzelFehler('VALIDIERUNG_WERTEBEREICH', `Textanker ungültig: ${pruefung}.`)
    }
  }

  const jetzt = Date.now()
  aussageRepo.zitatVerknuepfen(tx, {
    aussageId: ein.aussageId,
    zitatId: ein.zitatId,
    textankerVon: anker?.von,
    textankerBis: anker?.bis,
    erstelltAm: jetzt,
    geaendertAm: jetzt,
  })
  return null
}
