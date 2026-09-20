// AP-1.12: Handler für `ereignis.anlegen`. Läuft in der vom Befehlsbus bereits geöffneten und
// armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
import type { EreignisAnlegenEin } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert, type Tx } from '../repositories/basis'
import * as ereignisRepo from '../repositories/ereignis-repo'
import { datumSpalten } from '../import/datum-spalten'
import { neueId } from '../id'
import { existenzAussageSchreiben } from './existenz-aussage'

export function ereignisAnlegen(tx: Tx, ein: EreignisAnlegenEin): { readonly id: string } {
  if (ein.ortId !== undefined && !datensatzExistiert(tx, 'ort', ein.ortId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ORT')
  }
  for (const beteiligung of ein.beteiligungen) {
    if (!datensatzExistiert(tx, 'person', beteiligung.personId)) {
      throw new WurzelFehler('NICHT_GEFUNDEN_PERSON')
    }
  }

  const id = neueId()
  const jetzt = Date.now()
  ereignisRepo.einfuegen(tx, {
    id,
    typ: ein.typ,
    ortId: ein.ortId ?? null,
    datum: datumSpalten(ein.datum),
    beschreibung: ein.beschreibung ?? null,
    notiz: ein.notiz ?? null,
    erstelltAm: jetzt,
    geaendertAm: jetzt,
  })

  ein.beteiligungen.forEach((beteiligung) => {
    ereignisRepo.beteiligungEinfuegen(tx, {
      id: neueId(),
      ereignisId: id,
      personId: beteiligung.personId,
      rolle: beteiligung.rolle,
      reihenfolge: beteiligung.reihenfolge ?? null,
      erstelltAm: jetzt,
      geaendertAm: jetzt,
    })
  })

  existenzAussageSchreiben(tx, {
    subjektTyp: 'ereignis',
    subjektId: id,
    konfidenz: ein.konfidenz,
    belege: ein.belege,
    erstelltAm: jetzt,
  })
  return { id }
}
