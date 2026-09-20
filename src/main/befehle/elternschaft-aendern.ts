// AP-1.12: Handler für `elternschaft.aendern`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
// AP-0.22: vorher `elternschaftLesen()`, Vergleich der beiden editierbaren Felder (`typ`/`notiz` —
// Nutzerentscheidung AP-1.12: `elternteil_id`/`kind_id` ändert man nicht, das wäre eine andere
// Kante); bei Gleichheit ein No-op ohne Repo-Schreibvorgang.
import type { ElternschaftAendernEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from '../repositories/basis'
import * as beziehungRepo from '../repositories/beziehung-repo'

export function elternschaftAendern(tx: Tx, ein: ElternschaftAendernEin): null {
  const vorher = beziehungRepo.elternschaftLesen(tx, ein.id)
  if (vorher === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ELTERNSCHAFT')
  }
  const neuerNotizwert = ein.notiz ?? null
  if (vorher.typ === ein.typ && vorher.notiz === neuerNotizwert) {
    return null
  }
  beziehungRepo.elternschaftAktualisieren(tx, {
    id: ein.id,
    typ: ein.typ,
    notiz: neuerNotizwert,
    geaendertAm: Date.now(),
  })
  return null
}
