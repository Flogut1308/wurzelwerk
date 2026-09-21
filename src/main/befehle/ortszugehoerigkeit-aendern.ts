// AP-1.16 PR-A: Handler für `ortszugehoerigkeit.aendern`. Läuft in der vom Befehlsbus bereits
// geöffneten und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
// AP-0.22: vorher `ortszugehoerigkeitLesen()`, Vergleich der beiden editierbaren Felder
// (`gueltig_von`/`gueltig_bis` — Nutzerentscheidung AP-1.16: `ort_id`/`uebergeordnet_id`/`art`
// ändert man nicht, das wäre eine andere Kante); bei Gleichheit ein No-op.
import type { OrtszugehoerigkeitAendernEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from '../repositories/basis'
import * as ortRepo from '../repositories/ort-repo'

export function ortszugehoerigkeitAendern(tx: Tx, ein: OrtszugehoerigkeitAendernEin): null {
  const vorher = ortRepo.ortszugehoerigkeitLesen(tx, ein.id)
  if (vorher === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ORTSZUGEHOERIGKEIT')
  }
  const neuerGueltigVon = ein.gueltigVon ?? null
  const neuerGueltigBis = ein.gueltigBis ?? null
  if (vorher.gueltig_von === neuerGueltigVon && vorher.gueltig_bis === neuerGueltigBis) {
    return null
  }
  ortRepo.ortszugehoerigkeitAktualisieren(tx, {
    id: ein.id,
    gueltigVon: neuerGueltigVon,
    gueltigBis: neuerGueltigBis,
    geaendertAm: Date.now(),
  })
  return null
}
