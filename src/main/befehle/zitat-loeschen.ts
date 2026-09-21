// AP-1.17 PR-A3: Handler für `zitat.loeschen`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier). `aussage_zitat`/`persona`
// referenzieren `zitat.id` mit `ON DELETE CASCADE` (docs/schema/0002_kern.sql §2.7 + §2.15) —
// DB-seitig, keine zusätzliche Aufräumung hier nötig (docs/80_Offene_Fragen.md §29).
import type { ZitatLoeschenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as belegRepo from '../repositories/beleg-repo'

export function zitatLoeschen(tx: Tx, ein: ZitatLoeschenEin): null {
  if (!datensatzExistiert(tx, 'zitat', ein.id)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ZITAT')
  }
  belegRepo.zitatLoeschen(tx, ein.id)
  return null
}
