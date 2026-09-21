// AP-1.16 PR-A: Handler für `ort-externe-id.anlegen`. Läuft in der vom Befehlsbus bereits
// geöffneten und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier). `ort_externe_id`
// hat den zusammengesetzten Primärschlüssel `(ort_id, system)` — ein zweiter Aufruf mit derselben
// Kombination ist ein Duplikat, kein `aendern` (s. `src/shared/schemata/befehle.ts`-
// Abschnittskommentar).
import type { OrtExterneIdAnlegenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as ortRepo from '../repositories/ort-repo'

export function ortExterneIdAnlegen(tx: Tx, ein: OrtExterneIdAnlegenEin): null {
  if (!datensatzExistiert(tx, 'ort', ein.ortId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ORT')
  }
  if (ortRepo.ortExterneIdLesen(tx, ein.ortId, ein.system) !== undefined) {
    throw new WurzelFehler('KONFLIKT_ORT_EXTERNE_ID_DUPLIKAT')
  }

  const jetzt = Date.now()
  ortRepo.ortExterneIdEinfuegen(tx, {
    ortId: ein.ortId,
    system: ein.system,
    wert: ein.wert,
    erstelltAm: jetzt,
    geaendertAm: jetzt,
  })
  return null
}
