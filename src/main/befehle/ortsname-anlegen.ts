// AP-1.16 PR-A: Handler für `ortsname.anlegen` — legt einen WEITEREN Namen zu einem bestehenden
// `ort` an (mehrere gleichzeitig gültige/historische Namen, s. `src/shared/schemata/befehle.ts`-
// Abschnittskommentar). Läuft in der vom Befehlsbus bereits geöffneten und armierten Transaktion
// (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier). KEIN automatisches Demote eines bisherigen
// `istBevorzugt`-Namens (Nutzerentscheidung dieser Abnahme).
import type { OrtsnameAnlegenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as ortRepo from '../repositories/ort-repo'
import { neueId } from '../id'

export function ortsnameAnlegen(tx: Tx, ein: OrtsnameAnlegenEin): { readonly id: string } {
  if (!datensatzExistiert(tx, 'ort', ein.ortId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ORT')
  }

  const id = neueId()
  const jetzt = Date.now()
  ortRepo.ortsnameEinfuegen(tx, {
    id,
    ortId: ein.ortId,
    name: ein.name,
    sprache: ein.sprache ?? null,
    gueltigVon: ein.gueltigVon ?? null,
    gueltigBis: ein.gueltigBis ?? null,
    istBevorzugt: ein.istBevorzugt ?? null,
    originalText: ein.originalText ?? null,
    erstelltAm: jetzt,
    geaendertAm: jetzt,
  })
  return { id }
}
