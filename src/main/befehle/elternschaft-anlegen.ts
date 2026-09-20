// AP-1.12: Handler für `elternschaft.anlegen`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
import type { ElternschaftAnlegenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { wuerdeZyklusErzeugen } from '../../core/graph/zyklus'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as beziehungRepo from '../repositories/beziehung-repo'
import { neueId } from '../id'
import { existenzAussageSchreiben } from './existenz-aussage'

export function elternschaftAnlegen(tx: Tx, ein: ElternschaftAnlegenEin): { readonly id: string } {
  if (!datensatzExistiert(tx, 'person', ein.elternteilId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_PERSON')
  }
  if (!datensatzExistiert(tx, 'person', ein.kindId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_PERSON')
  }

  const bestehendeKanten = beziehungRepo.alleKanten(tx)
  if (wuerdeZyklusErzeugen(bestehendeKanten, { elternteilId: ein.elternteilId, kindId: ein.kindId })) {
    throw new WurzelFehler('KONFLIKT_ZYKLUS')
  }

  const id = neueId()
  const jetzt = Date.now()
  beziehungRepo.elternschaftEinfuegen(tx, {
    id,
    elternteilId: ein.elternteilId,
    kindId: ein.kindId,
    typ: ein.typ,
    notiz: ein.notiz ?? null,
    erstelltAm: jetzt,
    geaendertAm: jetzt,
  })
  existenzAussageSchreiben(tx, {
    subjektTyp: 'elternschaft',
    subjektId: id,
    konfidenz: ein.konfidenz,
    belege: ein.belege,
    erstelltAm: jetzt,
  })
  return { id }
}
