// AP-1.12: Handler für `elternschaft.aendern`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
// AP-0.22: vorher `elternschaftLesen()`, Vergleich der beiden editierbaren Felder (`typ`/`notiz` —
// Nutzerentscheidung AP-1.12: `elternteil_id`/`kind_id` ändert man nicht, das wäre eine andere
// Kante); bei Gleichheit ein No-op ohne Repo-Schreibvorgang.
// AP-1.30 PR 4: der Vergleich steht als `elternschaftGeaenderteFelder()` für sich — derselbe
// Vergleich entscheidet über den No-op UND über den Koaleszenzschlüssel (`koaleszenz-schluessel.ts`).
import type { ElternschaftAendernEin, ElternschaftAendernFeld } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from '../repositories/basis'
import * as beziehungRepo from '../repositories/beziehung-repo'
import type { ElternschaftZeile } from '../repositories/beziehung-repo'

/** Die Vertragsfelder, deren Wert `ein` gegenüber dem gespeicherten Stand ändern würde. */
export function elternschaftGeaenderteFelder(vorher: ElternschaftZeile, ein: ElternschaftAendernEin): readonly ElternschaftAendernFeld[] {
  const felder: ElternschaftAendernFeld[] = []
  if (vorher.typ !== ein.typ) felder.push('typ')
  if (vorher.notiz !== (ein.notiz ?? null)) felder.push('notiz')
  return felder
}

export function elternschaftAendern(tx: Tx, ein: ElternschaftAendernEin): null {
  const vorher = beziehungRepo.elternschaftLesen(tx, ein.id)
  if (vorher === undefined) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ELTERNSCHAFT')
  }
  if (elternschaftGeaenderteFelder(vorher, ein).length === 0) {
    return null
  }
  beziehungRepo.elternschaftAktualisieren(tx, {
    id: ein.id,
    typ: ein.typ,
    notiz: ein.notiz ?? null,
    geaendertAm: Date.now(),
  })
  return null
}
