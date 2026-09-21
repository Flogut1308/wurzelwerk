// AP-1.16 PR-A: Handler für `ortszugehoerigkeit.anlegen`. Läuft in der vom Befehlsbus bereits
// geöffneten und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier). Zyklusschutz
// über `src/core/ort/zyklus.ts::wuerdeZyklusErzeugen` — NUR gegen die bestehenden Kanten
// DERSELBEN `art` geprüft (politisch/kirchlich werden NIE gemischt, s.
// `src/core/ort/zeitbezug.ts`-Kopfkommentar und `src/shared/schemata/befehle.ts`-
// Abschnittskommentar).
import type { OrtszugehoerigkeitAnlegenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { wuerdeZyklusErzeugen } from '../../core/ort/zyklus'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as ortRepo from '../repositories/ort-repo'
import { neueId } from '../id'

export function ortszugehoerigkeitAnlegen(tx: Tx, ein: OrtszugehoerigkeitAnlegenEin): { readonly id: string } {
  if (!datensatzExistiert(tx, 'ort', ein.ortId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ORT')
  }
  if (!datensatzExistiert(tx, 'ort', ein.uebergeordnetId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ORT')
  }

  const bestehendeKanten = ortRepo.zugehoerigkeitenLesen(tx, ein.art)
  if (wuerdeZyklusErzeugen(bestehendeKanten, { ortId: ein.ortId, uebergeordnetId: ein.uebergeordnetId })) {
    throw new WurzelFehler('KONFLIKT_ZYKLUS_ORT')
  }

  const id = neueId()
  const jetzt = Date.now()
  ortRepo.ortszugehoerigkeitEinfuegen(tx, {
    id,
    ortId: ein.ortId,
    uebergeordnetId: ein.uebergeordnetId,
    art: ein.art,
    gueltigVon: ein.gueltigVon ?? null,
    gueltigBis: ein.gueltigBis ?? null,
    erstelltAm: jetzt,
    geaendertAm: jetzt,
  })
  return { id }
}
