// AP-1.33: Handler für `hauptname.wechseln` (docs/schema/0006_namensformen.sql). Läuft in der vom
// Befehlsbus bereits geöffneten, armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT`). Stellt
// die bevorzugte Namensform einer Person um; die eigentliche „erst demote, dann promote"-Mechanik mit
// ausgesetzten Constraint-Triggern liegt in `name-form-repo.ts` (dort das SQL, CLAUDE.md §2).
import type { HauptnameWechselnEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from '../repositories/basis'
import * as nameFormRepo from '../repositories/name-form-repo'

export function hauptnameWechseln(tx: Tx, ein: HauptnameWechselnEin): null {
  const alt = nameFormRepo.lesen(tx, ein.alt)
  const neu = nameFormRepo.lesen(tx, ein.neu)
  if (alt === undefined || neu === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_NAME')
  }
  // Beide Formen müssen zur genannten Person gehören — ein Wechsel über Personengrenzen hinweg wäre
  // fachlich sinnlos und würde das „genau ein Hauptname je Person" der falschen Person berühren.
  if (alt.person_id !== ein.personId || neu.person_id !== ein.personId) {
    throw new WurzelFehler('NICHT_GEFUNDEN_NAME')
  }
  // No-op, wenn `neu` bereits die bevorzugte Form ist (kein Schreibvorgang, leere Transaktion wird
  // vom Bus verworfen).
  if (neu.ist_bevorzugt === 1) {
    return null
  }
  nameFormRepo.hauptnameWechseln(tx, ein.personId, ein.alt, ein.neu, Date.now())
  return null
}
